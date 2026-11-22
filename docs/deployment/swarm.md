# Swarm Deployment Guide

This guide explains how to start and operate the `gmod` stack with Docker Swarm.

## Prerequisites

- Docker Engine installed
- A valid `.env` at repository root
- Logged in to GHCR if images are private (`docker login ghcr.io`)
- A TLS-terminating ingress such as the Cloudflare Tunnel described below, with direct origin access
  restricted to trusted ingress clients
- Access to a Swarm manager for data-service administration; database and object-storage ports are not
  published by the stack

## 1. Initialize Swarm (once)

```bash
docker swarm init
```

If Swarm is already initialized, Docker will tell you and you can continue.

## 2. Deploy the stack

From repository root:

```bash
./scripts/swarm-deploy.sh
```

What this does:

- creates/updates services in `docker-stack.swarm.yml`
- applies rolling updates (`parallelism: 1`, `start-first`)
- runs `prisma-migrate` service to execute `prisma db push` with retries
- `api`, `websocket`, and `discord` now wait for MariaDB schema readiness (`users` table) before starting

## 3. Check health

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

The Traefik management API and dashboard are disabled. Traefik publishes only the HTTP ingress on
port 80; the stack does not publish ports 443, 8080 or 9100. Prometheus metrics remain available to
trusted tasks on `gmod_net` at `http://traefik:9100/metrics`, without a public route. Check services
through Docker's manager commands and the logs below.

MariaDB, Redis, MongoDB and both MinIO interfaces are reachable only through the stack's overlay
network. Run administrative clients inside an appropriate service/task on that network, or use an
explicitly protected administration path. Do not add public database or console port mappings.
The root Compose file is for local development: its data-service ports bind to `127.0.0.1` only.

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

## 4. Update the stack

After changing images or stack config:

```bash
./scripts/swarm-deploy.sh
```

## 5. Rollback a service

```bash
docker service rollback gmod_api
docker service rollback gmod_websocket
docker service rollback gmod_discord
```

## 6. Stop everything (Swarm)

```bash
docker stack rm gmod
```

## 7. Backup (Swarm)

Full backup (MariaDB + MongoDB + Redis + MinIO):

```bash
bash ./scripts/swarm-backup.sh --all
```

Partial backup examples:

```bash
bash ./scripts/swarm-backup.sh --mariadb
bash ./scripts/swarm-backup.sh --mongo --minio
```

Custom stack/env path:

```bash
bash ./scripts/swarm-backup.sh --stack-name gmod --env-file .env
```

Cron example (daily at 03:30):

```bash
30 3 * * * cd /path/to/gmod-integration-monorepo && bash ./scripts/swarm-backup.sh --all >> backup/cron.log 2>&1
```

## 8. Production FQDN (Cloudflare Tunnel)

In Swarm, app services are behind Traefik. Do not route Cloudflare directly to `53136` or `53139`.
The supplied stack expects HTTPS/WSS to terminate at the ingress and sends HTTP over the local
Tunnel origin path. It does not install Traefik certificates or publish a direct HTTPS listener.
Use public `https://` API/website URLs and a `wss://` WebSocket URL in application configuration.

Docker Swarm's published port 80 is not restricted to loopback by this template. Restrict direct
access with Docker-aware firewall/network controls so untrusted clients cannot bypass the ingress.
The TLS boundary and the immediate proxy addresses trusted by the API must match the actual
installation; an edge certificate alone does not protect a publicly reachable HTTP origin.

Set production hosts in `.env`:

```bash
API_HOST=api.your-domain.com
WS_HOST=ws.your-domain.com
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
  - service: http_status:404
```

Local-only defaults like `api.localhost` and `ws.localhost` are intended for local testing, not production DNS.
`TRAEFIK_DASHBOARD_HOST` is no longer used or required by the deployment script.

For a deployment terminating TLS directly in Traefik, supply a separate reviewed configuration with
certificates/resolver, HTTPS routers, an HTTP-to-HTTPS redirect and port 443 publication before using
that topology. Do not assume the Tunnel-oriented template provides direct HTTPS.

These configuration changes take effect when the stack is redeployed or the development Compose
services are recreated. Editing the files does not change ports on existing containers. Preserve data
volumes and confirm backup/recovery before applying an operational change.

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

### MariaDB env names (`MARIA_*` vs `MARIADB_*`)

You can keep your existing `MARIA_*` variables.

- App services (`api/websocket/discord`) use `MARIA_*`
- MariaDB service now supports both:
  - if `MARIADB_*` is set, it is used
  - if not, Swarm/Compose fallback automatically to `MARIA_*`
