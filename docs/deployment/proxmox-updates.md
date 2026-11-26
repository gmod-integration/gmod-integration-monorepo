# Automatic production packages and migrations

CT115 uses `scripts/proxmox-production-update.py`, installed as
`/usr/local/sbin/gmod-production-update`, to update the existing
`gmod-production` installation. Fresh installations still use the
[Proxmox bootstrap procedure](./proxmox.md).

The systemd timer checks GitHub Container Registry every five minutes, with up
to thirty seconds of random delay. Initialization records packages already
published as a baseline without deploying them. Only a later change triggers a
release; enabling the timer does not replace the current installation with an
older package.

## Eligible releases

The Build workflow tests changes on `main` and publishes API, WebSocket and
Discord images together when backend paths change. The updater waits until all
three `latest` images carry the same full Git revision, then pins immutable
digests. A partially published set is deferred before stopping applications.
The server checks that a changed candidate belongs to the canonical monorepo's
`main` history. After its first deployment, it also requires forward commit
ancestry, so a late older publication cannot automatically roll back code.
Unavailable GitHub provenance prevents deployment while applications keep
running. Registry authentication alone does not authorize a candidate.

The internal relay, datastores, Traefik and Cloudflare connector keep their
existing images. Private application configuration, credentials, volume
identities, network and replica counts are preserved. Changes to infrastructure,
required environment variables or the standalone relay need a separate release
procedure.

Production applies SQL already checked into
`packages/infra-prisma/migrations/`. A change to `schema.prisma` alone does not
generate a production migration. Create and review it in development, then
include its SQL in the package:

```bash
bun run prisma:migration:create -- --name describe_the_change
```

The migration service executes `scripts/swarm-migrate.ts`, which runs
`prisma migrate deploy`. Production never generates migrations with `migrate dev`
and does not use `db push`, reset or automatic failure resolution.

## Rolling or maintenance

With no pending SQL, updates use rolling replacement. API and WebSocket keep
two instances each: one extra instance starts and becomes healthy before an
old instance is retired. The sequence repeats until both instances use the new
image. Container numbers can increase; the required final count remains two.
The bot is a singleton and restarts with the old process stopped first, after
API and WebSocket replacement. Its brief reconnect does not stop those services.

SQL migrations default to maintenance. To allow a pending migration while the
old applications remain active, review its compatibility and record the exact
SQL checksum in `packages/infra-prisma/rolling-migrations.json`:

```json
{
  "version": 1,
  "release_mode": "auto",
  "migrations": {
    "20270101120000_example": {
      "sha256": "<64 lowercase hexadecimal characters matching migration.sql>",
      "online": true
    }
  }
}
```

Every pending migration must be approved this way. Editing its SQL invalidates
the approval. Compatibility must include old and new schema usage, queued jobs
and messages; an approval is not inferred from SQL keywords. Set
`release_mode` to `maintenance` for a breaking application contract even when
there is no new SQL. Unknown or malformed metadata prevents deployment.

## Update sequence

Before stopping applications, the updater validates the image set and rendered
configuration. Completed database migrations must exist in the candidate image
with their original SQL checksums. Downgrades, edited history and unresolved
failed migrations are refused.

A Plakar backup and its remote integrity check complete while the existing
applications continue serving traffic. A backup failure prevents the release
without stopping applications. This backup retains the
[online consistency limits](./plakar-backups.md); it is not a common
transactional checkpoint across all datastores.

The updater then takes the backup lock, rechecks the selected migration mode,
and records the operation durably. In rolling mode:

1. Apply the approved SQL, or perform the no-op migration check when none is pending.
2. Verify every migration and checksum using the candidate image.
3. Start one additional API instance, verify its health and listener, and allow
   routing to converge before withdrawing an old instance. Repeat for the
   second instance and then for WebSocket.
4. Restart the singleton Discord process and verify principal bot readiness.
5. Check the complete release and atomically retain its bundle as `current`.

Maintenance mode instead follows this order:

1. Record maintenance durably and stop API, WebSocket and Discord writers.
2. Run `prisma-migrate` once using the exact candidate API image.
3. Verify every migration and SQL checksum with the candidate image.
4. Start matching application images with the existing replica counts.
5. Verify startup and retain the successful bundle as `current`.

The four datastores, their volumes, internal relay and public ingress are not
recreated. Downloads, validation and the backup occur while applications remain
active. A maintenance interval is reserved for the incompatible release path.

New API/WebSocket containers have readiness healthchecks. A retiring instance
with the new healthcheck is withdrawn using its drain marker before termination;
API shutdown waits for active HTTP requests before closing datastore clients.
Existing containers created before this updater have no readiness healthcheck,
so their first replacement cannot guarantee that no request observes a transient
proxy error. Rolling preserves service availability; it does not migrate live
connections between processes. Existing WebSockets reconnect when their own
instance stops, and the singleton Discord process also reconnects.

## Install and enable on CT115

Run from a checkout staged on the intended production container:

```bash
install -m 0755 scripts/proxmox-production-update.py /usr/local/sbin/gmod-production-update
install -m 0644 infra/proxmox/files/gmod-production-update.service /etc/systemd/system/
install -m 0644 infra/proxmox/files/gmod-production-update.timer /etc/systemd/system/
ln -sfn /opt/gmod-integration-production/current/gmod-prodctl /usr/local/bin/gmod-prodctl
systemd-analyze verify /etc/systemd/system/gmod-production-update.{service,timer}
/usr/local/sbin/gmod-production-update --initialize
/usr/local/sbin/gmod-production-update --check
systemctl daemon-reload
systemctl enable --now gmod-production-update.timer
```

Initialization requires a coherent package set and a running installation. It
cannot reset a blocked release. Public GHCR packages need no registry login;
private packages require separately provisioned read access.

## Inspect and recover

```bash
/usr/local/sbin/gmod-production-update --status
/usr/local/sbin/gmod-production-update --check
systemctl status gmod-production-update.timer gmod-production-update.service
systemctl list-timers --all gmod-production-update.timer
```

`--check` can download images and refresh check metadata but never deploys.
`--run` applies a new eligible release. State is
`/var/lib/docker/gmod-production-update/state.json`; diagnostics are private
under its `logs/` directory because command output can contain sensitive data.

A failed or interrupted update records a blocked state. A rolling failure keeps
accepted healthy instances serving and cleans up the unaccepted replacement;
it does not automatically stop every application. A failure while applying
pending SQL can still require stopping writers for manual recovery. Maintenance
failures retain the existing stop-all behavior. The timer never blindly restarts
old binaries after schema changes. Preserve logs and state, inspect Prisma
history, then perform a reviewed correction or recovery. Deleting state or
reinitializing is not a recovery procedure.

To suspend future checks without terminating an active release:

```bash
systemctl disable --now gmod-production-update.timer
```

Disabling the timer does not interrupt its running service. Do not stop that
service or reboot during migration.

Offline tests cover publication, migration history, preserved configuration and
failure behavior without connecting to production:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
  -s scripts/tests -p test_proxmox_production_update.py
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
  -s scripts/tests -p 'test_proxmox_rolling*.py'
```

The disposable integration test exercises the actual replacement methods with
two application instances behind Traefik and continuously samples requests.
It uses a unique project, loopback ingress and fixture-owned images; it does
not use production configuration. Preload the public fixture images, then opt
in explicitly:

```bash
docker pull oven/bun:1.3.9
docker pull traefik:v2.11
GMOD_ROLLING_DOCKER_TEST=1 PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
  -s scripts/tests -p test_proxmox_rolling_docker.py
```

With opt-in enabled, missing image prerequisites fail the test. The ordinary
offline suite skips this one integration test. CI runs it explicitly in the
recovery job before packages can publish.
