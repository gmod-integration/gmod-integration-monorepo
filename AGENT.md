# AGENT.md

Ce document définit les règles opérationnelles pour les agents IA qui modifient ce monorepo.

## 1) Mission

- Garder `apps/*` minces (entrypoints, routes, workers, bootstraps).
- Déplacer la logique métier partagée dans `packages/*`.
- Éviter les régressions d'architecture (imports croisés, cycles, couplage app-to-app).
- Valider systématiquement `lint + typecheck` sur les zones touchées.

## 2) Carte rapide du repo

- `apps/api`: API Express (controllers, routes, middleware HTTP).
- `apps/discord`: bot Discord (principal + bots custom par guilde) + workers BullMQ.
- `apps/websocket`: passerelle WebSocket + workers BullMQ côté WS.
- `apps/website`: frontend (site public + dashboard).
- `apps/docs`: site Docusaurus qui publie la doc **produit** publique (pas ce dossier `docs/`).
- `packages/config`: chargement `.env` global + validation Zod.
- `packages/schema`: schémas Zod partagés (payloads BullMQ, schémas métier).
- `packages/infra-*`: intégrations techniques (Prisma, Redis, BullMQ, Mongo, MinIO, Steam, etc.).
- `packages/domain-*`: logique métier orientée domaine (server, guild, user, moderation, compliance, gmod).
- `packages/core`: logique applicative transverse (models, utils, classes partagées).
- `packages/locales`: fichiers de traduction bruts.
- `submodules/gmod-integration`: l'addon Garry's Mod (Lua), dépôt git séparé — c'est le client de tout ce qui
  précède. A son propre `AGENTS.md`.

Carte complète, détaillée dossier par dossier: **[`docs/README.md`](./docs/README.md)**.

## 3) Règles non négociables

- Ne jamais importer depuis `apps/*` dans un autre `app` ou dans `packages/*`.
- Toute interaction avec Discord depuis API/Core/Domain passe par `@gmod/infra-bullmq/discordQueueAdapters.js` (pas d'accès direct aux clients Discord).
- Ne pas re-créer de "bridge" ad hoc: utiliser les adapters BullMQ + schémas `@gmod/schema`.
- Les variables d'environnement doivent passer par `@gmod/config` (pas de `process.env` dispersé).
- Les accès DB Prisma passent par `@gmod/infra-prisma`.
- En ESM NodeNext: imports internes avec extension `.js`.
- Utiliser `import type` dès qu'un import est uniquement typé.
- Ne jamais modifier `submodules/gmod-integration` sans lire son propre `AGENTS.md` d'abord (conventions GLua,
  realms `sv_`/`cl_`/`sh_`, sécurité réseau — très différentes des règles TypeScript ci-dessus).

## 4) Où placer le code

- Endpoint HTTP: controller (app) mince + logique dans `packages/core/src/models/*` ou `packages/domain-*`.
- Règle métier liée à un domaine précis: `packages/domain-<domaine>`.
- Code technique (queue, DB client, cache adapter): `packages/infra-*`.
- Validation de payloads/DTO inter-apps: `packages/schema`.
- Types globaux Express (`req.server`, `req.panelUser`, etc.): `packages/core/src/types/express.d.ts`.

## 5) Flux inter-app recommandé

1. API/Core/Domain publie un job BullMQ via `infra-bullmq`.
2. Le worker (Discord/WS) consomme, exécute l'action externe.
3. Réponse éventuelle via `correlationId` + clé Redis `bullmq:reply:<id>`.
4. Les schémas de job/reply vivent dans `packages/schema/src/bullmq.ts`.

Pourquoi ce détour par BullMQ plutôt qu'un appel direct: voir
[docs/architecture.md](./docs/architecture.md#why-this-shape).

## 6) Validation minimale avant fin de tâche

- `bun run lint`
- `bun run typecheck`
- Si format touché: `bun run format:check`
- Si workflow runtime touché: lancer l'app concernée (`turbo run dev --parallel` ou script ciblé)

## 7) Documentation complète

Toute la documentation technique/architecture détaillée vit dans **[`./docs/`](./docs/README.md)**, pas sur le
site public. Commencer par [`docs/README.md`](./docs/README.md) (docmap: une description de chaque dossier
avec un lien vers le détail), puis:

- [`docs/architecture.md`](./docs/architecture.md) — vue d'ensemble, pourquoi ce découpage, flux de données.
- [`docs/best-practices.md`](./docs/best-practices.md)
- [`docs/migration-playbook.md`](./docs/migration-playbook.md)
- [`docs/deployment/swarm.md`](./docs/deployment/swarm.md) — déploiement/exploitation prod (Docker Swarm).
- [`docs/apps/*.md`](./docs/apps) et [`docs/packages/*.md`](./docs/packages) — un fichier par app/package.
- [`docs/submodules/gmod-integration.md`](./docs/submodules/gmod-integration.md) — l'addon GMod.
- [`docs/architectures/`](./docs/architectures/README.md) — les mêmes flux en schémas Mermaid (`.mmd`).

La doc **produit** (installation, commandes Discord, guides dashboard) est ailleurs: `apps/docs/docs/`,
publiée sur docs.gmod-integration.com. Ne pas y mettre de contenu destiné aux agents/ingénieurs.

## 8) Rapports / audits demandés par l'utilisateur

Si on te demande d'auditer, d'investiguer ou de "faire un rapport" sur un sujet (et que la réponse dépasse une
simple réponse de chat), enregistre-le dans **[`docs/reports/`](./docs/reports/README.md)** au lieu de le
laisser uniquement dans la conversation — un fichier par rapport, nommé `YYYY-MM-DD-sujet-en-kebab-case.md`,
en partant de [`docs/reports/TEMPLATE.md`](./docs/reports/TEMPLATE.md), avec une ligne ajoutée à l'index dans
`docs/reports/README.md`. Ces rapports sont figés dans le temps (ne pas réécrire les constats après coup, voir
la règle dans `docs/reports/README.md`) — à ne pas confondre avec la doc vivante (`docs/architecture.md`,
`docs/packages/*`, ...), qui décrit l'état actuel.
