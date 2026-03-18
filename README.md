# Gmod Integration Monorepo

Backend monorepo pour Gmod Integration:

- API HTTP (`apps/api`)
- Bot Discord (`apps/discord`)
- WebSocket gateway (`apps/websocket`)
- Website (`apps/website`)
- Packages partagés (`packages/*`: domain, infra, core, config, schema)

## Présentation rapide

Le projet connecte des serveurs Gmod, Discord et un panel web:

- synchronisation utilisateur/rôles,
- logs serveur,
- webhook relay,
- queues BullMQ,
- persistance MariaDB + MongoDB + Redis + MinIO.

## Stack technique

- Runtime: Bun (`bun@1.3.9`)
- Langage: TypeScript (ESM, NodeNext)
- API: Express
- Queue: BullMQ + Redis
- DB relationnelle: MariaDB (Prisma)
- DB documents: MongoDB
- Storage: MinIO (S3 compatible)
- Orchestration locale: Docker Compose
- Orchestration prod: Docker Swarm

## Prérequis

- Bun `1.3.9`
- Docker + Docker Compose v2
- (Prod) Docker Swarm

Vérifier:

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

- Les secrets `.env` doivent respecter la validation Zod (ex: longueur minimale sur certains champs).
- Ne jamais commiter `.env`.

## Démarrage Dev (natif Bun)

### 1) Démarrer les requirements

```bash
docker compose --env-file .env -f docker-compose.requirements.yml up -d
```

### 2) Initialiser la base MariaDB

Méthode A (standard Prisma):

```bash
bunx prisma migrate deploy
```

Si Prisma CLI échoue dans ton contexte local, fallback SQL:

```bash
DB_PASS=$(grep -E '^MARIA_ROOT_PASSWORD=' .env | sed -E 's/^MARIA_ROOT_PASSWORD=//')
for f in $(find packages/infra-prisma/migrations -mindepth 2 -maxdepth 2 -name migration.sql | sort); do
  docker exec -i gmod_requirements_mariadb mariadb -uroot -p"$DB_PASS" gmod_integration < "$f"
done
```

### 3) Lancer les apps

Commande unique (recommandé):

```bash
bun run turbo:dev
```

Si tu veux lancer service par service:

```bash
bun run dev
bun run websocket:dev
bun run discord:dev
```

Optionnel website:

```bash
bun run website:dev
```

## Docker Compose (apps indépendantes)

### Build images séparées

```bash
docker build --target api -t gmod-integration/api:local .
docker build --target websocket -t gmod-integration/websocket:local .
docker build --target discord -t gmod-integration/discord:local .
```

### Lancer requirements + une seule app

API seule:

```bash
docker compose --env-file .env -f docker-compose.requirements.yml -f docker-compose.apps.yml up -d api
```

WebSocket seul:

```bash
docker compose --env-file .env -f docker-compose.requirements.yml -f docker-compose.apps.yml up -d websocket
```

Discord seul:

```bash
docker compose --env-file .env -f docker-compose.requirements.yml -f docker-compose.apps.yml up -d discord
```

Tout lancer:

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

## Prod Docker Swarm

### 1) Init swarm (une fois)

```bash
docker swarm init
```

### 2) Build (ou pull depuis registry)

```bash
docker build --target api -t gmod-integration/api:latest .
docker build --target websocket -t gmod-integration/websocket:latest .
docker build --target discord -t gmod-integration/discord:latest .
```

### 3) Déployer stack

```bash
API_IMAGE=gmod-integration/api:latest \
WEBSOCKET_IMAGE=gmod-integration/websocket:latest \
DISCORD_IMAGE=gmod-integration/discord:latest \
docker stack deploy -c docker-stack.swarm.yml gmod
```

### 4) Vérifier

```bash
docker stack services gmod
docker service ps gmod_api
docker service ps gmod_websocket
docker service ps gmod_discord
```

### 5) Scale manuel

```bash
docker service scale gmod_api=2 gmod_websocket=2 gmod_discord=2
```

## Workflow fork + branches (dev)

### Setup fork

```bash
git clone git@github.com:gmod-integration/api.git
cd api
git remote add upstream git@github.com:gmod-integration/api.git
git fetch upstream
```

### Branching recommandé

```bash
git checkout -b dev upstream/main
git push -u origin dev
```

Pour une feature:

```bash
git checkout dev
git pull --rebase upstream main
git checkout -b feat/<short-topic>
```

Exemples:

- `feat/docker-swarm-split-images`
- `fix/prisma-trigger-adminids`
- `chore/readme-dev-onboarding`

### Avant PR

```bash
bun run lint
bun run typecheck
bun run test
```

Puis:

```bash
git push -u origin feat/<short-topic>
```

Créer une PR vers `upstream/main`.

## Commandes utiles

```bash
# qualité
bun run lint
bun run format:check
bun run typecheck
bun run test

# turbo
bun run turbo:dev
bun run turbo:build
```

## Ports par défaut

- API: `53136`
- WebSocket: `53139`
- MariaDB: `3306`
- Redis: `6379`
- MongoDB: `27017`
- MinIO S3: `9060`
- MinIO Console: `9065`

## Troubleshooting rapide

- `Invalid environment variables`: vérifier `.env` (longueur secrets, URLs, IDs).
- `Table ... does not exist`: appliquer migrations Prisma.
- Container qui crash au boot:
  - `docker compose ... logs --tail=200 <service>`
  - vérifier connectivité `mariadb/redis/mongo/minio`.
