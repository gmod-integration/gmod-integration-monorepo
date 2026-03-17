# Architecture

## Vue d’ensemble

Ce repo est un monorepo Turbo + Bun.

- Exécution: `apps/*`
- Partage et réutilisation: `packages/*`

```text
apps/
  api        -> HTTP API (Express)
  discord    -> Bot Discord + workers BullMQ
  websocket  -> WebSocket gateway + workers BullMQ
  website    -> Frontend

packages/
  config     -> env loading + validation Zod
  schema     -> contrats Zod (BullMQ + schemas métier)
  infra-*    -> adaptateurs techniques (Redis, Prisma, BullMQ, etc.)
  domain-*   -> logique métier orientée domaine
  core       -> logique transverse / services applicatifs
```

## Dépendances autorisées

Règle générale: dépendances “vers le bas” seulement.

- `apps/*` peut dépendre de `packages/*`.
- `core` peut dépendre de `domain-*`, `infra-*`, `config`, `schema`.
- `domain-*` peut dépendre de `infra-*`, `config`, `schema`.
- `infra-*` ne dépend pas de `apps/*`.
- `schema` ne dépend que de libs de validation (`zod`).

## Boundaries critiques

### Discord boundary

- Toute action Discord déclenchée hors `apps/discord` doit passer par BullMQ.
- Utiliser `@gmod/infra-bullmq/discordQueueAdapters.js`.
- Déclarer/mettre à jour les payloads dans `packages/schema/src/bullmq.ts`.
- Implémenter le worker côté `apps/discord/src/discord/workers/discordQueueWorkers.ts`.

### Config boundary

- Source unique: `@gmod/config`.
- `@gmod/config` charge `.env` workspace + valide via Zod.
- Éviter la lecture directe de `process.env` dans les modules métiers.

### Data boundary

- Prisma généré dans `packages/infra-prisma/generated/prisma`.
- Import client Prisma via `@gmod/infra-prisma`.
- Ne pas dupliquer de client Prisma dans les apps.

## Patterns de composition

### API endpoint pattern

1. Route (`apps/api/src/routes/*`)
2. Middleware validation/auth (`apps/api/src/middleware/*`)
3. Controller mince (`apps/api/src/controllers/*`)
4. Logique extraite vers `packages/core/src/models/*` ou `packages/domain-*`

### Websocket pattern

- Envoi asynchrone via queues BullMQ (`@gmod/infra-websocket/queues.js`).
- Traitement côté app websocket via workers.

### Typage Express global

- Les extensions de `Request` (`req.server`, `req.panelUser`, etc.) sont centralisées dans:
  - `packages/core/src/types/express.d.ts`

## Anti-patterns à éviter

- Import `apps/discord/...` depuis API/core/domain.
- Logique métier lourde dans controllers/routes.
- Duplication des schémas de payload hors `packages/schema`.
- Nouveaux cycles entre packages domain.
