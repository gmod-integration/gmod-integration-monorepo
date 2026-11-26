"""Synthetic, offline guards for production import preparation; no services are accessed."""
from contextlib import redirect_stderr, redirect_stdout
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "prepare-production-import.py"
SPEC = importlib.util.spec_from_file_location("prepare_production_import", SCRIPT)
preparation = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(preparation)


def write_json(path, value):
    path.write_text(json.dumps(value))
    path.chmod(0o600)


class ProductionImportPreparationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.root = self.base / "recovery"
        self.root.mkdir(mode=0o700)
        self.output = self.base / "prepared"
        self.inventory = self.root / "inventory"
        self.inventory.mkdir(mode=0o700)
        self.records, checks, validations = [], [], []
        total = 0
        for position, label in enumerate(sorted(preparation.LABELS)):
            group = "minio-recovered" if label in preparation.BUCKETS else "database-recovered"
            parent = self.root / group
            parent.mkdir(mode=0o700, exist_ok=True)
            data = parent / label
            data.mkdir(mode=0o700)
            filename = "fixture.sql" if label == "mariadb" else "fixture.archive.gz" if label == "mongodb" else "fixture-object"
            content = ("synthetic-" + label).encode()
            payload = data / filename
            payload.write_bytes(content)
            payload.chmod(0o600)
            helper = self.root / ("run-" + str(position))
            helper.mkdir(mode=0o700)
            write_json(helper / "files.json", {"file_count": 1, "bytes": len(content), "files": [
                {"path": filename, "bytes": len(content), "sha256": hashlib.sha256(content).hexdigest()}]})
            digest = hashlib.sha256((helper / "files.json").read_bytes()).hexdigest()
            snapshot_id = str(position) * 64
            self.records.append({"label": label, "id": snapshot_id, "destination": str(data), "helper_exit": 0,
                                 "diagnostic_lines": 0, "full_check_passed": True, "file_count_matches": True,
                                 "byte_count_matches": True, "helper_run_directory": str(helper), "manifest_sha256": digest,
                                 "actual_files": 1, "actual_bytes": len(content)})
            checks.append({"label": label, "snapshot_id": snapshot_id, "full_root_verified": True})
            validations.append({"label": label, "status": "passed_local_file_validation", "errors": [],
                                "helper_inventory_sha256": digest, "files_checked": 1, "bytes_checked": len(content)})
            total += len(content)
        write_json(self.inventory / "completion.json", {"status": "completed_files_only", "snapshot_count": 8,
                   "full_snapshot_checks_passed": 8, "local_file_validations_passed": 8, "files": 8, "bytes": total})
        write_json(self.inventory / "full-integrity-status.json", {"status": "all_selected_snapshots_verified",
                   "verified_count": 8, "fast_mode": False, "signature_verification_enabled": True, "snapshots": checks})
        write_json(self.inventory / "recovery-results.json", self.records)
        write_json(self.inventory / "content-validation.json", {"status": "passed_local_file_validation", "errors": [], "snapshots": validations})

    def refuse(self):
        with self.assertRaises((preparation.PreparationError, OSError, ValueError, TypeError, KeyError)):
            preparation.prepare(self.root, self.output)
        self.assertFalse(self.output.exists())

    def change_proof(self, name, mutate):
        path = self.inventory / name
        value = json.loads(path.read_bytes())
        mutate(value)
        write_json(path, value)

    def test_valid_preparation_rehashes_sources_and_creates_only_private_metadata(self):
        result = preparation.prepare(self.root, self.output)
        self.assertEqual(result["status"], "prepared_files_only")
        self.assertEqual(result["files"], 8)
        manifest = json.loads((self.output / "manifest.json").read_bytes())
        self.assertFalse(manifest["database_loaded"])
        self.assertFalse(manifest["services_started"])
        self.assertFalse(manifest["cutover_ready"])
        self.assertTrue(all(item["file_hashes_recomputed"] for item in manifest["snapshots"]))
        self.assertEqual(sum(len(item["import_files"]) for item in manifest["snapshots"]), 2)
        self.assertEqual(self.output.stat().st_mode & 0o777, 0o700)
        self.assertTrue(all(path.stat().st_mode & 0o777 == 0o600 for path in self.output.iterdir()))
        self.assertEqual(set(path.name for path in self.output.iterdir()), {"manifest.json", "OPERATIONS.txt"})

    def test_refuses_incomplete_recovery_and_unverified_snapshots(self):
        self.change_proof("completion.json", lambda d: d.update(full_snapshot_checks_passed=7))
        self.refuse()

    def test_refuses_fast_or_unsigned_checks(self):
        for field, value in (("fast_mode", True), ("signature_verification_enabled", False)):
            with self.subTest(field=field):
                self.change_proof("full-integrity-status.json", lambda d: d.update({field: value}))
                self.refuse()
                self.change_proof("full-integrity-status.json", lambda d: d.update({field: not value}))

    def test_refuses_duplicate_snapshot_labels(self):
        self.change_proof("recovery-results.json", lambda d: d.__setitem__(0, d[1]))
        self.refuse()

    def test_refuses_proof_with_mismatched_snapshot_id(self):
        self.change_proof("full-integrity-status.json", lambda d: d["snapshots"][0].update(snapshot_id="f" * 64))
        self.refuse()

    def test_refuses_same_size_content_tampering(self):
        directory = Path(self.records[0]["destination"])
        path = next(directory.iterdir())
        path.write_bytes(b"x" * path.stat().st_size)
        self.refuse()

    def test_refuses_extra_file_and_symlink(self):
        directory = Path(self.records[0]["destination"])
        extra = directory / "unrecorded"
        extra.write_bytes(b"unexpected")
        extra.chmod(0o600)
        self.refuse()
        extra.unlink()
        extra.symlink_to(next(directory.iterdir()))
        self.refuse()

    def test_refuses_symlinked_recovery_root_and_ancestors(self):
        alias = self.base / "linked"
        alias.symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(preparation.PreparationError):
            preparation.prepare(alias, self.output)
        linked_parent = self.base / "linked-parent"
        linked_parent.symlink_to(self.base, target_is_directory=True)
        with self.assertRaises(preparation.PreparationError):
            preparation.prepare(linked_parent / "recovery", self.output)
        self.assertFalse(self.output.exists())

    def test_refuses_external_snapshot_destination(self):
        self.change_proof("recovery-results.json", lambda d: d[0].update(destination=str(self.base)))
        self.refuse()

    def test_refuses_insecure_inputs(self):
        for path in (self.root, self.inventory, self.inventory / "completion.json"):
            with self.subTest(path=path.name):
                previous = path.stat().st_mode & 0o777
                path.chmod(0o755 if path.is_dir() else 0o644)
                self.refuse()
                path.chmod(previous)

    def test_refuses_existing_output_and_output_inside_recovery(self):
        self.output.mkdir(mode=0o700)
        sentinel = self.output / "keep"
        sentinel.write_text("preserved")
        with self.assertRaises(preparation.PreparationError):
            preparation.prepare(self.root, self.output)
        self.assertEqual(sentinel.read_text(), "preserved")
        with self.assertRaises(preparation.PreparationError):
            preparation.prepare(self.root, self.root / "new-output")

    def test_cli_errors_do_not_print_private_paths_or_metadata(self):
        self.change_proof("recovery-results.json", lambda d: d[0].update(destination="/secret/password-location"))
        stdout, stderr = io.StringIO(), io.StringIO()
        with patch("sys.argv", [str(SCRIPT), "--recovery-root", str(self.root), "--output", str(self.output)]), redirect_stdout(stdout), redirect_stderr(stderr):
            self.assertEqual(preparation.main(), 1)
        self.assertEqual(stdout.getvalue(), "")
        self.assertNotIn("password-location", stderr.getvalue())
        self.assertNotIn(str(self.root), stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
