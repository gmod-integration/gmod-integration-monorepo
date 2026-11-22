# Gmod Integration Monorepo

This monorepo contains the backend services for Gmod Integration, including an HTTP API, Discord bot, WebSocket gateway, and website, along with shared packages for domain logic, infrastructure, core utilities, configuration, and schema definitions.

Contributing? See [CONTRIBUTING.md](./CONTRIBUTING.md) for the branch/PR workflow and [docs/best-practices.md](./docs/best-practices.md) for code conventions.

Small backend primitives live in [`@gmod/shared`](./docs/packages/shared.md); business workflows remain
in core and domain packages. Infrastructure connection settings come from the dedicated
[`@gmod/config/infrastructure.js` getters](./docs/packages/config.md), keeping adapters independent of
unrelated service credentials during isolated tests.

## Production Setup

For prod setup, please refer to the [self-hosted documentation](https://docs.gmod-integration.com/self-hosted/install).

## Development Setup

```bash
# Clone the repository
git clone git@github.com:gmod-integration/gmod-integration-monorepo.git
cd gmod-integration-monorepo
# Install dependencies
bun install
# Set up environment variables
cp .env.example .env
# Docker Compose for db, redis, minio, etc.
docker compose --env-file .env up -d
# Prisma Push
bun run prisma:push
# Configure the standalone relay separately (set its BARER_TOKEN to match BARER_DISCORD_RELAY)
cp apps/webhook-relay/.env.example apps/webhook-relay/.env
# Turborepo to run all services in development mode
turbo dev
```

### Garry's Mod addon prerequisite

The dedicated Garry's Mod server must have [GWSockets](https://github.com/FredyH/GWSockets/releases)
installed in `garrysmod/lua/bin/`. Choose the binary for the server's operating system and **process
architecture**, then fully stop and start the server through its hosting panel or service manager.
A map change is insufficient. The Workshop addon alone cannot connect: all connected addon features
use GWSockets, while local configuration and diagnostics remain available when it is missing.
See the [installation guide](apps/docs/docs/getting-started/installation.md#dll).

### Sample development data

After signing in to the local dashboard, preview and create sample data for your existing development
Discord community:

```bash
bun run seed:dev --dry-run
bun run seed:dev
# Also configure real demonstration channels, roles and messages on the development Discord guild
bun run seed:dev --discord --dry-run
bun run seed:dev --discord
```

The command requires `DEV=true` and local databases. It creates 103 sample servers: 100 public servers
for the ranking and three private integration servers, with 120 synthetic players, votes, sessions,
moderation records, bug reports, logs, errors and screenshots. It can be run again to refresh its own
fixtures. By default, it writes database samples only.
`--discord` also configures real status messages, auto roles, verification and integration webhooks,
requires the main development bot and Discord worker, and only targets `DISCORD_GUILD_ID`. It limits
Discord provisioning to the three private servers, keeping the 100 ranking servers in the sample data.
Use `--guild-id` for database-only fixtures or `--owner-id` to select the dashboard account. See
[Development sample data](./docs/development-seed.md) for setup, options and troubleshooting.

## Validation and API build

Use Bun 1.3.9 for workspace commands and Node.js 24 for the test and documentation tools.

```bash
bun run lint
bun run check:architecture
bun run test:architecture
bun run typecheck
bun run test:coverage
bun run build
```

`typecheck` checks all backend entrypoints and shared packages, the website source/tests/configuration,
and the documentation site. `build` checks and compiles the API for Bun to `dist/gm_integration_api.js`;
it does not upload source maps or publish anything. Workspace packages remain external and are resolved
from the repository by Bun, so the output requires the workspace and its installed dependencies.
`bun run sentry:sourcemaps` is a separate release operation.

`bun run format:check` audits the whole tree. CI checks formatting relative to the base commit with
`bun run format:check:changed <base-commit>`, so existing formatting debt cannot grow in changed files.

## Default Ports

| Service                              | Port  |
| ------------------------------------ | ----- |
| API (internal service port)          | 53136 |
| WebSocket (internal service port)    | 53139 |
| Webhook relay (standalone)           | 3000  |
| Webhook relay (local `.env.example`) | 3002  |
| Website (development)                | 3000  |
| MariaDB                              | 3306  |
| Redis                                | 6379  |
| MongoDB                              | 27017 |
| MinIO S3                             | 9060  |
| MinIO Console                        | 9065  |

None of those ports should ever be exposed to the public, use a reverse proxy like Cloudflare Tunnel to expose only the API and WebSocket ports securely.

## Cloudflare Tunnel

Use different routing depending on your runtime mode.

### Development (docker-compose / turbo dev)

If your GMod server is not on the same machine, expose dev ports directly:

| Protocol | Local Endpoint  | Public Endpoint             |
| -------- | --------------- | --------------------------- |
| http     | localhost:53136 | api-dev.your-domain.com     |
| http     | localhost:53139 | ws-dev.your-domain.com      |
| http     | localhost:3000  | website-dev.your-domain.com |
| http     | localhost:xxxx  | relay-dev.your-domain.com   |

### Production (Docker Swarm + Traefik)

In Swarm mode, API/WebSocket are routed by Traefik, so Cloudflare Tunnel should target Traefik (port `80`), not internal app ports.

Set FQDN env values in `.env` before deploy:

```bash
API_HOST=api.your-domain.com
WS_HOST=ws.your-domain.com
TRAEFIK_DASHBOARD_HOST=traefik.your-domain.com
```

Cloudflare Tunnel example:

```yaml
ingress:
  - hostname: api.your-domain.com
    service: http://localhost:80
  - hostname: ws.your-domain.com
    service: http://localhost:80
  - hostname: traefik.your-domain.com
    service: http://localhost:80
  - service: http_status:404
```

Prod routing summary:

| Protocol | Local Endpoint | Public Endpoint         |
| -------- | -------------- | ----------------------- |
| http     | localhost:80   | api.your-domain.com     |
| http     | localhost:80   | ws.your-domain.com      |
| http     | localhost:80   | traefik.your-domain.com |

## Set FQDN in Garry's Mod

After installing GWSockets and restarting the dedicated server, point the addon at your development
WebSocket gateway. Use a bare hostname, with an optional port, without a URL scheme or path:

```bash
gmod-integration config set websocketFQDN "ws-dev.your-domain.com"
gmod-integration config try
```

The addon uses WebSocket for all connected features; `apiFQDN` is a legacy persisted setting.
The dashboard still uses the HTTP API for authentication, settings and data.
