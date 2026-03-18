# Docker + Swarm

Ce guide couvre:

- démarrage des services requis (DB/Redis/Mongo/MinIO) avec `docker compose`,
- build des images app (`api`, `websocket`, `discord`),
- déploiement Swarm avec **2 replicas** pour `api`, `websocket`, `discord`.

## Fichiers

- `Dockerfile`: image monorepo unique.
- `docker-compose.requirements.yml`: services requis uniquement.
- `docker-compose.apps.yml`: apps (`api`, `websocket`, `discord`) séparées.
- `docker-stack.swarm.yml`: stack complète Swarm (requirements + apps).

## 1) Préparer l'environnement

1. Copier `.env.example` vers `.env` et remplir les secrets.
2. Vérifier au minimum:
   - `MARIA_*`
   - `MINIO_*`
   - `DISCORD_*`
   - `BARER_DISCORD_RELAY`
   - `STEAM_API_KEY`

## 2) Démarrer uniquement les requirements (mode compose)

```bash
docker compose --env-file .env -f docker-compose.requirements.yml up -d
```

Arrêt:

```bash
docker compose -f docker-compose.requirements.yml down
```

## 3) Build images séparées

```bash
docker build --target api -t gmod-integration/api:latest .
docker build --target websocket -t gmod-integration/websocket:latest .
docker build --target discord -t gmod-integration/discord:latest .
```

Si cluster multi-node, pousser l’image vers un registry:

```bash
docker tag gmod-integration/api:latest registry.example.com/gmod-integration/api:latest
docker tag gmod-integration/websocket:latest registry.example.com/gmod-integration/websocket:latest
docker tag gmod-integration/discord:latest registry.example.com/gmod-integration/discord:latest
docker push registry.example.com/gmod-integration/api:latest
docker push registry.example.com/gmod-integration/websocket:latest
docker push registry.example.com/gmod-integration/discord:latest
```

Puis déployer avec:

```bash
API_IMAGE=registry.example.com/gmod-integration/api:latest \
WEBSOCKET_IMAGE=registry.example.com/gmod-integration/websocket:latest \
DISCORD_IMAGE=registry.example.com/gmod-integration/discord:latest \
docker stack deploy -c docker-stack.swarm.yml gmod
```

## 4) Déploiement Swarm (2x api/ws/discord)

Initialiser Swarm (une seule fois):

```bash
docker swarm init
```

Déployer:

```bash
docker stack deploy -c docker-stack.swarm.yml gmod
```

### Déployer une seule app

Tu peux lancer uniquement l’API en local compose:

```bash
docker compose --env-file .env -f docker-compose.requirements.yml -f docker-compose.apps.yml up -d api
```

Ou uniquement websocket:

```bash
docker compose --env-file .env -f docker-compose.requirements.yml -f docker-compose.apps.yml up -d websocket
```

Ou uniquement discord:

```bash
docker compose --env-file .env -f docker-compose.requirements.yml -f docker-compose.apps.yml up -d discord
```

Vérifier:

```bash
docker stack services gmod
docker service ls
docker service ps gmod_api
docker service ps gmod_websocket
docker service ps gmod_discord
```

Logs:

```bash
docker service logs -f gmod_api
docker service logs -f gmod_websocket
docker service logs -f gmod_discord
```

Suppression:

```bash
docker stack rm gmod
```

## 5) Notes importantes

- `api`, `websocket`, `discord` sont configurés en `replicas: 2`.
- Les services stateful (`mariadb`, `redis`, `mongo`, `minio`) sont en `replicas: 1` avec volumes locaux.
- En multi-node, volumes `local` ne sont pas partagés: utiliser un driver de volume distribué si nécessaire.
- Sur plusieurs replicas `websocket`/`discord`, des effets fonctionnels peuvent nécessiter une stratégie d’élection de leader selon vos flows métier.
