# Swarm deployment and recovery

The release wrapper performs a maintenance release: it stops all application writers, takes a cold
backup of the four datastores and their recovery configuration, deploys the new images with writers
at zero, runs the checked-in Prisma migrations, and enables the matching API, WebSocket and Discord
services only after a successful migration task. A direct `docker stack deploy` leaves application
replicas at zero. Production never uses `prisma db push`.

## Prerequisites

Use Docker Engine on the Swarm manager that owns all four named data volumes, Python 3.10+, a private
repository-root `.env`, GHCR authentication if needed, and sufficient disk space for all archives.
The supplied placement constraints target managers; for multiple managers, pin every datastore to its
existing owning node before deployment. Local volumes do not migrate with tasks. Recovery refuses a
running datastore on another node. The release overlay preserves those owner constraints; bootstrap
pins all four datastores to the manager running the command. Do not run Compose and Swarm against the same data.

The wrapper requires immutable `registry@sha256` image digests in `API_IMAGE`, `WEBSOCKET_IMAGE` and
`DISCORD_IMAGE`, and checks that all three have the same `org.opencontainers.image.revision` commit
label before stopping anything. The build workflow supplies that label. Keep the matching
website artifact, addon commit, stack file and source revision. Record exact datastore image digests
before upgrading them: physical archives require the same datastore versions for the first restore.
The backup manifest records resolved image IDs, pullable repository digests and actual named-volume
mounts for this purpose. Normal releases preserve the running datastore digests automatically. Optional
`MARIADB_IMAGE`, `MONGO_IMAGE`, `REDIS_IMAGE` and `MINIO_IMAGE` overrides must be immutable digests; an
actual version change also requires a separately reviewed upgrade and `--allow-datastore-upgrade`.
For first installation, configure those digests explicitly instead of relying on floating defaults.

The build workflow publishes the API, WebSocket and Discord images together when backend, shared,
migration, deployment or workflow inputs change. The standalone webhook relay publishes independently.
A manual Build workflow run rebuilds every image to recover an incomplete publication.

Configure stable `AUTH_TOKEN_ENCRYPTION_KEY` (or the existing `DISCORD_CLIENT_SECRET` fallback),
`PRIVACY_HASH_SECRET`, database credentials, MinIO credentials and correct public origins. Losing the
auth encryption key makes encrypted Discord grants unreadable. Adding or rotating that key is a
separate credential migration, not a routine release edit.

Before maintenance, pause the automatic updater/cron and every external writer, including old local
API/Discord processes and scheduled jobs. Put the website into maintenance mode and stop old frontend
traffic. The wrapper stops only the explicitly named stack. `swarm-auto-update.sh` cannot provide the
required backup destination/outage authorization; use its `--check-only` mode while releases are
coordinated manually. Never automatically retry a failed schema-changing release with old images.

An existing `prisma-migrate` service must be scaled to zero and have no active tasks before maintenance.
The wrapper refuses an overlapping migration. Backup and restore compare the supplied recovery keys
and datastore credentials with the effective service/container environments before stopping anything;
an edited `.env` alone cannot authorize a different running key. These values stay out of manifests and logs.

## Release

Preview configuration without Docker commands, service changes or writes:

```bash
./scripts/swarm-deploy.sh --env-file .env --stack-name gmod \
  --quiesce --backup-dir backup/release-20261122 --dry-run
```

Deploy an existing installation in an agreed maintenance window (use a new backup directory):

```bash
./scripts/swarm-deploy.sh --env-file .env --stack-name gmod \
  --quiesce --backup-dir backup/release-20261122
```

The outage is explicit: `--quiesce` is required. The release backup deliberately leaves old writers
stopped. The migration service uses `prisma migrate deploy`, never schema push/reset, and a failed or
timed-out migration leaves all three application services at zero. Application startup independently
checks every checked-in migration's successful row and exact SQL checksum in `_prisma_migrations`.
An old `users` table alone cannot admit writers from a new credential/protocol release.

For a genuinely empty first installation only:

```bash
docker swarm init
./scripts/swarm-deploy.sh --env-file .env --stack-name gmod --quiesce --bootstrap
```

`--bootstrap` refuses an existing stack or its labelled volumes. An installation historically created
by `db push` needs a reviewed baseline before this procedure: compare its actual schema with the
checked-in history, back it up, and explicitly mark only migrations whose effects already exist as
applied using Prisma's `migrate resolve`. Do not mark every migration applied to suppress an error,
edit old applied SQL, or reset a populated production database. An incomplete/failed migration also
requires diagnosis and a reviewed repair before another release.

Expected final counts are API `2/2`, WebSocket `2/2`, Discord **`1/1`**, and each datastore/Traefik
`1/1`; `prisma-migrate` returns to `0/0`. `API_REPLICAS` and `WEBSOCKET_REPLICAS` can override the first
two counts. Discord is a singleton: its client registry is process-local and its reload queue has one
consumer per job, so multiple replicas cannot safely own the same bots. Both Discord update and
rollback use `stop-first` to prevent an overlap. Scaling Discord above one requires an ownership and
broadcast design first.

```bash
docker stack services gmod
docker service ps --no-trunc gmod_prisma-migrate
docker service logs --tail 100 gmod_prisma-migrate
```

Inspect migration diagnostics privately; database records, credentials and provider URLs must not be
copied into public logs. A nonzero wrapper exit is not permission to start the old binaries.

Publish the matching website only after the backend release succeeds. Verify login and legacy session
conversion, a CSRF-protected save, two tabs, logout, WebSocket reconnection, GWSockets dependency
reporting, an actual game screenshot and both directions of chat relay. Verify a custom Discord bot
reload/removal with the single Discord worker. Check refresh-worker/provider retry logs privately,
then remove maintenance mode and resume reviewed automation. These are runtime acceptance gates;
unit tests do not replace them.

## Cold backup

A coherent cross-store snapshot requires an outage. All API/WebSocket/Discord writers stop first,
then MariaDB, MongoDB, Redis and MinIO stop gracefully. A dirty/OOM datastore exit aborts the backup.
The helper mounts volumes read-only, has no network, and creates gzip tar archives. Each file has a
SHA-256 checksum; `manifest.json` is written last, only after every selected archive completes.
Directories are `0700` and files `0600`. The private `recovery.env` includes the source configuration,
including stable auth keys and credentials, so a data-only backup cannot silently lose key material.
It is sensitive even if SQL tokens are encrypted.

```bash
./scripts/swarm-backup.sh --env-file .env --stack-name gmod --all \
  --quiesce --backup-dir backup/maintenance-20261122
```

A successful standalone backup resumes the original counts, with Discord capped at one worker. `--leave-stopped` keeps the maintenance
outage in effect. Archive failures leave the backup incomplete and services stopped. A later startup
failure disables application writers again; a completed snapshot remains available for investigation
before resuming the matching release. Do not trust a directory without a completed manifest. Stop/pause all
external writers too; the script cannot make unrelated processes consistent.

For off-host storage, install `age` and encrypt every archive and recovery configuration directly:

```bash
./scripts/swarm-backup.sh --env-file .env --stack-name gmod --all --quiesce \
  --backup-dir backup/encrypted-20261122 --age-recipient age1YOUR_PUBLIC_RECIPIENT
```

Keep the age private identity outside this host and outside the backup. Checksums detect damage;
they do not authenticate an attacker-modified manifest. Store bundles in trusted, access-controlled,
versioned off-host storage and retain a separately trusted manifest/checksum. Retain recovery keys and
release artifacts together under the same access policy. Unencrypted local bundles need equivalent
disk/access protection; the tool does not pretend file permissions are encryption.

`--mariadb`, `--mongo`, `--redis` and `--minio` select partial archives, but still stop all stores and
writers for consistency. Partial restore is an expert repair: it does not recover the rest of the
application's cross-store state. Prefer `--all` for disaster recovery. A cron job must explicitly
allow its outage, use a unique directory each time and alert on failure; a backup without a tested
restore is not a recovery guarantee.

## Restore and rollback

A binary-only rollback is unsafe after the auth release writes hashed sessions/encrypted grants.
Restore a consistent pre-release bundle, **its matching backend and website releases**, and the same
auth key material, or use a reviewed forward repair. Do not resurrect erased personal data: reconcile
any erasure/revocation records after the snapshot before serving traffic again.

Prepare an isolated destination first. Provision the matching stack images/volumes with all writers
stopped; a direct stack deploy keeps app replicas zero, but briefly starts datastores, so stop them
before recovery. On a new machine, restore the exact images from the release archive or registry;
image IDs must match the manifest. Copy the bundle from trusted storage. Extract its configuration to
a **new** private file without Docker changes:

```bash
./scripts/swarm-restore.sh --backup-dir backup/maintenance-20261122 \
  --extract-env /secure/path/recovered.env
```

Review destination hostnames and ingress settings in that file, while preserving auth keys, database
credentials and MinIO keys. For encrypted bundles supply `--age-identity /secure/path/identity.txt` to
each restore/extract command. Avoid printing either file. Then validate the bundle and plan without
Docker commands or volume changes:

```bash
./scripts/swarm-restore.sh --backup-dir backup/maintenance-20261122 \
  --env-file /secure/path/recovered.env --stack-name gmod-recovery --dry-run
```

This dry run verifies archive checksums and safe tar paths, but does not inspect the target daemon,
prove image compatibility or start services. Actual restore checks the explicit target's volume
labels/mounts, exact images and effective recovery credentials **before** stopping/wiping anything. It rejects
absolute paths, traversal, archive links/devices, symlinked input files and incomplete manifests.

```bash
./scripts/swarm-restore.sh --backup-dir backup/maintenance-20261122 \
  --env-file /secure/path/recovered.env --stack-name gmod-recovery \
  --quiesce --confirm-restore gmod-recovery
```

`--confirm-restore` must exactly match the destination stack: this replaces selected named-volume
contents. Default success leaves all services stopped. `--resume` explicitly starts the backed-up
replica counts from the matching release, with Discord capped at one worker. On any extraction/start failure keep writers stopped,
correct the cause and restore the whole bundle again; partially restored volumes are not usable.
Without `--resume`, start datastores, check their health privately, then API/WebSocket and one Discord
worker, and publish the matching website only after acceptance. Never start current incompatible
images over an older snapshot just to make replica counters green.

## Tests

Offline safety and migration-guard tests:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts/tests -p test_swarm_ops.py
bun test scripts/swarm-migration-status.test.ts
```

Opt-in real Docker acceptance (the same publicly pullable Chainguard MinIO image as the stack; new
uniquely labelled containers, volumes and a private network; no
published ports; removes only those fixtures afterward):

```bash
PYTHONDONTWRITEBYTECODE=1 python3 scripts/tests/swarm_recovery_roundtrip.py --run-disposable-docker-test
```

The integration runner writes known SQL/document/Redis/S3 data, takes a cold backup, changes each
store, restores and reads the original values through all four real services. It separately replays
Prisma migrations against an empty database. A replay failure returns nonzero and stores diagnostics
in a private file under `backup/`; success is reported separately from restore success. It does not
prove a production restore or game/Discord acceptance. Repeat recovery on an isolated destination
using a real, access-controlled backup before relying on this procedure operationally.

## Ingress and operations

Cloudflare Tunnel routes both API and WebSocket hostnames to Traefik at `http://localhost:80`, preserving
the host header. Do not target internal ports `53136` or `53139` in Swarm. Keep the HTTP API for panel,
OAuth, tickets and uploads even though the game transport is exclusively WebSocket. Configure exact
`API_HOST`/`WS_HOST`, public HTTPS API/website URLs, a WSS gateway URL and the proxy trust boundary.

```yaml
ingress:
  - hostname: api.your-domain.com
    service: http://localhost:80
  - hostname: ws.your-domain.com
    service: http://localhost:80
  - service: http_status:404
```

This template terminates HTTPS/WSS at the trusted ingress. Its port 80 is published by Swarm; restrict
direct access with Docker-aware firewall/network controls. Datastore/admin interfaces are private to
`gmod_net`. Traefik's dashboard/API are disabled and ports 443, 8080 and 9100 are not published;
metrics stay private at `http://traefik:9100/metrics`. A direct Traefik TLS deployment needs a separate
reviewed certificate/router/port configuration. Editing files does not change existing containers.

`MARIA_*` values are canonical for applications; legacy `MARIADB_*` aliases are accepted by the wrapper
without sourcing or evaluating the env file. Environment values are literal, single-line assignments;
no shell expansion or multiline private keys are supported. Applications have a connection limit of
10 each. Inspect private database logs if connection pressure remains, and avoid duplicate local
processes. Keep backups before `docker stack rm`; that removes services, not a verified recovery plan.
