# Gmod Integration Monorepo

Backend monorepo for Gmod Integration:

- HTTP API (`apps/api`)
- Discord bot (`apps/discord`)
- WebSocket gateway (`apps/websocket`)
- Website (`apps/website`)
- Shared packages (`packages/*`: domain, infra, core, config, schema)

## Overview

This project connects Gmod servers, Discord, and a web panel:

- user/role synchronization
- server logs
- webhook relay
- BullMQ queues
- MariaDB + MongoDB + Redis + MinIO persistence

## Tech Stack

- Runtime: Bun (`bun@1.3.9`)
- Language: TypeScript (ESM, NodeNext)
- API: Express
- Queue: BullMQ + Redis
- Relational DB: MariaDB (Prisma)
- Document DB: MongoDB
- Storage: MinIO (S3-compatible)
- Local orchestration: Docker Compose
- Production orchestration: Docker Swarm
- Ingress / load balancing: Traefik (Swarm provider)

## Requirements

- Bun `1.3.9`
- Docker + Docker Compose v2
- (Prod) Docker Swarm

Check versions:

```bash
bun --version
docker --version
docker compose version
```

## Installation

```bash
git clone https://github.com/gmod-integration/api.git
cd api
bun install
cp .env.example .env
```

Important:

- `.env` secrets must pass Zod validation (for example minimum length on some fields).
- Never commit `.env`.

## Native Dev Setup (Bun)

### 1) Start requirements

```bash
docker compose --env-file .env -f docker-compose.requirements.yml up -d
```

### 2) Initialize MariaDB schema

Method A (standard Prisma):

```bash
bunx prisma migrate deploy
```

If Prisma CLI fails in your local environment, SQL fallback:

```bash
DB_PASS=$(grep -E '^MARIA_ROOT_PASSWORD=' .env | sed -E 's/^MARIA_ROOT_PASSWORD=//')
for f in $(find packages/infra-prisma/migrations -mindepth 2 -maxdepth 2 -name migration.sql | sort); do
  docker exec -i gmod_requirements_mariadb mariadb -uroot -p"$DB_PASS" gmod_integration < "$f"
done
```

### 3) Run apps

Single command (recommended):

```bash
bun run turbo:dev
```

If you want service-by-service:

```bash
bun run dev
bun run websocket:dev
bun run discord:dev
```

Optional website:

```bash
bun run website:dev
```

## Docker Compose (independent apps)

### Build separate images

```bash
docker build --target api -t gmod-integration/api:local .
docker build --target websocket -t gmod-integration/websocket:local .
docker build --target discord -t gmod-integration/discord:local .
```

### Run requirements + one app

API only:

```bash
docker compose --env-file .env -f docker-compose.requirements.yml -f docker-compose.apps.yml up -d api
```

WebSocket only:

```bash
docker compose --env-file .env -f docker-compose.requirements.yml -f docker-compose.apps.yml up -d websocket
```

Discord only:

```bash
docker compose --env-file .env -f docker-compose.requirements.yml -f docker-compose.apps.yml up -d discord
```

Run everything:

```bash
docker compose --env-file .env -f docker-compose.requirements.yml -f docker-compose.apps.yml up -d
```

Logs:

```bash
docker compose -f docker-compose.requirements.yml -f docker-compose.apps.yml logs -f
```

Stop:

```bash
docker compose -f docker-compose.requirements.yml -f docker-compose.apps.yml down
```

## Production with Docker Swarm

### 1) Initialize swarm (once)

```bash
docker swarm init
```

### 2) Build (or pull from registry)

```bash
docker build --target api -t gmod-integration/api:latest .
docker build --target websocket -t gmod-integration/websocket:latest .
docker build --target discord -t gmod-integration/discord:latest .
```

### 3) Deploy stack

```bash
API_IMAGE=gmod-integration/api:latest \
WEBSOCKET_IMAGE=gmod-integration/websocket:latest \
DISCORD_IMAGE=gmod-integration/discord:latest \
API_HOST=api.localhost \
WS_HOST=ws.localhost \
TRAEFIK_DASHBOARD_HOST=traefik.localhost \
docker stack deploy -c docker-stack.swarm.yml gmod
```

### 4) Verify

```bash
docker stack services gmod
docker service ps gmod_api
docker service ps gmod_websocket
docker service ps gmod_discord
docker service ps gmod_traefik
```

### 5) Manual scaling

```bash
docker service scale gmod_api=2 gmod_websocket=2 gmod_discord=2
```

### 6) Access routes (Traefik)

- API: `http://api.localhost`
- WebSocket: `ws://ws.localhost`
- Traefik dashboard: `http://traefik.localhost/dashboard/`
- Traefik Prometheus metrics: `http://<swarm-node-ip>:9100/metrics`

If needed, add local host entries:

```bash
echo "127.0.0.1 api.localhost ws.localhost traefik.localhost" | sudo tee -a /etc/hosts
```

## Fork + Branch Workflow (dev)

### Fork setup

```bash
git clone git@github.com:<your-user>/api.git
cd api
git remote add upstream git@github.com:gmod-integration/api.git
git fetch upstream
```

### Recommended branching

```bash
git checkout -b dev upstream/main
git push -u origin dev
```

For a feature:

```bash
git checkout dev
git pull --rebase upstream main
git checkout -b feat/<short-topic>
```

Examples:

- `feat/docker-swarm-split-images`
- `fix/prisma-trigger-adminids`
- `chore/readme-dev-onboarding`

### Before PR

```bash
bun run lint
bun run typecheck
bun run test
```

Then:

```bash
git push -u origin feat/<short-topic>
```

Open a PR to `upstream/main`.

## Useful Commands

```bash
# quality
bun run lint
bun run format:check
bun run typecheck
bun run test

# turbo
bun run turbo:dev
bun run turbo:build
```

## Default Ports

- Traefik HTTP ingress: `80`
- Traefik HTTPS ingress: `443`
- Traefik metrics: `9100`
- API (internal service port): `53136`
- WebSocket (internal service port): `53139`
- MariaDB: `3306`
- Redis: `6379`
- MongoDB: `27017`
- MinIO S3: `9060`
- MinIO Console: `9065`

## Quick Troubleshooting

- `Invalid environment variables`: check `.env` (secret length, URLs, IDs).
- `Table ... does not exist`: apply Prisma migrations.
- Container crashes at boot:
  - `docker compose ... logs --tail=200 <service>`
  - verify connectivity to `mariadb/redis/mongo/minio`.
