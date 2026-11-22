#!/usr/bin/env python3
"""Cold Swarm backups, verified restores and coordinated schema-changing releases.

No command sources a shell environment file or prints Docker's sensitive inspect output.
The standalone fixture mode accepts only containers explicitly labelled for this tool.
"""
from __future__ import annotations

import argparse
import contextlib
import datetime as dt
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parent.parent
COMPONENTS = {"mariadb": "/var/lib/mysql", "mongo": "/data/db", "redis": "/data", "minio": "/data"}
WRITERS = ("api", "websocket", "discord")
RECOVERY_KEYS = ("AUTH_TOKEN_ENCRYPTION_KEY", "DISCORD_CLIENT_SECRET", "PRIVACY_HASH_SECRET", "MARIA_USER", "MARIA_PASSWORD", "MARIA_NAME", "MARIA_ROOT_PASSWORD", "MINIO_ACCESS_KEY", "MINIO_SECRET_KEY")
HELPER_IMAGE = "alpine:3.22"
DATA_IMAGES = {"mariadb": "MARIADB_IMAGE", "mongo": "MONGO_IMAGE", "redis": "REDIS_IMAGE", "minio": "MINIO_IMAGE"}
APP_RECOVERY_KEYS = tuple(key for key in RECOVERY_KEYS if key != "MARIA_ROOT_PASSWORD")
TERMINAL_TASK_STATES = ("complete", "failed", "rejected", "shutdown", "remove", "orphaned")


class OperationError(RuntimeError):
    pass


def read_env(path: Path) -> dict[str, str]:
    result: dict[str, str] = {}
    for number, raw in enumerate(path.read_text().splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        match = re.fullmatch(r"(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)", line)
        if not match:
            raise OperationError(f"Invalid environment assignment on line {number}; multiline values are not supported.")
        key, value = match.groups()
        if key in result:
            raise OperationError(f"Duplicate environment key on line {number}.")
        if value.startswith(("'", '"')):
            quote = value[0]
            ending = re.fullmatch(r"(['\"])(.*)\1\s*(?:#.*)?", value)
            if not ending or ending[1] != quote:
                raise OperationError(f"Unclosed environment value on line {number}.")
            value = ending[2]
            if quote == '"':
                value = value.replace(r"\n", "\n").replace(r"\r", "\r")
        else:
            value = value.split("#", 1)[0].rstrip()
        result[key] = value
    for canonical, alias in (("MARIA_USER", "MARIADB_USER"), ("MARIA_PASSWORD", "MARIADB_PASSWORD"), ("MARIA_NAME", "MARIADB_DATABASE"), ("MARIA_ROOT_PASSWORD", "MARIADB_ROOT_PASSWORD")):
        if not result.get(canonical) and result.get(alias):
            result[canonical] = result[alias]
    return result


def run(args: list[str], *, output=None, source=None, environment=None) -> bytes:
    try:
        process = subprocess.run(args, stdin=source, stdout=output if output else subprocess.PIPE, stderr=subprocess.PIPE, env=environment, check=False)
    except OSError as error:
        raise OperationError(f"Unable to execute {args[0]}.") from error
    if process.returncode:
        # Commands and stderr may contain environment material, database records or provider URLs.
        raise OperationError(f"{args[0]} operation failed (exit {process.returncode}); services have not been automatically resumed.")
    return process.stdout or b""


def docker(*args: str):
    return run(["docker", *args])


def inspect(kind: str, name: str):
    try:
        return json.loads(docker("inspect", "--type", kind, name))[0]
    except (ValueError, IndexError) as error:
        raise OperationError(f"Cannot inspect requested {kind}.") from error


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def private_file(path: Path):
    return os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb")


def validate_name(name: str):
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,79}", name):
        raise OperationError("Use a simple, explicit Docker stack name.")


def recovery_values(component: str, values: dict[str, str], *, actual=False):
    if component in WRITERS:
        return {key: values.get(key, "") for key in APP_RECOVERY_KEYS}
    aliases = {
        "mariadb": {"MARIA_USER": ("MARIADB_USER", "MYSQL_USER"), "MARIA_PASSWORD": ("MARIADB_PASSWORD", "MYSQL_PASSWORD"), "MARIA_NAME": ("MARIADB_DATABASE", "MYSQL_DATABASE"), "MARIA_ROOT_PASSWORD": ("MARIADB_ROOT_PASSWORD", "MYSQL_ROOT_PASSWORD")},
        "minio": {"MINIO_ACCESS_KEY": ("MINIO_ROOT_USER", "MINIO_ACCESS_KEY"), "MINIO_SECRET_KEY": ("MINIO_ROOT_PASSWORD", "MINIO_SECRET_KEY")},
    }.get(component, {})
    return {key: next((values[name] for name in names if values.get(name)), "") if actual else values.get(key, "") for key, names in aliases.items()}


def container_environment(image: dict, spec: dict):
    values = {}
    for assignment in (*(image.get("Config", {}).get("Env") or []), *(spec.get("Env") or [])):
        key, separator, value = assignment.partition("=")
        if separator:
            values[key] = value
    return values


def ensure_no_migration(stack: str):
    name = f"{stack}_prisma-migrate"
    # Listing distinguishes an absent old service from a daemon/permission failure, which must abort.
    names = docker("service", "ls", "--filter", f"name={name}", "--format", "{{.Name}}").decode().splitlines()
    if name not in names:
        return
    service = inspect("service", name)
    replicas = service["Spec"].get("Mode", {}).get("Replicated", {}).get("Replicas")
    tasks = docker("service", "ps", "-q", "--no-trunc", name).decode().split()
    if replicas != 0 or any(inspect("task", task)["Status"]["State"] not in TERMINAL_TASK_STATES for task in tasks):
        raise OperationError("An existing migration service is enabled or still active; stop and diagnose it before maintenance.")


class Runtime:
    def __init__(self, stack: str, fixture_file: Path | None = None, timeout=180):
        validate_name(stack)
        self.stack, self.fixture, self.timeout = stack, fixture_file is not None, timeout
        self.resources: dict[str, dict] = {}
        # Effective recovery material stays in memory, outside serialized resource metadata.
        self.environments: dict[str, dict[str, str]] = {}
        if fixture_file:
            if not stack.startswith("gmi-recovery-"):
                raise OperationError("Fixture stack names must begin with gmi-recovery-.")
            mapping = json.loads(fixture_file.read_text())
            if not isinstance(mapping, dict) or set(mapping) != set(COMPONENTS) or not all(isinstance(name, str) for name in mapping.values()):
                raise OperationError("Fixture mapping must contain exactly the four datastore containers.")
            for component, name in mapping.items():
                item = inspect("container", name)
                if item.get("Config", {}).get("Labels", {}).get("gmi.recovery.fixture") != stack:
                    raise OperationError("Every fixture container must carry the matching gmi.recovery.fixture label.")
                image = inspect("image", item["Image"])
                self.resources[component] = self.resource(component, name, item["Image"], item["Mounts"], int(item["State"]["Running"]), image)
                self.environments[component] = recovery_values(component, container_environment(image, item["Config"]), actual=True)
        else:
            manager = json.loads(docker("info", "--format", "{{json .Swarm}}"))
            if not manager.get("ControlAvailable"):
                raise OperationError("Run this command on the Swarm manager that owns the local datastore volumes.")
            ensure_no_migration(stack)
            for component in (*WRITERS, *COMPONENTS):
                name = f"{stack}_{component}"
                item = inspect("service", name)
                spec = item["Spec"]
                if component in COMPONENTS and manager.get("Managers", 1) > 1:
                    constraints = spec["TaskTemplate"].get("Placement", {}).get("Constraints", [])
                    if f"node.id=={manager['NodeID']}" not in [constraint.replace(" ", "") for constraint in constraints]:
                        raise OperationError("Multi-manager recovery requires each datastore pinned to this manager's node.id.")
                image = spec["TaskTemplate"]["ContainerSpec"]["Image"]
                image_info = inspect("image", image)
                image_id = image_info["Id"]
                mounts = [{"Type": mount["Type"], "Name": mount.get("Source"), "Destination": mount["Target"]} for mount in spec["TaskTemplate"]["ContainerSpec"].get("Mounts", [])]
                count = spec.get("Mode", {}).get("Replicated", {}).get("Replicas")
                if count is None:
                    raise OperationError("Recovery supports replicated services only.")
                self.resources[component] = self.resource(component, name, image_id, mounts, count, image_info)
                self.environments[component] = recovery_values(component, container_environment(image_info, spec["TaskTemplate"]["ContainerSpec"]), actual=True)
                self.resources[component]["imageRef"] = image
                if component in COMPONENTS:
                    self.resources[component]["mount"]["nodeId"] = manager["NodeID"]
                    self.resources[component]["placementConstraints"] = spec["TaskTemplate"].get("Placement", {}).get("Constraints", [])
                    tasks = docker("service", "ps", "-q", "--no-trunc", name).decode().split()
                    for task in tasks:
                        item = inspect("task", task)
                        if item["Status"]["State"] not in TERMINAL_TASK_STATES and item.get("NodeID") and item["NodeID"] != manager["NodeID"]:
                            raise OperationError("Datastore task is on another node; run recovery on its owning manager.")

    def resource(self, component, name, image_id, mounts, replicas, image=None):
        result = {"name": name, "imageId": image_id, "replicas": replicas, "repoDigests": (image or {}).get("RepoDigests") or []}
        if component in COMPONENTS:
            if replicas not in (0, 1):
                raise OperationError("Each datastore must have at most one replica for a coherent physical backup.")
            matches = [mount for mount in mounts if mount.get("Destination") == COMPONENTS[component] and mount.get("Type") == "volume"]
            if len(matches) != 1:
                raise OperationError(f"{component} requires one named volume at its expected data directory.")
            volume = matches[0]["Name"]
            info = inspect("volume", volume)
            if info.get("Driver") != "local" or info.get("Options"):
                raise OperationError("Physical recovery supports plain local named volumes only; bind/remote driver options are refused.")
            label = "gmi.recovery.fixture" if self.fixture else "com.docker.stack.namespace"
            if info.get("Labels", {}).get(label) != self.stack:
                raise OperationError(f"{component} data volume is not labelled as belonging to the explicit target.")
            result["volume"] = volume
            result["mount"] = {"type": "volume", "source": volume, "target": COMPONENTS[component], "driver": info["Driver"]}
        return result

    def verify_environment(self, expected):
        for component, observed in self.environments.items():
            if observed != recovery_values(component, expected):
                raise OperationError(f"Effective {component} recovery credentials/key material differ from the supplied environment; no services changed and values were not printed.")

    def running_containers(self, component):
        resource = self.resources[component]
        if self.fixture:
            return [resource["name"]] if inspect("container", resource["name"])["State"]["Running"] else []
        return docker("ps", "-q", "--filter", f"label=com.docker.swarm.service.name={resource['name']}").decode().split()

    def set_count(self, component: str, count: int):
        resource = self.resources[component]
        if self.fixture:
            docker("start" if count else "stop", *([] if count else ["--time", "120"]), resource["name"])
        else:
            docker("service", "scale", f"{resource['name']}={count}")
        deadline = time.monotonic() + self.timeout
        while time.monotonic() < deadline:
            if self.fixture:
                observed = len(self.running_containers(component))
            else:
                tasks = docker("service", "ps", "-q", "--no-trunc", resource["name"]).decode().split()
                states = [inspect("task", task)["Status"]["State"] for task in tasks]
                observed = sum(state == "running" for state in states) if count else sum(state not in TERMINAL_TASK_STATES for state in states)
            if observed == count:
                return
            time.sleep(0.5)
        raise OperationError(f"Timed out waiting for {component}; writers remain stopped.")

    def stop(self, quiesce: bool):
        active = {component: self.running_containers(component) for component in self.resources}
        if not quiesce and (any(active.values()) or any(resource["replicas"] for resource in self.resources.values())):
            raise OperationError("Services are running. Use --quiesce to explicitly allow the maintenance outage.")
        for component in (*WRITERS, *COMPONENTS):
            if component not in self.resources:
                continue
            self.set_count(component, 0)
            if component in COMPONENTS:
                for container in active[component]:
                    state = inspect("container", container)["State"]
                    if state.get("ExitCode") != 0 or state.get("OOMKilled"):
                        raise OperationError(f"{component} did not stop cleanly; snapshot aborted and writers remain stopped.")

    def resume(self, metadata=None, writers=True):
        metadata = metadata or self.resources
        try:
            for component in tuple(COMPONENTS) + (WRITERS if writers else ()):
                if component in self.resources and component in metadata:
                    count = metadata[component]["replicas"]
                    self.set_count(component, min(count, 1) if component == "discord" else count)
        except Exception:
            if writers:
                # A later startup failure must not leave earlier application writers serving.
                for component in WRITERS:
                    if component in self.resources:
                        with contextlib.suppress(Exception):
                            self.set_count(component, 0)
            raise


def helper_args(image, volume, writable=False):
    mount = f"type=volume,src={volume},dst=/data" + ("" if writable else ",readonly")
    return ["docker", "run", "--rm", *(["-i"] if writable else []), "--network", "none", "--read-only", "--mount", mount, "--entrypoint", "/bin/sh", image]


def write_archive(path: Path, command, recipient=None):
    with private_file(path) as destination:
        if not recipient:
            run(command, output=destination)
            return
        with tempfile.TemporaryFile() as errors:
            producer = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=errors)
            try:
                run(["age", "-r", recipient], source=producer.stdout, output=destination)
                producer.stdout.close()
                if producer.wait():
                    raise OperationError("Archive creation failed; backup is incomplete.")
            finally:
                if producer.poll() is None:
                    producer.kill()
                    producer.wait()


@contextlib.contextmanager
def contents(path: Path, encrypted: bool, identity: str | None):
    if not encrypted:
        with path.open("rb") as stream:
            yield stream
        return
    if not identity:
        raise OperationError("Encrypted recovery requires --age-identity.")
    with tempfile.TemporaryFile() as errors:
        process = subprocess.Popen(["age", "-d", "-i", identity, str(path)], stdout=subprocess.PIPE, stderr=errors)
        try:
            yield process.stdout
            process.stdout.close()
            if process.wait():
                raise OperationError("Backup decryption failed.")
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()


def validate_archive(path, encrypted, identity):
    with contents(path, encrypted, identity) as stream:
        with tarfile.open(fileobj=stream, mode="r|gz") as archive:
            for member in archive:
                name = PurePosixPath(member.name)
                if name.is_absolute() or ".." in name.parts or not (member.isdir() or member.isfile()):
                    raise OperationError("Backup contains an unsafe archive path or unsupported link/device.")


def backup(runtime: Runtime, env_file: Path, output: Path, components, *, quiesce=False, leave_stopped=False, recipient=None, helper_image=HELPER_IMAGE):
    if output.exists():
        raise OperationError("Backup destination already exists; use a new directory.")
    if recipient and not shutil.which("age"):
        raise OperationError("Install age before requesting encrypted backup output.")
    runtime.verify_environment(read_env(env_file))
    # Pull before downtime. No network access is granted to the archive helper.
    docker("pull", helper_image)
    output.mkdir(mode=0o700, parents=True)
    os.chmod(output, 0o700)
    metadata = {"version": 1, "completed": False, "createdAt": dt.datetime.now(dt.timezone.utc).isoformat(), "stack": runtime.stack, "encrypted": bool(recipient), "resources": runtime.resources, "files": {}}
    runtime.stop(quiesce)
    env_name = "recovery.env" + (".age" if recipient else "")
    if recipient:
        write_archive(output / env_name, ["cat", str(env_file)], recipient)
    else:
        with private_file(output / env_name) as destination:
            destination.write(env_file.read_bytes())
    metadata["environment"] = env_name
    metadata["files"][env_name] = sha256(output / env_name)
    for component in components:
        name = component + ".tar.gz" + (".age" if recipient else "")
        command = helper_args(helper_image, runtime.resources[component]["volume"]) + ["-c", "exec tar -C /data --exclude=mysql.sock -czf - ."]
        write_archive(output / name, command, recipient)
        if not recipient:
            validate_archive(output / name, False, None)
        metadata["files"][name] = sha256(output / name)
    metadata["components"] = list(components)
    metadata["completed"] = True
    with private_file(output / "manifest.json") as destination:
        destination.write((json.dumps(metadata, indent=2) + "\n").encode())
    if not leave_stopped:
        runtime.resume()
    print(f"Completed backup: {output}. Contains sensitive recovery material; keep it private.")
    return metadata


def verify_backup(directory: Path, identity=None):
    manifest_path = directory / "manifest.json"
    if manifest_path.is_symlink() or not manifest_path.is_file():
        raise OperationError("No completed backup manifest found.")
    manifest = json.loads(manifest_path.read_text())
    if not isinstance(manifest, dict):
        raise OperationError("Invalid backup manifest.")
    if manifest.get("version") != 1 or manifest.get("completed") is not True:
        raise OperationError("Unsupported or incomplete backup.")
    components = manifest.get("components")
    if not isinstance(components, list) or not components or not all(isinstance(item, str) for item in components) or len(set(components)) != len(components) or not set(components) <= set(COMPONENTS):
        raise OperationError("Invalid backup component list.")
    resources = manifest.get("resources")
    if not isinstance(resources, dict) or not set(components) <= set(resources) or not set(resources) <= set(COMPONENTS) | set(WRITERS) or any(not isinstance(resource, dict) or not isinstance(resource.get("imageId"), str) or not isinstance(resource.get("replicas"), int) or resource["replicas"] < 0 for resource in resources.values()):
        raise OperationError("Invalid backup resource metadata.")
    encrypted = manifest.get("encrypted") is True
    suffix = ".age" if encrypted else ""
    expected = {component + ".tar.gz" + suffix for component in components} | {"recovery.env" + suffix}
    if not isinstance(manifest.get("files"), dict) or set(manifest["files"]) != expected or manifest.get("environment") != "recovery.env" + suffix:
        raise OperationError("Unexpected backup file paths.")
    for name, digest in manifest["files"].items():
        path = directory / name
        if path.is_symlink() or not path.is_file() or not re.fullmatch(r"[0-9a-f]{64}", str(digest)) or sha256(path) != digest:
            raise OperationError("Backup integrity check failed.")
        if name.startswith("recovery.env"):
            continue
        validate_archive(path, encrypted, identity)
    return manifest


def recovered_environment(directory, manifest, identity):
    with contents(directory / manifest["environment"], manifest["encrypted"], identity) as stream:
        data = stream.read(1024 * 1024 + 1)
    if len(data) > 1024 * 1024:
        raise OperationError("Recovery environment is too large.")
    # Reuse the parser without writing plaintext recovery material to disk.
    class Text:
        def read_text(self):
            return data.decode()
    return read_env(Text()), data


def restore(runtime, directory, env_file, confirmation, *, quiesce=False, resume=False, identity=None, helper_image=HELPER_IMAGE):
    manifest = verify_backup(directory, identity)
    if confirmation != runtime.stack:
        raise OperationError("Destructive restore requires --confirm-restore followed by the exact destination stack.")
    original, _ = recovered_environment(directory, manifest, identity)
    target = read_env(env_file)
    if any(original.get(key, "") != target.get(key, "") for key in RECOVERY_KEYS):
        raise OperationError("Destination recovery credentials/key material differ. Extract and review recovery.env first; values were not printed.")
    runtime.verify_environment(target)
    for component, resource in runtime.resources.items():
        recorded = manifest.get("resources", {}).get(component)
        if not recorded or recorded.get("imageId") != resource["imageId"]:
            raise OperationError("Destination image differs from the backed-up release; deploy the recorded images offline first.")
    docker("pull", helper_image)
    runtime.stop(quiesce)
    for component in manifest["components"]:
        name = component + ".tar.gz" + (".age" if manifest["encrypted"] else "")
        command = helper_args(helper_image, runtime.resources[component]["volume"], True) + ["-c", "find /data -mindepth 1 -maxdepth 1 -exec rm -rf -- {} + && exec tar -xzf - -C /data"]
        with contents(directory / name, manifest["encrypted"], identity) as stream:
            run(command, source=stream)
    if resume:
        runtime.resume(manifest["resources"])
    print("Restore completed." + (" Matching services resumed." if resume else " Services remain stopped; start the matching release after verification."))


def release_overlay(runtime=None, bootstrap_node=None):
    services = {component: {"deploy": {"replicas": 0}, "environment": {key: "${" + key + "}" for key in ("MARIA_USER", "MARIA_PASSWORD", "MARIA_NAME")}} for component in (*WRITERS, "prisma-migrate")}
    for component in COMPONENTS:
        resource = runtime.resources[component] if runtime else {}
        owner = resource.get("mount", {}).get("nodeId") or bootstrap_node
        if not owner:
            raise OperationError("Cannot determine the local datastore owner; no services changed.")
        constraints = list(resource.get("placementConstraints", ["node.role == manager"]))
        if f"node.id=={owner}" not in [constraint.replace(" ", "") for constraint in constraints]:
            constraints.append(f"node.id == {owner}")
        services[component] = {"deploy": {"placement": {"constraints": constraints}}}
    return {"services": services}


def deploy(args, env):
    required = ("API_HOST", "WS_HOST", "MARIA_USER", "MARIA_PASSWORD", "MARIA_NAME", "MARIA_ROOT_PASSWORD", "MINIO_ACCESS_KEY", "MINIO_SECRET_KEY")
    if any(not env.get(key) for key in required):
        raise OperationError("Required deployment configuration is missing; values were not printed.")
    replica_counts = {component: 1 if component == "discord" else int(env.get(component.upper() + "_REPLICAS", "2")) for component in WRITERS}
    if any(count < 1 for count in replica_counts.values()):
        raise OperationError("Release replica counts must be positive; Discord must remain a singleton.")
    if not args.quiesce or (not args.bootstrap and not args.backup_dir):
        raise OperationError("Release requires --quiesce and --backup-dir NEW_DIRECTORY, or --quiesce --bootstrap for an empty installation.")
    environment = dict(os.environ, **env)
    images = {key: os.environ.get(key) or env.get(key, "") for key in ("API_IMAGE", "WEBSOCKET_IMAGE", "DISCORD_IMAGE")}
    if any(not re.fullmatch(r"[^\s@]+@sha256:[0-9a-f]{64}", image) for image in images.values()):
        raise OperationError("Set API_IMAGE, WEBSOCKET_IMAGE and DISCORD_IMAGE to immutable registry@sha256 digests from one release before deployment.")
    environment.update(images)
    text = args.compose_file.read_text()
    if args.dry_run:
        print("Dry run: validate target, stop writers, make cold backup, deploy with writers at zero, apply checked-in migrations, then start one compatible release. No Docker commands or writes executed.")
        return
    revisions = set()
    for image in images.values():
        docker("pull", image)
        revision = (inspect("image", image).get("Config", {}).get("Labels") or {}).get("org.opencontainers.image.revision")
        if not revision or not re.fullmatch(r"[0-9a-f]{40,64}", revision):
            raise OperationError("Every application image must identify its source commit with the OCI revision label; no services changed.")
        revisions.add(revision)
    if len(revisions) != 1:
        raise OperationError("Application image revisions differ; refusing a mixed backend release before maintenance.")
    runtime = None
    bootstrap_node = None
    if not args.bootstrap:
        runtime = Runtime(args.stack_name, timeout=args.timeout)
        for component, key in DATA_IMAGES.items():
            requested = env.get(key)
            known = runtime.resources[component]["repoDigests"]
            if not requested:
                if not known:
                    raise OperationError("A datastore image has no recoverable registry digest; preserve/export it and configure an immutable image before release.")
                environment[key] = known[0]
                continue
            if not re.fullmatch(r"[^\s@]+@sha256:[0-9a-f]{64}", requested):
                raise OperationError("Explicit datastore images must use immutable registry@sha256 digests.")
            docker("pull", requested)
            if inspect("image", requested)["Id"] != runtime.resources[component]["imageId"] and not args.allow_datastore_upgrade:
                raise OperationError("Datastore image change requires a reviewed upgrade and explicit --allow-datastore-upgrade.")
            environment[key] = requested
        backup(runtime, args.env_file, args.backup_dir, COMPONENTS, quiesce=True, leave_stopped=True, recipient=args.age_recipient, helper_image=args.helper_image)
    else:
        manager = json.loads(docker("info", "--format", "{{json .Swarm}}"))
        if not manager.get("ControlAvailable") or not manager.get("NodeID"):
            raise OperationError("Bootstrap requires the Swarm manager that will own the local datastore volumes.")
        bootstrap_node = manager["NodeID"]
        existing = docker("service", "ls", "--filter", f"label=com.docker.stack.namespace={args.stack_name}", "-q").decode().strip()
        volumes = docker("volume", "ls", "--filter", f"label=com.docker.stack.namespace={args.stack_name}", "-q").decode().strip()
        if existing or volumes:
            raise OperationError("--bootstrap refuses an existing stack; use a cold backup release.")
    for canonical, alias in (("MARIA_USER", "MARIADB_USER"), ("MARIA_PASSWORD", "MARIADB_PASSWORD"), ("MARIA_NAME", "MARIADB_DATABASE"), ("MARIA_ROOT_PASSWORD", "MARIADB_ROOT_PASSWORD")):
        environment[alias] = environment[canonical]
    text = re.sub(r"(?m)^(\s*-\s*)\.env\s*$", lambda match: match[1] + json.dumps(str(args.env_file)), text)
    with tempfile.TemporaryDirectory(prefix="gmi-deploy-") as temporary:
        path = Path(temporary) / "stack.yml"
        with private_file(path) as stream:
            stream.write(text.encode())
        overlay = Path(temporary) / "migration.yml"
        # JSON is valid YAML; retain datastore node ownership when the base stack only pins managers.
        overlay.write_text(json.dumps(release_overlay(runtime, bootstrap_node), indent=2))
        run(["docker", "stack", "deploy", "-c", str(path), "-c", str(overlay), "--with-registry-auth", "--prune", "--resolve-image", args.resolve_image, args.stack_name], environment=environment)
    migration = f"{args.stack_name}_prisma-migrate"
    previous = set(docker("service", "ps", "-q", "--no-trunc", migration).decode().split())
    docker("service", "update", "--replicas", "1", "--force", "--restart-condition", "none", migration)
    deadline = time.monotonic() + args.timeout
    while time.monotonic() < deadline:
        tasks = docker("service", "ps", "-q", "--no-trunc", migration).decode().split()
        fresh = [task for task in tasks if task not in previous]
        if fresh:
            state = inspect("task", fresh[0])["Status"]
            if state["State"] == "complete" and state.get("ContainerStatus", {}).get("ExitCode") == 0:
                break
            if state["State"] in ("failed", "rejected", "orphaned"):
                raise OperationError("Migration failed; all application replicas remain at zero. Inspect the migration service privately; do not restart old binaries.")
        time.sleep(1)
    else:
        raise OperationError("Migration completion was not confirmed; application replicas remain at zero.")
    docker("service", "scale", f"{migration}=0")
    try:
        docker("service", "scale", *[f"{args.stack_name}_{component}={replica_counts[component]}" for component in WRITERS])
    except OperationError:
        # A partially successful scale must not leave an unacknowledged partial release serving.
        for component in WRITERS:
            with contextlib.suppress(OperationError):
                docker("service", "scale", f"{args.stack_name}_{component}=0")
        raise
    print("Migrations completed and matching application services started. Publish the matching website and run the documented acceptance checks.")


def parser():
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("operation", choices=("backup", "restore", "deploy"))
    result.add_argument("--env-file", "-e", type=Path)
    result.add_argument("--stack-name", "-s")
    result.add_argument("--dry-run", action="store_true")
    result.add_argument("--quiesce", action="store_true", help="Allow the complete maintenance outage required for a coherent snapshot/release.")
    result.add_argument("--timeout", type=int, default=600)
    result.add_argument("--helper-image", default=HELPER_IMAGE)
    result.add_argument("--fixture-containers", type=Path, help="Isolated tests only: labelled standalone datastore containers.")
    result.add_argument("--backup-dir", "--output-dir", type=Path)
    result.add_argument("--all", action="store_true")
    for component in COMPONENTS:
        result.add_argument("--" + component, action="store_true")
    result.add_argument("--leave-stopped", action="store_true")
    result.add_argument("--age-recipient")
    result.add_argument("--age-identity")
    result.add_argument("--confirm-restore")
    result.add_argument("--resume", action="store_true")
    result.add_argument("--extract-env", type=Path, help="Restore mode: only extract private recovery configuration to a new file; no Docker mutation.")
    result.add_argument("--compose-file", "-c", type=Path, default=ROOT / "docker-stack.swarm.yml")
    result.add_argument("--resolve-image", choices=("always", "changed", "never"), default="always")
    result.add_argument("--bootstrap", action="store_true")
    result.add_argument("--allow-datastore-upgrade", action="store_true", help="Explicitly authorize reviewed immutable datastore image changes after the cold backup.")
    return result


def main(argv=None):
    args = parser().parse_args(argv)
    os.umask(0o077)
    if args.timeout < 1:
        raise OperationError("Timeout must be positive.")
    if args.operation == "restore":
        if not args.backup_dir:
            raise OperationError("Restore requires --backup-dir.")
        manifest = verify_backup(args.backup_dir, args.age_identity)
        if args.extract_env:
            if args.dry_run:
                print("Dry run: would extract private recovery configuration; no writes performed.")
            else:
                _, data = recovered_environment(args.backup_dir, manifest, args.age_identity)
                with private_file(args.extract_env) as stream:
                    stream.write(data)
                print("Private recovery configuration extracted; review destination addresses without changing recovery keys.")
            return
        if not args.env_file or not args.stack_name:
            raise OperationError("Restore requires explicit --env-file and --stack-name destinations.")
    args.env_file = (args.env_file or ROOT / ".env").resolve()
    args.stack_name = args.stack_name or "gmod"
    validate_name(args.stack_name)
    env = read_env(args.env_file)
    if args.operation == "deploy":
        return deploy(args, env)
    if args.dry_run:
        print(f"Dry run: would verify and quiesce explicit target {args.stack_name}, then {args.operation}; no Docker commands or writes performed.")
        return
    runtime = Runtime(args.stack_name, args.fixture_containers, args.timeout)
    if args.operation == "restore":
        return restore(runtime, args.backup_dir, args.env_file, args.confirm_restore, quiesce=args.quiesce, resume=args.resume, identity=args.age_identity, helper_image=args.helper_image)
    components = list(COMPONENTS) if args.all else [name for name in COMPONENTS if getattr(args, name)] or list(COMPONENTS)
    output = args.backup_dir or ROOT / "backup" / (dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ-") + uuid.uuid4().hex[:8])
    backup(runtime, args.env_file, output.resolve(), components, quiesce=args.quiesce, leave_stopped=args.leave_stopped, recipient=args.age_recipient, helper_image=args.helper_image)


if __name__ == "__main__":
    try:
        main()
    except (OperationError, OSError, ValueError, tarfile.TarError) as error:
        print(f"Recovery/release stopped: {error}", file=sys.stderr)
        sys.exit(1)
