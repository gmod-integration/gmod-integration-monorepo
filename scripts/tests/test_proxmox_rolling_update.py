"""Offline tests for the real start-first Compose replacement and drain primitives."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

SCRIPT = Path(__file__).resolve().parents[1] / 'proxmox-production-update.py'
SPEC = importlib.util.spec_from_file_location('proxmox_rolling_update', SCRIPT)
update = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(update)


def container(role, identifier, image='fixture:old', bundle=Path('/fixture/bundle')):
    return {'Id': identifier, 'Image': image + '-id', 'RestartCount': 0,
            'Config': {'Image': image, 'Labels': {'com.docker.compose.project': 'gmod-production',
                'com.docker.compose.service': role, 'com.docker.compose.project.working_dir': str(bundle)},
                'Healthcheck': {'Test': ['CMD', 'bun', '-e', "require('node:fs').existsSync('/tmp/gmod-draining')"]}},
            'State': {'Running': True, 'Health': {'Status': 'healthy'}},
            'NetworkSettings': {'Networks': {'gmod-production_net': {'IPAddress': '172.30.115.130'}}}}


class RollingAlgorithmTests(unittest.TestCase):
    def setUp(self):
        self.runtime = update.Updater()
        self.runtime._rolling_state = None
        self.bundle = Path('/fixture/candidate')
        self.rows = {role: [container(role, role + '-old1'), container(role, role + '-old2')]
                     for role in ('api', 'websocket')}
        self.events = []
        self.maximum = {'api': 2, 'websocket': 2}
        self.serial = {'api': 2, 'websocket': 2}
        self.wait_number = 0
        self.fail_wait = None

        def service(role, all=False):
            return copy.deepcopy(self.rows[role])

        def start(bundle, role):
            self.assertEqual(len(self.rows[role]), 2)
            self.serial[role] += 1
            item = container(role, role + '-new' + str(self.serial[role]), 'fixture:new', bundle)
            self.rows[role].append(item)
            self.runtime._rolling_unaccepted.add(item['Id'])
            self.maximum[role] = max(self.maximum[role], len(self.rows[role]))
            self.events.append(('start', role, item['Id']))
            return item['Id']

        def wait(bundle, role, identifier):
            self.wait_number += 1
            self.events.append(('wait', role, identifier))
            if self.wait_number == self.fail_wait:
                raise update.UpdateError('candidate_not_ready')

        def retire(previous):
            role = previous['Config']['Labels']['com.docker.compose.service']
            self.assertEqual(len(self.rows[role]), 3)
            self.assertTrue(any(item['Id'] not in self.runtime._rolling_unaccepted
                                and item['Config']['Image'] == 'fixture:new' for item in self.rows[role]))
            self.events.append(('retire', role, previous['Id']))
            self.rows[role] = [item for item in self.rows[role] if item['Id'] != previous['Id']]

        def compose(bundle, *arguments, **kwargs):
            self.events.append(('discord', arguments[-1]))
            self.assertEqual(arguments[-1], 'discord')
            self.assertTrue(all(len(rows) == 2 and all(item['Config']['Image'] == 'fixture:new' for item in rows)
                                for rows in self.rows.values()))
            return b''

        def docker(*arguments, **kwargs):
            identifier = arguments[-1]
            item = next(item for rows in self.rows.values() for item in rows if item['Id'] == identifier)
            if arguments[0] == 'inspect':
                return json.dumps([item]).encode()
            if arguments[0] == 'stop':
                item['State']['Running'] = False
                self.events.append(('cleanup_stop', identifier))
            elif arguments[0] == 'rm':
                role = item['Config']['Labels']['com.docker.compose.service']
                self.rows[role].remove(item)
            else:
                raise AssertionError('Unexpected fixture Docker operation')
            return b''

        for name, effect in {'service_containers': service, 'start_spare': start, 'wait_candidate': wait,
                             'retire_replica': retire, 'compose': compose, 'docker': docker}.items():
            patcher = mock.patch.object(self.runtime, name, side_effect=effect)
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_actual_algorithm_waits_before_each_retirement_with_only_one_spare(self):
        self.runtime.rolling_update(self.bundle)
        self.assertEqual([event[0] for event in self.events], ['start', 'wait', 'retire'] * 4 + ['discord'])
        self.assertEqual(self.maximum, {'api': 3, 'websocket': 3})
        for role, rows in self.rows.items():
            self.assertEqual({item['Id'] for item in rows}, {role + '-new3', role + '-new4'})
        self.assertEqual(self.runtime._rolling_unaccepted, set())

    def test_first_unhealthy_candidate_does_not_stop_any_old_replica(self):
        self.fail_wait = 1
        with self.assertRaises(update.UpdateError):
            self.runtime.rolling_update(self.bundle)
        self.assertNotIn('retire', [event[0] for event in self.events])
        self.runtime.cleanup_rolling()
        self.assertEqual({item['Id'] for item in self.rows['api']}, {'api-old1', 'api-old2'})
        self.assertEqual({item['Id'] for item in self.rows['websocket']}, {'websocket-old1', 'websocket-old2'})

    def test_later_candidate_failure_keeps_accepted_replacement_and_remaining_old_replica(self):
        self.fail_wait = 2
        with self.assertRaises(update.UpdateError):
            self.runtime.rolling_update(self.bundle)
        self.runtime.cleanup_rolling()
        self.assertEqual({item['Id'] for item in self.rows['api']}, {'api-new3', 'api-old2'})
        self.assertEqual([event for event in self.events if event[0] == 'cleanup_stop'], [('cleanup_stop', 'api-new4')])
        self.assertNotIn('discord', [event[0] for event in self.events])


class RollingPrimitiveTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.bundle = Path(directory.name)
        self.runtime = update.Updater(state_dir=self.bundle)
        self.runtime._rolling_state = None
        self.runtime._rolling_unaccepted = set()
        self.old = [container('api', 'old1'), container('api', 'old2')]
        self.new = container('api', 'new3', 'fixture:new', self.bundle)
        self.configuration = {'services': {'api': {'image': 'fixture:new', 'healthcheck': update.application_healthcheck('api')}}}

    def test_spare_created_before_failed_compose_return_is_still_recorded_for_cleanup(self):
        def compose(*args, **kwargs):
            self.rows = [*self.old, self.new]
            raise update.UpdateError('compose_interrupted_after_create')
        self.rows = self.old
        self.runtime._rolling_state = {'version': 1, 'status': 'rolling'}
        with mock.patch.object(self.runtime, 'service_containers', side_effect=lambda *args, **kwargs: self.rows), \
                mock.patch.object(self.runtime, 'render', return_value=self.configuration), \
                mock.patch.object(self.runtime, 'compose', side_effect=compose), self.assertRaises(update.UpdateError):
            self.runtime.start_spare(self.bundle, 'api')
        self.assertEqual(self.runtime._rolling_unaccepted, {'new3'})
        self.assertEqual(json.loads(self.runtime.state_file.read_text())['rolling_unaccepted'], ['new3'])

    def test_three_existing_replicas_refuse_creation_of_a_fourth(self):
        with mock.patch.object(self.runtime, 'service_containers', return_value=[*self.old, self.new]), \
                mock.patch.object(self.runtime, 'compose') as compose, self.assertRaises(update.UpdateError):
            self.runtime.start_spare(self.bundle, 'api')
        compose.assert_not_called()

    def test_unowned_or_wrong_image_candidate_is_not_adopted(self):
        for field, value in (('working_dir', '/other/release'), ('image', 'other:image')):
            unexpected = copy.deepcopy(self.new)
            if field == 'working_dir':
                unexpected['Config']['Labels']['com.docker.compose.project.working_dir'] = value
            else:
                unexpected['Config']['Image'] = value
            with self.subTest(field=field), \
                    mock.patch.object(self.runtime, 'service_containers', side_effect=[self.old, [*self.old, unexpected]]), \
                    mock.patch.object(self.runtime, 'render', return_value=self.configuration), \
                    mock.patch.object(self.runtime, 'compose', return_value=b''), self.assertRaises(update.UpdateError):
                self.runtime.start_spare(self.bundle, 'api')
            self.assertEqual(self.runtime._rolling_unaccepted, set())

    def test_tcp_and_docker_health_cannot_replace_proof_of_actual_proxy_routing(self):
        clock = [0]
        def sleep(seconds):
            clock[0] += seconds
        with mock.patch.object(self.runtime, 'render', return_value=self.configuration), \
                mock.patch.object(self.runtime, 'docker', return_value=json.dumps([self.new]).encode()), \
                mock.patch.object(self.runtime, 'listener') as listener, \
                mock.patch.object(self.runtime, 'proxy_probe') as probe, \
                mock.patch.object(self.runtime, 'proxy_routed', return_value=False) as routed, \
                mock.patch.object(update.time, 'monotonic', side_effect=lambda: clock[0]), \
                mock.patch.object(update.time, 'sleep', side_effect=sleep), self.assertRaises(update.UpdateError):
            self.runtime.wait_candidate(self.bundle, 'api', 'new3')
        self.assertTrue(listener.called and probe.called and routed.called)
        self.assertGreaterEqual(clock[0], 180)

    def test_proxy_evidence_requires_token_and_candidate_target_on_the_same_line(self):
        token = 'fixture-probe-token'
        expected_target = 'http://172.30.115.130:53136'
        wrong = (token + ' http://172.30.115.131:53136\nother-token ' + expected_target + '\n').encode()
        correct = (token + ' ' + expected_target + '\n').encode()
        with mock.patch.object(self.runtime, 'service_containers', return_value=[{'Id': 'fixture-traefik'}]), \
                mock.patch.object(self.runtime, 'docker', return_value=wrong):
            self.assertFalse(self.runtime.proxy_routed('api', self.new, '2026-11-26T00:00:00Z', token))
        with mock.patch.object(self.runtime, 'service_containers', return_value=[{'Id': 'fixture-traefik'}]), \
                mock.patch.object(self.runtime, 'docker', return_value=correct):
            self.assertTrue(self.runtime.proxy_routed('api', self.new, '2026-11-26T00:00:00Z', token))

    def test_drain_waits_for_unhealthy_and_provider_convergence_before_stop(self):
        clock, events, draining = [0], [], [False]
        def docker(*args, **kwargs):
            events.append((args[0], clock[0]))
            if args[0] == 'inspect':
                item = copy.deepcopy(self.old[0])
                if draining[0]:
                    item['State']['Health']['Status'] = 'unhealthy'
                return json.dumps([item]).encode()
            if args[0] == 'exec':
                draining[0] = True
            return b''
        def sleep(seconds):
            clock[0] += seconds
        with mock.patch.object(self.runtime, 'docker', side_effect=docker), \
                mock.patch.object(update.time, 'monotonic', side_effect=lambda: clock[0]), \
                mock.patch.object(update.time, 'sleep', side_effect=sleep):
            self.runtime.retire_replica(self.old[0])
        self.assertLess([name for name, _ in events].index('exec'), [name for name, _ in events].index('stop'))
        self.assertGreaterEqual(next(stamp for name, stamp in events if name == 'stop'), 3)

    def test_unconfirmed_drain_preserves_old_replica_for_manual_recovery(self):
        clock = [0]
        def sleep(seconds):
            clock[0] += seconds
        def docker(*args, **kwargs):
            if args[0] == 'inspect':
                return json.dumps([self.old[0]]).encode()
            if args[0] == 'exec':
                return b''
            raise AssertionError('An old replica must not stop when health withdrawal is unconfirmed')
        with mock.patch.object(self.runtime, 'docker', side_effect=docker), \
                mock.patch.object(update.time, 'monotonic', side_effect=lambda: clock[0]), \
                mock.patch.object(update.time, 'sleep', side_effect=sleep), self.assertRaises(update.UpdateError):
            self.runtime.retire_replica(self.old[0])


if __name__ == '__main__':
    unittest.main()
