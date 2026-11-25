#!/usr/bin/env python3
"""Opt-in local acceptance of the Proxmox Compose bundle using the developer's test env.

Uses a unique Compose project, fresh volumes, a loopback-only registry and ingress,
and no Cloudflare connector. Never applies Terraform or selects an existing stack.
Subprocess output stays in a private log because application logs may contain secrets.
"""
from __future__ import annotations

import argparse
import http.client
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import uuid

ROOT = Path(__file__).resolve().parents[2]
FILES = ROOT / "infra/proxmox/files"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-disposable-docker-test", action="store_true", required=True)
    parser.add_argument("--env-file", type=Path, required=True, help="Local test credentials; never a production env.")
    parser.add_argument("--reuse-images", metavar="TAG", help="Reuse gmi-infra-check-{api,websocket,discord}:TAG instead of building.")
    args = parser.parse_args()
    env_source = args.env_file.resolve(strict=True)
    project = "gmi-bootstrap-" + uuid.uuid4().hex[:12]
    label = "gmi.bootstrap.fixture=" + project
    tag = args.reuse_images or project
    local_images = {role: f"gmi-infra-check-{role}:{tag}" for role in ("api", "websocket", "discord")}
    log_path = ROOT / "backup" / (project + ".log")
    log_path.parent.mkdir(exist_ok=True)
    descriptor = os.open(log_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    registry = project + "-registry"
    registry_created = False
    compose = None
    child_env = dict(os.environ)

    with os.fdopen(descriptor, "wb") as log, tempfile.TemporaryDirectory(prefix=project + "-") as directory:
        location = Path(directory)

        def command(argv, *, env=None, allow_failure=False, timeout=1800, log_output=True):
            result = subprocess.run(argv, cwd=ROOT, env=env or child_env, stdout=subprocess.PIPE,
                                    stderr=subprocess.PIPE, timeout=timeout)
            if log_output:
                log.write(result.stdout + result.stderr)
            log.flush()
            if result.returncode and not allow_failure:
                raise RuntimeError(f"{Path(argv[0]).name} failed (exit {result.returncode}); see private log.")
            return result

        def inspect_project():
            result = command(["docker", "ps", "-aq", "--filter", "label=com.docker.compose.project=" + project])
            ids = result.stdout.decode().split()
            return json.loads(command(["docker", "container", "inspect", *ids], log_output=False).stdout) if ids else []

        def request(path, host, *, websocket=False):
            headers = {"Host": host}
            if websocket:
                headers.update({"Connection": "Upgrade", "Upgrade": "websocket", "Sec-WebSocket-Version": "13",
                                "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==", "id": "fixture-invalid", "token": "fixture-invalid"})
                connection = http.client.HTTPConnection("127.0.0.1", ingress_port, timeout=5)
                try:
                    connection.request("GET", path, headers=headers)
                    response = connection.getresponse()
                    return response.status, response.read() if response.status != 101 else b""
                finally:
                    connection.close()
            try:
                with urlopen(Request(f"http://127.0.0.1:{ingress_port}{path}", headers=headers), timeout=5) as response:
                    return response.status, response.read()
            except HTTPError as error:
                return error.code, error.read()

        try:
            print(f"Testing isolated local deployment {project}; no server/Terraform access.", flush=True)
            command(["docker", "info"])
            # dotenv's parser matches the application, including quoted values. Never print its result.
            parsed = command(["bun", "-e", "import dotenv from 'dotenv';import{readFileSync}from'node:fs';process.stdout.write(JSON.stringify(dotenv.parse(readFileSync(process.argv[1]))))", str(env_source)], log_output=False)
            values = json.loads(parsed.stdout)
            if values.get("DEV") != "true":
                raise RuntimeError("The supplied env must explicitly set DEV=true for this local-only acceptance test.")
            if not args.reuse_images:
                # Freeze the source once: all three local images must contain the same files.
                context = location / "context"
                def excluded(source_directory, names):
                    return {name for name in names if name in {".git", ".terraform", "node_modules", "dist", "coverage", ".turbo", "__pycache__", ".docusaurus", ".solid", ".output"} or (Path(source_directory) == ROOT and name in {"docs", "infra", "logs", "backup", ".github", ".aws", ".agents", ".codex"}) or name.startswith(".env") or ".tfstate" in name or ".tfvars" in name or name.endswith(".tfplan")}
                shutil.copytree(ROOT, context, ignore=excluded)
                for role, image in local_images.items():
                    print("Building local " + role + " image.", flush=True)
                    command(["docker", "build", "-f", f"apps/{role}/Dockerfile", "-t", image,
                             "--label", "org.opencontainers.image.revision=local-test-" + project, str(context)])
            for image in local_images.values():
                # A build-context regression must fail before any app receives test credentials.
                command(["docker", "run", "--rm", "--network", "none", "--label", label, "--entrypoint", "/bin/sh", image,
                         "-c", "test ! -e /app/.env && test ! -e /app/.env.test && test ! -e /app/infra && test ! -e /app/.aws"])
            if command(["docker", "image", "inspect", "registry:2"], allow_failure=True).returncode:
                command(["docker", "pull", "registry:2"])
            command(["docker", "run", "-d", "--name", registry, "--label", label, "--publish", "127.0.0.1::5000", "registry:2"])
            registry_created = True
            item = json.loads(command(["docker", "container", "inspect", registry]).stdout)[0]
            registry_port = item["NetworkSettings"]["Ports"]["5000/tcp"][0]["HostPort"]
            app_refs = {}
            print("Resolving immutable local image references through a loopback registry.", flush=True)
            for role, image in local_images.items():
                ref = f"127.0.0.1:{registry_port}/{role}:fixture"
                command(["docker", "tag", image, ref])
                command(["docker", "push", ref])
                digests = json.loads(command(["docker", "image", "inspect", ref]).stdout)[0]["RepoDigests"]
                app_refs[role] = next(value for value in digests if value.startswith(f"127.0.0.1:{registry_port}/"))
            defaults = {"MARIADB_IMAGE": "mariadb:latest", "MONGO_IMAGE": "mongo:8.2", "REDIS_IMAGE": "redis:latest",
                        "MINIO_IMAGE": "cgr.dev/chainguard/minio:latest", "TRAEFIK_IMAGE": "traefik:v2.11",
                        "CLOUDFLARED_IMAGE": "cloudflare/cloudflared:latest"}
            for key, image in defaults.items():
                if command(["docker", "image", "inspect", image], allow_failure=True).returncode:
                    command(["docker", "pull", image])
                info = json.loads(command(["docker", "image", "inspect", image]).stdout)[0]
                values[key] = info["RepoDigests"][0]
            with socket.socket() as listener:
                listener.bind(("127.0.0.1", 0))
                ingress_port = listener.getsockname()[1]
            values.update({"API_IMAGE": app_refs["api"], "WEBSOCKET_IMAGE": app_refs["websocket"], "DISCORD_IMAGE": app_refs["discord"],
                           "MARIA_USER": "fixture", "MARIA_PASSWORD": secrets.token_hex(24), "MARIA_ROOT_PASSWORD": secrets.token_hex(24),
                           "MARIA_NAME": "fixture", "MARIA_HOST": "mariadb", "MARIA_PORT": "3306",
                           "MINIO_ACCESS_KEY": "fixture-access", "MINIO_SECRET_KEY": secrets.token_hex(24),
                           "AUTH_TOKEN_ENCRYPTION_KEY": secrets.token_hex(32), "PRIVACY_HASH_SECRET": secrets.token_hex(32),
                           "API_HOST": "api.fixture.localhost", "WS_HOST": "ws.fixture.localhost", "DEV": "true",
                           "DOMAIN_URL": f"http://api.fixture.localhost:{ingress_port}", "WEBSITE_URL": "http://127.0.0.1:53134",
                           "API_REPLICAS": "2", "WEBSOCKET_REPLICAS": "2", "DISCORD_REPLICAS": "1", "COMPOSE_PROFILES": ""})
            values.pop("SENTRY_DSN", None)
            values.pop("MARIA_URL", None)
            # Compose supports single-quoted literal env values; escape only the quote itself.
            env_text = "\n".join(key + "='" + str(value).replace("'", "\\'") + "'" for key, value in values.items()) + "\n"
            env_path = location / ".env"
            env_path.write_text(env_text)
            env_path.chmod(0o600)
            (location / "cloudflared.env").write_text("TUNNEL_TOKEN=unused-local-fixture\n")
            (location / "cloudflared.env").chmod(0o600)
            shutil.copyfile(ROOT / "docker-stack.swarm.yml", location / "docker-stack.swarm.yml")
            for source in FILES.iterdir():
                if source.is_file():
                    shutil.copyfile(source, location / source.name)
            child_env.update({"GMOD_STACK_DIR": str(location), "GMOD_PROJECT_NAME": project, "GMOD_INGRESS_PORT": str(ingress_port)})
            compose = ["docker", "compose", "--project-name", project, "--project-directory", str(location),
                       "--env-file", str(env_path), "-f", str(location / "docker-stack.swarm.yml"), "-f", str(location / "compose.proxmox.yml")]
            ctl = ["bash", str(location / "gmodctl.sh")]
            print("Preflight and explicit empty-install bootstrap (Cloudflare disabled).", flush=True)
            command([*ctl, "preflight", "--pull"])
            command([*ctl, "bootstrap", "--confirm-empty", project])
            deadline = time.monotonic() + 30
            while True:
                try:
                    status, body = request("/v6/", values["API_HOST"])
                    if status == 200 and json.loads(body).get("version") == "v6":
                        break
                except (URLError, OSError, ValueError):
                    pass
                if time.monotonic() >= deadline:
                    raise RuntimeError("The API did not return its v6 contract through the local ingress.")
                time.sleep(1)
            if status != 200:
                raise RuntimeError("The API did not return its v6 contract through the local ingress.")
            status, _ = request("/", values["WS_HOST"], websocket=True)
            if status != 401:
                raise RuntimeError(f"The WebSocket ingress returned {status}; expected 401 for invalid server credentials.")
            print("HTTP v6 and WebSocket authentication through Traefik PASSED.", flush=True)
            refusal = command([*ctl, "bootstrap", "--confirm-empty", project], allow_failure=True)
            if refusal.returncode == 0:
                raise RuntimeError("A second bootstrap incorrectly accepted existing containers/volumes.")
            print("Second bootstrap refused existing data as expected.", flush=True)
            deadline = time.monotonic() + 90
            while True:
                discord_log = command([*compose, "logs", "--no-color", "discord"], log_output=False).stdout
                if b"Ready on main with" in discord_log and b"Skipping command push due to test mode" in discord_log:
                    print("Test Discord Gateway login confirmed; global command publication skipped.", flush=True)
                    break
                if time.monotonic() >= deadline:
                    raise RuntimeError("The test Discord bot did not confirm Gateway readiness in DEV mode.")
                time.sleep(1)
            # Observe several restart-policy intervals so an immediately crashing bot cannot pass.
            time.sleep(15)
            containers = inspect_project()
            for role, expected in {"api": 2, "websocket": 2, "discord": 1}.items():
                selected = [item for item in containers if item["Config"]["Labels"].get("com.docker.compose.service") == role]
                if len(selected) != expected or any(item["State"]["Status"] != "running" or item["RestartCount"] for item in selected):
                    raise RuntimeError(f"{role} did not remain running with {expected} replicas and zero restarts.")
            print("API 2/2, WebSocket 2/2 and Discord 1/1 stable with zero restarts.", flush=True)
            print("Local Compose bootstrap acceptance PASSED. This does not validate live Proxmox or Cloudflare.", flush=True)
            return 0
        finally:
            cleanup_failed = False
            for diagnostic in location.glob(".bootstrap-diagnostic-*.log"):
                if diagnostic.is_file() and not diagnostic.is_symlink():
                    log.write(diagnostic.read_bytes())
                    log.flush()
            if compose is not None:
                command([*compose, "logs", "--no-color", "--tail", "100"], allow_failure=True)
                cleanup_failed |= command([*compose, "down", "--volumes", "--remove-orphans", "--timeout", "15"], allow_failure=True).returncode != 0
            if not registry_created:
                leftover = command(["docker", "container", "inspect", registry], allow_failure=True, log_output=False)
                if leftover.returncode == 0:
                    registry_created = json.loads(leftover.stdout)[0].get("Config", {}).get("Labels", {}).get("gmi.bootstrap.fixture") == project
            if registry_created:
                cleanup_failed |= command(["docker", "rm", "-fv", registry], allow_failure=True).returncode != 0
            if cleanup_failed:
                raise RuntimeError(f"Fixture cleanup incomplete; inspect only project {project}.")
            print(f"Fixture resources cleaned. Private diagnostics: {log_path}", flush=True)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, OSError, ValueError, subprocess.TimeoutExpired) as error:
        print(f"Local acceptance stopped: {error}", file=sys.stderr)
        raise SystemExit(1)
