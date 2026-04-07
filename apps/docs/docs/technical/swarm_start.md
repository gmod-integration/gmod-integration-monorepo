# Swarm Start Guide

This guide explains how to start and operate the `gmod` stack with Docker Swarm.

## Prerequisites

- Docker Engine installed
- A valid `.env` at repository root
- Logged in to GHCR if images are private (`docker login ghcr.io`)

## 1. Initialize Swarm (once)

```bash
docker swarm init
```

If Swarm is already initialized, Docker will tell you and you can continue.

## 2. Deploy the Stack

From repository root:

```bash
./scripts/swarm-deploy.sh
```

What this does:

- creates/updates services in `docker-stack.swarm.yml`
- applies rolling updates (`parallelism: 1`, `start-first`)
- runs `prisma-migrate` service to execute `prisma db push` with retries
- `api`, `websocket`, and `discord` now wait for MariaDB schema readiness (`users` table) before starting

## 3. Check Health

```bash
docker stack services gmod
```

Expected target replicas:

- `gmod_api`: `2/2`
- `gmod_websocket`: `2/2`
- `gmod_discord`: `2/2`
- `gmod_mariadb`: `1/1`
- `gmod_redis`: `1/1`
- `gmod_mongo`: `1/1`
- `gmod_minio`: `1/1`
- `gmod_traefik`: `1/1`

Traefik dashboard:

```bash
# Direct port (no host rule): http://<SERVER_IP>:8080/dashboard/
# API endpoint:              http://<SERVER_IP>:8080/api/overview
```

Host-rule access is still available on port 80 with `TRAEFIK_DASHBOARD_HOST` (default `traefik.localhost`).

Migration logs:

```bash
docker service logs -f gmod_prisma-migrate
```

Live logs (all services in stack):

```bash
docker service logs -f --timestamps --tail 50 $(docker stack services gmod --format '{{.Name}}')
```

Live logs (apps only: `api`, `websocket`, `discord`):

```bash
docker service logs -f --timestamps --tail 50 $(docker stack services gmod --format '{{.Name}}' | grep -E '^gmod_(api|websocket|discord)$')
```

Live logs with container prefix (apps only, no `rg` required):

```bash
zsh -lc '
trap "kill 0" INT TERM EXIT
for c in $(docker ps --filter label=com.docker.stack.namespace=gmod --format "{{.Names}}" | grep -E "gmod_(api|websocket|discord)"); do
  docker logs -f --tail 50 "$c" 2>&1 | sed -u "s/^/[$c] /" &
done
wait
'
```

One service at a time:

```bash
docker service logs -f --tail 100 gmod_api
docker service logs -f --tail 100 gmod_websocket
docker service logs -f --tail 100 gmod_discord
docker service logs -f --tail 100 gmod_mariadb
docker service logs -f --tail 100 gmod_prisma-migrate
```

Service/task details:

```bash
docker service ps gmod_api
docker service ps gmod_websocket
docker service ps gmod_discord
docker service ps gmod_mariadb
```

## 4. Update the Stack

After changing images or stack config:

```bash
./scripts/swarm-deploy.sh
```

## 5. Rollback a Service

```bash
docker service rollback gmod_api
docker service rollback gmod_websocket
docker service rollback gmod_discord
```

## 6. Stop Everything (Swarm)

```bash
docker stack rm gmod
```

## 7. Production FQDN (Cloudflare Tunnel)

In Swarm, app services are behind Traefik. Do not route Cloudflare directly to `53136` or `53139`.

Set production hosts in `.env`:

```bash
API_HOST=api.your-domain.com
WS_HOST=ws.your-domain.com
TRAEFIK_DASHBOARD_HOST=traefik.your-domain.com
```

Deploy/redeploy:

```bash
./scripts/swarm-deploy.sh
```

Cloudflare Tunnel example (`config.yml`):

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

Local-only defaults like `api.localhost` and `ws.localhost` are intended for local testing, not production DNS.

## Troubleshooting

### `table does not exist`

Schema is missing in MariaDB. Check migration service logs:

```bash
docker service logs --tail 200 gmod_prisma-migrate
```

Then redeploy stack:

```bash
./scripts/swarm-deploy.sh
```

If you need a different env file:

```bash
./scripts/swarm-deploy.sh --env-file .env.prod
```

Note:

- In Swarm, startup order is not strictly enforced.
- A first `P1001` in `gmod_prisma-migrate` can happen while MariaDB is still booting.
- With current stack config, migration retries and app startup waits handle this automatically.

### `Too many connections`

- avoid running Compose and Swarm for this project at the same time
- current stack enforces `MARIA_CONNECTION_LIMIT=10` in app services
- check MariaDB load/logs:

```bash
docker service logs --tail 200 gmod_mariadb
```

### Leftover Compose containers

If old Compose containers still run:

```bash
docker compose -p gmod-integration-monorepo -f docker-compose.prod.yml down --remove-orphans
```

### MariaDB env names (`MARIA_*` vs `MARIADB_*`)

You can keep your existing `MARIA_*` variables.

- App services (`api/websocket/discord`) use `MARIA_*`
- MariaDB service now supports both:
- if `MARIADB_*` is set, it is used
- if not, Swarm/Compose fallback automatically to `MARIA_*`
