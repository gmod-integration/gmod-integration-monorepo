# Docker + Swarm

This guide covers:

- starting required services (DB/Redis/Mongo/MinIO) with `docker compose`
- building app images (`api`, `websocket`, `discord`)
- Swarm deployment with **2 replicas** for `api`, `websocket`, and `discord`
- Traefik ingress in front of services for load balancing and runtime stats

## Files

- `Dockerfile`: monorepo multi-target image definition
- `docker-compose.requirements.yml`: required services only
- `docker-compose.apps.yml`: split app services (`api`, `websocket`, `discord`)
- `docker-stack.swarm.yml`: full Swarm stack (requirements + apps)

## 1) Prepare environment

1. Copy `.env.example` to `.env` and fill all secrets.
2. At minimum, verify:
   - `MARIA_*`
   - `MINIO_*`
   - `DISCORD_*`
   - `BARER_DISCORD_RELAY`
   - `STEAM_API_KEY`

## 2) Start only requirements (compose mode)

```bash
docker compose --env-file .env -f docker-compose.requirements.yml up -d
```

Stop:

```bash
docker compose -f docker-compose.requirements.yml down
```

## 3) Build split images

```bash
docker build --target api -t gmod-integration/api:latest .
docker build --target websocket -t gmod-integration/websocket:latest .
docker build --target discord -t gmod-integration/discord:latest .
```

If using a multi-node cluster, push images to a registry:

```bash
docker tag gmod-integration/api:latest registry.example.com/gmod-integration/api:latest
docker tag gmod-integration/websocket:latest registry.example.com/gmod-integration/websocket:latest
docker tag gmod-integration/discord:latest registry.example.com/gmod-integration/discord:latest
docker push registry.example.com/gmod-integration/api:latest
docker push registry.example.com/gmod-integration/websocket:latest
docker push registry.example.com/gmod-integration/discord:latest
```

Then deploy with:

```bash
API_IMAGE=registry.example.com/gmod-integration/api:latest \
WEBSOCKET_IMAGE=registry.example.com/gmod-integration/websocket:latest \
DISCORD_IMAGE=registry.example.com/gmod-integration/discord:latest \
API_HOST=api.example.com \
WS_HOST=ws.example.com \
TRAEFIK_DASHBOARD_HOST=traefik.example.com \
docker stack deploy -c docker-stack.swarm.yml gmod
```

## 4) Swarm deployment (2x api/ws/discord)

Initialize Swarm (once):

```bash
docker swarm init
```

Deploy:

```bash
API_HOST=api.localhost \
WS_HOST=ws.localhost \
TRAEFIK_DASHBOARD_HOST=traefik.localhost \
docker stack deploy -c docker-stack.swarm.yml gmod
```

### Deploy only one app (local compose)

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

Verify:

```bash
docker stack services gmod
docker service ls
docker service ps gmod_api
docker service ps gmod_websocket
docker service ps gmod_discord
docker service ps gmod_traefik
```

Logs:

```bash
docker service logs -f gmod_api
docker service logs -f gmod_websocket
docker service logs -f gmod_discord
docker service logs -f gmod_traefik
```

Remove:

```bash
docker stack rm gmod
```

## 5) Important notes

- `api`, `websocket`, and `discord` are configured with `replicas: 2`.
- `traefik` is the ingress and load-balances requests to `api` and `websocket`.
- Public routes are host-based:
  - `http://$API_HOST` -> API service
  - `ws://$WS_HOST` -> WebSocket service
  - `http://$TRAEFIK_DASHBOARD_HOST/dashboard/` -> Traefik dashboard
- Prometheus metrics are exposed on `:9100/metrics`.
- Stateful services (`mariadb`, `redis`, `mongo`, `minio`) run with `replicas: 1` and local volumes.
- In multi-node mode, `local` volumes are not shared. Use a distributed volume driver if needed.
- With multiple `websocket`/`discord` replicas, some features may require leader-election or singleton behavior depending on your business logic.
