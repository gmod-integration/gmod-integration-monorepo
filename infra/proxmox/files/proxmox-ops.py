#!/usr/bin/env python3
"""Explicit empty-installation bootstrap for the Proxmox Compose bundle.

No command evaluates an environment file or emits Docker's sensitive config/inspect output.
An unsuccessful bootstrap keeps its datastores for diagnosis and stops every application writer.
"""
from __future__ import annotations

import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time

WRITERS = ("api", "websocket", "discord")
DATASTORES = ("mariadb", "mongo", "redis", "minio")
DIGEST = re.compile(r"[^\s@]+@sha256:[a-f0-9]{64}")


class OperationError(RuntimeError):
    pass


class Bootstrap:
    def __init__(self, directory: Path, project: str):
        if project != "gmod" and not re.fullmatch(r"gmi-bootstrap-[a-f0-9]{12}", project):
            raise OperationError("Use project gmod or an explicitly named gmi-bootstrap-<12hex> local fixture.")
        self.directory, self.project = directory.resolve(), project
        self.environment = {key: value for key, value in os.environ.items() if key in (
            "PATH", "HOME", "DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG", "DOCKER_TLS_VERIFY",
            "DOCKER_CERT_PATH", "XDG_RUNTIME_DIR", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY",
        )}
        if project.startswith("gmi-bootstrap-") and "GMOD_INGRESS_PORT" in os.environ:
            port = os.environ["GMOD_INGRESS_PORT"]
            if not port.isdigit() or not 1024 <= int(port) <= 65535:
                raise OperationError("Local fixture ingress requires an explicit unprivileged TCP port.")
            self.environment["GMOD_INGRESS_PORT"] = port
        self.compose = ["docker", "compose", "--project-name", project, "--project-directory", str(self.directory),
                        "--env-file", str(self.directory / ".env"), "-f", str(self.directory / "docker-stack.swarm.yml"),
                        "-f", str(self.directory / "compose.proxmox.yml")]
        self.configuration = None

    def run(self, arguments, *, timeout=1200, allow_failure=False):
        try:
            result = subprocess.run(arguments, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                    env=self.environment, timeout=timeout, check=False)
        except subprocess.TimeoutExpired as error:
            diagnostic = self.diagnostic(error.stdout or b"", error.stderr or b"")
            raise OperationError(f"Docker command timed out; private diagnostic: {diagnostic}") from error
        except OSError as error:
            raise OperationError("Docker command could not complete; diagnostic output was suppressed.") from error
        if result.returncode and not allow_failure:
            diagnostic = self.diagnostic(result.stdout, result.stderr)
            raise OperationError(f"Docker operation failed (exit {result.returncode}); private diagnostic: {diagnostic}")
        return result

    def diagnostic(self, stdout, stderr):
        descriptor, path = tempfile.mkstemp(prefix=".bootstrap-diagnostic-", suffix=".log", dir=self.directory)
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(stdout + b"\n" + stderr)
        return path

    def docker(self, *arguments, **options):
        return self.run(["docker", *arguments], **options).stdout

    def call(self, *arguments, **options):
        return self.run([*self.compose, *arguments], **options).stdout

    def config(self):
        if self.configuration is None:
            self.configuration = json.loads(self.call("config", "--format", "json"))
        config = self.configuration
        services = config.get("services", {})
        required = {*WRITERS, *DATASTORES, "traefik", "prisma-migrate"}
        if not required.issubset(services) or set(services) - required - {"cloudflared"}:
            raise OperationError("The bundle must contain exactly the supported application and datastore services.")
        for name, service in services.items():
            if not DIGEST.fullmatch(service.get("image", "")):
                raise OperationError(f"{name} requires an immutable registry@sha256 image digest.")
            if name in (*WRITERS, "prisma-migrate") and service.get("deploy", {}).get("replicas") != 0:
                raise OperationError("The base Compose bundle must leave writers and migration at zero replicas.")
            if name != "traefik" and service.get("ports"):
                raise OperationError("Only Traefik may publish a host port.")
        ports = services["traefik"].get("ports", [])
        if len(ports) != 1 or ports[0].get("host_ip") != "127.0.0.1" or ports[0].get("target") != 80:
            raise OperationError("Traefik must publish only its HTTP listener on loopback.")
        command = services["traefik"].get("command", [])
        if any("api.dashboard=true" in item or "api.insecure=true" in item or "swarmMode=true" in item for item in command):
            raise OperationError("Traefik management API and Swarm provider must stay disabled.")
        if services["prisma-migrate"].get("image") != services["api"].get("image"):
            raise OperationError("Migration must use the exact API image digest.")
        values = services["api"].get("environment", {})
        counts = {}
        for name, default in zip(WRITERS, (2, 2, 1)):
            raw = str(values.get(f"{name.upper()}_REPLICAS", default))
            if not raw.isdigit() or not 1 <= int(raw) <= (1 if name == "discord" else 8):
                raise OperationError("Bootstrap requires 1–8 API/WebSocket instances and exactly one Discord instance.")
            counts[name] = int(raw)
        self.counts = counts
        self.tunnel = "tunnel" in str(values.get("COMPOSE_PROFILES", "")).split(",")
        if self.tunnel and "cloudflared" not in services:
            raise OperationError("The tunnel profile requires its Cloudflare connector service.")
        volumes = config.get("volumes", {})
        if set(volumes) != {f"gmod_{name}_data" for name in DATASTORES}:
            raise OperationError("Bootstrap requires the four expected fresh named datastore volumes.")
        for volume in volumes.values():
            if volume.get("external") or volume.get("driver", "local") != "local" or volume.get("driver_opts"):
                raise OperationError("Bootstrap refuses external or custom-driver datastore volumes.")
            if not volume.get("name", "").startswith(self.project + "_"):
                raise OperationError("Datastore volumes must belong to the explicit Compose project.")
        network = config.get("networks", {}).get("gmod_net", {})
        if network.get("name") != self.project + "_net" or network.get("driver") != "bridge" or network.get("external"):
            raise OperationError("Bootstrap requires its own private bridge network.")
        return config

    def empty_target(self):
        config = self.config()
        if (self.directory / ".bootstrap-complete").exists():
            raise OperationError("This bundle already completed bootstrap; an in-place release requires a reviewed recovery plan.")
        containers = self.docker("ps", "-aq", "--filter", f"label=com.docker.compose.project={self.project}").strip()
        volumes = set(self.docker("volume", "ls", "--format", "{{.Name}}").decode().splitlines())
        labelled = self.docker("volume", "ls", "-q", "--filter", f"label=com.docker.compose.project={self.project}").strip()
        if containers or labelled or any(volume["name"] in volumes for volume in config["volumes"].values()):
            raise OperationError("Bootstrap refused: project containers or datastore volumes already exist; no data were removed.")
        networks = set(self.docker("network", "ls", "--format", "{{.Name}}").decode().splitlines())
        if self.project + "_net" in networks:
            raise OperationError("Bootstrap refused: its project network already exists; inspect the prior installation first.")

    def image_check(self, pull=False):
        services = self.config()["services"]
        names = [name for name in services if name != "cloudflared" or self.tunnel]
        if pull:
            self.call("pull", "--quiet", *names)
        revisions = set()
        for name in names:
            items = json.loads(self.docker("image", "inspect", services[name]["image"]))
            if not items:
                raise OperationError(f"The {name} image is unavailable locally; use preflight --pull.")
            if name in WRITERS:
                revision = (items[0].get("Config", {}).get("Labels") or {}).get("org.opencontainers.image.revision")
                if not revision:
                    raise OperationError("Every application image must carry its source revision label.")
                revisions.add(revision)
        if len(revisions) != 1:
            raise OperationError("The API, WebSocket and Discord images must have the same source revision.")
        self.revision = revisions.pop()

    def preflight(self, pull=False):
        self.empty_target()
        self.image_check(pull)
        self.empty_target()
        print("Compose configuration, empty target and immutable application release verified.", flush=True)

    def writer_ids(self, name):
        return self.call("ps", "--all", "-q", name).decode().split()

    def wait_for_writers(self, timeout=120):
        deadline = time.monotonic() + timeout
        stable_since = None
        while time.monotonic() < deadline:
            ready = True
            for name, count in self.counts.items():
                ids = self.writer_ids(name)
                if len(ids) != count:
                    ready = False
                for container in ids:
                    item = json.loads(self.docker("container", "inspect", container))[0]
                    if not item.get("State", {}).get("Running") or item.get("RestartCount", 0):
                        ready = False
                    if name != "discord":
                        port = 53136 if name == "api" else 53139
                        probe = "const s=await Bun.connect({hostname:'127.0.0.1',port:" + str(port) + ",socket:{data(){},open(s){s.end();process.exit(0)},error(){process.exit(1)}}});"
                        if self.run(["docker", "exec", container, "bun", "-e", probe], timeout=10, allow_failure=True).returncode:
                            ready = False
            if ready:
                stable_since = stable_since or time.monotonic()
                if time.monotonic() - stable_since >= 5:
                    return
            else:
                stable_since = None
            time.sleep(1)
        raise OperationError("Application processes/listeners did not become stable; writers will stay stopped.")

    def stop_writers(self):
        # Include any partially started migration and ingress; never stop unrelated projects or delete data.
        try:
            result = self.run([*self.compose, "stop", "--timeout", "120", *WRITERS, "prisma-migrate", "traefik",
                               *(["cloudflared"] if self.tunnel else [])], allow_failure=True)
            if result.returncode:
                raise OperationError("Project stop failed.")
        except OperationError:
            print("WARNING: stopping this project's services failed; inspect its containers before any retry.", file=sys.stderr)
        try:
            result = self.run(["docker", "ps", "-aq", "--filter", f"label=com.docker.compose.project={self.project}",
                               "--filter", "label=com.docker.compose.oneoff=True"], allow_failure=True)
            oneoffs = result.stdout.decode().split() if not result.returncode else []
            if oneoffs:
                self.run(["docker", "stop", "--time", "120", *oneoffs])
        except OperationError:
            print("WARNING: stopping project one-off tasks failed; inspect the migration before any retry.", file=sys.stderr)

    def bootstrap(self, confirmation):
        if confirmation != self.project:
            raise OperationError("--confirm-empty must exactly match the destination project.")
        with (self.directory / ".bootstrap.lock").open("a") as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as error:
                raise OperationError("Another bootstrap is already in progress.") from error
            self.preflight(pull=True)
            try:
                print("Validating application environment before creating datastore contents.", flush=True)
                self.call("run", "--rm", "--no-deps", "--entrypoint", "bun", "api", "-e", "await import('@gmod/config')")
                print("Starting four fresh datastores; application writers remain at zero.", flush=True)
                self.call("up", "-d", "--no-deps", "--wait", "--wait-timeout", "180", *DATASTORES)
                print("Applying checked-in Prisma migrations before starting writers.", flush=True)
                self.call("run", "--rm", "--no-deps", "--name", self.project + "-prisma-bootstrap", "prisma-migrate")
                self.call("run", "--rm", "--no-deps", "--entrypoint", "bun", "api", "scripts/swarm-migration-status.ts")
                print("Migrations verified; starting matching application images.", flush=True)
                self.call("up", "-d", "--no-deps", *(argument for name, count in self.counts.items() for argument in ("--scale", f"{name}={count}")), *WRITERS)
                self.wait_for_writers()
                self.call("up", "-d", "--no-deps", "--wait", "--wait-timeout", "60", "traefik")
                if self.tunnel:
                    self.call("--profile", "tunnel", "up", "-d", "--no-deps", "cloudflared")
                marker = self.directory / ".bootstrap-complete"
                descriptor = os.open(marker, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                with os.fdopen(descriptor, "w") as stream:
                    json.dump({"project": self.project, "revision": self.revision, "images": {
                        name: service["image"] for name, service in self.config()["services"].items()
                    }}, stream)
                print("Bootstrap completed. API/WebSocket listeners and application processes are stable; game/Discord acceptance remains manual.", flush=True)
            except BaseException:
                self.stop_writers()
                raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stack-dir", type=Path, default=Path("/opt/gmod-integration"))
    parser.add_argument("--project", default="gmod")
    actions = parser.add_subparsers(dest="action", required=True)
    actions.add_parser("config")
    preflight = actions.add_parser("preflight")
    preflight.add_argument("--pull", action="store_true")
    bootstrap = actions.add_parser("bootstrap")
    bootstrap.add_argument("--confirm-empty", required=True)
    args = parser.parse_args()
    runtime = Bootstrap(args.stack_dir, args.project)
    if args.action == "config":
        runtime.config()
        print("Compose bundle configuration verified; no services started.")
    elif args.action == "preflight":
        runtime.preflight(args.pull)
    else:
        runtime.bootstrap(args.confirm_empty)


if __name__ == "__main__":
    try:
        main()
    except (OperationError, ValueError, OSError, KeyboardInterrupt) as error:
        message = str(error) if isinstance(error, OperationError) else "Bootstrap stopped; inspect the private bundle and project state."
        print(f"[gmodctl] ERROR: {message}", file=sys.stderr)
        raise SystemExit(1)
