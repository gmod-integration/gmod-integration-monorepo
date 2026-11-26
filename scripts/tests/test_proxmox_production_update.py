"""Offline release safety checks; never contact production, Docker or GHCR."""
from __future__ import annotations

import contextlib
import copy
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock

SCRIPT = Path(__file__).resolve().parents[1] / 'proxmox-production-update.py'
SPEC = importlib.util.spec_from_file_location('proxmox_production_update', SCRIPT)
update = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(update)

ROLES = ('api', 'websocket', 'discord')
REVISION = 'a' * 40
NEXT_REVISION = 'b' * 40
COUNTS = {'api': 2, 'websocket': 2, 'discord': 1}
REPOSITORIES = {role: 'ghcr.io/gmod-integration/gmod-integration-' + role for role in ROLES}
IMAGES = {role: REPOSITORIES[role] + '@sha256:' + str(i + 1) * 64 for i, role in enumerate(ROLES)}


def inspected_images(revision=REVISION):
    return {role: {
        'Id': 'sha256:' + str(i + 4) * 64,
        'RepoDigests': [IMAGES[role]],
        'Config': {'Labels': {'org.opencontainers.image.revision': revision}},
    } for i, role in enumerate(ROLES)}


def configuration(images=None):
    services = {}
    for role in (*ROLES, 'prisma-migrate', 'webhook-relay', 'mariadb', 'mongo', 'redis', 'minio', 'traefik', 'cloudflared'):
        image = 'fixture/' + role + '@sha256:' + 'a' * 64
        services[role] = {'image': image, 'restart': 'unless-stopped', 'networks': {'gmod_net': None}}
    for role in ROLES:
        services[role].update(
            deploy={'replicas': COUNTS[role]},
            environment={'MARIA_HOST': 'mariadb', 'MARIA_PASSWORD': 'fixture-$-#-password',
                         'PRIVACY_HASH_SECRET': 'fixture-private-key',
                         'DISCORD_RELAY_URL': 'http://webhook-relay:3000'},
            command=['/bin/sh', '-lc', 'bun scripts/swarm-migration-status.ts && exec bun fixture-' + role],
        )
    services['prisma-migrate'].update(
        image=services['api']['image'], deploy={'replicas': 0}, restart='no',
        environment=copy.deepcopy(services['api']['environment']),
        command=['/bin/sh', '-lc', 'exec bun scripts/swarm-migrate.ts'],
    )
    for name in ('mariadb', 'mongo', 'redis', 'minio'):
        services[name]['volumes'] = [{'type': 'volume', 'source': name + '_data', 'target': '/fixture/' + name}]
    services['traefik']['ports'] = [{'host_ip': '127.0.0.1', 'published': '80', 'target': 80}]
    services['cloudflared'].update(network_mode='host', profiles=['tunnel'])
    result = {
        'name': 'gmod-production', 'services': services,
        'volumes': {name + '_data': {'name': 'gmod_production_final_' + name} for name in ('mariadb', 'mongo', 'redis', 'minio')},
        'networks': {'gmod_net': {'name': 'gmod-production_net', 'driver': 'bridge',
                                 'ipam': {'config': [{'subnet': '172.30.115.0/24', 'gateway': '172.30.115.128'}]}}},
    }
    if images:
        for role, image in images.items():
            result['services'][role]['image'] = image
        result['services']['prisma-migrate']['image'] = images['api']
    return result


def ledger(name='0_initial', checksum='a' * 64, finished=True, rolled_back=False):
    return {'migration_name': name, 'checksum': checksum,
            'finished_at': '2026-11-25T00:00:00Z' if finished else None,
            'rolled_back_at': '2026-11-25T00:00:01Z' if rolled_back else None}


class MigrationPreflightTests(unittest.TestCase):
    def setUp(self):
        self.expected = {'0_initial': 'a' * 64, '20261126_added_column': 'b' * 64}

    def test_new_pending_migration_is_allowed_after_matching_existing_history(self):
        update.validate_ledger(self.expected, [ledger()])

    def test_absent_or_empty_history_never_authorizes_existing_production(self):
        for rows in (None, [], [ledger(finished=False, rolled_back=True)]):
            with self.subTest(rows=rows), self.assertRaises(update.UpdateError):
                update.validate_ledger(self.expected, rows)

    def test_edited_or_missing_applied_migration_is_refused(self):
        for expected in ({'0_initial': 'c' * 64}, {'20261126_added_column': 'b' * 64}, {}):
            with self.subTest(expected=expected), self.assertRaises(update.UpdateError):
                update.validate_ledger(expected, [ledger()])

    def test_unknown_active_history_is_refused(self):
        with self.assertRaises(update.UpdateError):
            update.validate_ledger(self.expected, [ledger(), ledger('unknown_legacy_migration')])

    def test_unfinished_active_migration_is_refused_before_another_attempt(self):
        with self.assertRaises(update.UpdateError):
            update.validate_ledger(self.expected, [ledger(), ledger('20261126_added_column', 'b' * 64, finished=False)])

    def test_historical_rolled_back_attempt_does_not_mask_successful_history(self):
        update.validate_ledger(self.expected, [ledger(), ledger('old_rolled_back_attempt', finished=False, rolled_back=True)])


class ReleaseIdentityTests(unittest.TestCase):
    def test_only_expected_immutable_repositories_are_accepted(self):
        result = update.inspect_release(inspected_images())
        self.assertEqual(result['revision'], REVISION)
        self.assertEqual(result['images'], IMAGES)

    def test_mutable_or_other_repository_cannot_be_selected(self):
        for image in (REPOSITORIES['api'] + ':latest',
                      'ghcr.io/another-owner/gmod-integration-api@sha256:' + '1' * 64,
                      REPOSITORIES['discord'] + '@sha256:' + '1' * 64,
                      REPOSITORIES['api'] + '@sha256:' + 'z' * 64):
            inspected = inspected_images()
            inspected['api']['RepoDigests'] = [image]
            with self.subTest(image=image), self.assertRaises(update.UpdateError):
                update.inspect_release(inspected)

    def test_missing_or_mismatching_source_revision_is_refused(self):
        for revision in (None, 'not-a-commit', NEXT_REVISION):
            inspected = inspected_images()
            inspected['websocket']['Config']['Labels']['org.opencontainers.image.revision'] = revision
            with self.subTest(revision=revision), self.assertRaises(update.UpdateError):
                update.inspect_release(inspected)


class CandidatePreservationTests(unittest.TestCase):
    def test_changing_only_three_images_and_exact_migration_image_is_allowed(self):
        update.validate_config(configuration(), configuration(IMAGES), IMAGES)

    def test_storage_secret_network_or_non_backend_image_change_is_refused(self):
        changes = {
            'volume_name': lambda cfg: cfg['volumes']['mariadb_data'].update(name='wrong_empty_database'),
            'volume_mount': lambda cfg: cfg['services']['mariadb']['volumes'][0].update(source='other_data'),
            'database_image': lambda cfg: cfg['services']['mariadb'].update(image='mariadb:latest'),
            'private_key': lambda cfg: cfg['services']['api']['environment'].update(PRIVACY_HASH_SECRET='changed'),
            'database_password': lambda cfg: cfg['services']['api']['environment'].update(MARIA_PASSWORD='changed'),
            'relay': lambda cfg: cfg['services']['webhook-relay'].update(image='relay:latest'),
            'tunnel': lambda cfg: cfg['services']['cloudflared'].update(image='cloudflare/cloudflared:latest'),
            'gateway': lambda cfg: cfg['networks']['gmod_net']['ipam']['config'][0].update(gateway='172.30.115.1'),
            'writer_count': lambda cfg: cfg['services']['discord']['deploy'].update(replicas=2),
            'command': lambda cfg: cfg['services']['api'].update(command=['bun', 'unreviewed-entrypoint.ts']),
        }
        for change, mutate in changes.items():
            before, candidate = configuration(), configuration(IMAGES)
            mutate(candidate)
            with self.subTest(change=change), self.assertRaises(update.UpdateError):
                update.validate_config(before, candidate, IMAGES)

    def test_migration_must_use_exact_candidate_api_digest(self):
        candidate = configuration(IMAGES)
        candidate['services']['prisma-migrate']['image'] = configuration()['services']['api']['image']
        with self.assertRaises(update.UpdateError):
            update.validate_config(configuration(), candidate, IMAGES)

class PrivateStateTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.root.chmod(0o700)
        self.runtime = update.Updater(state_dir=self.root, current=self.root / 'current', releases=self.root / 'releases')

    def test_state_write_uses_private_permissions_and_is_readable_by_status(self):
        state = {'version': 1, 'status': 'ready', 'selected': {'revision': REVISION, 'images': IMAGES}}
        update.write_json(self.runtime.state_file, state)
        self.assertEqual(self.runtime.state_file.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.runtime.status(), state)
        self.assertEqual(list(self.root.glob('.state.json-*')), [])

    def test_world_readable_state_is_refused(self):
        self.runtime.state_file.write_text(json.dumps({'version': 1, 'status': 'ready'}))
        self.runtime.state_file.chmod(0o644)
        with self.assertRaises(update.UpdateError):
            self.runtime.status()

    def test_symlinked_state_is_refused_without_following_target(self):
        outside = self.root / 'outside.json'
        outside.write_text('{"version":1,"status":"ready"}')
        outside.chmod(0o600)
        self.runtime.state_file.symlink_to(outside)
        with self.assertRaises(update.UpdateError):
            self.runtime.status()

    def test_private_working_directory_rejects_symlinks_and_shared_permissions(self):
        shared = self.root / 'shared'
        shared.mkdir(mode=0o755)
        linked = self.root / 'linked'
        linked.symlink_to(shared, target_is_directory=True)
        for path in (shared, linked):
            with self.subTest(path=path), self.assertRaises(update.UpdateError):
                update.private_dir(path)

    def test_runner_never_inherits_shell_image_override_or_remote_docker_endpoint(self):
        with mock.patch.dict(os.environ, {'API_IMAGE': 'injected:latest', 'DOCKER_HOST': 'tcp://attacker:2375',
                                         'DOCKER_CONTEXT': 'attacker', 'AWS_SECRET_ACCESS_KEY': 'private-fixture'}):
            runner = update.Runner()
        with mock.patch.object(update.subprocess, 'run', return_value=mock.Mock(returncode=0, stdout=b'ok', stderr=b'')) as run:
            self.assertEqual(runner.run(['docker', 'fixture']), b'ok')
        environment = run.call_args.kwargs['env']
        self.assertEqual(environment['DOCKER_HOST'], 'unix:///var/run/docker.sock')
        self.assertNotIn('API_IMAGE', environment)
        self.assertNotIn('DOCKER_CONTEXT', environment)
        self.assertNotIn('AWS_SECRET_ACCESS_KEY', environment)

    def test_failed_command_keeps_private_bytes_out_of_error(self):
        log = io.BytesIO()
        runner = update.Runner(log=log)
        process = mock.Mock(returncode=1, stdout=b'fixture-token', stderr=b'fixture-database-record')
        with mock.patch.object(update.subprocess, 'run', return_value=process):
            with self.assertRaises(update.UpdateError) as raised:
                runner.run(['docker', 'fixture'])
        self.assertNotIn('fixture-token', str(raised.exception))
        self.assertNotIn('fixture-database-record', str(raised.exception))
        self.assertIn(b'fixture-token', log.getvalue())

class CoordinatedUpdateTests(unittest.TestCase):
    """Exercise real durable updater decisions with all external operations replaced."""

    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.root.chmod(0o700)
        self.releases = self.root / 'releases'
        self.releases.mkdir(mode=0o700)
        self.bundle = self.releases / 'existing' / 'bundle'
        self.bundle.mkdir(mode=0o700, parents=True)
        self.current = self.root / 'current'
        self.current.symlink_to(self.bundle, target_is_directory=True)
        self.staged = self.releases / 'candidate' / 'bundle'
        self.staged.mkdir(mode=0o700, parents=True)
        self.runtime = update.Updater(state_dir=self.root / 'state', current=self.current, releases=self.releases)
        self.events = []
        self.baseline = {'revision': REVISION, 'images': copy.deepcopy(IMAGES)}
        self.next_release = {'revision': NEXT_REVISION, 'images': {
            role: REPOSITORIES[role] + '@sha256:' + str(i + 4) * 64 for i, role in enumerate(ROLES)
        }}
        self.live = {'bundle': self.bundle, 'config': configuration(), 'api_id': 'live-api-one',
                     'containers': [{'Id': 'live-api-one', 'Config': {'Image': configuration()['services']['api']['image'],
                          'Labels': {'com.docker.compose.project': 'gmod-production', 'com.docker.compose.service': 'api'}},
                          'State': {'Running': True}}]}
        self.mocks = {}

        def operation(name, result=None):
            def call(*args, **kwargs):
                self.events.append((name, args))
                return result
            return call

        @contextlib.contextmanager
        def lock():
            self.events.append(('backup_lock', ()))
            try:
                yield
            finally:
                self.events.append(('backup_unlock', ()))

        def target():
            update.private_dir(self.runtime.state_dir)
            return self.bundle

        overrides = {
            'target': target,
            'runtime': lambda: self.live,
            'candidate': lambda: copy.deepcopy(self.baseline),
            'expected_migrations': lambda *args: {'0_initial': 'a' * 64, '20261126_added_column': 'b' * 64},
            'image_metadata': lambda *args: {'version': 1, 'release_mode': 'auto', 'migrations': {}},
            'current_ledger': lambda *args: [ledger()],
            'schema': operation('schema'),
            'verify_provenance': operation('verify_provenance'),
            'cancel_migration': operation('cancel_migration'),
            'backup': operation('backup', {'status': 'success', 'snapshot_id': 'd' * 64}),
            'backup_lock': lock,
            'stage': operation('stage', self.staged),
            'stop_writers': operation('stop_writers'),
            'migrate': operation('migrate'),
            'guard': operation('guard'),
            'start_writers': operation('start_writers'),
            'verify_apps': operation('verify_apps'),
            'switch': operation('switch'),
        }
        for name, effect in overrides.items():
            patcher = mock.patch.object(self.runtime, name, side_effect=effect, create=True)
            self.mocks[name] = patcher.start()
            self.addCleanup(patcher.stop)
        patcher = mock.patch.object(self.runtime.runner, 'run', side_effect=AssertionError('Unexpected external process in offline test'))
        patcher.start()
        self.addCleanup(patcher.stop)

    def initialize(self):
        with contextlib.redirect_stdout(io.StringIO()):
            self.runtime.initialize()
        self.events.clear()
        for operation in self.mocks.values():
            operation.reset_mock()

    def available_release(self):
        self.mocks['candidate'].side_effect = None
        self.mocks['candidate'].return_value = copy.deepcopy(self.next_release)

    def names(self):
        return [name for name, _ in self.events]

    def test_initialization_records_baseline_without_deploying_or_stopping(self):
        self.runtime.initialize()
        state = self.runtime.status()
        self.assertEqual(state['status'], 'ready')
        self.assertEqual(state['selected'], self.baseline)
        self.assertNotIn('backup', self.names())
        self.assertNotIn('stop_writers', self.names())
        self.assertNotIn('migrate', self.names())
        self.assertEqual(self.runtime.state_file.stat().st_mode & 0o777, 0o600)
        self.mocks['verify_provenance'].assert_not_called()

    def test_same_published_release_does_not_redeploy_local_bootstrap_images(self):
        self.initialize()
        self.runtime.check(apply=True)
        self.assertNotIn('backup', self.names())
        self.assertNotIn('stop_writers', self.names())
        self.assertEqual(self.runtime.status()['selected'], self.baseline)
        self.mocks['verify_provenance'].assert_not_called()

    def test_partial_publication_waits_without_stopping_live_writers(self):
        self.initialize()
        self.mocks['candidate'].side_effect = update.UpdateError('mixed_image_revisions')
        result = self.runtime.check(apply=True)
        self.assertIn(result['status'], ('waiting', 'deferred'))
        self.assertNotIn('backup', self.names())
        self.assertNotIn('stop_writers', self.names())
        self.assertEqual(self.runtime.status()['selected'], self.baseline)

    def test_check_only_does_not_backup_stop_or_migrate(self):
        self.initialize()
        self.available_release()
        self.runtime.check(apply=False)
        self.assertNotIn('backup', self.names())
        self.assertNotIn('stop_writers', self.names())
        self.assertNotIn('migrate', self.names())
        self.assertEqual(self.runtime.status()['selected'], self.baseline)

    def test_changed_release_uses_durable_selection_even_if_already_pulled(self):
        self.initialize()
        self.available_release()
        self.runtime.check(apply=True)
        self.assertIn('migrate', self.names())
        self.assertEqual(self.runtime.status()['selected'], self.next_release)
        self.events.clear()
        self.runtime.check(apply=True)
        self.assertNotIn('migrate', self.names())
        self.assertNotIn('stop_writers', self.names())

    def test_success_orders_fresh_remote_backup_lock_migration_guard_and_restart(self):
        self.initialize()
        self.available_release()
        self.runtime.check(apply=True)
        names = self.names()
        expected = ['backup', 'backup_lock', 'stop_writers', 'migrate', 'guard', 'start_writers', 'verify_apps', 'switch', 'backup_unlock']
        positions = [names.index(name) for name in expected]
        self.assertEqual(positions, sorted(positions))
        self.mocks['migrate'].assert_called_once_with(self.staged)
        self.mocks['guard'].assert_called_once_with(self.staged)
        self.mocks['start_writers'].assert_called_once_with(self.staged)
        self.assertEqual(self.runtime.status()['status'], 'ready')
        self.assertEqual(self.runtime.status()['selected'], self.next_release)

    def test_feature_branch_package_refuses_before_backup_or_outage(self):
        self.initialize()
        self.available_release()
        self.mocks['verify_provenance'].side_effect = update.UpdateError('candidate_not_on_main')
        with self.assertRaises(update.UpdateError):
            self.runtime.check(apply=True)
        self.assertNotIn('backup', self.names())
        self.assertNotIn('stop_writers', self.names())
        self.assertEqual(self.runtime.status()['selected'], self.baseline)

    def test_incompatible_applied_migration_is_rejected_before_backup_or_outage(self):
        self.initialize()
        self.available_release()
        self.mocks['current_ledger'].side_effect = None
        self.mocks['current_ledger'].return_value = [ledger(checksum='c' * 64)]
        with self.assertRaises(update.UpdateError):
            self.runtime.check(apply=True)
        self.assertNotIn('backup', self.names())
        self.assertNotIn('stop_writers', self.names())
        self.assertNotIn('migrate', self.names())

    def test_failed_backup_leaves_live_writers_and_baseline_untouched(self):
        self.initialize()
        self.available_release()
        self.mocks['backup'].side_effect = update.UpdateError('fresh_remote_backup_failed')
        with self.assertRaises(update.UpdateError):
            self.runtime.check(apply=True)
        self.assertNotIn('stop_writers', self.names())
        self.assertNotIn('migrate', self.names())
        self.assertEqual(self.runtime.status()['selected'], self.baseline)

    def test_failed_migration_blocks_future_runs_even_when_a_newer_package_appears(self):
        self.initialize()
        self.available_release()
        self.mocks['migrate'].side_effect = update.UpdateError('migration_failed')
        with self.assertRaises(update.UpdateError):
            self.runtime.check(apply=True)
        self.assertNotIn('start_writers', self.names())
        self.assertNotIn('switch', self.names())
        self.assertEqual(self.runtime.status()['status'], 'blocked')
        self.assertEqual(self.runtime.status()['selected'], self.baseline)
        self.events.clear()
        self.mocks['candidate'].return_value = {'revision': 'c' * 40, 'images': self.next_release['images']}
        self.mocks['candidate'].reset_mock()
        with self.assertRaises(update.UpdateError):
            self.runtime.check(apply=True)
        self.mocks['candidate'].assert_not_called()
        self.assertNotIn('backup', self.names())
        self.assertNotIn('migrate', self.names())

    def test_initialization_cannot_clear_failure_block(self):
        self.initialize()
        blocked = self.runtime.status()
        blocked['status'] = 'blocked'
        update.write_json(self.runtime.state_file, blocked)
        with self.assertRaises(update.UpdateError):
            self.runtime.initialize()
        self.assertEqual(self.runtime.status()['status'], 'blocked')

    def test_failed_guard_never_starts_new_writers(self):
        self.initialize()
        self.available_release()
        self.mocks['guard'].side_effect = update.UpdateError('checksum_guard_failed')
        with self.assertRaises(update.UpdateError):
            self.runtime.check(apply=True)
        self.assertNotIn('start_writers', self.names())
        self.assertNotIn('switch', self.names())
        self.assertEqual(self.runtime.status()['status'], 'blocked')

    def test_failed_startup_stops_new_writers_and_preserves_block(self):
        self.initialize()
        self.available_release()
        self.mocks['verify_apps'].side_effect = update.UpdateError('listeners_not_ready')
        with self.assertRaises(update.UpdateError):
            self.runtime.check(apply=True)
        names = self.names()
        self.assertIn('start_writers', names)
        later_stops = [i for i, name in enumerate(names) if name == 'stop_writers' and i > names.index('start_writers')]
        self.assertTrue(later_stops)
        self.assertNotIn('switch', names)
        self.assertEqual(self.runtime.status()['status'], 'blocked')

class ProductionAdaptersTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.root.chmod(0o700)
        self.releases = self.root / 'releases'
        self.releases.mkdir(mode=0o700)
        self.bundle = self.releases / 'existing' / 'bundle'
        self.bundle.mkdir(mode=0o700, parents=True)
        self.runtime = update.Updater(state_dir=self.root / 'state', current=self.root / 'current', releases=self.releases)
        self.raw_files = {}
        for name in ('.env', 'application.env', '.relay.env', 'mariadb.env', 'minio.env', 'cloudflared.env'):
            data = ("FIXTURE_RAW='private-$-#-\\n-value'\nLITERAL=$(never-execute)\nFILE=" + name + '\n').encode()
            self.raw_files[name] = data
            path = self.bundle / name
            path.write_bytes(data)
            path.chmod(0o600)
        for name in update.FILES:
            path = self.bundle / name
            path.write_text('{}\n')
            path.chmod(0o600)
        patcher = mock.patch.object(self.runtime.runner, 'run', side_effect=AssertionError('Unexpected external process in offline test'))
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_staging_copies_private_configuration_byte_for_byte(self):
        release = {'revision': NEXT_REVISION, 'images': IMAGES}
        before, candidate_config = configuration(), configuration(IMAGES)
        with mock.patch.object(self.runtime, 'render', side_effect=[before, candidate_config]), \
                mock.patch.object(self.runtime, 'schema') as schema:
            staged = self.runtime.stage(self.bundle, release)
        self.assertNotEqual(staged, self.bundle)
        self.assertEqual(staged.parent.parent, self.releases)
        for name, data in self.raw_files.items():
            with self.subTest(file=name):
                self.assertEqual((self.bundle / name).read_bytes(), data)
                self.assertEqual((staged / name).read_bytes(), data)
                self.assertEqual((staged / name).stat().st_mode & 0o777, 0o600)
        overlay = json.loads((staged / 'compose.update.yml').read_text())
        self.assertEqual(set(overlay['services']), {*ROLES, 'prisma-migrate'})
        self.assertEqual(overlay['services']['prisma-migrate']['image'], IMAGES['api'])
        self.assertEqual(overlay['services']['api']['image'], IMAGES['api'])
        self.assertIn('-f compose.update.yml', (staged / 'gmod-prodctl').read_text())
        self.assertEqual((staged / 'compose.update.yml').stat().st_mode & 0o777, 0o600)
        schema.assert_called_once_with(staged, IMAGES['api'])

    def test_staging_refuses_symlinks_in_private_bundle(self):
        outside = self.root / 'outside-secret'
        outside.write_bytes(b'never-copy')
        (self.bundle / 'linked-private-file').symlink_to(outside)
        with mock.patch.object(self.runtime, 'render') as render, self.assertRaises(update.UpdateError):
            self.runtime.stage(self.bundle, {'revision': REVISION, 'images': IMAGES})
        render.assert_not_called()
        self.assertEqual(outside.read_bytes(), b'never-copy')

    def test_migration_uses_staged_compose_service_once_without_pulling_or_dependencies(self):
        with mock.patch.object(self.runtime, 'docker', return_value=b''), \
                mock.patch.object(self.runtime, 'compose', return_value=b'') as compose:
            self.runtime.migrate(self.bundle)
        arguments = compose.call_args.args
        self.assertEqual(arguments[0], self.bundle)
        self.assertEqual(arguments[-1], 'prisma-migrate')
        self.assertIn('--rm', arguments)
        self.assertIn('--no-deps', arguments)
        self.assertEqual(arguments[arguments.index('--pull') + 1], 'never')
        compose.assert_called_once()

    def test_concurrent_migration_is_refused_before_starting_one(self):
        with mock.patch.object(self.runtime, 'docker', return_value=b'existing-migration\n'), \
                mock.patch.object(self.runtime, 'compose') as compose, self.assertRaises(update.UpdateError):
            self.runtime.migrate(self.bundle)
        compose.assert_not_called()

    def test_checksum_guard_uses_candidate_api_and_never_old_running_container(self):
        with mock.patch.object(self.runtime, 'compose', return_value=b'') as compose:
            self.runtime.guard(self.bundle)
        arguments = compose.call_args.args
        self.assertEqual(arguments[0], self.bundle)
        self.assertEqual(arguments[-2:], ('api', 'scripts/swarm-migration-status.ts'))
        self.assertIn('--no-deps', arguments)
        self.assertEqual(arguments[arguments.index('--pull') + 1], 'never')

    def test_starting_writers_leaves_datastores_and_tunnel_untouched(self):
        with mock.patch.object(self.runtime, 'compose', return_value=b'') as compose:
            self.runtime.start_writers(self.bundle)
        arguments = compose.call_args.args
        self.assertEqual(arguments[-3:], ROLES)
        self.assertIn('--no-deps', arguments)
        self.assertEqual(arguments[arguments.index('--pull') + 1], 'never')
        for service in ('mariadb', 'mongo', 'redis', 'minio', 'traefik', 'cloudflared'):
            self.assertNotIn(service, arguments)

    def test_backup_rejects_stale_prepared_or_unverified_success_marker(self):
        backup_root = self.root / 'backup'
        backup_root.mkdir(mode=0o700)
        valid = {'status': 'success', 'stage': 'complete', 'prepare_only': False,
                 'started_at_utc': '2026-11-26T10:00:01+00:00', 'snapshot_id': 'd' * 64}
        variants = {
            'old_success': dict(valid, started_at_utc='2026-11-25T00:00:00+00:00'),
            'prepared_only': dict(valid, prepare_only=True),
            'export_only': dict(valid, status='prepared'),
            'missing_snapshot': {key: value for key, value in valid.items() if key != 'snapshot_id'},
            'upload_not_checked': dict(valid, stage='check'),
        }
        for reason, marker in variants.items():
            (backup_root / 'last-success.json').write_text(json.dumps(marker))
            with self.subTest(reason=reason), mock.patch.object(update, 'BACKUP', backup_root), \
                    mock.patch.object(update, 'now', return_value='2026-11-26T10:00:00+00:00'), \
                    mock.patch.object(self.runtime.runner, 'run', return_value=b''), \
                    self.assertRaises(update.UpdateError):
                self.runtime.backup()

    def test_backup_requires_new_completed_offsite_snapshot(self):
        backup_root = self.root / 'backup'
        backup_root.mkdir(mode=0o700)
        marker = {'status': 'success', 'stage': 'complete', 'prepare_only': False,
                  'started_at_utc': '2026-11-26T10:00:01+00:00', 'snapshot_id': 'd' * 64}
        (backup_root / 'last-success.json').write_text(json.dumps(marker))
        with mock.patch.object(update, 'BACKUP', backup_root), \
                mock.patch.object(update, 'now', return_value='2026-11-26T10:00:00+00:00'), \
                mock.patch.object(self.runtime.runner, 'run', return_value=b'') as run:
            self.runtime.backup()
        self.assertEqual(run.call_args.args[0], ['/usr/local/sbin/gmod-plakar-backup', '--run'])

class ProvenanceTests(unittest.TestCase):
    def setUp(self):
        self.runtime = update.Updater()
        self.release = {'revision': NEXT_REVISION, 'images': IMAGES}
        self.state = {'baseline_only': False, 'selected': {'revision': REVISION, 'images': IMAGES}}

    @staticmethod
    def comparison(base, status='ahead'):
        return {'status': status, 'merge_base_commit': {'sha': base}}

    def test_compare_queries_current_monorepo_with_read_only_bounded_response(self):
        payload = self.comparison(NEXT_REVISION)
        response = io.BytesIO(json.dumps(payload).encode())
        with mock.patch.object(update.urllib.request, 'urlopen', return_value=response) as open_url:
            self.assertEqual(self.runtime.github_compare(NEXT_REVISION, 'main'), payload)
        request = open_url.call_args.args[0]
        self.assertEqual(request.get_method(), 'GET')
        self.assertEqual(request.full_url, 'https://api.github.com/repos/gmod-integration/gmod-integration-monorepo/compare/' + NEXT_REVISION + '...main')
        self.assertIsNone(request.data)
        self.assertEqual(open_url.call_args.kwargs['timeout'], 20)

    def test_unavailable_provenance_never_authorizes_candidate(self):
        with mock.patch.object(update.urllib.request, 'urlopen', side_effect=OSError('private network diagnostic')):
            with self.assertRaises(update.UpdateError) as raised:
                self.runtime.github_compare(NEXT_REVISION, 'main')
        self.assertEqual(str(raised.exception), 'github_provenance_unavailable')

    def test_candidate_on_main_and_forward_of_deployed_revision_is_accepted(self):
        with mock.patch.object(self.runtime, 'github_compare', side_effect=[
                self.comparison(NEXT_REVISION), self.comparison(REVISION)]) as compare:
            self.runtime.verify_provenance(self.release, self.state)
        self.assertEqual(compare.call_args_list, [mock.call(NEXT_REVISION, 'main'), mock.call(REVISION, NEXT_REVISION)])

    def test_baseline_checks_main_provenance_without_requiring_custom_bootstrap_ancestry(self):
        self.state['baseline_only'] = True
        with mock.patch.object(self.runtime, 'github_compare', return_value=self.comparison(NEXT_REVISION)) as compare:
            self.runtime.verify_provenance(self.release, self.state)
        compare.assert_called_once_with(NEXT_REVISION, 'main')

    def test_feature_branch_or_unverifiable_merge_base_is_refused(self):
        for comparison in (self.comparison(REVISION, 'diverged'),
                           self.comparison(REVISION, 'behind'),
                           self.comparison(REVISION, 'ahead'), {}):
            with self.subTest(comparison=comparison), \
                    mock.patch.object(self.runtime, 'github_compare', return_value=comparison), \
                    self.assertRaises(update.UpdateError):
                self.runtime.verify_provenance(self.release, self.state)

    def test_older_package_on_main_cannot_downgrade_previously_deployed_code(self):
        with mock.patch.object(self.runtime, 'github_compare', side_effect=[
                self.comparison(NEXT_REVISION), self.comparison(NEXT_REVISION, 'behind')]), \
                self.assertRaises(update.UpdateError):
            self.runtime.verify_provenance(self.release, self.state)

    def test_identical_commit_is_valid_when_only_image_digest_was_rebuilt(self):
        self.release['revision'] = REVISION
        with mock.patch.object(self.runtime, 'github_compare', return_value=self.comparison(REVISION, 'identical')):
            self.runtime.verify_provenance(self.release, self.state)


class CandidateAcceptanceTests(unittest.TestCase):
    def setUp(self):
        self.runtime = update.Updater()
        self.runtime._stores = {}
        self.clock = 0
        self.polls = 0
        self.log_bytes = b'[ready] Ready on main with 100 guilds\n'
        self.changed_ids_at = None
        self.rows = []
        for role, count in COUNTS.items():
            for number in range(count):
                self.rows.append({'Id': role + str(number + 1),
                                  'Config': {'Image': IMAGES[role], 'Labels': {'com.docker.compose.service': role}},
                                  'State': {'Running': True, 'StartedAt': '2026-11-26T10:00:00Z'},
                                  'RestartCount': 0})
        self.listener_calls = []
        self.fail_listener = None
        self.headers = {'Access-Control-Allow-Origin': 'https://gmod-integration.com',
                        'Access-Control-Allow-Credentials': 'true'}

        class Response:
            def __init__(response, path):
                response.status = 200 if path == '/v6' else 401

            def read(response, limit):
                return b'{"version":"v6"}'

            def getheader(response, name):
                return self.headers.get(name)

        class Connection:
            def __init__(connection, *args, **kwargs):
                connection.path = None

            def request(connection, method, path, headers):
                self.assertEqual(method, 'GET')
                connection.path = path

            def getresponse(connection):
                return Response(connection.path)

            def close(connection):
                pass

        def rows():
            result = copy.deepcopy(self.rows)
            if self.changed_ids_at is not None and self.clock >= self.changed_ids_at:
                result[0]['Id'] += '-replacement'
            return result

        def docker(*arguments, **kwargs):
            if arguments[0] == 'ps':
                return ('\n'.join(item['Id'] for item in rows()) + '\n').encode()
            if arguments[0] == 'inspect':
                self.polls += 1
                return json.dumps(rows()).encode()
            if arguments[0] == 'logs':
                return self.log_bytes
            raise AssertionError('Unexpected Docker call in acceptance fixture: ' + repr(arguments))

        def listener(container, port):
            self.listener_calls.append((container, port))
            if container == self.fail_listener:
                raise update.UpdateError('candidate_replica_listener_failed')

        def sleep(seconds):
            self.clock += seconds

        patches = [
            mock.patch.object(self.runtime, 'docker', side_effect=docker),
            mock.patch.object(self.runtime, 'listener', side_effect=listener),
            mock.patch.object(self.runtime, 'render', return_value=configuration(IMAGES)),
            mock.patch.object(update.time, 'monotonic', side_effect=lambda: self.clock),
            mock.patch.object(update.time, 'sleep', side_effect=sleep),
            mock.patch('http.client.HTTPConnection', Connection),
        ]
        for patcher in patches:
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_main_ready_log_and_every_replica_listener_must_remain_stable_for_five_seconds(self):
        self.runtime.verify_apps(Path('/fixture/bundle'))
        self.assertGreaterEqual(self.clock, 5)
        self.assertGreaterEqual(self.polls, 3)
        self.assertEqual(set(self.listener_calls), {
            ('api1', 53136), ('api2', 53136), ('websocket1', 53139), ('websocket2', 53139)})
        self.assertTrue(all(self.listener_calls.count(pair) >= 3 for pair in set(self.listener_calls)))

    def test_generic_or_custom_bot_ready_message_does_not_authorize_release(self):
        self.log_bytes = b'Discord Ready\nReady on custom guild fixture\n'
        with self.assertRaises(update.UpdateError):
            self.runtime.verify_apps(Path('/fixture/bundle'))
        self.assertGreaterEqual(self.clock, 90)

    def test_one_failed_replica_is_not_hidden_by_healthy_load_balanced_endpoint(self):
        self.fail_listener = 'api2'
        with self.assertRaises(update.UpdateError):
            self.runtime.verify_apps(Path('/fixture/bundle'))
        self.assertIn(('api2', 53136), self.listener_calls)

    def test_container_replacement_restarts_five_second_stability_window(self):
        self.changed_ids_at = 4
        self.runtime.verify_apps(Path('/fixture/bundle'))
        self.assertGreaterEqual(self.clock, 9)
        self.assertIn(('api1-replacement', 53136), self.listener_calls)

    def test_old_image_or_restarted_container_never_counts_as_healthy_candidate(self):
        for change in ('old_image', 'restart'):
            saved = copy.deepcopy(self.rows)
            if change == 'old_image':
                self.rows[0]['Config']['Image'] = 'fixture/old-api@sha256:' + 'f' * 64
            else:
                self.rows[0]['RestartCount'] = 1
            self.clock = 0
            with self.subTest(change=change), self.assertRaises(update.UpdateError):
                self.runtime.verify_apps(Path('/fixture/bundle'))
            self.rows = saved

class RenderedEnvironmentTests(unittest.TestCase):
    def test_compose_escaped_single_dollar_matches_original_runtime_secret(self):
        self.assertTrue(update.environment_matches_rendered(
            {'SECRET': 'fixture$$literal#secret'}, {'SECRET': 'fixture$literal#secret'}))

    def test_consecutive_runtime_dollars_require_exact_rendered_dollar_count(self):
        self.assertTrue(update.environment_matches_rendered(
            {'SECRET': 'fixture$$$$literal'}, {'SECRET': 'fixture$$literal'}))
        self.assertFalse(update.environment_matches_rendered(
            {'SECRET': 'fixture$$$$literal'}, {'SECRET': 'fixture$literal'}))

    def test_real_secret_change_is_refused_despite_matching_dollar_pattern(self):
        self.assertFalse(update.environment_matches_rendered(
            {'SECRET': 'original$$secret'}, {'SECRET': 'changed$secret'}))

    def test_actual_runtime_values_are_never_unescaped_or_interpolated(self):
        self.assertFalse(update.environment_matches_rendered(
            {'SECRET': 'fixture$$literal'}, {'SECRET': 'fixture$$literal'}))
        self.assertTrue(update.environment_matches_rendered(
            {'SECRET': '$${UNEXPANDED}'}, {'SECRET': '${UNEXPANDED}'}))

    def test_unset_environment_is_distinct_from_explicit_empty_value(self):
        self.assertTrue(update.environment_matches_rendered({'UNSET': None}, {}))
        self.assertFalse(update.environment_matches_rendered({'UNSET': None}, {'UNSET': ''}))
        self.assertTrue(update.environment_matches_rendered({'EMPTY': ''}, {'EMPTY': ''}))
        self.assertFalse(update.environment_matches_rendered({'EMPTY': ''}, {}))

    def test_rendered_scalar_values_match_only_their_exact_runtime_string(self):
        self.assertTrue(update.environment_matches_rendered({'PORT': 6379}, {'PORT': '6379'}))
        self.assertFalse(update.environment_matches_rendered({'PORT': 6379}, {'PORT': '06379'}))


if __name__ == '__main__':
    unittest.main()
