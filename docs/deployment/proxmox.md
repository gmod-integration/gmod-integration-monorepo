# Proxmox: prepare and bootstrap a fresh backend

`infra/proxmox` provisions one unprivileged Proxmox LXC and installs a Docker Compose bundle.
The default `deployment_mode = "prepare"` installs and validates the bundle **without starting
application containers**. Starting a fresh installation is a separate, explicit operation.
This workflow does not import an existing production database or implement routine releases over
an installation containing data.

## Layout

```text
Proxmox node
└── LXC 110 (default: 4 vCPU, 8 GiB RAM, 10.10.10.20/24)
    ├── /var/lib/docker on a separate backed-up volume
    ├── /opt/gmod-integration: stack, Compose override, private env files and operations helper
    └── Compose project gmod
        ├── MariaDB, MongoDB, Redis, MinIO: private bridge, no host ports
        ├── Prisma migration: one process before application writers
        ├── API ×2, WebSocket ×2, Discord ×1 after successful migration
        └── Traefik 127.0.0.1:80 ← optional outbound Cloudflare Tunnel
```

The override reuses `docker-stack.swarm.yml` with a plain bridge and the Docker Traefik provider.
Swarm needs host networking capabilities unavailable in an unprivileged LXC; use a VM if Swarm is
required. The Traefik management API/dashboard is disabled. The website, product documentation and
webhook relay have separate hosting and are not provisioned here.

The container size is a starting allocation, not a demonstrated capacity under load. Redis has a
smaller default memory budget in the Compose override; inspect the effective configuration and leave
headroom for MariaDB, MongoDB, MinIO, Docker and five Bun application processes. Monitor memory,
OOM events, disk usage, queue growth and database connections during acceptance and after launch.

## Local verification before accessing a server

Validate the module and its mocked plans in an isolated copy:

```bash
terraform -chdir=infra/proxmox fmt -check -recursive
python3 infra/proxmox/tests/run-isolated.py
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts/tests -p 'test_proxmox*.py'
```

The runner excludes local tfvars/state and Terraform variable/CLI environment overrides, installs the
locked providers without a backend, then runs validation and 16 mocked plans. It reuses the module's local
provider cache when available. It does not inspect a real node or prove that a real plan is safe. Keep
credentials out of command output, shell history, build contexts and test reports. Never source an env
file as a shell script.

For opt-in real local acceptance with the repository's configured test integrations:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 scripts/tests/proxmox_bootstrap_roundtrip.py \
  --run-disposable-docker-test --env-file .env
```

Supply only an env file explicitly configured for test use with `DEV=true`. The runner freezes the
source context, builds the three application images with one revision label, resolves immutable
references through its own loopback registry and copies the bundle into a private temporary directory.
It selects a unique `gmi-bootstrap-<12 lowercase hex characters>` project, generated datastore
credentials, auth/privacy keys and a free loopback ingress port. It overrides the local database and
origin settings and disables Cloudflare. It selects only its own fixtures for cleanup. Diagnostics
are written to a private file under `backup/`; no server or Terraform deployment is involved.

The root `.env.test` contains fixture credentials suitable for offline checks. A schema-valid file
alone does not establish working Discord, Steam, GModStore or relay credentials. A local test using
real integration credentials can interact with those test services. Do not run another Discord worker
with the same bot token. `DEV=true` skips Discord command publication but still connects the bot,
handles events and runs workers; it does not bypass the migration commands in the stack.

A real local acceptance run must demonstrate successful migration, API/WS reachability and Discord
Gateway readiness. The runner waits for the bot's `Ready on main with` message and confirmation that
global command publication was skipped in DEV mode; a merely running process does not establish
Gateway login. Its application images are local test artifacts, not a published production release.
Separately exercise the failure paths: a failed migration leaves writers stopped; existing
containers, volumes or a prior bootstrap marker cause a fresh bootstrap to be refused. These local
checks do not establish the future host's API/SSH, storage, NAT or public tunnel configuration.

## Public v6 test deployment

The public test origins are separate from the production domains:

| Service                  | URL                           |
| ------------------------ | ----------------------------- |
| API                      | `https://v6-gmi-api.linv.dev` |
| WebSocket                | `wss://v6-gmi-ws.linv.dev`    |
| Cloudflare Pages website | `https://v6-gmi-web.linv.dev` |

Prepare the private test artifacts locally, keeping the existing `.env` and Terraform state intact:

```bash
python3 scripts/proxmox-test-release.py --env-file .env \
  --website-url https://v6-gmi-web.linv.dev
```

This command creates a private `backup/v6-public-test-<timestamp>` directory. It freezes one source
context for API, WebSocket, Discord and the standalone relay, builds all four images with the same
revision label, and saves `application-images.tar.gz` with its SHA-256 checksum and `release.json`.
It does not publish images, contact a server or start applications. `--skip-build` prepares only the
private env/source bundle for inspection.

The test env keeps `DEV=true`, uses the two v6 backend origins and fresh SQL/MinIO/auth/privacy
credentials, and sets the website origin plus its `/login` OAuth callback when `--website-url` is
provided. Register that callback in the matching test Discord application. Production Terraform
deliberately forces `DEV=false`; do not apply its production profile to obtain this test env.

Verify the archive checksum before loading it into the target daemon. Docker's containerd image store
can report an image-index `Id`, while a classic image store reports the image-config digest for the
same saved image. Use each manifest entry's `portable_identity`: `config_blob_sha256` comes from the
actual saved config blob; `os`, `architecture`, `variant`, `rootfs_diff_ids` and
`runtime_config_sha256` describe its platform and content. Do not infer a content mismatch solely
from unequal local/target `Id` fields. Resolve the target registry's immutable digests and preserve
the common revision label before running the bootstrap.

Use a separate `gmi-bootstrap-<12hex>` project and fresh project-owned volumes. Its Traefik listener
is **`127.0.0.1:18080` inside the LXC**, selected with `GMOD_INGRESS_PORT=18080`; preserve that setting
for subsequent operations on this project. Existing projects and volumes stay separate. The test
relay uses the same private Docker network with alias `webhook-relay`, reads only `.relay.env`, and
publishes no host port. The backend calls `http://webhook-relay:3000`.

Create a **dedicated Cloudflare test tunnel whose connector runs inside this LXC**. Configure only
these two published application routes on it:

| Hostname              | Origin service inside the LXC |
| --------------------- | ----------------------------- |
| `v6-gmi-api.linv.dev` | `http://127.0.0.1:18080`      |
| `v6-gmi-ws.linv.dev`  | `http://127.0.0.1:18080`      |

Preserve the request Host header so Traefik selects the API or WebSocket router. Run the dedicated
connector using the pinned cloudflared image and the LXC host network, which gives it access to this
loopback listener. Keep the main test bootstrap's `COMPOSE_PROFILES` empty when this connector is
managed separately. Do not reuse the production tunnel, publish port 18080 on the LXC bridge, or add
a reverse proxy on the Proxmox host. The connector establishes its own outbound connection.

The local ignored `.env.v6-tunnel` holds `TUNNEL_TOKEN` for this dedicated tunnel. Keep it and its
target env file mode `0600`, transfer it privately, and pass it as an env file; do not put the token in
shell arguments, source control, logs or the application env. The website hostname belongs to its
Cloudflare Pages custom-domain configuration, rather than either backend tunnel route.

Build the existing Cloudflare frontend with `DOMAIN_URL=https://v6-gmi-api.linv.dev`,
`WEBSITE_WS_URL=wss://v6-gmi-ws.linv.dev`, `WEBSITE_URL=https://v6-gmi-web.linv.dev` and the matching
test Discord client ID. These values are baked into the website build; changing the backend env does
not update an already deployed frontend. Its `linv.dev` custom domain keeps browser sessions
same-site with the API's `Secure; SameSite=Lax` cookies. A `pages.dev` preview domain does not provide
that same-site relationship. Keep exact CORS/Origin checks and cookie protections in place.

Verify `/v6/` over public HTTPS, an actual WSS handshake, the Discord test bot's readiness, and the
browser OAuth/session/save/logout flow. Local or private-origin success does not demonstrate working
DNS, Cloudflare routes or public TLS, and an unauthenticated WS refusal does not replace an addon or
dashboard's authenticated exchange.

## Configuration

Preserve an existing `terraform.tfvars` and state. Use `terraform.tfvars.example` to add missing
inputs instead of copying it over existing secrets or state.

- `proxmox_endpoint`, token and root SSH through the local agent identify the intended node.
- `manage_host_resources = false` references an existing pool, bridge and storage. Creating/importing
  shared host resources is a separate reviewed operation; see `imports.tf.example`.
- `app_images` supplies API, WebSocket and Discord as `registry/repository@sha256:<digest>`.
  Preflight also checks that their `org.opencontainers.image.revision` labels agree.
- `datastore_images` supplies immutable MariaDB, MongoDB, Redis and MinIO versions.
- `ingress_images` supplies immutable Traefik and cloudflared versions, including when the optional
  tunnel is disabled. Do not use floating tags as release inputs.
- `deployment_mode` defaults to `prepare`. `bootstrap` is reserved for a reviewed fresh installation.
- `auto_update = false` is required. The old image-update timer is disabled; schema-changing updates
  must not run unattended.
- `replicas` defaults to API 2, WebSocket 2 and Discord 1. Discord must remain at exactly one replica.

Terraform renders the private application env file from generated secrets, `env_file`, `app_env`,
then the deployment inputs. The deployment keys win, including `DEV=false` on the target. Application
credentials and URLs must be supplied through `env_file` or `app_env`. Generated MariaDB/MinIO secrets
and the dedicated auth encryption/privacy keys remain stable in Terraform state unless explicitly
changed. Keep both state and the effective env files in access-controlled storage.

A local development env file needs deliberate overrides: `MARIA_USER` must be non-root for the MariaDB
image; `DOMAIN_URL`, `WEBSITE_URL`, `OAUTH_PANEL_URL`, `OAUTH_REDIRECT_URL` and the website WebSocket URL
must describe the target environment. An unchanged development env file is not a production config.
Optional fields such as Sentry URLs must be valid when supplied; remove unused placeholders.

Use exact HTTPS public origins. The website and API must be same-site for the HttpOnly SameSite=Lax
session cookie. `OAUTH_REDIRECT_URL` must point to `/login` on the website origin and be registered in
the matching Discord application. Build the website with those API/WS origins and the matching Discord
client ID. Preserve dedicated auth/privacy keys across subsequent releases.

Set `API_TRUSTED_PROXIES` from the actual Traefik peer IP or the CIDR of the dedicated trusted proxy
network, after inspecting the target Docker network. Do not invent a production CIDR or trust every
source. Verify the full forwarded-address chain through Cloudflare and Traefik before relying on
client-IP logs, session metadata or IP-based limits. Without this setting Express uses the immediate
proxy address. Exact public origins in `DOMAIN_URL`/`WEBSITE_URL`, CORS and the Discord OAuth redirect
remain separate checks; trusting a proxy does not authorize another browser origin.

## Server prerequisites for the later deployment

Verify these on the intended host before applying a real plan:

1. Root SSH and Proxmox API access reach the intended node. The provider uses root SSH for uploads
   and privileged container feature operations. A stopped local SSH forwarding process must be
   re-established before remote operations can work.
2. The pool, `dir-gmi` storage, Ubuntu template and private `vmbr1` bridge exist or have been explicitly
   included in the reviewed plan. The bridge's default gateway is `10.10.10.1` and the LXC address is
   `10.10.10.20/24`. The host needs IP forwarding and outbound NAT for this private subnet; Terraform
   does not configure those host firewall rules.
3. The intended Docker volume is mounted at `/var/lib/docker` and has sufficient free space for
   images and all four stores. Inspect Docker's effective storage configuration: containerd image
   storage on `/var/lib/containerd` would otherwise consume the smaller root filesystem.
4. The target has no old application workers, named volumes or bootstrap marker. Do not remove
   unexpected data to make a bootstrap check pass. Inspect it and decide separately how to recover
   or provision a genuinely empty destination.
5. Configure the optional Cloudflare Tunnel with the API and WebSocket hostnames, both pointing to
   `http://localhost:80`. Preserve the Host header. Do not route any database, metrics or management
   port. Before enabling a reused tunnel, stop its old connector so requests cannot be split between
   releases. The old and new deployments must not use the same Discord bot concurrently.

No command in the local verification section establishes these server prerequisites.

## Prepare a reviewed target

For the later server operation, keep `deployment_mode = "prepare"` and review a saved plan privately:

```bash
terraform -chdir=infra/proxmox init
terraform -chdir=infra/proxmox plan -out=prepared.tfplan
```

The plan must address the intended existing LXC and volumes without an unexpected destroy or
replacement. Retain the existing state; do not run from an empty state against a container that already
exists. Plan files may contain secrets and need the same protection as state. Applying this plan is
a server change: it provisions/updates the LXC, installs Docker/Python as needed, disables the old timer
and pushes the bundle. The default mode does not start the stack.

After the reviewed plan has been applied, use the generated `ops` output for the exact access details.
On the Proxmox host, the default container can be checked with:

```bash
pct exec 110 -- gmodctl preflight --pull
pct exec 110 -- gmodctl status
```

`preflight --pull` downloads the selected images and validates the rendered configuration, immutable
references, matching app revision labels and absence of an existing installation. Plain `preflight`
uses only already available images. Neither starts application containers.

## Explicit fresh bootstrap

Only after preflight and when the destination is genuinely empty:

```bash
pct exec 110 -- gmodctl bootstrap --confirm-empty gmod
```

The confirmation must match the Compose project name. Bootstrap refuses an existing project container,
datastore volume or prior attempt marker. It starts the four datastores, waits for readiness, runs the
migration command once, and enables API/WebSocket/one Discord process only after success. Ingress and
the optional tunnel start after application checks. A failed step stops application writers and does
not silently restart or reset the installation.

For fresh installation, there is no historical Prisma baseline to mark as applied. Never run `db push`,
`migrate reset`, `docker compose down -v` or arbitrary migration-resolution commands to bypass a failed
bootstrap. Keep logs private; connection details and provider responses can contain sensitive data.

Inspect status and private logs, then perform acceptance through the intended origin:

```bash
pct exec 110 -- gmodctl status
pct exec 110 -- gmodctl logs api
pct exec 110 -- gmodctl logs websocket
pct exec 110 -- gmodctl logs discord
```

Process/TCP checks are preliminary evidence. Human acceptance must cover Discord OAuth, session cookie,
a CSRF-protected save, guilde/server setup, addon authentication, bidirectional chat, WS reconnect and
logout. Publish the matching website only after the backend checks succeed. The addon endpoint/config
must match the new API/WS routes. A blank installation does not preserve previous users, guild/server
settings, purchases or session data.

## Failure and rollback

Before public traffic and new user writes, keep the old deployment available for rollback but stopped
when the same Discord bot or tunnel is active on the new target. If acceptance fails, leave the new
writers/tunnel stopped, retain the logs and the bootstrap marker, and restore routing to the coherent
old release only after ensuring that there are no duplicate bot or tunnel connectors.

A failed fresh attempt is not automatically retryable: its volumes may contain a partial schema.
Inspect the cause and choose a separate fresh destination or a reviewed recovery action. Do not delete
volumes as part of a generic retry. After new user writes, routing back alone would lose those writes;
plan recovery or a forward repair explicitly.

Failed Docker commands and timeouts retain their output in a private `0600`
`.bootstrap-diagnostic-*.log` file in the bundle directory; the error reports its path. The migration
container is removed after its one-shot run, so use that private diagnostic for migration failures.
`gmodctl logs` remains available for retained application and datastore containers. Never publish these
logs without inspecting and redacting their contents.

This Compose workflow intentionally refuses `gmodctl update` and the old `deploy` entrypoint. It does
not provide safe maintenance upgrades over populated data. The separate [Swarm recovery procedure](./swarm.md)
requires Swarm service/volume metadata and must not be applied blindly to Compose volumes. Configure
and verify a target-appropriate backup/recovery strategy before relying on this installation for
persistent production data. An optional Proxmox vzdump includes the Docker mount when configured, but
its mere configuration proves neither an offsite backup nor a successful restore.

## Files

| File                                       | Purpose                                                       |
| ------------------------------------------ | ------------------------------------------------------------- |
| `host.tf`, `container.tf`                  | Optional shared resources and protected LXC/storage           |
| `env.tf`, `variables.tf`                   | Immutable release inputs, env rendering and validation        |
| `deploy.tf`                                | Private SSH staging and bundle preparation                    |
| `files/compose.proxmox.yml`                | Compose override, private ingress and stopped initial writers |
| `files/gmodctl.sh`, `files/proxmox-ops.py` | Preparation, preflight and explicit fresh bootstrap           |
| `files/push.sh`                            | Host-to-container bundle transfer and private staging cleanup |
| `tests/plan.tftest.hcl`                    | Mocked Terraform plans                                        |
