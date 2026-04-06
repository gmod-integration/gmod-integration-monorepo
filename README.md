# Gmod Integration Monorepo

This monorepo contains the backend services for Gmod Integration, including an HTTP API, Discord bot, WebSocket gateway, and website, along with shared packages for domain logic, infrastructure, core utilities, configuration, and schema definitions.

## Warning

Do not use this code in production, it's still in early development.

## Setup

### Production Setup

Not ready yet, but will be a simple Docker Swarm.

### Development Setup

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
