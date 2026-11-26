#!/usr/bin/env python3
"""Back up CT115's live datastores and private bundle to the existing Plakar store.

Online dumps have independent capture times, not cross-store transaction consistency.
Raw command diagnostics and all recovery material remain in private local files.
"""
from __future__ import annotations

import argparse
import datetime as dt
import fcntl
import gzip
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import shutil
import socket
import stat
import subprocess
import sys
import tempfile
import traceback
import uuid


ROOT = Path('/var/lib/docker/gmod-plakar-backup')
BUNDLE = Path('/opt/gmod-integration-production/current')
PROJECT = 'gmod-production'
SERVICES = ('mariadb', 'mongo', 'redis', 'minio')
EXPECTED_BUCKETS = {'gmi-gdpr-exports', 'gmi-players-connections-charts',
                    'gmi-players-screenshots', 'gmi-players-team-charts',
                    'gmi-servers-status', 'gmi-user-avatars'}
DOCKER = ['docker', '--host', 'unix:///var/run/docker.sock']
ENVIRONMENT = {'PATH': '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
               'HOME': '/root', 'DOCKER_HOST': 'unix:///var/run/docker.sock',
               'XDG_CONFIG_HOME': '/root/.config',
               'XDG_CACHE_HOME': str(ROOT / 'cache'), 'TZ': 'Europe/Paris',
               'AWS_EC2_METADATA_DISABLED': 'true'}
PLAKAR = ['/usr/local/bin/plakar', '-cpu', '2', '-concurrency', '16',
          '-configdir', '/root/.config/plakar',
          '-cachedir', str(ROOT / 'cache'), '-keyfile',
          '/root/.config/plakar/gmi-prod.key', 'at', '@gmi-prod']
MINIMUM_FREE = 15 * 1024 ** 3


class BackupError(RuntimeError):
    pass


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def require(condition, reason):
    if not condition:
        raise BackupError(reason)


def private_directory(path: Path):
    for item in (path, *path.parents):
        require(not item.is_symlink(), 'symlink_in_private_path')
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    value = path.stat()
    require(stat.S_ISDIR(value.st_mode) and value.st_uid == os.geteuid()
            and stat.S_IMODE(value.st_mode) == 0o700, 'directory_not_private')


def private_write(path: Path, data: bytes):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, 'wb') as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())


def json_bytes(value):
    return (json.dumps(value, indent=2, sort_keys=True, default=str) + '\n').encode()


def atomic_json(path: Path, value):
    temporary = path.parent / ('.' + path.name + '-' + uuid.uuid4().hex)
    private_write(temporary, json_bytes(value))
    os.replace(temporary, path)


def acquire_lock(path: Path):
    descriptor = os.open(path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    value = os.fstat(descriptor)
    if not stat.S_ISREG(value.st_mode) or value.st_uid != os.geteuid() or value.st_mode & 0o077:
        os.close(descriptor)
        raise BackupError('lock_not_private')
    stream = os.fdopen(descriptor, 'a+b')
    try:
        fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        stream.close()
        raise BackupError('another_backup_is_running') from None
    return stream


def check_space():
    require(shutil.disk_usage(ROOT).free >= MINIMUM_FREE, 'less_than_15_gib_free')


def run(arguments):
    value = subprocess.run(arguments, capture_output=True, env=ENVIRONMENT, timeout=120)
    require(value.returncode == 0, 'metadata_command_failed')
    return value.stdout


def discover_containers(runner=run):
    identifiers = runner(DOCKER + ['ps', '--filter', 'label=com.docker.compose.project=' + PROJECT,
                                  '--filter', 'status=running', '--format', '{{.ID}}']).decode().split()
    require(bool(identifiers), 'no_production_containers')
    try:
        values = json.loads(runner(DOCKER + ['inspect', *identifiers]))
    except (ValueError, TypeError):
        raise BackupError('invalid_container_metadata') from None
    result = {}
    for service in SERVICES:
        matches = [item for item in values
                   if item.get('State', {}).get('Running') is True
                   and item.get('Config', {}).get('Labels', {}).get('com.docker.compose.project') == PROJECT
                   and item.get('Config', {}).get('Labels', {}).get('com.docker.compose.service') == service
                   and item.get('Config', {}).get('Labels', {}).get('com.docker.compose.oneoff', 'False').lower() != 'true']
        require(len(matches) == 1, 'expected_one_running_' + service)
        result[service] = matches[0]
    return result


def container_environment(item):
    return dict(value.split('=', 1) for value in item['Config'].get('Env', []) if '=' in value)


def safe_key_path(root: Path, bucket: str, key: str):
    require(bool(bucket) and '/' not in bucket and '\\' not in bucket
            and bucket not in ('.', '..'), 'invalid_bucket_name')
    require(bool(key) and not key.startswith('/') and '\\' not in key
            and all(piece not in ('', '.', '..') for piece in key.split('/'))
            and not any(ord(c) < 32 or ord(c) == 127 for c in key), 'unsafe_object_key')
    destination = root / bucket / key
    require(destination.is_relative_to(root), 'object_outside_staging')
    for item in (destination, *destination.parents):
        require(not item.is_symlink(), 'symlink_in_object_path')
        if item == root:
            break
    require(not destination.exists(), 'object_path_collision')
    return destination


def diagnostic_lines(paths):
    benign = re.compile(r'\b(?:0|no)\s+(?:errors?|warnings?|failures?)\b'
                        r'|\bwithout\s+(?:errors?|warnings?|failures?)'
                        r'(?:\s*(?:,|and|or)\s*(?:errors?|warnings?|failures?))*\b', re.I)
    diagnostic = re.compile(r'\b(?:warn(?:ings?)?|err(?:ors?)?|fatal|panic|failed|failures?)\b'
                            r'|\bKO\s*[✘✗×]|\b(?:chunk|object)\s+(?:(?:is|was)\s+)?(?:missing|corrupted)\b', re.I)
    count = 0
    for path in paths:
        with path.open('rb') as stream:
            for line in stream:
                if diagnostic.search(benign.sub('', line.decode('utf-8', errors='replace'))):
                    count += 1
    return count


def check_plakar_result(returncode, stdout, stderr):
    require(returncode == 0, 'plakar_nonzero_exit')
    require(diagnostic_lines((stdout, stderr)) == 0, 'plakar_diagnostics_require_review')


def hash_file(path):
    digest = hashlib.sha256()
    size = 0
    with path.open('rb') as stream:
        while chunk := stream.read(1024 * 1024):
            size += len(chunk)
            digest.update(chunk)
    return {'bytes': size, 'sha256': digest.hexdigest()}


def stream_command(arguments, destination, errors, compress=False):
    partial = destination.with_name(destination.name + '.partial')
    outfd = os.open(partial, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    errfd = os.open(errors, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    process = None
    try:
        with os.fdopen(outfd, 'wb') as output, os.fdopen(errfd, 'wb') as error_output:
            process = subprocess.Popen(arguments, stdout=subprocess.PIPE, stderr=error_output, env=ENVIRONMENT)
            target = gzip.GzipFile(filename='', mode='wb', fileobj=output, compresslevel=1) if compress else output
            try:
                while chunk := process.stdout.read(1024 * 1024):
                    check_space()
                    target.write(chunk)
            finally:
                if compress:
                    target.close()
                process.stdout.close()
            require(process.wait() == 0, 'datastore_export_failed')
            output.flush()
            os.fsync(output.fileno())
        require(partial.stat().st_size > 0, 'empty_datastore_export')
        if compress or destination.name.endswith('.gz'):
            with gzip.open(partial, 'rb') as verify:
                while verify.read(1024 * 1024):
                    pass
        partial.rename(destination)
    finally:
        if process is not None and process.poll() is None:
            process.kill()
            process.wait()


def copy_bundle(destination):
    source = BUNDLE.resolve(strict=True)
    require(source.is_relative_to(Path('/opt/gmod-integration-production/releases')),
            'bundle_outside_production_releases')
    private_directory(destination)
    total = 0
    for directory, dirs, files in os.walk(source, followlinks=False):
        current = Path(directory)
        require(not any((current / name).is_symlink() for name in (*dirs, *files)), 'bundle_contains_symlink')
        target_dir = destination / current.relative_to(source)
        private_directory(target_dir)
        for name in files:
            path = current / name
            metadata = path.stat()
            require(stat.S_ISREG(metadata.st_mode), 'bundle_contains_special_file')
            total += metadata.st_size
            require(metadata.st_size <= 64 * 1024 ** 2 and total <= 256 * 1024 ** 2, 'bundle_unexpectedly_large')
            private_write(target_dir / name, path.read_bytes())
    return {'release_directory': str(source), 'bytes': total, 'raw_bytes_preserved': True}


def capture_databases(containers, payload, logs):
    destination = payload / 'databases'
    private_directory(destination)
    result = {}
    commands = {
        'mariadb': (['sh', '-c', 'export MYSQL_PWD="$MARIADB_ROOT_PASSWORD"; exec mariadb-dump -uroot --single-transaction --quick --routines --events --triggers --hex-blob --databases "$MARIADB_DATABASE"'], 'mariadb.sql.gz', True),
        'mongo': (['mongodump', '--quiet', '--archive', '--gzip', '--db=gmod_integration'], 'mongo.archive.gz', False),
        'redis': (['redis-cli', '--rdb', '-'], 'redis.rdb', False),
    }
    maria_env = container_environment(containers['mariadb'])
    require(bool(maria_env.get('MARIADB_ROOT_PASSWORD')) and bool(maria_env.get('MARIADB_DATABASE')),
            'mariadb_credentials_missing')
    for service, (command, filename, compress) in commands.items():
        started = now()
        path = destination / filename
        stream_command(DOCKER + ['exec', containers[service]['Id'], *command], path,
                       logs / (service + '-export.stderr'), compress)
        result[service] = {'started_at_utc': started, 'completed_at_utc': now(), **hash_file(path)}
    redis_id = containers['redis']['Id']
    with (destination / 'redis.rdb').open('rb') as stream:
        require(re.fullmatch(rb'REDIS[0-9]{4}', stream.read(9)) is not None, 'invalid_redis_rdb_header')
    temporary = '/tmp/gmod-plakar-check-' + uuid.uuid4().hex + '.rdb'
    copied = False
    try:
        run(DOCKER + ['cp', str(destination / 'redis.rdb'), redis_id + ':' + temporary])
        copied = True
        validation = run(DOCKER + ['exec', redis_id, 'redis-check-rdb', temporary])
        private_write(logs / 'redis-check.stdout', validation)
    finally:
        if copied:
            run(DOCKER + ['exec', redis_id, 'rm', '--', temporary])
    result['redis']['redis_check_rdb_passed'] = True
    return result


def optional_s3(client, method, bucket):
    from botocore.exceptions import ClientError
    try:
        value = getattr(client, method)(Bucket=bucket)
        return {key: item for key, item in value.items() if key != 'ResponseMetadata'}
    except ClientError as error:
        code = error.response.get('Error', {}).get('Code', 'unknown')
        if code in {'NoSuchBucketPolicy', 'NoSuchLifecycleConfiguration', 'NoSuchTagSet'}:
            return {'unavailable': code}
        raise


def capture_minio(container, payload):
    import boto3
    from botocore.config import Config
    environment = container_environment(container)
    require(bool(environment.get('MINIO_ROOT_USER')) and bool(environment.get('MINIO_ROOT_PASSWORD')),
            'minio_credentials_missing')
    network = container.get('NetworkSettings', {}).get('Networks', {}).get('gmod-production_net', {})
    address = network.get('IPAddress', '')
    require(ipaddress.ip_address(address) in ipaddress.ip_network('172.30.115.0/24'), 'unexpected_minio_address')
    client = boto3.client('s3', endpoint_url='http://' + address + ':9000', region_name='us-east-1',
                          aws_access_key_id=environment['MINIO_ROOT_USER'],
                          aws_secret_access_key=environment['MINIO_ROOT_PASSWORD'],
                          config=Config(signature_version='s3v4', connect_timeout=10, read_timeout=120,
                                        retries={'max_attempts': 3, 'mode': 'standard'}, s3={'addressing_style': 'path'}))
    names = sorted(item['Name'] for item in client.list_buckets()['Buckets'])
    require(EXPECTED_BUCKETS <= set(names), 'expected_minio_bucket_missing')
    object_root = payload / 'minio' / 'objects'
    private_directory(object_root)
    metadata_root = payload / 'minio' / 'metadata'
    private_directory(metadata_root)
    summary = {'started_at_utc': now(), 'buckets': [], 'object_count': 0, 'bytes': 0}
    for bucket in names:
        require('/' not in bucket and bucket not in ('', '.', '..'), 'invalid_bucket_name')
        private_directory(object_root / bucket)
        private_directory(metadata_root / bucket)
        versioning = client.get_bucket_versioning(Bucket=bucket)
        require(not versioning.get('Status'), 'versioned_minio_bucket_not_supported')
        details = {'bucket': bucket, 'versioning': {k: v for k, v in versioning.items() if k != 'ResponseMetadata'},
                   'settings': {method: optional_s3(client, method, bucket) for method in
                                ('get_bucket_policy', 'get_bucket_lifecycle_configuration', 'get_bucket_tagging')},
                   'objects': []}
        for page in client.get_paginator('list_objects_v2').paginate(Bucket=bucket):
            for item in page.get('Contents', []):
                check_space()
                key = item['Key']
                # Flat hashed filenames preserve every legal S3 key (including directories,
                # traversal-looking strings and file/prefix collisions) without interpreting it.
                name = hashlib.sha256(key.encode('utf-8')).hexdigest()
                destination = safe_key_path(object_root, bucket, name)
                body = client.get_object(Bucket=bucket, Key=key, IfMatch=item['ETag'])
                digest = hashlib.sha256()
                size = 0
                descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
                try:
                    with os.fdopen(descriptor, 'wb') as output:
                        while chunk := body['Body'].read(1024 * 1024):
                            check_space()
                            size += len(chunk)
                            digest.update(chunk)
                            output.write(chunk)
                        output.flush()
                        os.fsync(output.fileno())
                finally:
                    body['Body'].close()
                require(size == item['Size'] == body['ContentLength'], 'minio_object_size_changed')
                try:
                    tags = client.get_object_tagging(Bucket=bucket, Key=key).get('TagSet', [])
                except Exception:
                    raise BackupError('minio_object_tag_read_failed') from None
                metadata = {field: body[field] for field in
                            ('ContentType', 'Metadata', 'CacheControl', 'ContentDisposition', 'ContentEncoding',
                             'ContentLanguage', 'Expires', 'ETag', 'LastModified', 'StorageClass',
                             'ServerSideEncryption', 'SSEKMSKeyId', 'ObjectLockMode', 'ObjectLockRetainUntilDate',
                             'ObjectLockLegalHoldStatus') if field in body}
                details['objects'].append({'key': key, 'file': bucket + '/' + name, 'bytes': size,
                                           'sha256': digest.hexdigest(), 'metadata': metadata, 'tags': tags})
                summary['object_count'] += 1
                summary['bytes'] += size
        private_write(metadata_root / bucket / 'objects.json', json_bytes(details))
        summary['buckets'].append({'name': bucket, 'object_count': len(details['objects']),
                                   'bytes': sum(item['bytes'] for item in details['objects']),
                                   'optional_settings_unavailable': {k: v['unavailable'] for k, v in details['settings'].items() if 'unavailable' in v}})
    summary['completed_at_utc'] = now()
    return summary


def inventory(payload):
    files = []
    for directory, dirs, names in os.walk(payload, followlinks=False):
        current = Path(directory)
        require(not any((current / name).is_symlink() for name in (*dirs, *names)), 'symlink_in_staging')
        for name in sorted(names):
            path = current / name
            require(path.is_file(), 'special_file_in_staging')
            files.append({'path': str(path.relative_to(payload)), **hash_file(path)})
    return sorted(files, key=lambda item: item['path'])


def copy_operational_files(payload):
    destination = payload / 'operations'
    private_directory(destination)
    paths = (Path(__file__).resolve(),
             Path('/etc/systemd/system/gmod-plakar-backup.service'),
             Path('/etc/systemd/system/gmod-plakar-backup.timer'),
             Path('/usr/local/sbin/gmod-production-update'),
             Path('/etc/systemd/system/gmod-production-update.service'),
             Path('/etc/systemd/system/gmod-production-update.timer'))
    copied = []
    for path in paths:
        if path.exists():
            require(path.is_file() and not path.is_symlink(), 'operational_file_not_regular')
            require(path.stat().st_size < 1024 * 1024, 'operational_file_too_large')
            private_write(destination / path.name, path.read_bytes())
            copied.append(str(path))
    return copied


def prune_local_runs(current):
    """Keep the current completed run and newest failed run; never prune Plakar."""
    runs = []
    for path in (ROOT / 'staging').iterdir():
        if path.is_symlink() or not path.is_dir() or not path.name.startswith('run-'):
            continue
        try:
            value = json.loads((path / 'result.json').read_bytes())
        except (OSError, ValueError):
            continue
        if value.get('run_directory') == str(path) and value.get('status') in ('success', 'failed', 'prepared'):
            runs.append((path, value))
    failed = sorted((path for path, value in runs if value['status'] == 'failed'), key=lambda p: p.name)
    keep = {current, *(failed[-1:])}
    for path, _ in runs:
        if path not in keep:
            shutil.rmtree(path)


def existing_private_path(path, directory=False):
    for item in (path, *path.parents):
        require(not item.is_symlink(), 'symlink_in_resume_path')
    try:
        metadata = path.stat()
    except FileNotFoundError:
        raise BackupError('resume_path_missing') from None
    require(metadata.st_uid == os.geteuid() and not metadata.st_mode & 0o077,
            'resume_path_not_private')
    require(stat.S_ISDIR(metadata.st_mode) if directory else stat.S_ISREG(metadata.st_mode),
            'resume_path_wrong_type')


def resume_json(path):
    existing_private_path(path)
    try:
        value = json.loads(path.read_bytes())
    except (ValueError, UnicodeError):
        raise BackupError('resume_json_invalid') from None
    require(isinstance(value, dict), 'resume_json_not_mapping')
    return value


def validate_resume_run(value):
    text = str(value)
    require(text.startswith('/') and os.path.normpath(text) == text, 'resume_path_not_canonical')
    run_dir = Path(text)
    require(run_dir.parent == ROOT / 'staging' and re.fullmatch(r'run-[A-Za-z0-9_-]+', run_dir.name),
            'resume_path_outside_staging')
    for path in (ROOT, ROOT / 'staging', run_dir, run_dir / 'payload', run_dir / 'logs'):
        existing_private_path(path, directory=True)
    latest = resume_json(ROOT / 'latest.json')
    require(latest.get('run_directory') == str(run_dir)
            and latest.get('status') in ('running', 'failed')
            and latest.get('stage') in ('plakar', 'catalogue', 'check'), 'resume_latest_not_eligible')
    manifest_path = run_dir / 'payload' / 'manifest.json'
    manifest = resume_json(manifest_path)
    require(manifest.get('format') == 'gmod-ct115-plakar-v1'
            and manifest.get('host') == 'gmod-integration-prod'
            and manifest.get('project') == PROJECT, 'resume_manifest_wrong_target')
    if latest.get('manifest_sha256'):
        require(hash_file(manifest_path)['sha256'] == latest['manifest_sha256'], 'resume_manifest_hash_changed')
    actual = [item for item in inventory(run_dir / 'payload') if item['path'] != 'manifest.json']
    require(actual == manifest.get('files') and len(actual) == manifest.get('file_count')
            and sum(item['bytes'] for item in actual) == manifest.get('bytes'), 'resume_inventory_changed')
    proof = run_dir / 'logs' / 'plakar.stdout'
    existing_private_path(proof)
    require(b'backup completed without errors' in proof.read_bytes().lower(), 'resume_upload_not_proven')
    return run_dir, manifest, latest


def resume_check(value):
    require(os.geteuid() == 0 and socket.gethostname() == 'gmod-integration-prod', 'wrong_target_host')
    existing_private_path(ROOT, directory=True)
    with acquire_lock(ROOT / 'backup.lock'):
        run_dir, manifest, previous = validate_resume_run(value)
        result = {key: item for key, item in previous.items() if key not in ('error_type', 'reason')}
        result.update(status='running', stage='catalogue', prepare_only=False,
                      resumed_check=True, resumed_at_utc=now(),
                      manifest_sha256=hash_file(run_dir / 'payload' / 'manifest.json')['sha256'])
        atomic_json(ROOT / 'latest.json', result)
        suffix = uuid.uuid4().hex
        logs = run_dir / 'logs'
        try:
            catalogue_out = logs / ('resume-catalogue-' + suffix + '.stdout')
            catalogue_err = logs / ('resume-catalogue-' + suffix + '.stderr')
            with catalogue_out.open('xb') as output, catalogue_err.open('xb') as errors:
                process = subprocess.run(PLAKAR + ['ls', '-uuid', '-job', 'ct115-production',
                                                   '-name', run_dir.name, '-tag', 'ct115'],
                                         stdout=output, stderr=errors, env=ENVIRONMENT, timeout=900)
            check_plakar_result(process.returncode, catalogue_out, catalogue_err)
            identifiers = set(re.findall(rb'(?<![a-f0-9])[a-f0-9]{64}(?![a-f0-9])', catalogue_out.read_bytes()))
            require(len(identifiers) == 1, 'expected_one_complete_snapshot_id')
            identifier = identifiers.pop().decode('ascii')
            if previous.get('snapshot_id'):
                require(previous['snapshot_id'] == identifier, 'resume_snapshot_id_changed')
            result.update(stage='check', snapshot_id=identifier)
            atomic_json(ROOT / 'latest.json', result)
            output_path, error_path = logs / ('resume-check-' + suffix + '.stdout'), logs / ('resume-check-' + suffix + '.stderr')
            with output_path.open('xb') as output, error_path.open('xb') as errors:
                process = subprocess.run(PLAKAR + ['check', identifier + ':/'],
                                         stdout=output, stderr=errors, env=ENVIRONMENT)
            check_plakar_result(process.returncode, output_path, error_path)
            require(b'check completed without errors' in output_path.read_bytes().lower(),
                    'resume_check_completion_not_proven')
            result.update(status='success', stage='complete', completed_at_utc=now(),
                          file_count=manifest['file_count'], bytes=manifest['bytes'],
                          minio_objects=manifest['minio']['object_count'])
            atomic_json(run_dir / 'result.json', result)
            atomic_json(ROOT / 'latest.json', result)
            atomic_json(ROOT / 'last-success.json', result)
            prune_local_runs(run_dir)
            return result
        except Exception as error:
            private_write(logs / ('resume-failure-' + suffix + '.private.log'), traceback.format_exc().encode())
            result.update(status='failed', completed_at_utc=now(), error_type=type(error).__name__,
                          reason=str(error) if isinstance(error, BackupError) else 'private_log_requires_review')
            atomic_json(run_dir / 'result.json', result)
            atomic_json(ROOT / 'latest.json', result)
            raise BackupError('backup_resume_failed_at_' + result['stage'] + '; inspect private latest.json') from None


def backup(prepare_only=False):
    require(os.geteuid() == 0 and socket.gethostname() == 'gmod-integration-prod', 'wrong_target_host')
    private_directory(ROOT)
    lock = acquire_lock(ROOT / 'backup.lock')
    with lock:
        check_space()
        private_directory(ROOT / 'staging')
        private_directory(ROOT / 'cache')
        prefix = 'run-' + dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ-')
        run_dir = Path(tempfile.mkdtemp(prefix=prefix, dir=ROOT / 'staging'))
        payload, logs = run_dir / 'payload', run_dir / 'logs'
        private_directory(payload)
        private_directory(logs)
        result = {'run_directory': str(run_dir), 'started_at_utc': now(), 'status': 'running',
                  'stage': 'preflight', 'prepare_only': prepare_only}
        atomic_json(ROOT / 'latest.json', result)
        try:
            containers = discover_containers()
            manifest = {'format': 'gmod-ct115-plakar-v1', 'host': socket.gethostname(), 'project': PROJECT,
                        'started_at_utc': result['started_at_utc'],
                        'consistency': 'Independent online captures; no cross-store point-in-time guarantee.',
                        'plakar_key_included': False, 'images': {name: value['Image'] for name, value in containers.items()}}
            result['stage'] = 'databases'
            atomic_json(ROOT / 'latest.json', result)
            manifest['databases'] = capture_databases(containers, payload, logs)
            result['stage'] = 'minio'
            atomic_json(ROOT / 'latest.json', result)
            manifest['minio'] = capture_minio(containers['minio'], payload)
            result['stage'] = 'bundle'
            atomic_json(ROOT / 'latest.json', result)
            manifest['bundle'] = copy_bundle(payload / 'bundle')
            manifest['operational_files'] = copy_operational_files(payload)
            # Refuse container replacement during capture instead of silently mixing releases.
            after = discover_containers()
            require(all(after[name]['Id'] == containers[name]['Id'] for name in SERVICES), 'datastore_container_changed')
            result['stage'] = 'inventory'
            atomic_json(ROOT / 'latest.json', result)
            manifest['files'] = inventory(payload)
            manifest['file_count'] = len(manifest['files'])
            manifest['bytes'] = sum(item['bytes'] for item in manifest['files'])
            manifest['completed_at_utc'] = now()
            private_write(payload / 'manifest.json', json_bytes(manifest))
            if not prepare_only:
                result['stage'] = 'plakar'
                atomic_json(ROOT / 'latest.json', result)
                stdout, stderr = logs / 'plakar.stdout', logs / 'plakar.stderr'
                with stdout.open('xb') as output, stderr.open('xb') as errors:
                    process = subprocess.run(PLAKAR + ['backup', '-check', '-no-progress', '-tag',
                                                       'gmi-backup,ct115', '-job', 'ct115-production',
                                                       '-name', run_dir.name, str(payload)],
                                             stdout=output, stderr=errors, env=ENVIRONMENT)
                check_plakar_result(process.returncode, stdout, stderr)
                result['stage'] = 'catalogue'
                atomic_json(ROOT / 'latest.json', result)
                catalogue_out, catalogue_err = logs / 'catalogue.stdout', logs / 'catalogue.stderr'
                with catalogue_out.open('xb') as output, catalogue_err.open('xb') as errors:
                    catalogue = subprocess.run(PLAKAR + ['ls', '-uuid', '-job', 'ct115-production',
                                                         '-name', run_dir.name], stdout=output,
                                               stderr=errors, env=ENVIRONMENT, timeout=900)
                check_plakar_result(catalogue.returncode, catalogue_out, catalogue_err)
                identifiers = set(re.findall(rb'(?<![a-f0-9])[a-f0-9]{64}(?![a-f0-9])', catalogue_out.read_bytes()))
                require(len(identifiers) == 1, 'expected_one_complete_snapshot_id')
                result['snapshot_id'] = identifiers.pop().decode('ascii')
            result.update(status='prepared' if prepare_only else 'success', stage='complete',
                          completed_at_utc=now(), file_count=manifest['file_count'], bytes=manifest['bytes'],
                          minio_objects=manifest['minio']['object_count'],
                          manifest_sha256=hash_file(payload / 'manifest.json')['sha256'])
            atomic_json(run_dir / 'result.json', result)
            atomic_json(ROOT / 'latest.json', result)
            if not prepare_only:
                atomic_json(ROOT / 'last-success.json', result)
                prune_local_runs(run_dir)
            return result
        except Exception as error:
            private_write(logs / 'failure.private.log', traceback.format_exc().encode())
            result.update(status='failed', completed_at_utc=now(), error_type=type(error).__name__,
                          reason=str(error) if isinstance(error, BackupError) else 'private_log_requires_review')
            atomic_json(run_dir / 'result.json', result)
            atomic_json(ROOT / 'latest.json', result)
            raise BackupError('backup_failed_at_' + result['stage'] + '; inspect private latest.json') from None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--run', action='store_true')
    mode.add_argument('--prepare-only', action='store_true')
    mode.add_argument('--resume-check', metavar='RUN_DIRECTORY')
    arguments = parser.parse_args()
    os.umask(0o077)
    try:
        result = resume_check(arguments.resume_check) if arguments.resume_check else backup(arguments.prepare_only)
    except (BackupError, OSError) as error:
        print(str(error) if isinstance(error, BackupError) else 'backup_local_io_failed', file=sys.stderr)
        return 1
    print(json.dumps({key: result[key] for key in ('status', 'completed_at_utc', 'file_count', 'bytes', 'minio_objects')}))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
