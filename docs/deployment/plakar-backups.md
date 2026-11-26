# Production backups on Proxmox with Plakar

The CT115 production installation uses `scripts/proxmox-plakar-backup.py`, installed
as `/usr/local/sbin/gmod-plakar-backup`, to export application data and send an
encrypted snapshot to the existing `@gmi-prod` Plakar store on OVH S3. The runner
uses the existing store and encryption key; it must not initialize a replacement
store or generate a replacement key.

The systemd units are maintained in
`infra/proxmox/files/gmod-plakar-backup.service` and
`infra/proxmox/files/gmod-plakar-backup.timer`. The timer schedules a daily run at
**03:15 Europe/Paris**, with up to 60 seconds of random delay. `Persistent=true`
causes a missed scheduled run to be attempted when the timer starts again.

## Installation

The runtime requires Python 3, the distribution packages `python3-boto3` and
`python3-yaml`, Plakar 1.1.8 and its compatible S3 integration. The initial
installation reused the already validated Plakar binary and S3 1.1.5 package;
the binary and deployed files have SHA-256 records in the private setup evidence.

Provide `/root/.config/plakar/{sources,destinations,stores}.yml` and
`/root/.config/plakar/gmi-prod.key` through the private operator channel. Keep
the directory at `0700` and its files at `0600`, owned by root. All three YAML
documents use `version: v1.0.0`; unused sources and destinations are empty
mappings. Configure the existing `gmi-prod` S3 store and retain its existing key.
An empty or new repository is not a substitute for the historical repository.

From a checkout staged on CT115, install the maintained files:

```bash
install -m 0755 scripts/proxmox-plakar-backup.py /usr/local/sbin/gmod-plakar-backup
install -m 0755 scripts/plakar-recover-files.py /usr/local/sbin/gmod-plakar-recover-files
install -m 0644 infra/proxmox/files/gmod-plakar-backup.service /etc/systemd/system/
install -m 0644 infra/proxmox/files/gmod-plakar-backup.timer /etc/systemd/system/
systemd-analyze verify /etc/systemd/system/gmod-plakar-backup.{service,timer}
systemctl daemon-reload
systemctl start gmod-plakar-backup.service
```

Check the first run and restore its files to an isolated directory before enabling
the recurring schedule with `systemctl enable --now gmod-plakar-backup.timer`.
The runner deliberately refuses a hostname other than `gmod-integration-prod`
or missing/ambiguous production containers.

## Coverage and limits

Each run captures:

- A compressed logical MariaDB dump using `--single-transaction`, including
  routines, events and triggers.
- A compressed MongoDB archive of `gmod_integration`.
- A Redis RDB export, validated with `redis-check-rdb`.
- MinIO object contents, object metadata and tags, and available bucket policies,
  lifecycle rules and tags.
- The complete active production release bundle, including the private RAW
  application configuration needed to recover the installation.

These exports run while the application is serving traffic. The stores are read
at different times: a successful run does not establish a single consistent
application checkpoint across MariaDB, MongoDB, Redis and MinIO. MongoDB is a
standalone deployment, so its archive is not an oplog-backed point-in-time
snapshot. An object can also change while MinIO is being copied. Use a reviewed
maintenance procedure and stop application writers when a globally consistent
checkpoint is required.

The MinIO capture uses conditional GETs against the listed ETags and refuses
objects whose content changed before the download. This does not make the full
bucket listing atomic. Buckets with enabled or suspended versioning are refused;
the runner does not claim to preserve historical object versions. Review any
unavailable optional bucket settings recorded in the manifest.

The production bundle and exports contain secrets and personal data. Keep the
staging area, logs, manifests and restored files private. The Plakar encryption
key and the credentials required to reach the remote store must also be retained
securely **outside CT115 and outside the Proxmox host**. The encrypted repository
alone cannot recover a lost key.

The runner does not delete or expire remote snapshots. Configure any future
retention change separately, after reviewing recovery requirements and available
remote capacity. Local staging, cache and logs live under
`/var/lib/docker/gmod-plakar-backup`; that local directory is operational working
space, not the offsite backup destination.

## Installed paths and snapshot layout

The service uses `/usr/local/bin/plakar`, configuration under
`/root/.config/plakar`, and `/root/.config/plakar/gmi-prod.key`. Preserve
`sources.yml`, `destinations.yml` and `stores.yml` together. The runner uses the
existing `@gmi-prod` entry and keeps the Plakar cache under
`/var/lib/docker/gmod-plakar-backup/cache`.

Each run creates a private directory under
`/var/lib/docker/gmod-plakar-backup/staging/run-<UTC timestamp>-<unique suffix>/`.
Its `logs/` directory holds command diagnostics; its `payload/` directory is sent
to Plakar with tags `gmi-backup,ct115` and job `ct115-production`. The payload
contains:

```text
databases/mariadb.sql.gz
databases/mongo.archive.gz
databases/redis.rdb
bundle/
minio/objects/<bucket>/<SHA256 of the original object key>
minio/metadata/<bucket>/objects.json
operations/
manifest.json
```

`objects.json` maps each original MinIO key to its hashed filename and records the
content hash, metadata and tags, together with bucket settings. Restore using
this mapping; the hashed filename is not the original object key. `manifest.json`
records the captured files, byte counts and SHA-256 hashes. `operations/` retains
the installed backup runner and service/timer units when present, together with
the production package updater and its units when installed. The Plakar key is
deliberately excluded from the payload.

After a successful remote backup, local cleanup keeps the current successful run
and the latest failed run. The status files are `latest.json` for the latest
attempt and `last-success.json` for the latest successful remote backup.

## Check and run backups

Run these commands on CT115 as root:

```bash
systemctl status gmod-plakar-backup.timer gmod-plakar-backup.service
systemctl list-timers --all gmod-plakar-backup.timer
systemctl cat gmod-plakar-backup.service gmod-plakar-backup.timer
cat /var/lib/docker/gmod-plakar-backup/latest.json
cat /var/lib/docker/gmod-plakar-backup/last-success.json
journalctl -u gmod-plakar-backup.service --since '2 days ago'
```

`latest.json` and the private per-run logs provide the result of the runner. Check
the completion time and reported status together with the systemd result, then
identify the full snapshot ID in the private Plakar logs and catalogue. An enabled
timer or a successful export alone does not demonstrate a completed remote
backup. A oneshot service normally becomes inactive after a successful run; use
its exit result and the run evidence to assess it.

The runner provides `--run` for capture and remote backup, and `--prepare-only`
for local capture without upload. The latter reports `prepared`, which must not
be treated as a successful offsite backup. Both modes read the live stores and
require private staging capacity; the runner refuses to proceed with less than
15 GiB free in its working filesystem.

Plakar runs with global `-cpu 2 -concurrency 16`: two CPU workers and up to
sixteen concurrent operations. The independent I/O limit allows the full remote
integrity check to overlap small S3 range reads while limiting CPU use on CT115.
Content digest and signature verification are not disabled.

For an upload that completed before its verification was interrupted, the
operator can run `/usr/local/sbin/gmod-plakar-backup --resume-check RUN_DIRECTORY`.
Stop the previous backup service first; the shared lock prevents simultaneous
runs. The selected directory must be the current private `staging/run-*` recorded
in `latest.json`. The runner requires the upload completion log, checks every
local payload hash against its manifest, finds exactly one remote snapshot by
job/name/tag, and performs a standalone full `check SNAPSHOT_ID:/`. It does not
recapture or upload the data. New private logs record the resumed check, and a
successful result includes `resumed_check: true` and the complete `snapshot_id`.

To request a backup immediately:

```bash
systemctl start gmod-plakar-backup.service
systemctl show gmod-plakar-backup.service \
  -p Result -p ExecMainStatus -p ExecMainStartTimestamp -p ExecMainExitTimestamp
cat /var/lib/docker/gmod-plakar-backup/latest.json
```

`systemctl start` waits for the oneshot command to finish. Inspect private logs
when it fails. Do not publish raw logs, configuration, exported filenames or
manifests. Preserve failed run evidence while investigating.

## Inspect and recover a snapshot

Use [the file recovery procedure](./plakar-recovery.md) and
`scripts/plakar-recover-files.py` from an isolated recovery environment. It targets
Plakar **1.1.8** and configuration schema `v1.0.0`. Prepare the existing key,
private configuration, cache and an empty recovery directory before running it.
All three configuration files are required, even when a mapping is empty:

```text
/secure/plakar-config/sources.yml
/secure/plakar-config/destinations.yml
/secure/plakar-config/stores.yml
/secure/plakar-key
/secure/plakar-cache/
/secure/plakar-recovery/
```

Keep their ownership and permissions as required by the recovery helper. The
configured `gmi-prod` store must point to the existing repository. Do not copy
credentials into shell arguments or shared logs.

```bash
plakar_recovery=(python3 scripts/plakar-recover-files.py
  --config-dir /secure/plakar-config
  --key-file /secure/plakar-key
  --cache-dir /secure/plakar-cache
  --output-root /secure/plakar-recovery
  --store gmi-prod)

"${plakar_recovery[@]}" list
"${plakar_recovery[@]}" info SNAPSHOT_ID
"${plakar_recovery[@]}" check SNAPSHOT_ID
"${plakar_recovery[@]}" restore SNAPSHOT_ID \
  --snapshot-path / \
  --destination /secure/plakar-recovery/new-production-snapshot
```

Use the complete **64 lowercase hexadecimal characters** of the snapshot ID.
Review the private recovery logs, manifest and recovered-file hashes. A completed
integrity check proves the selected snapshot can be read; it does not prove the
databases can be imported or the application can start.

Keep all datastore imports and application startup isolated from production.
Restore the compatible release and its private configuration, import the database
exports into fresh stores, and restore MinIO objects with the recorded metadata
and policies using a reviewed procedure. Validate application behavior and the
required credentials before planning any production recovery. Never use the
file recovery helper to overwrite live volumes or run restored workloads against
production services.

## Initial production evidence

Verified on **26 November 2026**:

- Snapshot: `4657e5120e8715960e213eda6152544793b5a184d28c23ad1b59e28fdef9f31e`.
- Payload: 31,767 files plus its manifest, 4,278,374,688 payload bytes; six MinIO
  buckets and 31,742 objects, the three database exports and the private bundle.
- Full remote integrity check completed without errors at **02:09:52
  Europe/Paris**. The initial upload was preserved while its slow check was
  resumed with 16 parallel tasks; the standalone check and backup service both
  completed successfully.
- A separate file restore completed at **09:12:47 Europe/Paris**. All payload
  SHA-256 hashes and the manifest matched; both gzip archives passed their EOF
  and CRC checks, and the restored RDB passed `redis-check-rdb` in an isolated
  container. No database import or application recovery was performed.
- The timer is enabled and active. At the final check its next run was
  **27 November 2026 at 03:15:56 Europe/Paris**, including the random delay.
  The normal `--run` command is restored, with no temporary service override.
- All 12 production containers remained running. The runner's 29 offline guard
  tests and the systemd unit validation passed.

Private local evidence is recorded in
`backup/ct115-plakar-setup-20261126T003214Z/completion.json`. CT115 retains
`last-success.json`, `first-restore-validation.json`, the per-run logs and the
isolated restore evidence under `/var/lib/docker/gmod-plakar-backup`.
