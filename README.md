# Gmod Integration Monorepo

This monorepo contains the backend services for Gmod Integration, including an HTTP API, Discord bot, WebSocket gateway, and website, along with shared packages for domain logic, infrastructure, core utilities, configuration, and schema definitions.

## Production Setup

For prod setup, please refer to the [self-hosted documentation](https://docs.gmod-integration.com/self-hosted/install-prod).

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
docker compose --env-file .env -f docker-compose.dev.yml up -d
# Prisma Push
bun run prisma:push
# Turborepo to run all services in development mode
turbo dev
```

## Default Ports

| Service                           | Port  |
| --------------------------------- | ----- |
| API (internal service port)       | 53136 |
| WebSocket (internal service port) | 53139 |
| MariaDB                           | 3306  |
| Redis                             | 6379  |
| MongoDB                           | 27017 |
| MinIO S3                          | 9060  |
| MinIO Console                     | 9065  |

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

| Protocol | Local Endpoint | Public Endpoint           |
| -------- | -------------- | ------------------------- |
| http     | localhost:80   | api.your-domain.com       |
| http     | localhost:80   | ws.your-domain.com        |
| http     | localhost:80   | traefik.your-domain.com   |

## Set FQDN in Garry's Mod

Don't forget to change Garry's Mod configuration to point to your dev instance instead of the public one, using the following command in your console:

```bash
gmod-integration config set apiFQDN "https://api-dev.your-domain.com"
gmod-integration config set websocketFQDN "https://ws-dev.your-domain.com"
```
