"""Offline guards for resuming a confirmed upload's full integrity check."""
import importlib.util
import itertools
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock


SCRIPT = Path(__file__).resolve().parents[1] / 'proxmox-plakar-backup.py'
SPEC = importlib.util.spec_from_file_location('proxmox_plakar_resume', SCRIPT)
backup = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(backup)


class ResumeGuardsTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name) / 'backup'
        self.run = self.root / 'staging' / 'run-fixture'
        self.payload = self.run / 'payload'
        self.logs = self.run / 'logs'
        for path in (self.root, self.root / 'staging', self.run, self.payload, self.logs):
            path.mkdir(mode=0o700)
        self.data = self.payload / 'fixture.sql'
        self.write(self.data, b'current export fixture\n')
        files = backup.inventory(self.payload)
        self.manifest = {
            'format': 'gmod-ct115-plakar-v1',
            'host': 'gmod-integration-prod', 'project': 'gmod-production',
            'files': files, 'file_count': len(files),
            'bytes': sum(item['bytes'] for item in files),
            'minio': {'object_count': 0},
        }
        self.write(self.payload / 'manifest.json', json.dumps(self.manifest).encode())
        self.latest = {'run_directory': str(self.run), 'status': 'running',
                       'stage': 'plakar', 'prepare_only': False}
        self.write(self.root / 'latest.json', json.dumps(self.latest).encode())
        self.write(self.logs / 'plakar.stdout', b'info: backup: backup completed without errors\n')
        self.write(self.logs / 'plakar.stderr', b'')
        root_patch = mock.patch.object(backup, 'ROOT', self.root)
        root_patch.start()
        self.addCleanup(root_patch.stop)

    @staticmethod
    def write(path, data):
        path.write_bytes(data)
        path.chmod(0o600)

    def test_valid_uploaded_run_is_accepted_without_exporting_data(self):
        with mock.patch.object(backup.subprocess, 'run') as process:
            run, manifest, latest = backup.validate_resume_run(self.run)
        process.assert_not_called()
        self.assertEqual(run, self.run)
        self.assertEqual(manifest['files'], self.manifest['files'])
        self.assertEqual(latest['run_directory'], str(self.run))

    def test_run_outside_the_dedicated_staging_directory_is_refused(self):
        with self.assertRaises(backup.BackupError):
            backup.validate_resume_run(self.root)

    def test_symbolic_run_alias_is_refused_even_when_it_targets_a_valid_run(self):
        alias = self.root / 'staging' / 'run-linked'
        alias.symlink_to(self.run, target_is_directory=True)
        with self.assertRaises(backup.BackupError):
            backup.validate_resume_run(alias)

    def test_latest_must_refer_to_the_same_run(self):
        self.latest['run_directory'] = str(self.root / 'staging' / 'run-other')
        self.write(self.root / 'latest.json', json.dumps(self.latest).encode())
        with self.assertRaises(backup.BackupError):
            backup.validate_resume_run(self.run)

    def test_completed_or_exporting_runs_cannot_be_resumed(self):
        for status, stage in (('success', 'complete'), ('running', 'databases'), ('prepared', 'complete')):
            self.latest.update(status=status, stage=stage)
            self.write(self.root / 'latest.json', json.dumps(self.latest).encode())
            with self.subTest(status=status, stage=stage), self.assertRaises(backup.BackupError):
                backup.validate_resume_run(self.run)

    def test_missing_upload_completion_proof_is_refused(self):
        self.write(self.logs / 'plakar.stdout', b'backup started\n')
        with self.assertRaises(backup.BackupError):
            backup.validate_resume_run(self.run)

    def test_modified_export_bytes_are_refused(self):
        self.write(self.data, b'altered export fixture\n')
        with self.assertRaises(backup.BackupError):
            backup.validate_resume_run(self.run)

    def test_unlisted_extra_payload_file_is_refused(self):
        self.write(self.payload / 'unexpected.sql', b'unlisted export fixture\n')
        with self.assertRaises(backup.BackupError):
            backup.validate_resume_run(self.run)

    def test_private_manifest_may_not_be_replaced_by_a_symlink(self):
        outside = self.root / 'manifest-outside.json'
        self.write(outside, (self.payload / 'manifest.json').read_bytes())
        (self.payload / 'manifest.json').unlink()
        (self.payload / 'manifest.json').symlink_to(outside)
        with self.assertRaises(backup.BackupError):
            backup.validate_resume_run(self.run)

    def test_private_upload_proof_may_not_be_replaced_by_a_symlink(self):
        outside = self.root / 'upload-proof-outside.log'
        self.write(outside, (self.logs / 'plakar.stdout').read_bytes())
        (self.logs / 'plakar.stdout').unlink()
        (self.logs / 'plakar.stdout').symlink_to(outside)
        with self.assertRaises(backup.BackupError):
            backup.validate_resume_run(self.run)

    def test_resume_checks_the_uploaded_snapshot_without_exporting_or_uploading_again(self):
        identifier = 'a3' * 32
        commands = []

        def process(arguments, **kwargs):
            commands.append(arguments)
            kwargs['stdout'].write((identifier + '\n').encode() if 'ls' in arguments
                                   else b'check completed without errors\n')
            return mock.Mock(returncode=0)

        current_uid = backup.os.geteuid()
        identity = itertools.chain((0,), itertools.repeat(current_uid))
        with mock.patch.object(backup.os, 'geteuid', side_effect=lambda: next(identity)), \
                mock.patch.object(backup.socket, 'gethostname', return_value='gmod-integration-prod'), \
                mock.patch.object(backup, 'capture_databases') as databases, \
                mock.patch.object(backup, 'capture_minio') as minio, \
                mock.patch.object(backup.subprocess, 'run', side_effect=process):
            result = backup.resume_check(self.run)
        databases.assert_not_called()
        minio.assert_not_called()
        self.assertEqual(result['status'], 'success')
        self.assertTrue(result['resumed_check'])
        self.assertEqual(result['snapshot_id'], identifier)
        self.assertEqual(len(commands), 2)
        self.assertEqual(commands[1][-2:], ['check', identifier + ':/'])
        for command in commands:
            self.assertNotIn('backup', command)
            self.assertNotIn('-fast', command)
            self.assertNotIn('-no-verify', command)
            self.assertEqual(command[command.index('-cpu') + 1], '2')
            self.assertEqual(command[command.index('-concurrency') + 1], '16')
            self.assertLess(command.index('-concurrency'), command.index('at'))
        self.assertEqual(json.loads((self.root / 'last-success.json').read_bytes())['snapshot_id'], identifier)

    def test_resume_obeys_the_same_exclusive_backup_lock(self):
        current_uid = backup.os.geteuid()
        identity = itertools.chain((0,), itertools.repeat(current_uid))
        with backup.acquire_lock(self.root / 'backup.lock'), \
                mock.patch.object(backup.os, 'geteuid', side_effect=lambda: next(identity)), \
                mock.patch.object(backup.socket, 'gethostname', return_value='gmod-integration-prod'), \
                mock.patch.object(backup.subprocess, 'run') as process:
            with self.assertRaises(backup.BackupError):
                backup.resume_check(self.run)
        process.assert_not_called()


if __name__ == '__main__':
    unittest.main()
