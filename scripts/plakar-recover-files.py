#!/usr/bin/env python3
"""Read Plakar snapshots or recover private files, without starting any datastore.

Requires PyYAML. Raw Plakar output and recovered filenames stay in private files.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import uuid


class RecoveryError(RuntimeError):
    pass


OPERATIONS = ("list", "info", "check", "restore")
CONFIG_FILES = ("sources.yml", "destinations.yml", "stores.yml")
INTERNAL_DIRECTORY = ".plakar-recovery-runs"
RESTORE_OPTIONS = ("skip_permissions=true", "skip_ownership=true", "skip_times=true", "skip_root_perms_and_time=true")


def absolute_path(value: str) -> Path:
    if not value.startswith("/") or value.startswith("//") or os.path.normpath(value) != value or "\\" in value or any(ord(c) < 32 or ord(c) == 127 for c in value):
        raise RecoveryError("Use a canonical absolute local path without traversal or control characters.")
    return Path(value)


def no_symlink_parents(path: Path):
    for current in (path, *path.parents):
        try:
            mode = current.lstat().st_mode
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(mode):
            raise RecoveryError("Local paths must not contain symbolic links.")


def private_directory(path: Path):
    no_symlink_parents(path)
    try:
        metadata = path.lstat()
    except FileNotFoundError:
        raise RecoveryError("Create the required private directory with mode 0700 first.") from None
    if not stat.S_ISDIR(metadata.st_mode) or metadata.st_uid != os.getuid() or stat.S_IMODE(metadata.st_mode) != 0o700:
        raise RecoveryError("Required directories must be owned by the current user with mode 0700.")


def private_file(path: Path):
    no_symlink_parents(path)
    try:
        metadata = path.lstat()
    except FileNotFoundError:
        raise RecoveryError("A required private file is missing.") from None
    if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != os.getuid() or stat.S_IMODE(metadata.st_mode) & 0o077:
        raise RecoveryError("Required files must be regular, owned by the current user and inaccessible to other users.")
    return metadata


def read_private(path: Path, limit=1024 * 1024) -> bytes:
    metadata = private_file(path)
    if metadata.st_size > limit:
        raise RecoveryError("Private configuration or key file exceeds the size limit.")
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor, "rb") as source:
        return source.read(limit + 1)


def write_private(path: Path, data: bytes):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "wb") as destination:
        destination.write(data)


def validate_configuration(directory: Path, store: str) -> dict[str, bytes]:
    """Validate all files before Plakar can run its destructive LoadFallback."""
    private_directory(directory)
    try:
        import yaml
    except ImportError:
        raise RecoveryError("Install PyYAML before using this helper.") from None

    class UniqueLoader(yaml.SafeLoader):
        pass

    def mapping(loader, node, deep=False):
        result = {}
        for key_node, value_node in node.value:
            key = loader.construct_object(key_node, deep=deep)
            if not isinstance(key, str) or key in result:
                raise RecoveryError("Configuration contains duplicate or non-string mapping keys.")
            result[key] = loader.construct_object(value_node, deep=deep)
        return result

    UniqueLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, mapping)
    documents = {}
    for name in CONFIG_FILES:
        data = read_private(directory / name)
        section = name.removesuffix(".yml")
        try:
            document = yaml.load(data, Loader=UniqueLoader)
        except (yaml.YAMLError, UnicodeError):
            raise RecoveryError("A required Plakar YAML file is invalid.") from None
        required = {"version", section}
        allowed = required | ({"default"} if section == "stores" else set())
        if not isinstance(document, dict) or not required <= set(document) <= allowed or document["version"] != "v1.0.0" or not isinstance(document[section], dict):
            raise RecoveryError("Each Plakar YAML file must have version v1.0.0 and its matching mapping.")
        for entry in document[section].values():
            if not isinstance(entry, dict) or not all(isinstance(key, str) and isinstance(value, str) for key, value in entry.items()):
                raise RecoveryError("Plakar configuration entries must map strings to strings.")
        if section == "stores":
            entry = document[section].get(store)
            if not isinstance(entry, dict) or not entry.get("location", "").strip():
                raise RecoveryError("The requested store needs a nonempty location in stores.yml.")
            default = document.get("default", "")
            if not isinstance(default, str) or (default and default not in document[section]):
                raise RecoveryError("The optional default store must name a configured store.")
        documents[name] = data
    return documents


def snapshot_id(value: str) -> str:
    if not re.fullmatch(r"[a-f0-9]{64}", value):
        raise RecoveryError("Use the complete 64-character lowercase hexadecimal snapshot ID from list.")
    return value


def snapshot_path(value: str) -> str:
    if not value.startswith("/") or value.startswith("//") or os.path.normpath(value) != value or any(c in value for c in ("\\", ":")) or any(ord(c) < 32 or ord(c) == 127 for c in value):
        raise RecoveryError("Snapshot paths must be canonical absolute paths without traversal.")
    return value


def destination_path(value: str, output_root: Path, protected: tuple[Path, ...]) -> Path:
    destination = absolute_path(value)
    no_symlink_parents(destination)
    if not destination.is_relative_to(output_root) or destination == output_root:
        raise RecoveryError("Recovery destination must be strictly inside the private output root.")
    if destination.relative_to(output_root).parts[0] == INTERNAL_DIRECTORY:
        raise RecoveryError("Recovery destination overlaps private operation records.")
    if any(destination == path or destination.is_relative_to(path) or path.is_relative_to(destination) for path in protected):
        raise RecoveryError("Recovery destination overlaps configuration, keys or cache.")
    if destination.exists() and (not destination.is_dir() or any(destination.iterdir())):
        raise RecoveryError("Recovery destination must be absent or an empty directory.")
    current = destination.parent
    while current != output_root:
        if current.exists():
            private_directory(current)
        current = current.parent
    if destination.exists():
        private_directory(destination)
    return destination


def command(arguments, config_dir: Path, cache_dir: Path, destination: Path | None) -> list[str]:
    """No generic Plakar command or user-provided flags can enter this allowlist."""
    if arguments.operation not in OPERATIONS or arguments.store != "gmi-prod":
        raise RecoveryError("Unsupported operation or store.")
    result = ["plakar", "-configdir", str(config_dir), "-cachedir", str(cache_dir), "-keyfile", str(arguments.key_file), "at", "@gmi-prod"]
    if arguments.operation == "list":
        return result + ["ls", "-uuid", "-tags"]
    if arguments.operation == "info":
        return result + ["info", snapshot_id(arguments.snapshot)]
    if arguments.operation == "check":
        # One full root per snapshot; no partial/fast/unverified checks.
        return result + ["check"] + [snapshot_id(value) + ":/" for value in arguments.snapshots]
    target = snapshot_id(arguments.snapshot) + ":" + snapshot_path(arguments.snapshot_path)
    if destination is None:
        raise RecoveryError("Restore requires a guarded destination.")
    result += ["restore", "-to", str(destination), "-skip-permissions"]
    for option in RESTORE_OPTIONS:
        result += ["-o", option]
    return result + [target]


def hash_file(path: Path) -> tuple[int, str]:
    digest = hashlib.sha256()
    size = 0
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor, "rb") as source:
        if not stat.S_ISREG(os.fstat(source.fileno()).st_mode):
            raise RecoveryError("Recovered tree contains a non-regular file.")
        while block := source.read(1024 * 1024):
            digest.update(block)
            size += len(block)
    return size, digest.hexdigest()


def inventory_tree(root: Path) -> dict:
    """Reject links and special files; never follow a recovered symbolic link."""
    no_symlink_parents(root)
    private_directory(root)
    files = []
    directories = 0
    pending = [root]
    while pending:
        directory = pending.pop()
        with os.scandir(directory) as entries:
            for entry in entries:
                metadata = entry.stat(follow_symlinks=False)
                path = Path(entry.path)
                if stat.S_ISDIR(metadata.st_mode):
                    private_directory(path)
                    directories += 1
                    pending.append(path)
                elif stat.S_ISREG(metadata.st_mode):
                    if metadata.st_uid != os.getuid() or stat.S_IMODE(metadata.st_mode) & 0o077:
                        raise RecoveryError("Recovered file permissions are not private.")
                    size, digest = hash_file(path)
                    files.append({"path": path.relative_to(root).as_posix(), "bytes": size, "sha256": digest})
                else:
                    raise RecoveryError("Recovered tree contains a symbolic link or special file; it was not followed.")
    files.sort(key=lambda item: item["path"])
    return {"file_count": len(files), "directory_count": directories, "bytes": sum(item["bytes"] for item in files), "files": files}


def diagnostic_lines(paths: tuple[Path, ...]) -> int:
    """A zero CLI exit can still contain signature/export errors or warnings."""
    benign = re.compile(
        r"\b(?:0|no)\s+(?:errors?|warnings?|failures?)\b"
        r"|\bwithout\s+(?:errors?|warnings?|failures?)"
        r"(?:\s*(?:,|and|or)\s*(?:errors?|warnings?|failures?))*\b",
        re.IGNORECASE,
    )
    diagnostic = re.compile(
        r"\b(?:warn(?:ings?)?|err(?:ors?)?|fatal|panic|failed|failures?)\b"
        r"|\bKO\s*[✘✗×]"
        r"|\b(?:chunk|object)\s+(?:(?:is|was)\s+)?(?:missing|corrupted)\b",
        re.IGNORECASE,
    )
    count = 0
    for path in paths:
        with path.open("rb") as stream:
            for line in stream:
                text = line.decode("utf-8", errors="replace")
                # Remove benign counters/phrases, preserving any other diagnostic.
                text = benign.sub("", text)
                if diagnostic.search(text):
                    count += 1
    return count


def parser():
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--config-dir", required=True)
    result.add_argument("--key-file", required=True)
    result.add_argument("--cache-dir", required=True)
    result.add_argument("--output-root", required=True)
    result.add_argument("--store", required=True, choices=("gmi-prod",))
    subcommands = result.add_subparsers(dest="operation", required=True)
    subcommands.add_parser("list", help="Capture the snapshot catalogue in a private log.")
    info = subcommands.add_parser("info", help="Capture metadata for one complete snapshot ID.")
    info.add_argument("snapshot")
    check = subcommands.add_parser("check", help="Read and verify full roots using Plakar's fresh per-invocation verification cache.")
    check.add_argument("snapshots", nargs="+")
    restore = subcommands.add_parser("restore")
    restore.add_argument("snapshot")
    restore.add_argument("--snapshot-path", default="/")
    restore.add_argument("--destination", required=True)
    return result


def recover(arguments) -> dict:
    os.umask(0o077)
    arguments.config_dir = absolute_path(arguments.config_dir)
    arguments.key_file = absolute_path(arguments.key_file)
    cache_root = absolute_path(arguments.cache_dir)
    output_root = absolute_path(arguments.output_root)
    # All validation precedes process execution and output creation.
    documents = validate_configuration(arguments.config_dir, arguments.store)
    if not read_private(arguments.key_file).strip():
        raise RecoveryError("The private key file must not be empty.")
    private_directory(cache_root)
    private_directory(output_root)
    if arguments.operation not in OPERATIONS:
        raise RecoveryError("Unsupported operation.")
    if arguments.operation == "check":
        if not arguments.snapshots or len(set(arguments.snapshots)) != len(arguments.snapshots):
            raise RecoveryError("Check requires distinct complete snapshot IDs.")
        for value in arguments.snapshots:
            snapshot_id(value)
    elif arguments.operation != "list":
        snapshot_id(arguments.snapshot)
    if arguments.operation == "restore":
        snapshot_path(arguments.snapshot_path)
    destination = None
    if arguments.operation == "restore":
        destination = destination_path(arguments.destination, output_root, (cache_root, arguments.config_dir, arguments.key_file))
    records = output_root / INTERNAL_DIRECTORY
    no_symlink_parents(records)
    if records.exists():
        private_directory(records)
    else:
        records.mkdir(mode=0o700)
    run_name = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ-") + uuid.uuid4().hex
    run_dir = records / run_name
    run_dir.mkdir(mode=0o700)
    config_home = run_dir / "config-home"
    config_home.mkdir(mode=0o700)
    config_dir = config_home / "plakar"
    config_dir.mkdir(mode=0o700)
    for name, data in documents.items():
        write_private(config_dir / name, data)
    # Plakar creates a fresh verification cache internally per check invocation.
    # Reuse the catalogue cache; never combine partial paths in the invocation.
    effective_cache = cache_root
    if destination is not None:
        destination.mkdir(mode=0o700, parents=True, exist_ok=True)
        private_directory(destination)
    environment = {key: value for key, value in os.environ.items() if not key.startswith("PLAKAR_")}
    environment["XDG_CONFIG_HOME"] = str(config_home)
    environment["XDG_CACHE_HOME"] = str(effective_cache)
    summary = {"operation": arguments.operation, "status": "started", "run_directory": str(run_dir), "cache_directory": str(effective_cache), "requires_log_review": True, "database_loaded": False}
    try:
        with (run_dir / "stdout.log").open("xb") as stdout, (run_dir / "stderr.log").open("xb") as stderr:
            process = subprocess.run(command(arguments, config_dir, effective_cache, destination), stdin=subprocess.DEVNULL, stdout=stdout, stderr=stderr, env=environment, cwd=run_dir, check=False)
        summary["exit_code"] = process.returncode
        summary["status"] = "completed_requires_review" if process.returncode == 0 else "command_failed"
        summary["diagnostic_line_count"] = diagnostic_lines((run_dir / "stdout.log", run_dir / "stderr.log"))
        if process.returncode == 0 and summary["diagnostic_line_count"]:
            summary["status"] = "diagnostics_require_review"
        for name in ("stdout.log", "stderr.log"):
            size, digest = hash_file(run_dir / name)
            summary[name] = {"bytes": size, "sha256": digest}
        if process.returncode == 0 and destination is not None:
            inventory = inventory_tree(destination)
            inventory_path = run_dir / "files.json"
            write_private(inventory_path, (json.dumps(inventory, indent=2) + "\n").encode())
            summary["inventory"] = {key: value for key, value in inventory.items() if key != "files"}
            summary["inventory"]["sha256"] = hash_file(inventory_path)[1]
    except (OSError, RecoveryError):
        summary["status"] = "local_validation_failed"
        raise RecoveryError("Recovery did not complete safely; inspect the private operation records.") from None
    finally:
        write_private(run_dir / "summary.json", (json.dumps(summary, indent=2) + "\n").encode())
    return summary


def main(argv=None):
    try:
        summary = recover(parser().parse_args(argv))
    except (RecoveryError, OSError) as error:
        print(str(error), file=sys.stderr)
        return 1
    print(json.dumps(summary, sort_keys=True))
    return 0 if summary["status"] == "completed_requires_review" else 1


if __name__ == "__main__":
    sys.exit(main())
