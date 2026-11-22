#!/usr/bin/env python3
"""Opt-in Docker acceptance test. Uses unique labelled containers/volumes and no host ports.

Exercises real SQL, document, Redis and S3 reads after physical backup/restore, plus
Prisma migration replay against a separate empty database. Never selects existing data.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import hmac
import importlib.util
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile
import time
import traceback
from urllib.error import URLError
from urllib.parse import quote, urlsplit
from urllib.request import Request, urlopen
import uuid

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("swarm_ops", ROOT / "scripts/swarm-ops.py")
ops = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ops)


def command(arguments, *, env=None, data=None, allow_failure=False):
    result = subprocess.run(arguments, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
    if result.returncode and not allow_failure:
        raise RuntimeError(f"Disposable test command {arguments[0]} failed (exit {result.returncode}); output suppressed.")
    return result


def wait(action, description):
    deadline = time.monotonic() + 180
    while time.monotonic() < deadline:
        try:
            return action()
        except (RuntimeError, URLError, OSError, AssertionError):
            time.sleep(1)
    raise RuntimeError(f"Timed out waiting for disposable {description}.")


def s3(endpoint, access, secret, method, path, payload=b""):
    """Minimal signed fixture client; credentials never appear in command arguments/logs."""
    instant = dt.datetime.now(dt.timezone.utc)
    stamp, day = instant.strftime("%Y%m%dT%H%M%SZ"), instant.strftime("%Y%m%d")
    host, digest = urlsplit(endpoint).netloc, hashlib.sha256(payload).hexdigest()
    headers = f"host:{host}\nx-amz-content-sha256:{digest}\nx-amz-date:{stamp}\n"
    signed = "host;x-amz-content-sha256;x-amz-date"
    canonical = "\n".join((method, path, "", headers, signed, digest))
    scope = f"{day}/us-east-1/s3/aws4_request"
    signable = "\n".join(("AWS4-HMAC-SHA256", stamp, scope, hashlib.sha256(canonical.encode()).hexdigest()))
    key = ("AWS4" + secret).encode()
    for value in (day, "us-east-1", "s3", "aws4_request"):
        key = hmac.new(key, value.encode(), hashlib.sha256).digest()
    signature = hmac.new(key, signable.encode(), hashlib.sha256).hexdigest()
    authorization = f"AWS4-HMAC-SHA256 Credential={access}/{scope}, SignedHeaders={signed}, Signature={signature}"
    request = Request(endpoint + path, data=payload if method == "PUT" else None, method=method, headers={"Authorization": authorization, "x-amz-content-sha256": digest, "x-amz-date": stamp})
    with urlopen(request, timeout=5) as response:
        return response.read()


def main():
    if sys.argv[1:] != ["--run-disposable-docker-test"]:
        raise RuntimeError("Explicitly opt in with --run-disposable-docker-test; this creates and removes its own Docker fixtures.")
    name = "gmi-recovery-" + uuid.uuid4().hex[:12]
    label = "gmi.recovery.fixture=" + name
    containers, volumes = {}, []
    images = {"mariadb": "mariadb:latest", "mongo": "mongo:8.2", "redis": "redis:latest", "minio": "cgr.dev/chainguard/minio:latest"}
    password, access, secret = secrets.token_hex(20), "fixture-access", secrets.token_hex(24)
    environment = dict(os.environ, MARIADB_ROOT_PASSWORD=password, MARIADB_DATABASE="fixture", MARIADB_USER="fixture", MARIADB_PASSWORD=password, MINIO_ROOT_USER=access, MINIO_ROOT_PASSWORD=secret, MYSQL_PWD=password)
    network_created = False
    with tempfile.TemporaryDirectory(prefix=name + "-") as directory:
        location = Path(directory)
        env_path = location / "fixture.env"
        env_path.write_text(f"MARIA_USER=fixture\nMARIA_PASSWORD={password}\nMARIA_NAME=fixture\nMARIA_ROOT_PASSWORD={password}\nMINIO_ACCESS_KEY={access}\nMINIO_SECRET_KEY={secret}\nAUTH_TOKEN_ENCRYPTION_KEY={secrets.token_hex(32)}\nDISCORD_CLIENT_SECRET=fixture-only\nPRIVACY_HASH_SECRET={secrets.token_hex(24)}\n")
        env_path.chmod(0o600)
        try:
            # Pull all fixtures before creating anything; failures cannot affect other stacks.
            print("Preparing labelled disposable Docker fixtures (no host ports).", flush=True)
            for image in (*images.values(), ops.HELPER_IMAGE):
                command(["docker", "image", "inspect", image], allow_failure=True).returncode == 0 or command(["docker", "pull", image])
            command(["docker", "network", "create", "--label", label, name])
            network_created = True
            for component, image in images.items():
                volume, container = name + "-" + component + "-data", name + "-" + component
                command(["docker", "volume", "create", "--label", label, volume])
                volumes.append(volume)
                arguments = ["docker", "run", "-d", "--name", container, "--label", label, "--network", name, "--mount", f"type=volume,src={volume},dst={ops.COMPONENTS[component]}"]
                if component == "mariadb":
                    for key in ("MARIADB_ROOT_PASSWORD", "MARIADB_DATABASE", "MARIADB_USER", "MARIADB_PASSWORD"):
                        arguments.extend(["-e", key])
                if component == "minio":
                    # Fixture-only: a fresh root-owned named volume, never a production permission change.
                    arguments.extend(["--user", "0", "-e", "MINIO_ROOT_USER", "-e", "MINIO_ROOT_PASSWORD"])
                arguments.append(image)
                if component == "minio":
                    arguments.extend(["server", "/data"])
                started = command(arguments, env=environment, allow_failure=True)
                if started.returncode:
                    # Docker can create a container and then fail to start it. Only reclaim
                    # that failed container if its label proves this invocation owns it.
                    leftover = command(["docker", "container", "inspect", container], allow_failure=True)
                    if leftover.returncode == 0 and json.loads(leftover.stdout)[0].get("Config", {}).get("Labels", {}).get("gmi.recovery.fixture") == name:
                        containers[component] = container
                    raise RuntimeError(f"Could not start disposable {component}; output suppressed.")
                containers[component] = container
            fixture_file = location / "containers.json"
            fixture_file.write_text(json.dumps(containers))

            def sql(statement):
                return command(["docker", "exec", "-e", "MYSQL_PWD", containers["mariadb"], "mariadb", "-uroot", "-N", "-e", statement], env=environment).stdout.strip()

            def mongo(expression):
                return command(["docker", "exec", containers["mongo"], "mongosh", "--quiet", "--eval", expression]).stdout.strip()

            def redis(*arguments):
                return command(["docker", "exec", containers["redis"], "redis-cli", "--raw", *arguments]).stdout.strip()

            def endpoint():
                item = json.loads(command(["docker", "container", "inspect", containers["minio"]]).stdout)[0]
                return "http://" + item["NetworkSettings"]["Networks"][name]["IPAddress"] + ":9000"

            print("Waiting for four disposable datastores.", flush=True)
            wait(lambda: sql("SELECT 1"), "MariaDB")
            wait(lambda: mongo("db.adminCommand({ping:1})"), "MongoDB")
            wait(lambda: redis("PING"), "Redis")
            wait(lambda: s3(endpoint(), access, secret, "GET", "/"), "MinIO")
            sql("CREATE TABLE fixture.recovery_fixture (id INT PRIMARY KEY, value VARCHAR(100)); INSERT INTO fixture.recovery_fixture VALUES (1, 'before-backup');")
            mongo("db.getSiblingDB('fixture').recovery.insertOne({_id:1,value:'before-backup'})")
            redis("SET", "recovery-fixture", "before-backup")
            s3(endpoint(), access, secret, "PUT", "/recovery-fixture")
            s3(endpoint(), access, secret, "PUT", "/recovery-fixture/payload.txt", b"before-backup")

            print("Fixture data seeded; replaying checked-in migrations on an empty DB.", flush=True)
            # Replay the checked-in SQL against an independently empty database.
            sql("CREATE DATABASE migration_replay; GRANT ALL PRIVILEGES ON migration_replay.* TO 'fixture'@'%';")
            maria_item = json.loads(command(["docker", "container", "inspect", containers["mariadb"]]).stdout)[0]
            host = maria_item["NetworkSettings"]["Networks"][name]["IPAddress"]
            replay_env = dict(environment, MARIA_HOST=host, MARIA_PORT="3306", MARIA_USER="fixture", MARIA_PASSWORD=password, MARIA_NAME="migration_replay", MARIA_URL=f"mysql://fixture:{quote(password, safe='')}@{host}:3306/migration_replay")
            replay = command(["bun", "run", "prisma:migrate:prod"], env=replay_env, allow_failure=True)
            if replay.returncode:
                log = ROOT / "backup" / (name + "-migration-replay.log")
                log.parent.mkdir(exist_ok=True)
                with ops.private_file(log) as stream:
                    stream.write(replay.stdout + replay.stderr)
                print(f"Empty-database migration replay FAILED; private disposable-fixture log: {log}")
            else:
                print("Empty-database migration replay PASSED.")
                command(["bun", "scripts/swarm-migration-status.ts"], env=replay_env)

            print("Starting real cold backup, mutation and restore.", flush=True)
            runtime = ops.Runtime(name, fixture_file)
            bundle = location / "backup"
            ops.backup(runtime, env_path, bundle, ops.COMPONENTS, quiesce=True)
            wait(lambda: sql("SELECT 1"), "MariaDB after snapshot")
            wait(lambda: mongo("db.adminCommand({ping:1})"), "MongoDB after snapshot")
            wait(lambda: redis("PING"), "Redis after snapshot")
            wait(lambda: s3(endpoint(), access, secret, "GET", "/"), "MinIO after snapshot")
            sql("UPDATE fixture.recovery_fixture SET value='after-backup'")
            mongo("db.getSiblingDB('fixture').recovery.updateOne({_id:1},{$set:{value:'after-backup'}})")
            redis("SET", "recovery-fixture", "after-backup")
            s3(endpoint(), access, secret, "PUT", "/recovery-fixture/payload.txt", b"after-backup")
            ops.restore(runtime, bundle, env_path, name, quiesce=True, resume=True)

            def assert_equal(actual, expected):
                if actual != expected:
                    raise AssertionError("Restored datastore value differs from the pre-backup fixture.")
                return True

            wait(lambda: assert_equal(sql("SELECT value FROM fixture.recovery_fixture WHERE id=1"), b"before-backup"), "restored MariaDB value")
            wait(lambda: assert_equal(mongo("print(db.getSiblingDB('fixture').recovery.findOne({_id:1}).value)"), b"before-backup"), "restored MongoDB value")
            wait(lambda: assert_equal(redis("GET", "recovery-fixture"), b"before-backup"), "restored Redis value")
            wait(lambda: assert_equal(s3(endpoint(), access, secret, "GET", "/recovery-fixture/payload.txt"), b"before-backup"), "restored MinIO object")
            print("REAL four-store cold backup/restore roundtrip PASSED (SQL, MongoDB, Redis and S3 reads).")
            if replay.returncode:
                return 2
            return 0
        finally:
            cleanup_failed = False
            for container in containers.values():
                cleanup_failed |= command(["docker", "rm", "-f", container], allow_failure=True).returncode != 0
            for volume in volumes:
                cleanup_failed |= command(["docker", "volume", "rm", volume], allow_failure=True).returncode != 0
            if network_created:
                cleanup_failed |= command(["docker", "network", "rm", name], allow_failure=True).returncode != 0
            if cleanup_failed:
                raise RuntimeError(f"Fixture cleanup incomplete; inspect only resources labelled gmi.recovery.fixture={name}.")
            print("Disposable fixture cleanup completed; no existing containers/volumes were selected.")


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, ops.OperationError, OSError) as error:
        print(f"Disposable acceptance test stopped: {error}", file=sys.stderr)
        # Code locations only; do not include environment values or subprocess output.
        traceback.print_exc()
        raise SystemExit(1)
