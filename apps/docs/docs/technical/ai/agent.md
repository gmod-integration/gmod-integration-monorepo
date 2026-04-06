# AGENT.md

Ce document définit les règles opérationnelles pour les agents IA qui modifient ce monorepo.

## 1) Mission

- Garder `apps/*` minces (entrypoints, routes, workers, bootstraps).
- Déplacer la logique métier partagée dans `packages/*`.
- Éviter les régressions d’architecture (imports croisés, cycles, couplage app-to-app).
- Valider systématiquement `lint + typecheck` sur les zones touchées.

## 2) Carte du repo

- `apps/api`: API Express (controllers, routes, middleware HTTP).
- `apps/discord`: bot Discord + workers BullMQ.
- `apps/websocket`: passerelle WebSocket + workers BullMQ côté WS.
- `apps/website`: frontend.
- `packages/config`: chargement `.env` global + validation Zod.
- `packages/schema`: schémas Zod partagés (payloads BullMQ, schémas métier).
- `packages/infra-*`: intégrations techniques (Prisma, Redis, BullMQ, Mongo, Steam, etc.).
- `packages/domain-*`: logique métier orientée domaine.
- `packages/core`: logique applicative transverse (models, utils, classes partagées).

## 3) Règles non négociables

- Ne jamais importer depuis `apps/*` dans un autre `app` ou dans `packages/*`.
- Toute interaction avec Discord depuis API/Core/Domain passe par `@gmod/infra-bullmq/discordQueueAdapters.js` (pas d’accès direct aux clients Discord).
- Ne pas re-créer de “bridge” ad hoc: utiliser les adapters BullMQ + schémas `@gmod/schema`.
- Les variables d’environnement doivent passer par `@gmod/config` (pas de `process.env` dispersé).
- Les accès DB Prisma passent par `@gmod/infra-prisma`.
- En ESM NodeNext: imports internes avec extension `.js`.
- Utiliser `import type` dès qu’un import est uniquement typé.

## 4) Où placer le code

- Endpoint HTTP: controller (app) mince + logique dans `packages/core/src/models/*` ou `packages/domain-*`.
- Règle métier liée à un domaine précis: `packages/domain-<domaine>`.
- Code technique (queue, DB client, cache adapter): `packages/infra-*`.
- Validation de payloads/DTO inter-apps: `packages/schema`.
- Types globaux Express (`req.server`, `req.panelUser`, etc.): `packages/core/src/types/express.d.ts`.

## 5) Flux inter-app recommandé

1. API/Core/Domain publie un job BullMQ via `infra-bullmq`.
2. Le worker (Discord/WS) consomme, exécute l’action externe.
3. Réponse éventuelle via `correlationId` + clé Redis `bullmq:reply:<id>`.
4. Les schémas de job/reply vivent dans `packages/schema/src/bullmq.ts`.

## 6) Validation minimale avant fin de tâche

- `bun run lint`
- `bun run typecheck`
- Si format touché: `bun run format:check`
- Si workflow runtime touché: lancer l’app concernée (`turbo run dev --parallel` ou script ciblé)

## 7) Documentation IA

Lire aussi:

- `docs/ai/README.md`
- `docs/ai/ARCHITECTURE.md`
- `docs/ai/BEST_PRACTICES.md`
- `docs/ai/MIGRATION_PLAYBOOK.md`
