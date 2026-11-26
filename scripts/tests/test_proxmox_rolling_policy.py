"""Rolling SQL compatibility policy; all fixtures are offline and disposable."""
from __future__ import annotations

import copy
import contextlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

SCRIPT = Path(__file__).resolve().parents[1] / 'proxmox-production-update.py'
SPEC = importlib.util.spec_from_file_location('proxmox_rolling_policy', SCRIPT)
update = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(update)

BASE = '0_initial'
NEXT = '20261126_add_optional_column'
LATER = '20261127_add_lookup_index'
CHECKSUMS = {BASE: 'a' * 64, NEXT: 'b' * 64, LATER: 'c' * 64}


def applied(name=BASE, *, finished=True, rolled_back=False, checksum=None):
    return {'migration_name': name, 'checksum': checksum or CHECKSUMS.get(name, 'd' * 64),
            'finished_at': '2026-11-25T00:00:00Z' if finished else None,
            'rolled_back_at': '2026-11-25T00:01:00Z' if rolled_back else None}


def approved(*names):
    # This document is read from the exact immutable candidate image by the updater.
    return {'version': 1, 'release_mode': 'auto',
            'migrations': {name: {'sha256': CHECKSUMS[name], 'online': True} for name in names}}


class RollingMigrationPolicyTests(unittest.TestCase):
    def test_no_pending_sql_uses_rolling_without_metadata(self):
        self.assertEqual(update.migration_plan({BASE: CHECKSUMS[BASE]}, [applied()]),
                         {'mode': 'rolling', 'pending': []})

    def test_declared_maintenance_overrides_no_sql_or_online_approval(self):
        for expected, rows, metadata in (
            ({BASE: CHECKSUMS[BASE]}, [applied()],
             {'version': 1, 'release_mode': 'maintenance', 'migrations': {}}),
            ({BASE: CHECKSUMS[BASE], NEXT: CHECKSUMS[NEXT]}, [applied()],
             dict(approved(NEXT), release_mode='maintenance')),
        ):
            with self.subTest(expected=expected):
                self.assertEqual(update.migration_plan(expected, rows, metadata)['mode'], 'maintenance')

    def test_pending_sql_defaults_to_maintenance(self):
        expected = {BASE: CHECKSUMS[BASE], NEXT: CHECKSUMS[NEXT]}
        for metadata in (None, approved()):
            with self.subTest(metadata=metadata):
                self.assertEqual(update.migration_plan(expected, [applied()], metadata),
                                 {'mode': 'maintenance', 'pending': [NEXT]})

    def test_exact_reviewed_sql_checksum_allows_online_migration(self):
        expected = {BASE: CHECKSUMS[BASE], NEXT: CHECKSUMS[NEXT]}
        self.assertEqual(update.migration_plan(expected, [applied()], approved(NEXT)),
                         {'mode': 'rolling', 'pending': [NEXT]})

    def test_every_pending_migration_requires_its_own_approval(self):
        for metadata, expected_mode in ((approved(NEXT), 'maintenance'),
                                        (approved(LATER), 'maintenance'),
                                        (approved(NEXT, LATER), 'rolling')):
            with self.subTest(metadata=metadata):
                self.assertEqual(update.migration_plan(CHECKSUMS, [applied()], metadata),
                                 {'mode': expected_mode, 'pending': sorted((NEXT, LATER))})

    def test_approval_is_invalidated_when_pending_sql_changes(self):
        metadata = approved(NEXT)
        changed = {BASE: CHECKSUMS[BASE], NEXT: 'e' * 64}
        self.assertEqual(update.migration_plan(changed, [applied()], metadata)['mode'], 'maintenance')

    def test_boolean_true_is_required_to_approve_online_execution(self):
        for value in (False, None, 'true', 'false', 1, 0, [], {}):
            metadata = approved(NEXT)
            metadata['migrations'][NEXT]['online'] = value
            with self.subTest(value=value):
                self.assertEqual(update.migration_plan(CHECKSUMS, [applied(), applied(LATER)], metadata)['mode'],
                                 'maintenance')

    def test_missing_checksum_or_online_flag_never_approves_pending_sql(self):
        for field in ('sha256', 'online'):
            metadata = approved(NEXT)
            del metadata['migrations'][NEXT][field]
            with self.subTest(field=field):
                self.assertEqual(update.migration_plan({BASE: CHECKSUMS[BASE], NEXT: CHECKSUMS[NEXT]},
                                                      [applied()], metadata)['mode'], 'maintenance')

    def test_invalid_document_version_mode_and_mapping_are_rejected(self):
        invalid = [[], True, 'rolling', {}, {'version': 1}, {'version': 2}, {'version': None},
                   {'version': 1, 'release_mode': 'rolling'},
                   {'version': 1, 'release_mode': 'force'},
                   {'version': 1, 'migrations': []}, {'version': 1, 'migrations': 'all'}]
        for metadata in invalid:
            with self.subTest(metadata=metadata), self.assertRaises(update.UpdateError):
                update.migration_plan(CHECKSUMS, [applied()], metadata)

    def test_explicit_approval_cannot_override_edited_applied_history(self):
        expected = {BASE: 'f' * 64, NEXT: CHECKSUMS[NEXT]}
        with self.assertRaises(update.UpdateError):
            update.migration_plan(expected, [applied()], approved(NEXT))

    def test_explicit_approval_cannot_remove_applied_migration(self):
        with self.assertRaises(update.UpdateError):
            update.migration_plan({NEXT: CHECKSUMS[NEXT]}, [applied()], approved(NEXT))

    def test_failed_active_or_empty_history_never_authorizes_rolling(self):
        for rows in ([], [applied(finished=False)], [applied(rolled_back=True, finished=False)],
                     [applied(), applied(NEXT, finished=False)]):
            with self.subTest(rows=rows), self.assertRaises(update.UpdateError):
                update.migration_plan(CHECKSUMS, rows, approved(NEXT, LATER))

    def test_historical_rolled_back_attempt_does_not_count_as_applied_sql(self):
        rows = [applied(), applied(NEXT, finished=False, rolled_back=True)]
        self.assertEqual(update.migration_plan({BASE: CHECKSUMS[BASE], NEXT: CHECKSUMS[NEXT]}, rows),
                         {'mode': 'maintenance', 'pending': [NEXT]})

    def test_policy_does_not_modify_image_metadata_or_current_ledger(self):
        expected, rows, metadata = copy.deepcopy(CHECKSUMS), [applied()], approved(NEXT, LATER)
        originals = copy.deepcopy((expected, rows, metadata))
        update.migration_plan(expected, rows, metadata)
        self.assertEqual((expected, rows, metadata), originals)


class InterruptedRollingTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        root.chmod(0o700)
        self.runtime = update.Updater(state_dir=root, current=root / 'current', releases=root / 'releases')
        self.state = {'version': 1, 'status': 'rolling',
                      'selected': {'revision': 'a' * 40, 'images': {}},
                      'candidate': {'revision': 'b' * 40, 'images': {}},
                      'candidate_bundle': str(root / 'candidate'),
                      'rolling_slots': [{'role': 'api', 'old_id': 'old-api', 'new_id': 'accepted-api'}]}
        update.write_json(self.runtime.state_file, self.state)

    def test_timer_after_interruption_refuses_before_inspecting_or_mutating_replicas(self):
        for apply in (False, True):
            with self.subTest(apply=apply), mock.patch.object(self.runtime, 'target'), \
                 mock.patch.object(self.runtime, 'runtime') as inspect, \
                 mock.patch.object(self.runtime, 'candidate') as pull, \
                 mock.patch.object(self.runtime, 'stop_writers') as stop, \
                 mock.patch.object(self.runtime, 'start_writers') as start:
                with self.assertRaisesRegex(update.UpdateError, 'manual_recovery_required'):
                    self.runtime.check(apply=apply)
                inspect.assert_not_called()
                pull.assert_not_called()
                stop.assert_not_called()
                start.assert_not_called()
        self.assertEqual(self.runtime.status(), self.state)

    def test_initialization_cannot_erase_interrupted_mixed_release_history(self):
        with mock.patch.object(self.runtime, 'target'), \
             mock.patch.object(self.runtime, 'runtime') as inspect, \
             mock.patch.object(self.runtime, 'candidate') as pull:
            with self.assertRaisesRegex(update.UpdateError, 'manual_recovery_required'):
                self.runtime.initialize()
            inspect.assert_not_called()
            pull.assert_not_called()
        self.assertEqual(self.runtime.status(), self.state)


class RollingFailurePreservationTests(unittest.TestCase):
    """Run the durable decision flow while replacing all external I/O boundaries."""

    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.root.chmod(0o700)
        self.runtime = update.Updater(state_dir=self.root, current=self.root / 'current',
                                      releases=self.root / 'releases')
        self.bundle, self.candidate_bundle = self.root / 'existing', self.root / 'candidate'
        self.previous = {'revision': 'a' * 40, 'images': {
            role: update.REPOSITORIES[role] + '@sha256:' + '1' * 64 for role in update.ROLES}}
        self.next_release = {'revision': 'b' * 40, 'images': {
            role: update.REPOSITORIES[role] + '@sha256:' + '2' * 64 for role in update.ROLES}}
        update.write_json(self.runtime.state_file,
                          {'version': 1, 'status': 'ready', 'selected': self.previous})
        self.inventory = {}
        for identifier in ('old-api', 'accepted-api', 'failed-standby'):
            self.inventory[identifier] = {
                'Id': identifier, 'Config': {'Labels': {'com.docker.compose.project': 'gmod-production',
                                                       'com.docker.compose.service': 'api'}},
                'State': {'Running': identifier != 'failed-standby'},
            }
        self.commands, self.events, self.mocks = [], [], {}

        def docker(*args, **kwargs):
            self.commands.append(args)
            if args[0] == 'inspect':
                if args[1] not in self.inventory:
                    raise update.UpdateError('missing_fixture_container')
                return json.dumps([self.inventory[args[1]]]).encode()
            if args[0] == 'stop':
                self.inventory[args[-1]]['State']['Running'] = False
                return b''
            if args[0] == 'rm':
                del self.inventory[args[-1]]
                return b''
            raise AssertionError('Unexpected Docker boundary in rolling policy test')

        def operation(name, result=None):
            def call(*args, **kwargs):
                self.events.append(name)
                return result
            return call

        runtime = {'bundle': self.bundle, 'config': {}, 'api_id': 'old-api', 'containers': []}
        overrides = {
            'target': operation('target'), 'runtime': operation('runtime', runtime),
            'candidate': operation('candidate', self.next_release),
            'verify_provenance': operation('provenance'),
            'expected_migrations': operation('expected', {BASE: CHECKSUMS[BASE]}),
            'current_ledger': operation('ledger', [applied()]),
            'image_metadata': operation('metadata'),
            'stage': operation('stage', self.candidate_bundle),
            'backup': operation('backup', {'snapshot_id': 'd' * 64}),
            'backup_lock': lambda: contextlib.nullcontext(),
            'migrate': operation('migrate'), 'guard': operation('guard'),
            'rolling_update': operation('rolling'), 'start_writers': operation('start'),
            'stop_writers': operation('stop'), 'cancel_migration': operation('cancel'),
            'verify_apps': operation('verify'), 'switch': operation('switch'), 'docker': docker,
        }
        for name, side_effect in overrides.items():
            patcher = mock.patch.object(self.runtime, name, side_effect=side_effect)
            self.mocks[name] = patcher.start()
            self.addCleanup(patcher.stop)
        patcher = mock.patch.object(self.runtime.runner, 'run',
                                    side_effect=AssertionError('External process forbidden in offline test'))
        patcher.start()
        self.addCleanup(patcher.stop)

    def online_pending(self):
        self.mocks['expected_migrations'].side_effect = None
        self.mocks['expected_migrations'].return_value = {BASE: CHECKSUMS[BASE], NEXT: CHECKSUMS[NEXT]}
        self.mocks['image_metadata'].side_effect = None
        self.mocks['image_metadata'].return_value = approved(NEXT)

    def test_no_sql_rolls_after_noop_migration_guard_without_stopping_all_writers(self):
        result = self.runtime.check(apply=True)
        self.assertEqual(result['mode'], 'rolling')
        self.assertEqual(result['pending'], [])
        self.assertLess(self.events.index('migrate'), self.events.index('guard'))
        self.assertLess(self.events.index('guard'), self.events.index('rolling'))
        self.mocks['stop_writers'].assert_not_called()
        self.mocks['start_writers'].assert_not_called()
        self.mocks['image_metadata'].assert_called_once_with(self.next_release['images']['api'])
        self.assertEqual(self.runtime.status()['selected'], self.next_release)

    def test_approved_online_sql_finishes_before_first_candidate_is_started(self):
        self.online_pending()
        result = self.runtime.check(apply=True)
        self.assertEqual(result, {'status': 'updated', 'revision': self.next_release['revision'],
                                  'mode': 'rolling', 'pending': [NEXT]})
        self.assertLess(self.events.index('backup'), self.events.index('migrate'))
        self.assertLess(self.events.index('migrate'), self.events.index('guard'))
        self.assertLess(self.events.index('guard'), self.events.index('rolling'))
        self.mocks['stop_writers'].assert_not_called()

    def test_unreviewed_pending_sql_uses_maintenance_before_migration(self):
        self.online_pending()
        self.mocks['image_metadata'].return_value = None
        result = self.runtime.check(apply=True)
        self.assertEqual(result['mode'], 'maintenance')
        self.assertLess(self.events.index('stop'), self.events.index('migrate'))
        self.assertLess(self.events.index('guard'), self.events.index('start'))
        self.mocks['rolling_update'].assert_not_called()

    def test_failed_second_candidate_keeps_accepted_replacement_and_remaining_old_replica(self):
        self.online_pending()

        def partial_rolling(bundle):
            self.runtime._rolling_unaccepted = {'failed-standby'}
            self.runtime._rolling_state['rolling_accepted'] = ['accepted-api']
            raise update.UpdateError('fixture_second_candidate_failed')

        self.mocks['rolling_update'].side_effect = partial_rolling
        with self.assertRaisesRegex(update.UpdateError, 'rolling_failed_manual_recovery_required'):
            self.runtime.check(apply=True)
        self.assertEqual(set(self.inventory), {'old-api', 'accepted-api'})
        self.assertTrue(all(item['State']['Running'] for item in self.inventory.values()))
        self.assertEqual([args[-1] for args in self.commands if args[0] in ('stop', 'rm')],
                         ['failed-standby', 'failed-standby'])
        self.mocks['stop_writers'].assert_not_called()
        self.mocks['start_writers'].assert_not_called()
        self.mocks['switch'].assert_not_called()
        state = self.runtime.status()
        self.assertEqual(state['status'], 'blocked')
        self.assertEqual(state['selected'], self.previous)
        self.assertEqual(state['candidate'], self.next_release)
        self.assertEqual(state['rolling_accepted'], ['accepted-api'])
        self.assertEqual(state['rolling_unaccepted'], [])

    def test_cleanup_refuses_identifiers_from_other_project_or_discord_singleton(self):
        self.inventory['failed-standby']['Config']['Labels']['com.docker.compose.project'] = 'unrelated'
        self.inventory['accepted-api']['Config']['Labels']['com.docker.compose.service'] = 'discord'
        self.runtime._rolling_unaccepted = {'failed-standby', 'accepted-api'}
        self.runtime.cleanup_rolling()
        self.assertEqual(set(self.inventory), {'old-api', 'accepted-api', 'failed-standby'})
        self.assertFalse(any(args[0] in ('stop', 'rm') for args in self.commands))

    def test_online_sql_failure_blocks_and_never_starts_any_old_binary(self):
        self.online_pending()
        self.mocks['migrate'].side_effect = update.UpdateError('fixture_ddl_failure')
        with self.assertRaises(update.UpdateError):
            self.runtime.check(apply=True)
        self.assertEqual(self.runtime.status()['status'], 'blocked')
        self.mocks['stop_writers'].assert_called_once_with(self.candidate_bundle)
        self.mocks['rolling_update'].assert_not_called()
        self.mocks['start_writers'].assert_not_called()
        self.assertFalse(any(args[0] == 'start' for args in self.commands))

    def test_noop_migration_failure_keeps_existing_writers_and_blocks_retry(self):
        self.mocks['migrate'].side_effect = update.UpdateError('fixture_noop_migration_unavailable')
        with self.assertRaises(update.UpdateError):
            self.runtime.check(apply=True)
        self.mocks['stop_writers'].assert_not_called()
        self.mocks['start_writers'].assert_not_called()
        self.mocks['rolling_update'].assert_not_called()
        self.assertTrue(self.inventory['old-api']['State']['Running'])
        self.assertEqual(self.runtime.status()['status'], 'blocked')
        self.assertFalse(any(args[0] in ('stop', 'rm', 'start') for args in self.commands))

    def test_no_sql_guard_failure_keeps_existing_writers_and_blocks_retry(self):
        self.mocks['guard'].side_effect = update.UpdateError('fixture_noop_guard_unavailable')
        with self.assertRaises(update.UpdateError):
            self.runtime.check(apply=True)
        self.mocks['stop_writers'].assert_not_called()
        self.mocks['start_writers'].assert_not_called()
        self.mocks['rolling_update'].assert_not_called()
        self.assertTrue(self.inventory['old-api']['State']['Running'])
        self.assertEqual(self.runtime.status()['status'], 'blocked')

    def test_ledger_change_while_backup_runs_refuses_before_entering_rolling(self):
        self.online_pending()
        self.mocks['current_ledger'].side_effect = [[applied()], [applied(), applied(NEXT)]]
        with self.assertRaisesRegex(update.UpdateError, 'migration_ledger_changed_before_update'):
            self.runtime.check(apply=True)
        self.mocks['stop_writers'].assert_not_called()
        self.mocks['migrate'].assert_not_called()
        self.mocks['rolling_update'].assert_not_called()
        self.assertEqual(self.runtime.status()['status'], 'ready')
        self.assertEqual(self.runtime.status()['selected'], self.previous)

    def test_acceptance_failure_preserves_completed_rolling_replicas_and_blocks_retry(self):
        self.mocks['verify_apps'].side_effect = update.UpdateError('fixture_final_probe_failure')
        with self.assertRaises(update.UpdateError):
            self.runtime.check(apply=True)
        self.mocks['stop_writers'].assert_not_called()
        self.mocks['switch'].assert_not_called()
        self.assertEqual(self.runtime.status()['status'], 'blocked')
        for operation in self.mocks.values():
            operation.reset_mock()
        with self.assertRaisesRegex(update.UpdateError, 'manual_recovery_required'):
            self.runtime.check(apply=True)
        self.mocks['candidate'].assert_not_called()
        self.mocks['runtime'].assert_not_called()
        self.mocks['stop_writers'].assert_not_called()


class AcceptedJournalDurabilityTests(unittest.TestCase):
    def test_old_replica_is_not_retired_if_accepted_journal_cannot_be_persisted(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        runtime = update.Updater(state_dir=root, current=root / 'current', releases=root / 'releases')
        runtime._rolling_state = {'status': 'rolling', 'rolling_accepted': [], 'rolling_retired': []}
        previous = [{'Id': 'old-api-one'}, {'Id': 'old-api-two'}]

        def created(*args):
            runtime._rolling_unaccepted.add('new-api')
            return 'new-api'

        with mock.patch.object(runtime, 'service_containers', return_value=previous), \
             mock.patch.object(runtime, 'start_spare', side_effect=created), \
             mock.patch.object(runtime, 'wait_candidate'), \
             mock.patch.object(runtime, 'retire_replica') as retire, \
             mock.patch.object(runtime, 'compose') as compose, \
             mock.patch.object(update, 'write_json', side_effect=OSError('fixture_disk_full')):
            with self.assertRaises(OSError):
                runtime.rolling_update(root / 'candidate')
            retire.assert_not_called()
            compose.assert_not_called()
        self.assertEqual(runtime._rolling_unaccepted, set())
        self.assertEqual(runtime._rolling_state['rolling_accepted'], ['new-api'])


if __name__ == '__main__':
    unittest.main()
