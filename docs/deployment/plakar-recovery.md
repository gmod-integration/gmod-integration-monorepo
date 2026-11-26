# Recover Plakar files without loading application data

`scripts/plakar-recover-files.py` reads the `gmi-prod` store and recovers files to a
private local directory. It never starts applications, containers or datastores,
executes SQL, or imports MongoDB/MinIO data. A remote `check` reads stored objects;
it is not an offline operation or a database restore test.

## Prepare private local paths

Use Python 3 with PyYAML and the installed Plakar CLI. This helper targets the
Plakar 1.1.8 CLI and configuration schema `v1.0.0`. Install the required storage
integration separately using the usual operator procedure. The helper preserves
the existing integration data directory.

Create separate absolute directories for configuration, cache and recovery output,
owned by the current user with mode `0700`. Provide the existing private key file
and **all three** configuration files, owned by the current user with no group or
other access:

```text
/secure/plakar-config/sources.yml
/secure/plakar-config/destinations.yml
/secure/plakar-config/stores.yml
/secure/plakar-key
/secure/plakar-cache/
/secure/plakar-recovery/
```

Each YAML must contain `version: v1.0.0` and its matching mapping: `sources`,
`destinations` or `stores`. Empty mappings use `{}`. Entries map strings to strings;
`stores.gmi-prod.location` must be nonempty. Duplicate mapping keys are rejected.
The optional `stores.yml` field `default` must name a configured store or be empty.
Do not initialize Plakar with an incomplete configuration directory: its fallback
loader can rewrite the other configuration files. The helper validates the entire
configuration before invoking Plakar, then runs with a private copy. Both the
parent process and its cache child inherit the isolated configuration location.

## Catalogue, inspect, check and recover

From the repository root, define the common arguments without putting keys or
credentials on the command line:

```bash
plakar_recovery=(python3 scripts/plakar-recover-files.py
  --config-dir /secure/plakar-config
  --key-file /secure/plakar-key
  --cache-dir /secure/plakar-cache
  --output-root /secure/plakar-recovery
  --store gmi-prod)

"${plakar_recovery[@]}" list
"${plakar_recovery[@]}" info SNAPSHOT_ID
"${plakar_recovery[@]}" check SNAPSHOT_ID OTHER_SNAPSHOT_ID
"${plakar_recovery[@]}" restore SNAPSHOT_ID \
  --snapshot-path / \
  --destination /secure/plakar-recovery/new-snapshot-files
```

Replace each ID with the complete **64 lowercase hexadecimal characters** from
the private catalogue log. Short IDs, UUIDs with dashes and path selectors are
rejected. `check` always checks full snapshot roots, with verification enabled.
Plakar creates a fresh verification cache for each invocation; reusing the local
catalogue cache avoids downloading metadata again. This helper does not permit
partial checks, `-fast` or `-no-verify`.

The restore destination must be absent or an empty private directory strictly
inside `--output-root`. Symbolic links in local paths, traversal, overlapping
cache/configuration/key paths and nonempty destinations are rejected. A snapshot
subpath may be selected only for `restore`; it must be a canonical absolute path.
Use a different destination for each snapshot, with no concurrent writer.

The restore command supplies `-skip-permissions` **and** the filesystem export
options `skip_permissions`, `skip_ownership`, `skip_times` and
`skip_root_perms_and_time`. The explicit export options are necessary for Plakar
1.1.8; the CLI permission flag alone does not protect recovered metadata.

## Review the result privately

Raw stdout/stderr, the copied configuration, `summary.json` and any recovered-file
inventory are under a new `.plakar-recovery-runs/` directory inside the output
root. Directories use mode `0700`, files `0600`. The terminal receives only a
summary with log hashes and counts. Recovered filenames and contents stay private.

After a successful restore command, `files.json` records file counts, total bytes
and each regular file's local SHA-256. The helper refuses symbolic links and
special files without following them. A failed validation preserves the files and
operation records for inspection; it does not load or remove recovered data.

Plakar can emit signature warnings or per-file export errors while returning
zero. The helper scans both logs for warning/error diagnostics and returns nonzero
when they are detected, recording `diagnostics_require_review`. Every result
still requires private log review: text scanning is conservative and cannot prove
that all objects were recovered. Compare the catalogue, selected scope and local
inventory. A local checksum records the recovered bytes, not database validity,
cross-store consistency, schema compatibility or a successful application import.

Offline guard tests use fixtures and mocked processes only:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
  -s scripts/tests -p test_plakar_recover_files.py
```
