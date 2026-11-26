#!/usr/bin/env python3
"""Coordinated CT115 image updates; migration failures require manual recovery."""
from __future__ import annotations

import argparse
import contextlib
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import socket
import stat
import subprocess
import sys
import tempfile
import time
import traceback
import urllib.error
import urllib.request
import uuid

STATE = Path('/var/lib/docker/gmod-production-update')
CURRENT = Path('/opt/gmod-integration-production/current')
RELEASES = CURRENT.parent / 'releases'
BACKUP = Path('/var/lib/docker/gmod-plakar-backup')
ROLES = ('api', 'websocket', 'discord')
COUNTS = {'api': 2, 'websocket': 2, 'discord': 1}
REPOSITORIES = {role: 'ghcr.io/gmod-integration/gmod-integration-' + role for role in ROLES}
FILES = ('docker-stack.swarm.yml', 'compose.proxmox.yml', 'compose.production.yml', 'compose.live.yml')
PRIVATE_FILES = ('.env', 'application.env', '.relay.env', 'mariadb.env', 'minio.env', 'cloudflared.env')


class UpdateError(RuntimeError):
    pass


def require(value, reason):
    if not value:
        raise UpdateError(reason)


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def inspect_release(inspected_by_role):
    require(set(inspected_by_role) == set(ROLES), 'incomplete_backend_release')
    images, revisions = {}, set()
    for role in ROLES:
        item = inspected_by_role[role]
        revision = (item.get('Config', {}).get('Labels') or {}).get('org.opencontainers.image.revision', '')
        require(isinstance(revision, str) and re.fullmatch(r'[0-9a-f]{40}', revision), 'invalid_image_revision')
        revisions.add(revision)
        matches = [x for x in item.get('RepoDigests', []) if re.fullmatch(
            re.escape(REPOSITORIES[role]) + r'@sha256:[0-9a-f]{64}', x)]
        require(len(set(matches)) == 1, 'unexpected_image_repository_or_digest')
        images[role] = matches[0]
    require(len(revisions) == 1, 'mixed_image_revisions')
    return {'revision': revisions.pop(), 'images': images}


def validate_ledger(expected, rows):
    require(expected and all(re.fullmatch(r'[A-Za-z0-9_-]+', k) and re.fullmatch(r'[0-9a-f]{64}', v)
                             for k, v in expected.items()), 'invalid_candidate_migrations')
    require(rows and isinstance(rows, list), 'missing_current_migration_ledger')
    names = set()
    for row in rows:
        if row.get('rolled_back_at'):
            continue
        name = row.get('migration_name')
        require(name not in names, 'duplicate_current_migration')
        names.add(name)
        require(row.get('finished_at') and not row.get('rolled_back_at'), 'incomplete_current_migration')
        require(name in expected and row.get('checksum') == expected[name], 'candidate_changes_or_removes_applied_migration')
    require(names, 'missing_current_migration_ledger')


def migration_plan(expected, rows, metadata=None):
    validate_ledger(expected, rows)
    metadata = metadata if metadata is not None else {'version': 1, 'release_mode': 'auto', 'migrations': {}}
    require(isinstance(metadata, dict) and metadata.get('version') == 1
            and metadata.get('release_mode') in ('auto', 'maintenance')
            and isinstance(metadata.get('migrations'), dict), 'invalid_rolling_migration_metadata')
    applied = {row['migration_name'] for row in rows if not row.get('rolled_back_at')}
    pending = sorted(set(expected) - applied)
    approved = all(isinstance(metadata['migrations'].get(name), dict)
                   and metadata['migrations'][name].get('sha256') == expected[name]
                   and metadata['migrations'][name].get('online') is True for name in pending)
    return {'mode': 'rolling' if metadata['release_mode'] == 'auto' and approved else 'maintenance', 'pending': pending}


def application_healthcheck(role):
    require(role in ('api', 'websocket'), 'unsupported_rolling_service')
    script = "if(require('node:fs').existsSync('/tmp/gmod-draining'))process.exit(1);"
    if role == 'api':
        script += "fetch('http://127.0.0.1:53136/v6',{signal:AbortSignal.timeout(2500)}).then(async r=>process.exit(r.status===200&&(await r.json()).version==='v6'?0:1)).catch(()=>process.exit(1));"
    else:
        script += "const t=setTimeout(()=>process.exit(1),2500);const s=require('node:net').connect(53139,'127.0.0.1',()=>{clearTimeout(t);s.end();process.exit(0)});s.on('error',()=>process.exit(1));"
    return {'test': ['CMD', 'bun', '-e', script], 'interval': '2s', 'timeout': '4s', 'retries': 1, 'start_period': '30s'}


def validate_config(before, candidate, images):
    require(set(images) == set(ROLES), 'incomplete_backend_release')
    require(before.get('services', {}).keys() == candidate.get('services', {}).keys(), 'candidate_changes_services')
    expected = json.loads(json.dumps(before))
    for role in (*ROLES, 'prisma-migrate'):
        expected['services'][role]['image'] = images['api' if role == 'prisma-migrate' else role]
    for role in ('api', 'websocket'):
        if candidate['services'][role].get('healthcheck') != before['services'][role].get('healthcheck'):
            expected['services'][role]['healthcheck'] = application_healthcheck(role)
    # Compose embeds the project-directory-derived project name only when not explicitly set.
    require(expected == candidate, 'candidate_changes_protected_configuration')
    require(candidate['services']['prisma-migrate']['image'] == candidate['services']['api']['image'], 'migration_image_mismatch')
    return True


def environment_matches_rendered(rendered, effective):
    # `compose config` re-escapes literal dollars for a reusable Compose document.
    # Decode that representation once; actual container bytes remain untouched.
    return all((key not in effective if value is None else
                effective.get(key) == str(value).replace('$$', '$'))
               for key, value in rendered.items())


def private_dir(path):
    require(not path.is_symlink(), 'symlink_in_private_directory')
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = path.stat()
    require(info.st_uid == os.geteuid() and stat.S_IMODE(info.st_mode) == 0o700, 'insecure_private_directory')


def write_json(path, value):
    fd, temporary = tempfile.mkstemp(prefix='.' + path.name + '-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as output:
            json.dump(value, output, indent=2, sort_keys=True)
            output.write('\n')
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
        descriptor = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


class Runner:
    def __init__(self, log=None):
        self.log = log
        self.environment = {'PATH': '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
                            'HOME': '/root', 'DOCKER_HOST': 'unix:///var/run/docker.sock'}

    def run(self, arguments, *, timeout=900, check=True):
        try:
            result = subprocess.run([str(x) for x in arguments], capture_output=True,
                                    env=self.environment, timeout=timeout)
        except (OSError, subprocess.TimeoutExpired) as error:
            if self.log:
                self.log.write((getattr(error, 'stdout', None) or b'') + b'\n' +
                               (getattr(error, 'stderr', None) or b''))
                self.log.flush()
            raise UpdateError('private_command_unavailable_or_timed_out') from None
        if self.log:
            self.log.write(result.stdout + b'\n' + result.stderr + b'\n')
            self.log.flush()
        require(not check or result.returncode == 0, 'private_command_failed')
        return result.stdout


class Updater:
    def __init__(self, runner=None, state_dir=STATE, current=CURRENT, releases=RELEASES):
        self.runner = runner or Runner()
        self.state_dir, self.current, self.releases = Path(state_dir), Path(current), Path(releases)
        self.state_file = self.state_dir / 'state.json'
        self.project, self.ingress_port = 'gmod-production', 80
        self._rolling_unaccepted, self._rolling_state = set(), None

    def status(self):
        if not self.state_file.exists():
            return {'status': 'uninitialized'}
        require(not self.state_file.is_symlink(), 'invalid_state_file')
        info = self.state_file.stat()
        require(info.st_uid == os.geteuid() and stat.S_IMODE(info.st_mode) == 0o600, 'insecure_state_file')
        state = json.loads(self.state_file.read_bytes())
        require(state.get('version') == 1, 'unsupported_state')
        return state

    def initialize(self):
        self.target()
        state = self.status()
        require(state['status'] not in ('blocked', 'maintenance', 'rolling'), 'manual_recovery_required')
        if state['status'] != 'uninitialized':
            return {'status': 'already_initialized', 'revision': state['selected']['revision']}
        runtime, release = self.runtime(), self.candidate()
        self.schema(runtime['bundle'], release['images']['api'])
        state = {'version': 1, 'status': 'ready', 'initialized_at_utc': now(),
                 'selected': release, 'baseline_only': True}
        write_json(self.state_file, state)
        return {'status': 'initialized', 'revision': release['revision'], 'production_changed': False}

    def check(self, apply=False):
        self.target()
        state = self.status()
        require(state['status'] not in ('blocked', 'maintenance', 'rolling'), 'manual_recovery_required')
        require(state['status'] == 'ready', 'initialize_before_updating')
        runtime = self.runtime()
        try:
            release = self.candidate()
        except UpdateError as error:
            if str(error) == 'mixed_image_revisions':
                return {'status': 'waiting', 'reason': 'publication_incomplete'}
            raise
        if release == state.get('selected'):
            return {'status': 'unchanged', 'revision': release['revision']}
        self.verify_provenance(release, state)
        expected = self.expected_migrations(release['images']['api'])
        metadata = self.image_metadata(release['images']['api'])
        plan = migration_plan(expected, self.current_ledger(runtime['api_id']), metadata)
        if not apply:
            return {'status': 'available', 'revision': release['revision'], **plan}
        candidate = self.stage(runtime['bundle'], release)
        # The verified offsite snapshot completes while the current release still serves traffic.
        backup = self.backup()
        with self.backup_lock():
            current = self.runtime()
            require(current['bundle'] == runtime['bundle'] and current['config'] == runtime['config']
                    and current['api_id'] == runtime['api_id']
                    and current.get('fingerprints') == runtime.get('fingerprints'), 'runtime_changed_before_maintenance')
            require(migration_plan(expected, self.current_ledger(current['api_id']), metadata) == plan,
                    'migration_ledger_changed_before_update')
            self._stores = {x['Id']: x for x in current['containers']
                            if (x['Config'].get('Labels') or {}).get('com.docker.compose.service')
                            in ('mariadb', 'mongo', 'redis', 'minio')}
            state.update(status=plan['mode'], candidate=release, candidate_bundle=str(candidate),
                         update_started_at_utc=now(), migration_plan=plan)
            if isinstance(backup, dict):
                state['pre_update_backup'] = backup
            if plan['mode'] == 'rolling':
                state.update(rolling_unaccepted=[], rolling_accepted=[], rolling_retired=[])
            write_json(self.state_file, state)
            self._rolling_state = state if plan['mode'] == 'rolling' else None
            sql_verified = False
            try:
                if plan['mode'] == 'maintenance':
                    self.stop_writers(runtime['bundle'])
                self.migrate(candidate)
                self.guard(candidate)
                sql_verified = True
                if plan['mode'] == 'rolling':
                    self.rolling_update(candidate)
                else:
                    self.start_writers(candidate)
                self.verify_apps(candidate)
                self.switch(candidate)
                state.update(status='ready', selected=release, baseline_only=False,
                             last_success_at_utc=now(), deployed_bundle=str(candidate))
                state.pop('candidate', None)
                state.pop('candidate_bundle', None)
                write_json(self.state_file, state)
            except BaseException as error:
                # A partially started compatible release also remains stopped for manual recovery.
                with contextlib.suppress(BaseException):
                    self.cancel_migration()
                if plan['mode'] == 'rolling' and (sql_verified or not plan['pending']):
                    with contextlib.suppress(BaseException):
                        self.cleanup_rolling()
                else:
                    with contextlib.suppress(BaseException):
                        self.stop_writers(candidate)
                reason = plan['mode'] + '_failed_manual_recovery_required'
                state.update(status='blocked', failed_at_utc=now(), reason=reason)
                write_json(self.state_file, state)
                raise UpdateError(reason) from error
        return {'status': 'updated', 'revision': release['revision'], **plan}

    def target(self):
        private_dir(self.state_dir)
        require(self.current.is_symlink(), 'current_must_be_release_symlink')
        bundle = self.current.resolve(strict=True)
        require(bundle.name == 'bundle' and bundle.parent.parent == self.releases.resolve(), 'unexpected_current_release')
        for name in (*FILES, *PRIVATE_FILES):
            path = bundle / name
            require(path.is_file() and not path.is_symlink(), 'missing_or_symlinked_bundle_file')
            info = path.stat()
            mask = 0o077 if name in PRIVATE_FILES else 0o022
            require(info.st_uid == os.geteuid() and not stat.S_IMODE(info.st_mode) & mask, 'insecure_bundle_file')

    def docker(self, *args, **options):
        return self.runner.run(['docker', '--host', 'unix:///var/run/docker.sock', *args], **options)

    def compose(self, bundle, *args, **options):
        command = ['docker', '--host', 'unix:///var/run/docker.sock', 'compose', '--project-name', self.project,
                   '--project-directory', str(bundle), '--env-file', str(bundle / '.env')]
        for name in (*FILES, 'compose.update.yml'):
            if (bundle / name).exists():
                command.extend(('-f', str(bundle / name)))
        return self.runner.run([*command, *args], **options)

    def render(self, bundle):
        return json.loads(self.compose(bundle, 'config', '--format', 'json'))

    def candidate(self):
        require(shutil.disk_usage(self.state_dir).free >= 20 * 1024 ** 3, 'insufficient_free_space_for_update')
        inspected = {}
        for role, repository in REPOSITORIES.items():
            self.docker('pull', repository + ':latest', timeout=600)
            inspected[role] = json.loads(self.docker('image', 'inspect', repository + ':latest'))[0]
        release = inspect_release(inspected)
        # Pin and inspect each selected digest as well: tags may move during publication.
        for role, image in release['images'].items():
            pinned = json.loads(self.docker('image', 'inspect', image))[0]
            require(pinned['Id'] == inspected[role]['Id'], 'image_changed_during_resolution')
        return release

    def github_compare(self, base, head):
        require(re.fullmatch(r'[0-9a-f]{40}', base)
                and (head == 'main' or re.fullmatch(r'[0-9a-f]{40}', head)), 'invalid_provenance_revision')
        url = 'https://api.github.com/repos/gmod-integration/gmod-integration-monorepo/compare/' + base + '...' + head
        request = urllib.request.Request(url, headers={'Accept': 'application/vnd.github+json',
                                                       'User-Agent': 'gmi-ct115-production-updater',
                                                       'X-GitHub-Api-Version': '2022-11-28'})
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                data = response.read(8 * 1024 * 1024 + 1)
                require(len(data) <= 8 * 1024 * 1024, 'provenance_response_too_large')
                return json.loads(data)
        except (urllib.error.URLError, OSError, ValueError):
            raise UpdateError('github_provenance_unavailable') from None

    def verify_provenance(self, release, state):
        revision = release['revision']
        main = self.github_compare(revision, 'main')
        require(main.get('status') in ('ahead', 'identical')
                and main.get('merge_base_commit', {}).get('sha') == revision, 'candidate_not_on_main')
        if not state.get('baseline_only', False):
            selected = state['selected']['revision']
            forward = self.github_compare(selected, revision)
            require(forward.get('status') in ('ahead', 'identical')
                    and forward.get('merge_base_commit', {}).get('sha') == selected, 'automatic_code_downgrade_refused')

    def runtime(self):
        bundle = self.current.resolve(strict=True)
        config = self.render(bundle)
        require(config.get('name') == 'gmod-production', 'wrong_compose_project')
        services = config['services']
        require(set(services) == {*ROLES, 'prisma-migrate', 'mariadb', 'mongo', 'redis', 'minio',
                                  'webhook-relay', 'traefik', 'cloudflared'}, 'unsupported_current_services')
        for role, count in COUNTS.items():
            require(services[role].get('deploy', {}).get('replicas') == count, 'unexpected_live_replica_count')
        require(services['prisma-migrate'].get('deploy', {}).get('replicas') == 0, 'migration_must_stay_at_zero')
        require(services['prisma-migrate']['image'] == services['api']['image'], 'migration_image_mismatch')
        reserved = self.docker('ps', '-aq', '--filter', 'name=^/gmod-production-update-(migrate|guard)$').decode().strip()
        require(not reserved, 'stale_update_task_requires_review')
        ids = self.docker('ps', '-q', '--filter', 'label=com.docker.compose.project=gmod-production').decode().split()
        require(ids, 'missing_production_containers')
        containers = json.loads(self.docker('inspect', *ids))
        for role in (*ROLES, 'mariadb', 'mongo', 'redis', 'minio', 'webhook-relay', 'traefik', 'cloudflared'):
            matches = [x for x in containers if (x['Config'].get('Labels') or {}).get('com.docker.compose.service') == role]
            require(len(matches) == COUNTS.get(role, 1), 'missing_or_duplicate_production_service')
            for item in matches:
                require(item['State']['Running'] and not item['State'].get('OOMKilled')
                        and item['State'].get('Health', {}).get('Status', 'healthy') == 'healthy', 'production_service_not_healthy')
                require(item['Config']['Image'] == services[role]['image'], 'running_image_differs_from_bundle')
                effective = dict(x.split('=', 1) for x in item['Config'].get('Env', []) if '=' in x)
                require(environment_matches_rendered(services[role].get('environment', {}), effective),
                        'running_configuration_differs_from_bundle')
        require(len(containers) == 12, 'unexpected_running_production_container')
        api = next(x for x in containers if (x['Config'].get('Labels') or {}).get('com.docker.compose.service') == 'api')
        return {'bundle': bundle, 'config': config, 'api_id': api['Id'], 'containers': containers,
                'fingerprints': {name: hashlib.sha256((bundle / name).read_bytes()).hexdigest()
                                 for name in (*FILES, *PRIVATE_FILES, 'gmod-prodctl')}}

    def expected_migrations(self, image):
        script = """import{readdirSync,readFileSync}from'node:fs';import{createHash}from'node:crypto';
const root='/app/packages/infra-prisma/migrations/';const result={};
for(const x of readdirSync(root,{withFileTypes:true})){if(x.isDirectory())result[x.name]=createHash('sha256').update(readFileSync(root+x.name+'/migration.sql')).digest('hex')}
process.stdout.write(JSON.stringify(result));"""
        return json.loads(self.docker('run', '--rm', '--network', 'none', '--read-only', '--entrypoint', 'bun', image, '-e', script))

    def image_metadata(self, image):
        script = """const fs=require('node:fs');const p='/app/packages/infra-prisma/rolling-migrations.json';
process.stdout.write(fs.existsSync(p)?fs.readFileSync(p,'utf8'):'null');"""
        return json.loads(self.docker('run', '--rm', '--network', 'none', '--read-only', '--entrypoint', 'bun', image, '-e', script))

    def current_ledger(self, api_id):
        script = """const{getMariaDbConfig}=await import('./packages/config/src/infrastructure.ts');
const maria=await import('mariadb');const c=await maria.createConnection(getMariaDbConfig());
try{process.stdout.write(JSON.stringify(await c.query('SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations')))}finally{await c.end()}"""
        return json.loads(self.docker('exec', api_id, 'bun', '-e', script, timeout=60))

    def schema(self, bundle, image):
        script = """const{ConfigSchema}=await import('./packages/config/src/schema.ts');
if(!ConfigSchema.safeParse(process.env).success)process.exit(1);"""
        self.docker('run', '--rm', '--network', 'none', '--read-only', '--env-file', str(bundle / 'application.env'),
                    '--entrypoint', 'bun', image, '-e', script, timeout=120)

    def stage(self, bundle, release):
        destination = self.releases / ('update-' + dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ-') + uuid.uuid4().hex[:8])
        destination.mkdir(mode=0o700)
        for path in bundle.rglob('*'):
            require(not path.is_symlink() and (path.is_file() or path.is_dir()), 'unsupported_bundle_entry')
        candidate = destination / 'bundle'
        shutil.copytree(bundle, candidate)
        overlay = {'services': {role: {'image': release['images']['api' if role == 'prisma-migrate' else role]}
                                for role in (*ROLES, 'prisma-migrate')}}
        for role in ('api', 'websocket'):
            overlay['services'][role]['healthcheck'] = application_healthcheck(role)
        write_json(candidate / 'compose.update.yml', overlay)
        wrapper = '''#!/usr/bin/env bash
set -euo pipefail
cd /opt/gmod-integration-production/current
export GMOD_INGRESS_PORT=80
compose=(docker compose --project-name gmod-production --project-directory "$PWD" --env-file .env -f docker-stack.swarm.yml -f compose.proxmox.yml -f compose.production.yml -f compose.live.yml -f compose.update.yml)
case "${1:-}" in
  status) exec "${compose[@]}" ps --all ;;
  compose) shift; exec "${compose[@]}" "$@" ;;
  logs) shift; exec "${compose[@]}" logs --tail 100 "$@" ;;
  *) printf 'Use status, compose or logs.\\n' >&2; exit 1 ;;
esac
'''
        (candidate / 'gmod-prodctl').write_text(wrapper)
        (candidate / 'gmod-prodctl').chmod(0o700)
        validate_config(self.render(bundle), self.render(candidate), release['images'])
        for name in PRIVATE_FILES:
            require((bundle / name).read_bytes() == (candidate / name).read_bytes(), 'candidate_changes_private_configuration')
        self.schema(candidate, release['images']['api'])
        return candidate

    def backup(self):
        started = now()
        self.runner.run(['/usr/local/sbin/gmod-plakar-backup', '--run'], timeout=5400)
        result = json.loads((BACKUP / 'last-success.json').read_bytes())
        require(result.get('status') == 'success' and result.get('stage') == 'complete'
                and not result.get('prepare_only') and result.get('started_at_utc', '') >= started
                and re.fullmatch(r'[0-9a-f]{64}', result.get('snapshot_id', '')), 'verified_fresh_offsite_backup_required')
        return {'snapshot_id': result['snapshot_id'], 'completed_at_utc': result.get('completed_at_utc')}

    @contextlib.contextmanager
    def backup_lock(self):
        descriptor = os.open(BACKUP / 'backup.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        with os.fdopen(descriptor, 'r+') as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise UpdateError('backup_in_progress_retry_later') from None
            yield

    def stop_writers(self, bundle):
        self.compose(bundle, 'stop', '--timeout', '120', *ROLES, timeout=180)
        ids = self.docker('ps', '-q', '--filter', 'label=com.docker.compose.project=gmod-production').decode().split()
        if ids:
            items = json.loads(self.docker('inspect', *ids))
            require(not any((x['Config'].get('Labels') or {}).get('com.docker.compose.service') in ROLES for x in items),
                    'writers_did_not_stop')

    def migrate(self, bundle):
        ids = self.docker('ps', '-q', '--filter', 'label=com.docker.compose.project=gmod-production',
                          '--filter', 'label=com.docker.compose.service=prisma-migrate').decode().strip()
        require(not ids, 'concurrent_migration')
        self.compose(bundle, 'run', '--rm', '--no-deps', '--pull', 'never', '--name',
                     'gmod-production-update-migrate', 'prisma-migrate', timeout=1800)

    def guard(self, bundle):
        self.compose(bundle, 'run', '--rm', '--no-deps', '--pull', 'never', '--name',
                     'gmod-production-update-guard', '--entrypoint', 'bun',
                     'api', 'scripts/swarm-migration-status.ts', timeout=120)

    def cancel_migration(self):
        for name, role in (('gmod-production-update-migrate', 'prisma-migrate'),
                           ('gmod-production-update-guard', 'api')):
            with contextlib.suppress(UpdateError, ValueError, KeyError):
                raw = self.docker('container', 'inspect', name, check=False)
                for item in json.loads(raw or b'[]'):
                    labels = item['Config'].get('Labels') or {}
                    if (labels.get('com.docker.compose.project') == 'gmod-production'
                            and labels.get('com.docker.compose.service') == role
                            and str(labels.get('com.docker.compose.oneoff')).lower() == 'true'):
                        self.docker('stop', '--time', '30', item['Id'], timeout=45, check=False)

    def start_writers(self, bundle):
        self.compose(bundle, 'up', '-d', '--no-deps', '--pull', 'never', '--wait', '--wait-timeout', '180',
                     *ROLES, timeout=240)

    def service_containers(self, role, all=False):
        ids = self.docker('ps', '-aq' if all else '-q', '--filter', 'label=com.docker.compose.project=' + self.project,
                          '--filter', 'label=com.docker.compose.service=' + role).decode().split()
        return json.loads(self.docker('inspect', *ids)) if ids else []

    def _record_rolling(self):
        if self._rolling_state is not None:
            self._rolling_state['rolling_unaccepted'] = sorted(self._rolling_unaccepted)
            write_json(self.state_file, self._rolling_state)

    def start_spare(self, bundle, role):
        before = self.service_containers(role, all=True)
        require(len(before) == 2 and all(x['State']['Running'] for x in before), 'rolling_requires_two_live_replicas')
        previous = {x['Id'] for x in before}
        expected = self.render(bundle)['services'][role]['image']
        created = []
        try:
            self.compose(bundle, 'up', '-d', '--no-recreate', '--no-deps', '--pull', 'never', '--scale', role + '=3',
                         role, timeout=180)
        finally:
            created = [x for x in self.service_containers(role, all=True) if x['Id'] not in previous]
            for item in created:
                labels = item['Config'].get('Labels') or {}
                require(labels.get('com.docker.compose.project') == self.project
                        and labels.get('com.docker.compose.service') == role
                        and labels.get('com.docker.compose.project.working_dir') == str(bundle)
                        and item['Config']['Image'] == expected, 'unexpected_rolling_container')
                self._rolling_unaccepted.add(item['Id'])
            self._record_rolling()
        require(len(created) == 1, 'expected_one_new_rolling_replica')
        return created[0]['Id']

    def proxy_probe(self, role, token):
        from http.client import HTTPConnection
        host = ('api' if role == 'api' else 'ws') + '.gmod-integration.com'
        path = ('/v6' if role == 'api' else '/') + '?gmod_rolling_probe=' + token
        headers = {'Host': host, 'Origin': 'https://gmod-integration.com', 'Connection': 'close'}
        if role == 'websocket':
            headers.update({'Connection': 'Upgrade', 'Upgrade': 'websocket', 'Sec-WebSocket-Version': '13',
                            'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ=='})
        connection = HTTPConnection('127.0.0.1', self.ingress_port, timeout=8)
        try:
            connection.request('GET', path, headers=headers)
            response = connection.getresponse()
            require(response.status == (200 if role == 'api' else 401), 'rolling_proxy_probe_failed')
            if role == 'api':
                require(json.loads(response.read(4096)).get('version') == 'v6', 'rolling_api_version_failed')
        finally:
            connection.close()

    def proxy_routed(self, role, item, since, token):
        ingress = self.service_containers('traefik')
        require(len(ingress) == 1, 'unexpected_production_ingress')
        networks = item['NetworkSettings']['Networks']
        require(len(networks) == 1, 'unexpected_rolling_networks')
        address = next(iter(networks.values()))['IPAddress']
        target = ('http://' + address + ':' + ('53136' if role == 'api' else '53139')).encode()
        logs = self.docker('logs', '--since', since, '--tail', '2000', ingress[0]['Id'])
        return any(token.encode() in line and target in line for line in logs.splitlines())

    def wait_candidate(self, bundle, role, identifier):
        expected = self.render(bundle)['services'][role]
        require(expected.get('healthcheck') == application_healthcheck(role), 'rolling_requires_controlled_healthcheck')
        deadline, stable_since = time.monotonic() + 180, None
        since = now()
        token = uuid.uuid4().hex
        while True:
            try:
                item = json.loads(self.docker('inspect', identifier))[0]
                require(item['State']['Running'] and not item['State'].get('OOMKilled')
                        and item.get('RestartCount', 0) == 0 and item['Config']['Image'] == expected['image']
                        and item['State'].get('Health', {}).get('Status') == 'healthy', 'rolling_candidate_not_healthy')
                self.listener(identifier, 53136 if role == 'api' else 53139)
                self.proxy_probe(role, token)
                require(self.proxy_routed(role, item, since, token), 'rolling_candidate_not_routed')
                if stable_since is None:
                    stable_since = time.monotonic()
                if time.monotonic() - stable_since >= 5:
                    return
            except (UpdateError, OSError, ValueError, KeyError):
                stable_since = None
            require(time.monotonic() < deadline, 'rolling_candidate_acceptance_failed')
            time.sleep(2)

    def retire_replica(self, old):
        item = json.loads(self.docker('inspect', old['Id']))[0]
        labels = item['Config'].get('Labels') or {}
        require(labels.get('com.docker.compose.project') == self.project
                and labels.get('com.docker.compose.service') in ('api', 'websocket')
                and item['Image'] == old['Image'], 'refuse_unowned_rolling_retirement')
        test = item['Config'].get('Healthcheck', {}).get('Test', [])
        if item['State']['Running'] and any('/tmp/gmod-draining' in str(x) for x in test):
            self.docker('exec', item['Id'], 'bun', '-e',
                        "require('node:fs').writeFileSync('/tmp/gmod-draining','1',{mode:0o600})", timeout=15)
            deadline = time.monotonic() + 40
            while True:
                latest = json.loads(self.docker('inspect', item['Id']))[0]
                if not latest['State']['Running'] or latest['State'].get('Health', {}).get('Status') == 'unhealthy':
                    break
                require(time.monotonic() < deadline, 'rolling_drain_not_confirmed')
                time.sleep(1)
            # Docker health events pass through Traefik's provider debounce before routing changes.
            time.sleep(3)
        self.docker('stop', '--time', '120', item['Id'], timeout=150)
        self.docker('rm', item['Id'], timeout=30)

    def rolling_update(self, bundle):
        self._rolling_unaccepted = set()
        for role in ('api', 'websocket'):
            old = self.service_containers(role)
            require(len(old) == 2, 'rolling_requires_two_live_replicas')
            for previous in old:
                identifier = self.start_spare(bundle, role)
                self.wait_candidate(bundle, role, identifier)
                self._rolling_unaccepted.remove(identifier)
                if self._rolling_state is not None:
                    self._rolling_state['rolling_accepted'].append(identifier)
                self._record_rolling()
                self.retire_replica(previous)
                if self._rolling_state is not None:
                    self._rolling_state['rolling_retired'].append(previous['Id'])
                    self._record_rolling()
        # Process-local Discord clients remain a singleton; Compose stops the old instance first.
        self.compose(bundle, 'up', '-d', '--no-deps', '--pull', 'never', '--wait', '--wait-timeout', '180',
                     'discord', timeout=240)

    def cleanup_rolling(self):
        for identifier in sorted(self._rolling_unaccepted):
            with contextlib.suppress(UpdateError, ValueError, KeyError):
                item = json.loads(self.docker('inspect', identifier))[0]
                labels = item['Config'].get('Labels') or {}
                if (labels.get('com.docker.compose.project') == self.project
                        and labels.get('com.docker.compose.service') in ('api', 'websocket')):
                    self.docker('stop', '--time', '30', identifier, timeout=45, check=False)
                    self.docker('rm', identifier, timeout=30)
                    self._rolling_unaccepted.remove(identifier)
        self._record_rolling()

    def listener(self, container, port):
        script = "const t=setTimeout(()=>process.exit(1),3000);const s=require('node:net').connect(%d,'127.0.0.1',()=>{clearTimeout(t);s.end();process.exit(0)});s.on('error',()=>process.exit(1));" % port
        self.docker('exec', container, 'bun', '-e', script, timeout=8)

    def verify_apps(self, bundle):
        from http.client import HTTPConnection
        deadline = time.monotonic() + 90
        expected = self.render(bundle)['services']
        stable_ids, stable_since = None, None
        while True:
            try:
                ids = self.docker('ps', '-q', '--filter', 'label=com.docker.compose.project=gmod-production').decode().split()
                items = json.loads(self.docker('inspect', *ids))
                for role, count in COUNTS.items():
                    matches = [x for x in items if (x['Config'].get('Labels') or {}).get('com.docker.compose.service') == role]
                    require(len(matches) == count and all(x['State']['Running'] and not x['State'].get('OOMKilled')
                            and x.get('RestartCount', 0) == 0 and x['Config']['Image'] == expected[role]['image']
                            for x in matches), 'candidate_app_not_stable')
                    if role in ('api', 'websocket'):
                        for item in matches:
                            self.listener(item['Id'], 53136 if role == 'api' else 53139)
                for old in self._stores.values():
                    item = next(x for x in items if x['Id'] == old['Id'])
                    require(item['Image'] == old['Image'] and item['Mounts'] == old['Mounts']
                            and item['State']['Running'], 'datastore_changed_during_release')
                for host, path, status, upgrade in [('api.gmod-integration.com', '/v6', 200, False),
                                                   ('api.gmod-integration.com', '/v6/auth/session', 401, False),
                                                   ('ws.gmod-integration.com', '/', 401, True)]:
                    connection = HTTPConnection('127.0.0.1', 80, timeout=8)
                    headers = {'Host': host, 'Origin': 'https://gmod-integration.com', 'Connection': 'close'}
                    if upgrade:
                        headers.update({'Connection': 'Upgrade', 'Upgrade': 'websocket',
                                        'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ=='})
                    try:
                        connection.request('GET', path, headers=headers)
                        response = connection.getresponse()
                        require(response.status == status, 'candidate_http_probe_failed')
                        if path == '/v6':
                            require(json.loads(response.read(4096)).get('version') == 'v6', 'candidate_api_version_failed')
                        if path == '/v6/auth/session':
                            require(response.getheader('Access-Control-Allow-Origin') == 'https://gmod-integration.com'
                                    and response.getheader('Access-Control-Allow-Credentials') == 'true', 'candidate_cors_failed')
                    finally:
                        connection.close()
                discord = next(x for x in items if (x['Config'].get('Labels') or {}).get('com.docker.compose.service') == 'discord')
                logs = self.docker('logs', '--since', discord['State']['StartedAt'], '--tail', '10000', discord['Id'])
                require(b'Ready on main with ' in logs, 'main_discord_not_ready')
                selected = tuple(sorted(x['Id'] for x in items))
                if selected != stable_ids:
                    stable_ids, stable_since = selected, time.monotonic()
                if time.monotonic() - stable_since >= 5:
                    return
                time.sleep(2)
            except (UpdateError, OSError, ValueError, StopIteration):
                stable_ids, stable_since = None, None
                require(time.monotonic() < deadline, 'candidate_acceptance_failed')
                time.sleep(3)

    def switch(self, candidate):
        temporary = self.current.with_name('.current-' + uuid.uuid4().hex)
        temporary.symlink_to(candidate)
        os.replace(temporary, self.current)
        descriptor = os.open(self.current.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    for name in ('initialize', 'check', 'run', 'status'):
        mode.add_argument('--' + name, action='store_true')
    args = parser.parse_args()
    os.umask(0o077)
    require(os.geteuid() == 0 and socket.gethostname() == 'gmod-integration-prod', 'wrong_target_host')
    updater = Updater()
    if args.status:
        print(json.dumps(updater.status()))
        return 0
    private_dir(STATE)
    private_dir(STATE / 'logs')
    lock_fd = os.open(STATE / 'update.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(lock_fd, 'r+') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print(json.dumps({'status': 'busy'}))
            return 0
        log = STATE / 'logs' / ('run-' + dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ-') + uuid.uuid4().hex[:8] + '.log')
        descriptor = os.open(log, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(descriptor, 'wb') as output:
            updater.runner.log = output
            def interrupted(signum, frame):
                raise UpdateError('update_interrupted')
            signal.signal(signal.SIGTERM, interrupted)
            signal.signal(signal.SIGINT, interrupted)
            try:
                result = updater.initialize() if args.initialize else updater.check(apply=args.run)
            except BaseException:
                output.write(traceback.format_exc().encode())
                output.flush()
                raise
            finally:
                logs = sorted((STATE / 'logs').glob('run-*.log'))
                for old in logs[:-200]:
                    with contextlib.suppress(OSError):
                        if old != log and old.is_file() and not old.is_symlink():
                            old.unlink()
    print(json.dumps(result))
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except UpdateError as error:
        print(json.dumps({'status': 'refused_or_failed', 'reason': str(error)}), file=sys.stderr)
        raise SystemExit(1)
    except (OSError, ValueError, KeyError, TypeError):
        print(json.dumps({'status': 'refused_or_failed', 'reason': 'inspect_private_update_state_and_logs'}), file=sys.stderr)
        raise SystemExit(1)
