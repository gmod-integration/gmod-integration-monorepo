"""Offline backup guards; no Docker daemon, datastore or repository is contacted."""
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock


SCRIPT = Path(__file__).resolve().parents[1] / "proxmox-plakar-backup.py"
SPEC = importlib.util.spec_from_file_location("proxmox_plakar_backup", SCRIPT)
backup = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(backup)


def container(service, *, project="gmod-production", identifier=None, running=True):
    return {
        "Id": identifier or service + "-fixture-id",
        "State": {"Running": running},
        "Config": {"Labels": {
            "com.docker.compose.project": project,
            "com.docker.compose.service": service,
        }},
        "NetworkSettings": {"Networks": {
            "gmod-production_net": {"IPAddress": "172.30.115.130"},
        }},
    }


class BackupGuardsTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)

    @staticmethod
    def docker_fixture(containers):
        """The runner returns real-shaped docker ps/inspect JSON, without processes."""
        def run(arguments):
            if "inspect" in arguments:
                return json.dumps(containers).encode()
            if "ps" in arguments:
                return ("\n".join(value["Id"] for value in containers) + "\n").encode()
            raise AssertionError("Unexpected Docker fixture command: " + repr(arguments))
        return run

    def all_stores(self):
        return [container(service) for service in ("mariadb", "mongo", "redis", "minio")]

    def test_object_key_cannot_escape_bucket_or_alias_another_key(self):
        for key in ("../secret", "a/../../secret", "/absolute", "a//b", "a/./b", ".", "..", "", "a/", "a\\b", "a\x00b", "a\nb"):
            with self.subTest(key=repr(key)), self.assertRaises(backup.BackupError):
                backup.safe_key_path(self.root, "fixture-bucket", key)

    def test_bucket_name_cannot_escape_staging(self):
        for bucket in ("../other", "/absolute", "a/b", ".", "", "a\\b"):
            with self.subTest(bucket=bucket), self.assertRaises(backup.BackupError):
                backup.safe_key_path(self.root, bucket, "object.bin")

    def test_regular_nested_object_keeps_its_exact_bucket_and_key(self):
        destination = backup.safe_key_path(self.root, "fixture-bucket", "nested/object.bin")
        self.assertEqual(destination, self.root / "fixture-bucket" / "nested" / "object.bin")

    def test_object_parent_symlink_is_rejected_without_following_it(self):
        outside = self.root / "outside"
        outside.mkdir()
        bucket = self.root / "fixture-bucket"
        bucket.mkdir()
        (bucket / "linked").symlink_to(outside, target_is_directory=True)
        with self.assertRaises(backup.BackupError):
            backup.safe_key_path(self.root, "fixture-bucket", "linked/object.bin")
        self.assertFalse((outside / "object.bin").exists())

    def test_dangling_object_symlink_is_rejected(self):
        bucket = self.root / "fixture-bucket"
        bucket.mkdir()
        (bucket / "object.bin").symlink_to(self.root / "missing")
        with self.assertRaises(backup.BackupError):
            backup.safe_key_path(self.root, "fixture-bucket", "object.bin")

    def test_existing_object_is_never_overwritten(self):
        bucket = self.root / "fixture-bucket"
        bucket.mkdir()
        target = bucket / "object.bin"
        target.write_bytes(b"existing bytes")
        with self.assertRaises(backup.BackupError):
            backup.safe_key_path(self.root, "fixture-bucket", "object.bin")
        self.assertEqual(target.read_bytes(), b"existing bytes")

    def test_container_selection_uses_exact_project_and_service_labels(self):
        containers = self.all_stores()
        containers.extend((container("mongo", project="gmod-production-test", identifier="foreign-project"), container("mongo-old", identifier="foreign-service")))
        found = backup.discover_containers(self.docker_fixture(containers))
        self.assertEqual(set(found), {"mariadb", "mongo", "redis", "minio"})
        self.assertEqual(found["mongo"]["Id"], "mongo-fixture-id")

    def test_missing_or_stopped_datastore_refuses_backup(self):
        for mode in ("missing", "stopped"):
            containers = self.all_stores()
            if mode == "missing":
                containers = [value for value in containers if value["Id"] != "mongo-fixture-id"]
            else:
                containers[1]["State"]["Running"] = False
            with self.subTest(mode=mode), self.assertRaises(backup.BackupError):
                backup.discover_containers(self.docker_fixture(containers))

    def test_two_running_candidates_for_one_store_refuse_backup(self):
        containers = self.all_stores() + [container("mongo", identifier="mongo-duplicate")]
        with self.assertRaises(backup.BackupError):
            backup.discover_containers(self.docker_fixture(containers))

    def test_simultaneous_runs_are_refused_and_released_lock_is_reusable(self):
        lock = self.root / "run.lock"
        first = backup.acquire_lock(lock)
        try:
            with self.assertRaises(backup.BackupError):
                backup.acquire_lock(lock)
        finally:
            first.close()
        second = backup.acquire_lock(lock)
        second.close()

    def plakar_logs(self, stdout=b"", stderr=b""):
        out = self.root / "plakar.stdout"
        err = self.root / "plakar.stderr"
        out.write_bytes(stdout)
        err.write_bytes(stderr)
        return out, err

    def test_plakar_nonzero_exit_always_refuses_success(self):
        out, err = self.plakar_logs(stdout=b"backup done\n")
        with self.assertRaises(backup.BackupError):
            backup.check_plakar_result(1, out, err)

    def test_plakar_zero_exit_with_warning_or_error_refuses_success(self):
        for message in (b"WARN signature verification failed\n", b"error uploading chunk\n", b"object corrupted\n"):
            for stream in ("stdout", "stderr"):
                out, err = self.plakar_logs(**{stream: message})
                with self.subTest(message=message, stream=stream), self.assertRaises(backup.BackupError):
                    backup.check_plakar_result(0, out, err)

    def test_benign_zero_error_diagnostics_are_accepted(self):
        out, err = self.plakar_logs(stdout=b"check completed without errors\n0 errors, no warnings\n")
        self.assertEqual(backup.diagnostic_lines((out, err)), 0)
        backup.check_plakar_result(0, out, err)

    def test_failed_new_dump_never_uploads_or_reuses_an_old_successful_dump(self):
        root = self.root / "backup"
        previous = root / "staging" / "run-old-success" / "payload" / "databases"
        previous.mkdir(parents=True)
        old_dump = previous / "mongo.archive.gz"
        old_dump.write_bytes(b"previous successful dump fixture")

        def mkdir(path):
            path.mkdir(mode=0o700, parents=True, exist_ok=True)

        with mock.patch.object(backup, 'ROOT', root), \
                mock.patch.object(backup.os, 'geteuid', return_value=0), \
                mock.patch.object(backup.socket, 'gethostname', return_value='gmod-integration-prod'), \
                mock.patch.object(backup, 'private_directory', side_effect=mkdir), \
                mock.patch.object(backup, 'acquire_lock', return_value=io.BytesIO()), \
                mock.patch.object(backup, 'check_space'), \
                mock.patch.object(backup, 'discover_containers', return_value={name: {'Image': 'fixture-image'} for name in backup.SERVICES}), \
                mock.patch.object(backup, 'capture_databases', side_effect=backup.BackupError('datastore_export_failed')), \
                mock.patch.object(backup.subprocess, 'run') as process:
            with self.assertRaises(backup.BackupError):
                backup.backup()
        process.assert_not_called()
        self.assertEqual(old_dump.read_bytes(), b"previous successful dump fixture")
        result = json.loads((root / 'latest.json').read_bytes())
        self.assertEqual(result['status'], 'failed')
        self.assertEqual(result['stage'], 'databases')
        self.assertNotEqual(Path(result['run_directory']), previous.parent.parent)
        self.assertFalse((Path(result['run_directory']) / 'payload' / 'databases' / 'mongo.archive.gz').exists())

    def run_with_catalogue_fixture(self, catalogue_bytes):
        root = self.root / 'catalogue-backup'
        stores = {name: {'Id': name + '-fixture-id', 'Image': 'fixture-image'}
                  for name in backup.SERVICES}
        captured_commands = []

        def mkdir(path):
            path.mkdir(mode=0o700, parents=True, exist_ok=True)

        def plakar(arguments, **kwargs):
            captured_commands.append(arguments)
            kwargs['stdout'].write(catalogue_bytes if 'ls' in arguments else b'backup completed without errors\n')
            return mock.Mock(returncode=0)

        with mock.patch.object(backup, 'ROOT', root), \
                mock.patch.object(backup.os, 'geteuid', return_value=0), \
                mock.patch.object(backup.socket, 'gethostname', return_value='gmod-integration-prod'), \
                mock.patch.object(backup, 'private_directory', side_effect=mkdir), \
                mock.patch.object(backup, 'acquire_lock', return_value=io.BytesIO()), \
                mock.patch.object(backup, 'check_space'), \
                mock.patch.object(backup, 'discover_containers', return_value=stores), \
                mock.patch.object(backup, 'capture_databases', return_value={}), \
                mock.patch.object(backup, 'capture_minio', return_value={'object_count': 0}), \
                mock.patch.object(backup, 'copy_bundle', return_value={}), \
                mock.patch.object(backup, 'copy_operational_files', return_value=[]), \
                mock.patch.object(backup.subprocess, 'run', side_effect=plakar):
            error = None
            try:
                backup.backup()
            except backup.BackupError as caught:
                error = caught
        return json.loads((root / 'latest.json').read_bytes()), captured_commands, error

    def test_success_records_the_unique_complete_remote_snapshot_id(self):
        identifier = 'a3' * 32
        result, commands, error = self.run_with_catalogue_fixture(
            ('2026-11-26T01:00:00Z  ' + identifier + '  snapshot\n').encode())
        self.assertIsNone(error)
        self.assertEqual(result['status'], 'success')
        self.assertEqual(result['snapshot_id'], identifier)
        self.assertEqual(len(commands), 2)
        self.assertIn('-uuid', commands[1])
        for command in commands:
            name_flag = command.index('-name')
            self.assertEqual(command[name_flag + 1], Path(result['run_directory']).name)

    def test_success_without_a_complete_remote_snapshot_id_is_refused(self):
        result, _, error = self.run_with_catalogue_fixture(b'2026-11-26  a3a3a3a3  snapshot\n')
        self.assertIsInstance(error, backup.BackupError)
        self.assertEqual(result['status'], 'failed')
        self.assertEqual(result['stage'], 'catalogue')
        self.assertNotIn('snapshot_id', result)

    def test_catalogue_with_multiple_unique_snapshots_is_refused(self):
        catalogue = ('a3' * 32 + '\n' + 'b4' * 32 + '\n').encode()
        result, _, error = self.run_with_catalogue_fixture(catalogue)
        self.assertIsInstance(error, backup.BackupError)
        self.assertEqual(result['status'], 'failed')
        self.assertEqual(result['stage'], 'catalogue')
        self.assertNotIn('snapshot_id', result)


if __name__ == "__main__":
    unittest.main()
