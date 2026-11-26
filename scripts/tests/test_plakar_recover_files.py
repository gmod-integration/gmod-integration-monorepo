"""Offline guard tests: no Plakar repository, datastore or network is accessed."""
import argparse
from contextlib import redirect_stdout
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "plakar-recover-files.py"
SPEC = importlib.util.spec_from_file_location("plakar_recover_files", SCRIPT)
recovery = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(recovery)
SNAPSHOT = "a" * 64


class FileRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.config = self.root / "config"
        self.cache = self.root / "cache"
        self.output = self.root / "output"
        for directory in (self.config, self.cache, self.output):
            directory.mkdir(mode=0o700)
        for section in ("sources", "destinations", "stores"):
            entries = {"gmi-prod": {"location": "s3://fixture.invalid/store", "access_key": "fixture", "secret_access_key": "fixture-secret"}} if section == "stores" else {}
            recovery.write_private(self.config / (section + ".yml"), json.dumps({"version": "v1.0.0", section: entries}).encode())
        self.key = self.root / "private-key"
        recovery.write_private(self.key, b"fixture-passphrase\n")

    def arguments(self, operation="list", **overrides):
        values = dict(config_dir=str(self.config), key_file=str(self.key), cache_dir=str(self.cache), output_root=str(self.output), store="gmi-prod", operation=operation, snapshot=SNAPSHOT, snapshots=[SNAPSHOT], snapshot_path="/", destination=str(self.output / "restored"))
        values.update(overrides)
        return argparse.Namespace(**values)

    def assert_refused_without_process(self, arguments):
        with patch.object(recovery.subprocess, "run") as run:
            with self.assertRaises(recovery.RecoveryError):
                recovery.recover(arguments)
            run.assert_not_called()
        self.assertFalse((self.output / recovery.INTERNAL_DIRECTORY).exists())

    def test_missing_any_yaml_is_refused_before_process_or_config_mutation(self):
        for name in recovery.CONFIG_FILES:
            with self.subTest(name=name):
                path = self.config / name
                original = path.read_bytes()
                path.unlink()
                self.assert_refused_without_process(self.arguments())
                recovery.write_private(path, original)

    def test_yaml_schema_version_duplicate_and_malformed_files_are_rejected(self):
        path = self.config / "sources.yml"
        for content in (b"sources: {}\n", b"version: v2.0.0\nsources: {}\n", b"version: v1.0.0\nsources: []\n", b"version: v1.0.0\nsources: {}\nsources: {}\n", b"version: [\n", b"version: v1.0.0\nsources: {sample: {location: 123}}\n"):
            with self.subTest(content=content):
                path.write_bytes(content)
                self.assert_refused_without_process(self.arguments())

    def test_requested_store_and_location_are_required(self):
        path = self.config / "stores.yml"
        for stores in ({}, {"gmi-prod": {}}, {"gmi-prod": {"location": ""}}):
            with self.subTest(stores=stores):
                path.write_text(json.dumps({"version": "v1.0.0", "stores": stores}))
                self.assert_refused_without_process(self.arguments())

    def test_optional_default_store_is_validated_and_preserved(self):
        path = self.config / "stores.yml"
        document = json.loads(path.read_text())
        document["default"] = "gmi-prod"
        path.write_text(json.dumps(document))
        self.assertEqual(recovery.validate_configuration(self.config, "gmi-prod")["stores.yml"], path.read_bytes())
        for default in ("missing-store", 123):
            document["default"] = default
            path.write_text(json.dumps(document))
            self.assert_refused_without_process(self.arguments())

    def test_private_permissions_and_config_key_symlinks_are_required(self):
        for path in (self.config, self.cache, self.output, self.key, self.config / "stores.yml"):
            with self.subTest(path=path.name):
                previous = path.stat().st_mode & 0o777
                path.chmod(0o755 if path.is_dir() else 0o644)
                self.assert_refused_without_process(self.arguments())
                path.chmod(previous)
        link = self.root / "linked-key"
        link.symlink_to(self.key)
        self.assert_refused_without_process(self.arguments(key_file=str(link)))

    def test_complete_lowercase_snapshot_ids_are_required(self):
        for identifier in ("abc123", "a" * 63, "A" * 64, "a" * 65, "-fast", "a" * 64 + ":/", "01234567-89ab-cdef-0123-456789abcdef"):
            for operation in ("info", "check", "restore"):
                with self.subTest(identifier=identifier, operation=operation):
                    self.assert_refused_without_process(self.arguments(operation, snapshot=identifier, snapshots=[identifier]))

    def test_full_check_refuses_paths_duplicates_and_extra_flags(self):
        self.assert_refused_without_process(self.arguments("check", snapshots=[SNAPSHOT, SNAPSHOT]))
        self.assert_refused_without_process(self.arguments("check", snapshots=[SNAPSHOT + ":/partial"]))
        for command in (["check", SNAPSHOT, "--snapshot-path", "/partial"], ["check", SNAPSHOT, "-fast"]):
            with self.subTest(command=command), redirect_stdout(io.StringIO()), patch("sys.stderr", io.StringIO()), self.assertRaises(SystemExit):
                recovery.parser().parse_args(["--config-dir", str(self.config), "--key-file", str(self.key), "--cache-dir", str(self.cache), "--output-root", str(self.output), "--store", "gmi-prod", *command])

    def test_destination_cannot_escape_root_or_overwrite_existing_files(self):
        occupied = self.output / "occupied"
        occupied.mkdir(mode=0o700)
        recovery.write_private(occupied / "data.sql", b"unchanged")
        for value in (str(self.root / "elsewhere"), str(self.output), str(occupied), str(self.output / ".." / "escape"), "relative", str(self.output / recovery.INTERNAL_DIRECTORY / "target")):
            with self.subTest(value=value):
                self.assert_refused_without_process(self.arguments("restore", destination=value))
        self.assertEqual((occupied / "data.sql").read_bytes(), b"unchanged")

    def test_destination_and_parent_symlinks_are_refused(self):
        external = self.root / "external"
        external.mkdir(mode=0o700)
        link = self.output / "link"
        link.symlink_to(external, target_is_directory=True)
        self.assert_refused_without_process(self.arguments("restore", destination=str(link)))
        self.assert_refused_without_process(self.arguments("restore", destination=str(link / "child")))
        dangling = self.output / "dangling"
        dangling.symlink_to(self.root / "missing")
        self.assert_refused_without_process(self.arguments("restore", destination=str(dangling)))

    def test_destination_cannot_overlap_cache_or_configuration(self):
        nested_cache = self.output / "cache"
        nested_cache.mkdir(mode=0o700)
        self.assert_refused_without_process(self.arguments("restore", cache_dir=str(nested_cache), destination=str(nested_cache / "child")))

    def test_snapshot_paths_are_canonical_and_absolute(self):
        for value in ("relative", "/../secret", "/data/../secret", "/data//child", "//data", "/data/./child", "/data\\child", "/data:secret", "/data\nsecret", "/data\x7fsecret"):
            with self.subTest(value=value):
                self.assert_refused_without_process(self.arguments("restore", snapshot_path=value))

    def test_allowlist_never_builds_store_mutation_or_datastore_commands(self):
        for operation in ("backup", "repair", "prune", "load", "docker", "mysql", "mongo"):
            with self.subTest(operation=operation):
                self.assert_refused_without_process(self.arguments(operation))
                with self.assertRaises(recovery.RecoveryError):
                    recovery.command(self.arguments(operation), self.config, self.cache, None)
        self.assert_refused_without_process(self.arguments(store="other-store"))

    def test_list_stages_complete_config_isolates_environment_and_keeps_output_private(self):
        before = {name: (self.config / name).read_bytes() for name in recovery.CONFIG_FILES}

        def run(command, **options):
            self.assertEqual(command[0], "plakar")
            self.assertEqual(command[-4:], ["@gmi-prod", "ls", "-uuid", "-tags"])
            self.assertEqual(options["stdin"], subprocess.DEVNULL)
            self.assertNotIn("PLAKAR_PASSPHRASE", options["env"])
            self.assertEqual(options["env"]["XDG_CACHE_HOME"], str(self.cache))
            staged = Path(command[command.index("-configdir") + 1])
            self.assertEqual(staged, Path(options["env"]["XDG_CONFIG_HOME"]) / "plakar")
            self.assertEqual({name: (staged / name).read_bytes() for name in recovery.CONFIG_FILES}, before)
            options["stdout"].write(b"private catalogue content\n")
            return subprocess.CompletedProcess(command, 0)

        with patch.dict(os.environ, {"PLAKAR_PASSPHRASE": "secret"}), patch.object(recovery.subprocess, "run", side_effect=run):
            summary = recovery.recover(self.arguments())
        self.assertEqual(summary["status"], "completed_requires_review")
        self.assertEqual({name: (self.config / name).read_bytes() for name in recovery.CONFIG_FILES}, before)
        for path in Path(summary["run_directory"]).rglob("*"):
            self.assertEqual(path.stat().st_mode & 0o777, 0o700 if path.is_dir() else 0o600)

    def test_batch_check_covers_full_roots_and_reuses_catalogue_cache(self):
        with patch.object(recovery.subprocess, "run", return_value=subprocess.CompletedProcess([], 0)) as run:
            summary = recovery.recover(self.arguments("check", snapshots=[SNAPSHOT, "b" * 64]))
        built = run.call_args.args[0]
        self.assertEqual(built[-3:], ["check", SNAPSHOT + ":/", "b" * 64 + ":/"])
        self.assertEqual(built[built.index("-cachedir") + 1], str(self.cache))
        self.assertEqual(summary["cache_directory"], str(self.cache))
        self.assertNotIn("-fast", built)
        self.assertNotIn("-no-verify", built)

    def test_restore_flags_and_local_inventory_without_loading_data(self):
        payload = b"fixture content only"

        def run(command, **options):
            destination = Path(command[command.index("-to") + 1])
            self.assertIn("-skip-permissions", command)
            for option in recovery.RESTORE_OPTIONS:
                self.assertIn(option, command)
            recovery.write_private(destination / "fixture.sql", payload)
            options["stdout"].write(b"restored one fixture\n")
            return subprocess.CompletedProcess(command, 0)

        with patch.object(recovery.subprocess, "run", side_effect=run):
            summary = recovery.recover(self.arguments("restore"))
        self.assertFalse(summary["database_loaded"])
        self.assertEqual(summary["inventory"]["file_count"], 1)
        self.assertEqual(summary["inventory"]["bytes"], len(payload))
        inventory = json.loads((Path(summary["run_directory"]) / "files.json").read_text())
        self.assertEqual(inventory["files"][0]["sha256"], hashlib.sha256(payload).hexdigest())
        self.assertNotIn("fixture.sql", json.dumps(summary))

    def test_cli_zero_with_signature_warning_requires_review_and_nonzero_helper_exit(self):
        def run(command, **options):
            options["stderr"].write(b"WARN signature verification failed for private snapshot\n")
            return subprocess.CompletedProcess(command, 0)

        with patch.object(recovery.subprocess, "run", side_effect=run):
            summary = recovery.recover(self.arguments("check"))
        self.assertEqual(summary["exit_code"], 0)
        self.assertEqual(summary["status"], "diagnostics_require_review")
        self.assertEqual(summary["diagnostic_line_count"], 1)
        with patch.object(recovery, "recover", return_value=summary), redirect_stdout(io.StringIO()):
            common = ["--config-dir", str(self.config), "--key-file", str(self.key), "--cache-dir", str(self.cache), "--output-root", str(self.output), "--store", "gmi-prod", "check", SNAPSHOT]
            self.assertEqual(recovery.main(common), 1)

    def test_integrity_diagnostics_require_review_even_when_cli_exits_zero(self):
        diagnostics = (
            "check completed with 2 errors",
            "check completed with 2 warnings",
            "check completed with 2 failures",
            "snapshot: KO ✘ /dump.sql.gz",
            "object=fixture: chunk is missing",
            "object=fixture: object corrupted",
        )
        for message in diagnostics:
            with self.subTest(message=message):
                def run(command, **options):
                    options["stdout"].write((message + "\n").encode())
                    return subprocess.CompletedProcess(command, 0)

                with patch.object(recovery.subprocess, "run", side_effect=run):
                    summary = recovery.recover(self.arguments("check"))
                self.assertEqual(summary["status"], "diagnostics_require_review")
                self.assertEqual(summary["diagnostic_line_count"], 1)

    def test_success_phrases_and_zero_counters_are_not_diagnostics(self):
        stdout = self.root / "benign-stdout.log"
        stderr = self.root / "benign-stderr.log"
        recovery.write_private(stdout, (
            "snapshot: check completed without errors\n"
            "snapshot: check completed without errors or warnings\n"
            "snapshot: check completed with no errors\n"
            "snapshot: 0 errors, 0 warnings, 0 failures\n"
            "snapshot: OK ✓ /dump.sql.gz\n"
        ).encode())
        recovery.write_private(stderr, b"")
        self.assertEqual(recovery.diagnostic_lines((stdout, stderr)), 0)
        stdout.write_text("snapshot: 0 errors, 2 warnings\nWARNING: check completed without errors\n")
        self.assertEqual(recovery.diagnostic_lines((stdout, stderr)), 2)

    def test_recovered_symlink_is_not_followed_and_failure_is_recorded(self):
        outside = self.root / "outside-secret"
        recovery.write_private(outside, b"must not be hashed")

        def run(command, **options):
            destination = Path(command[command.index("-to") + 1])
            (destination / "link").symlink_to(outside)
            return subprocess.CompletedProcess(command, 0)

        with patch.object(recovery.subprocess, "run", side_effect=run), self.assertRaises(recovery.RecoveryError):
            recovery.recover(self.arguments("restore"))
        summary_path = next((self.output / recovery.INTERNAL_DIRECTORY).glob("*/summary.json"))
        self.assertEqual(json.loads(summary_path.read_text())["status"], "local_validation_failed")
        self.assertFalse((summary_path.parent / "files.json").exists())
        self.assertEqual(outside.read_bytes(), b"must not be hashed")

    def test_stdout_contains_only_summary_and_command_failure_is_retained(self):
        def run(command, **options):
            options["stdout"].write(b"private snapshot filenames and data\n")
            options["stderr"].write(b"ERROR fixture command failed\n")
            return subprocess.CompletedProcess(command, 3)

        common = ["--config-dir", str(self.config), "--key-file", str(self.key), "--cache-dir", str(self.cache), "--output-root", str(self.output), "--store", "gmi-prod"]
        stdout = io.StringIO()
        with patch.object(recovery.subprocess, "run", side_effect=run), redirect_stdout(stdout):
            code = recovery.main(common + ["list"])
        self.assertEqual(code, 1)
        self.assertNotIn("private snapshot filenames", stdout.getvalue())
        self.assertEqual(json.loads(stdout.getvalue())["exit_code"], 3)


if __name__ == "__main__":
    unittest.main()
