"""Opt-in real Docker/Traefik replacement test; every resource belongs to a unique disposable project.

Run with GMOD_ROLLING_DOCKER_TEST=1. The Bun base image and traefik:v2.11
must already exist locally; the test never pulls application images or contacts production.
"""
import copy
import http.client
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import time
import unittest
import uuid

SCRIPT = Path(__file__).resolve().parents[1] / 'proxmox-production-update.py'
SPEC = importlib.util.spec_from_file_location('rolling_docker_updater', SCRIPT)
update = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(update)
DOCKER = ['docker', '--host', 'unix:///var/run/docker.sock']
BASE = os.environ.get('GMOD_ROLLING_BASE_IMAGE', 'oven/bun:1.3.9')
SERVER = r"""
const http=require('node:http'),os=require('node:os');
const role=process.env.FIXTURE_ROLE,revision=process.env.FIXTURE_REVISION;
const headers={'X-Fixture-Revision':revision,'X-Fixture-Instance':os.hostname(),
 'Access-Control-Allow-Origin':'https://gmod-integration.com','Access-Control-Allow-Credentials':'true'};
const delay=Number(process.env.FIXTURE_READY_DELAY_MS||0);
if(role==='discord'){console.log('Ready on main with 0 fixture guilds');setInterval(()=>{},1000);process.on('SIGTERM',()=>process.exit(0))}
else if(role==='websocket'){
 let server;
 setTimeout(()=>{server=Bun.serve({hostname:'0.0.0.0',port:53139,fetch:()=>new Response(null,{status:401,headers})})},delay);
 process.on('SIGTERM',()=>Promise.resolve(server?.stop()).then(()=>process.exit(0)));
}else{
 const start=Date.now();
 const server=http.createServer((req,res)=>{
  if(Date.now()-start<delay){res.writeHead(503,headers);res.end('starting');return}
  if(req.url.startsWith('/v6/auth/session')){res.writeHead(401,headers);res.end();return}
  res.writeHead(200,{...headers,'Content-Type':'application/json'});
  res.end(JSON.stringify({version:'v6',revision,instance:os.hostname()}));
 });
 server.listen(53136,'0.0.0.0');
 process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
}
"""


def command(arguments, timeout=180, check=True):
    result = subprocess.run([str(x) for x in arguments], capture_output=True, timeout=timeout)
    if check and result.returncode:
        raise AssertionError('Disposable Docker fixture command failed: ' + result.stderr.decode(errors='replace')[-1800:])
    return result.stdout


class FixtureUpdater(update.Updater):
    def __init__(self, project, bundle, test):
        super().__init__(state_dir=bundle.parent / 'state', current=bundle, releases=bundle.parent)
        self.project, self.test = project, test
        self._rolling_state = None
        self.events = []
        self.max_running = {'api': 0, 'websocket': 0, 'discord': 0}
        self.accepted = set()

    def docker(self, *arguments, **options):
        # Mutation targets are explicit IDs whose ownership is verified before every operation.
        if arguments and arguments[0] in ('stop', 'rm', 'exec'):
            identifier = arguments[-1] if arguments[0] in ('stop', 'rm') else arguments[1]
            item = json.loads(command([*DOCKER, 'inspect', identifier]))[0]
            self.test.assertEqual(item['Config']['Labels'].get('gmi.rolling.fixture'), self.project)
            self.test.assertEqual(item['Config']['Labels'].get('com.docker.compose.project'), self.project)
        return command([*DOCKER, *arguments], timeout=options.get('timeout', 180), check=options.get('check', True))

    def compose(self, bundle, *arguments, **options):
        return command([*DOCKER, 'compose', '--project-name', self.project, '--project-directory', str(bundle),
                        '-f', str(bundle / 'compose.json'), *arguments], timeout=options.get('timeout', 180),
                       check=options.get('check', True))

    def service_containers(self, role, all=False):
        rows = super().service_containers(role, all=all)
        self.test.assertTrue(all_items_owned(rows, self.project))
        if role in self.max_running:
            count = sum(bool(item['State']['Running']) for item in rows)
            self.max_running[role] = max(self.max_running[role], count)
            self.test.assertLessEqual(count, 1 if role == 'discord' else 3)
        return rows

    def wait_candidate(self, bundle, role, identifier):
        self.events.append(('created', role, identifier))
        super().wait_candidate(bundle, role, identifier)
        item = json.loads(self.docker('inspect', identifier))[0]
        self.test.assertEqual(item['State']['Health']['Status'], 'healthy')
        self.accepted.add(identifier)
        self.events.append(('accepted', role, identifier))
        print(json.dumps({'fixture_event': 'accepted', 'role': role, 'container': identifier[:12]}), flush=True)

    def retire_replica(self, old):
        role = old['Config']['Labels']['com.docker.compose.service']
        running = self.service_containers(role)
        replacements = [item for item in running if item['Id'] in self.accepted]
        self.test.assertTrue(replacements, 'An old replica cannot stop before a healthy routed replacement exists')
        self.test.assertEqual(len(running), 3)
        self.events.append(('retire', role, old['Id']))
        super().retire_replica(old)
        remaining = self.service_containers(role)
        self.test.assertEqual(len(remaining), 2)
        self.test.assertTrue(any(item['State'].get('Health', {}).get('Status') == 'healthy' for item in remaining))


def all_items_owned(rows, project):
    return all(item['Config']['Labels'].get('gmi.rolling.fixture') == project
               and item['Config']['Labels'].get('com.docker.compose.project') == project for item in rows)


@unittest.skipUnless(os.environ.get('GMOD_ROLLING_DOCKER_TEST') == '1', 'Set GMOD_ROLLING_DOCKER_TEST=1 for disposable Docker integration')
class RealComposeRollingTests(unittest.TestCase):
    def test_actual_updater_preserves_healthy_capacity_and_final_compose_identity(self):
        project = 'gmi-rolling-' + uuid.uuid4().hex[:12]
        self.assertTrue(project.startswith('gmi-rolling-'))
        for image in (BASE, 'traefik:v2.11'):
            result = subprocess.run([*DOCKER, 'image', 'inspect', image], capture_output=True)
            self.assertEqual(result.returncode, 0, 'Required Docker fixture image unavailable locally: ' + image)
        with tempfile.TemporaryDirectory(prefix=project + '-') as temporary:
            root = Path(temporary)
            root.chmod(0o700)
            context, previous, candidate = root / 'image', root / 'previous', root / 'candidate'
            for directory in (context, previous, candidate):
                directory.mkdir(mode=0o700)
            (context / 'server.js').write_text(SERVER)
            (context / 'Dockerfile').write_text('FROM ' + BASE + '\nARG REVISION\nARG READY_DELAY\n'
                'ENV FIXTURE_REVISION=$REVISION FIXTURE_READY_DELAY_MS=$READY_DELAY\n'
                'COPY server.js /fixture/server.js\nCMD ["bun","/fixture/server.js"]\n')
            images = {revision: project + ':' + revision for revision in ('old', 'new')}
            updater = FixtureUpdater(project, candidate, self)
            stop = threading.Event()
            observations = []
            threads = []
            try:
                for revision, image in images.items():
                    command([*DOCKER, 'build', '--network', 'none', '--pull=false', '--label', 'gmi.rolling.fixture=' + project,
                             '--build-arg', 'REVISION=' + revision, '--build-arg', 'READY_DELAY=' + ('3000' if revision == 'new' else '0'),
                             '-t', image, str(context)])
                for directory, image in ((previous, images['old']), (candidate, images['new'])):
                    configuration = {'services': {}, 'networks': {'net': {'name': project + '_net'}}}
                    for role, count in (('api', 2), ('websocket', 2), ('discord', 1)):
                        service = {'image': image, 'environment': {'FIXTURE_ROLE': role}, 'deploy': {'replicas': count},
                                   'networks': ['net'], 'labels': {'gmi.rolling.fixture': project}, 'stop_grace_period': '15s'}
                        if role in ('api', 'websocket'):
                            service['healthcheck'] = update.application_healthcheck(role)
                            service['labels'].update({'traefik.enable': 'true', 'traefik.docker.network': project + '_net',
                                'traefik.http.routers.' + role + '.rule': 'Host(`' + ('api' if role == 'api' else 'ws') + '.gmod-integration.com`)',
                                'traefik.http.routers.' + role + '.entrypoints': 'web',
                                'traefik.http.services.' + role + '.loadbalancer.server.port': str(53136 if role == 'api' else 53139)})
                        configuration['services'][role] = service
                    configuration['services']['traefik'] = {
                        'image': 'traefik:v2.11', 'networks': ['net'],
                        'environment': {'DOCKER_API_VERSION': '1.40'},
                        'labels': {'gmi.rolling.fixture': project},
                        'command': ['--providers.docker=true', '--providers.docker.exposedbydefault=false',
                                    '--providers.docker.network=' + project + '_net',
                                    '--providers.docker.constraints=Label(`gmi.rolling.fixture`,`' + project + '`)',
                                    '--entrypoints.web.address=:80', '--accesslog=true'],
                        'ports': ['127.0.0.1::80'],
                        'volumes': ['/var/run/docker.sock:/var/run/docker.sock:ro']}
                    (directory / 'compose.json').write_text(json.dumps(configuration))
                updater.compose(previous, 'up', '-d', '--pull', 'never', '--wait', '--wait-timeout', '120')
                ingress = updater.service_containers('traefik')[0]
                updater.ingress_port = int(ingress['NetworkSettings']['Ports']['80/tcp'][0]['HostPort'])
                deadline = time.monotonic() + 30
                while True:
                    try:
                        updater.proxy_probe('api', 'baseline')
                        updater.proxy_probe('websocket', 'baseline')
                        break
                    except (update.UpdateError, OSError):
                        if time.monotonic() >= deadline:
                            raise
                        time.sleep(0.25)

                def sample(role):
                    expected_status = 200 if role == 'api' else 401
                    while not stop.is_set():
                        connection = http.client.HTTPConnection('127.0.0.1', updater.ingress_port, timeout=2)
                        try:
                            connection.request('GET', '/v6' if role == 'api' else '/', headers={
                                'Host': ('api' if role == 'api' else 'ws') + '.gmod-integration.com', 'Connection': 'close'})
                            response = connection.getresponse()
                            response.read()
                            observations.append({'role': role, 'time': time.monotonic(), 'status': response.status,
                                'expected': expected_status, 'revision': response.getheader('X-Fixture-Revision')})
                        except OSError as error:
                            observations.append({'role': role, 'time': time.monotonic(), 'error': type(error).__name__})
                        finally:
                            connection.close()
                        stop.wait(0.025)

                for role in ('api', 'websocket'):
                    thread = threading.Thread(target=sample, args=(role,), daemon=True)
                    thread.start()
                    threads.append(thread)
                updater.rolling_update(candidate)
                time.sleep(1)
                final_before = {role: {item['Id'] for item in updater.service_containers(role)} for role in ('api', 'websocket', 'discord')}
                updater.compose(candidate, 'up', '-d', '--no-deps', '--pull', 'never', 'api', 'websocket', 'discord')
                final_after = {role: {item['Id'] for item in updater.service_containers(role)} for role in ('api', 'websocket', 'discord')}
                self.assertEqual(final_before, final_after, 'Plain Compose up must retain the new replicas even with indices 3/4')
                for role in ('api', 'websocket'):
                    rows = updater.service_containers(role)
                    self.assertEqual(len(rows), 2)
                    self.assertTrue(all(item['Config']['Image'] == images['new'] for item in rows))
                    self.assertEqual(updater.max_running[role], 3)
                    self.assertEqual(sum(event[0] == 'retire' and event[1] == role for event in updater.events), 2)
                for role in ('api', 'websocket'):
                    samples = [sample for sample in observations if sample['role'] == role]
                    self.assertGreater(len(samples), 100)
                    successful = [sample for sample in samples if sample.get('status') == sample.get('expected')]
                    self.assertTrue(any(sample.get('revision') == 'old' for sample in successful))
                    self.assertTrue(any(sample.get('revision') == 'new' for sample in successful))
                    self.assertFalse(any(sample.get('revision') == 'new' and sample.get('status') == 503 for sample in samples),
                                     'A new backend was routed before it became ready')
                errors = [sample for sample in observations if 'error' in sample or sample.get('status') != sample.get('expected')]
                print(json.dumps({'fixture_project': project, 'requests': len(observations), 'observed_errors': len(errors),
                                  'max_running_per_role': updater.max_running, 'real_updater_methods': True,
                                  'plain_compose_preserved_container_ids': final_before == final_after}), flush=True)
                self.assertFalse(errors, 'Controlled old/new healthcheck fixture observed unexpected HTTP/connection errors')
            finally:
                stop.set()
                for thread in threads:
                    thread.join(timeout=3)
                # Compose's exact unique project owns all removal targets; no global prune/volume removal.
                updater.compose(candidate, 'down', '--remove-orphans', check=False)
                ids = command([*DOCKER, 'ps', '-aq', '--filter', 'label=com.docker.compose.project=' + project]).split()
                self.assertEqual(ids, [], 'Disposable fixture containers were not cleaned up')
                for image in images.values():
                    info = json.loads(command([*DOCKER, 'image', 'inspect', image]))[0]
                    self.assertEqual(info['Config']['Labels'].get('gmi.rolling.fixture'), project)
                    command([*DOCKER, 'image', 'rm', image], check=False)


if __name__ == '__main__':
    unittest.main()
