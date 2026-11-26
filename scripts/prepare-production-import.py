#!/usr/bin/env python3
"""Prepare a private production-import inventory without starting or importing anything."""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys

BUCKETS = ("gmi-servers-status", "gmi-players-connections-charts", "gmi-players-team-charts",
           "gmi-gdpr-exports", "gmi-players-screenshots", "gmi-user-avatars")
LABELS = {*BUCKETS, "mariadb", "mongodb"}
SHA256 = re.compile(r"[a-f0-9]{64}")
PROOFS = ("completion.json", "full-integrity-status.json", "recovery-results.json", "content-validation.json")


class PreparationError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise PreparationError(message)


def absolute(value):
    path = Path(value)
    require(".." not in path.parts, "Parent traversal is refused.")
    path = Path(os.path.abspath(path))
    for part in (path, *path.parents):
        require(not part.is_symlink(), "Symbolic links are refused.")
    return path


def private(path, *, directory=False):
    metadata = path.lstat()
    correct_type = stat.S_ISDIR(metadata.st_mode) if directory else stat.S_ISREG(metadata.st_mode)
    require(correct_type and metadata.st_uid == os.getuid() and not stat.S_IMODE(metadata.st_mode) & 0o077,
            "Recovery inputs must be private files/directories owned by the current user.")
    if not directory:
        require(metadata.st_nlink == 1, "Hard-linked recovery files are refused.")
    return metadata


def inside(root, value):
    path = absolute(value)
    require(path != root and path.is_relative_to(root), "Recovery input escapes its private root.")
    return path


def digest(path):
    hasher = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            hasher.update(block)
    return hasher.hexdigest()


def document(path):
    private(path)
    require(path.stat().st_size <= 32 * 1024 * 1024, "Recovery metadata is unexpectedly large.")
    return json.loads(path.read_bytes())


def indexed(items, id_key="label"):
    require(isinstance(items, list) and len(items) == len(LABELS), "Exactly eight recovered snapshots are required.")
    result = {item[id_key]: item for item in items}
    require(set(result) == LABELS, "Snapshot labels are missing or duplicated.")
    return result


def verify_tree(directory, inventory):
    private(directory, directory=True)
    entries = inventory["files"]
    require(isinstance(entries, list), "Invalid recovered file inventory.")
    expected = {}
    for item in entries:
        relative = Path(item["path"])
        require(not relative.is_absolute() and relative.parts and str(relative) == item["path"]
                and ".." not in relative.parts, "Invalid recovered file path.")
        require(item["path"] not in expected and SHA256.fullmatch(item["sha256"])
                and type(item["bytes"]) is int and item["bytes"] >= 0, "Invalid recovered file metadata.")
        expected[item["path"]] = item
    found, total = set(), 0
    for current, directories, files in os.walk(directory, followlinks=False):
        private(Path(current), directory=True)
        for name in directories:
            private(Path(current) / name, directory=True)
        for name in files:
            path = Path(current) / name
            metadata = private(path)
            relative = path.relative_to(directory).as_posix()
            require(relative in expected, "Recovered tree contains an unrecorded file.")
            item = expected[relative]
            require(metadata.st_size == item["bytes"] and digest(path) == item["sha256"],
                    "Recovered content no longer matches its recorded SHA-256.")
            found.add(relative)
            total += metadata.st_size
    require(found == set(expected) and len(found) == inventory["file_count"] and total == inventory["bytes"],
            "Recovered file count or byte total does not match its inventory.")
    return len(found), total


OPERATIONS = """Production import preparation — no import or service start has been performed.

1. Use a NEW production instance with its own Terraform state, network and volumes.
   Do not reuse LXC 110, the test environment, or its generated credentials/keys.
   Check available disk against restored data size, indexes, temporary space and backups;
   compressed dump size is not restored database size. Verify source and target DB versions.

2. Copy the active production configuration privately. Preserve the exact active auth
   encryption material (dedicated key or existing Discord-secret fallback) and privacy
   secret. Verify Discord application, frontend/API/WS origins, OAuth API callback,
   webhook relay secret, integration credentials and the actual trusted proxy network.
   Validate only the config schema; never source an env file or start a bot to validate it.

3. Stop identified test services after recording their exact projects/volumes and recovery
   information. Preserve recovered source files and legacy volumes until disposition is
   explicit. Do not start a second Discord worker using the active production bot token.

4. Start ONLY private datastores on the new production instance. Keep API, WebSocket,
   Discord, relay workers, ingress and tunnel stopped. Import the logical SQL dump into
   an empty intended database; restore the Mongo gzip archive into an empty intended
   database; recreate the six MinIO buckets and upload objects with their relative keys.
   Treat bucket lifecycle, policies, metadata and encryption separately: recovered files
   alone do not demonstrate preservation of S3 metadata. Keep all importer logs private.

5. Before applying Prisma migrations, compare the recovered schema and the entire
   _prisma_migrations ledger with checked-in names, SQL SHA-256, completion and rollback
   state. Review any baseline individually; never mark all migrations applied. Use
   migrate deploy only after this comparison; never db push, migrate reset, or edited
   applied SQL. Check the migration guard after migration, before any application writer.

6. Validate table/collection counts, representative relations and objects, and privacy
   erasure/revocation reconciliation. Redis was not covered by this recovery: review
   live queue state and agree explicitly which ephemeral state may be recreated.
   A SHA-256 inventory is not proof of a successful import or cross-store consistency.

7. These snapshots may predate live production writes. Before cutover, pause all AWS
   writers, bots and scheduled jobs, take a final coordinated snapshot/dump, and repeat
   the reviewed import/migration/validation on the intended production destination.
   Reconcile erasures/revocations through the final snapshot before exposing any data.

8. Start matching backend and frontend revisions only after data acceptance. Start one
   Discord worker after confirming the old one stopped; switch routing/tunnel without
   overlapping connectors. Validate login/session/save/logout and authenticated GMod/WS.

9. Retain the old deployment, final coherent snapshot, configuration and exact key
   material for rollback. After new writes or schema/auth conversion, an old-binary-only
   rollback is unsafe: use a reviewed full-data restore or forward repair. Preserve
   post-snapshot writes and erasures when deciding recovery; never delete source backups.
"""


def prepare(recovery_root, output):
    root, destination = absolute(recovery_root), absolute(output)
    private(root, directory=True)
    require(not destination.exists(), "Output must be a new directory.")
    require(not destination.is_relative_to(root) and not root.is_relative_to(destination),
            "Output must be separate from recovered source data.")
    require(destination.parent.is_dir(), "Output parent directory must already exist.")
    inventory_dir = inside(root, root / "inventory")
    private(inventory_dir, directory=True)
    proofs = {name: document(inventory_dir / name) for name in PROOFS}
    completion = proofs["completion.json"]
    require(completion["status"] == "completed_files_only" and completion["snapshot_count"] == 8
            and completion["full_snapshot_checks_passed"] == 8 and completion["local_file_validations_passed"] == 8,
            "Recovery is incomplete.")
    integrity = proofs["full-integrity-status.json"]
    require(integrity["status"] == "all_selected_snapshots_verified" and integrity["verified_count"] == 8
            and integrity["fast_mode"] is False and integrity["signature_verification_enabled"] is True,
            "Full snapshot verification is required.")
    checks = indexed(integrity["snapshots"])
    records = indexed(proofs["recovery-results.json"])
    validation = proofs["content-validation.json"]
    require(validation["status"] == "passed_local_file_validation" and validation["errors"] == [],
            "Local recovery validation did not pass.")
    validations = indexed(validation["snapshots"])
    snapshots = []
    for label in sorted(LABELS):
        record, check, local = records[label], checks[label], validations[label]
        require(record["helper_exit"] == 0 and record["diagnostic_lines"] == 0 and record["full_check_passed"] is True
                and record["file_count_matches"] is True and record["byte_count_matches"] is True
                and check["full_root_verified"] is True and check["snapshot_id"] == record["id"]
                and SHA256.fullmatch(record["id"]) and local["errors"] == []
                and local["status"] == "passed_local_file_validation", "Snapshot proofs are inconsistent.")
        data = inside(root, record["destination"])
        expected = root / ("minio-recovered" if label in BUCKETS else "database-recovered") / label
        require(data == expected, "Unexpected recovered snapshot destination.")
        helper_inventory = inside(root, Path(record["helper_run_directory"]) / "files.json")
        inventory = document(helper_inventory)
        inventory_digest = digest(helper_inventory)
        require(inventory_digest == record["manifest_sha256"] == local["helper_inventory_sha256"],
                "Recorded inventory checksum is inconsistent.")
        count, size = verify_tree(data, inventory)
        require(count == record["actual_files"] == local["files_checked"]
                and size == record["actual_bytes"] == local["bytes_checked"], "Snapshot counters are inconsistent.")
        snapshots.append({"label": label, "snapshot_id": record["id"], "directory": str(data),
                          "files": count, "bytes": size, "inventory": str(helper_inventory),
                          "inventory_sha256": inventory_digest, "file_hashes_recomputed": True,
                          "import_files": [str(data / item["path"]) for item in inventory["files"]
                                           if label not in BUCKETS and item["path"].endswith((".sql", ".archive.gz"))]})
    totals = {"files": sum(item["files"] for item in snapshots), "bytes": sum(item["bytes"] for item in snapshots)}
    require(all(totals[key] == completion[key] for key in totals), "Recovery totals are inconsistent.")
    manifest = {"created_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(), "status": "prepared_files_only",
                "target": "new_separate_production_instance", "database_loaded": False,
                "services_started": False, "recovery_root": str(root), "snapshots": snapshots, **totals,
                "proofs": [{"path": str(inventory_dir / name), "sha256": digest(inventory_dir / name)} for name in PROOFS],
                "cutover_ready": False, "requires_final_coordinated_snapshot": True}
    destination.mkdir(mode=0o700)
    for name, content in (("manifest.json", json.dumps(manifest, indent=2) + "\n"), ("OPERATIONS.txt", OPERATIONS)):
        descriptor = os.open(destination / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "w") as stream:
            stream.write(content)
    return {"status": manifest["status"], "snapshots": 8, **totals, "database_loaded": False, "services_started": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--recovery-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(prepare(args.recovery_root, args.output), sort_keys=True))
    except (PreparationError, OSError, ValueError, TypeError, KeyError):
        print("Production import preparation refused: inputs or recovery proofs failed validation; no import performed.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
