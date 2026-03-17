# Best Practices

## 1) Import/Export

- En NodeNext ESM, utiliser les imports locaux avec extension `.js`.
- Préférer les imports directs de package:
  - `@gmod/config`
  - `@gmod/infra-bullmq/discordQueueAdapters.js`
  - `@gmod/domain-server/Server.js`
- Éviter les fichiers “proxy” inutiles qui ne font que re-exporter 1 symbole.
- Si un import est seulement typé, utiliser `import type`.

## 2) Placement de logique

- Controller > 10 lignes: extraire dans `packages/core/src/models/*` ou `packages/domain-*`.
- Middleware: garder seulement validation/auth/context.
- Domain package: logique métier pure et cohérente par domaine.
- Infra package: SDK clients, queues, DB adapters, cache adapters.

## 3) Contrats et validation

- Tout payload inter-app (BullMQ, websocket data critique) doit avoir un schéma Zod dans `@gmod/schema`.
- Parse au point d’entrée (producer/consumer), pas “au milieu”.

## 4) Résilience

- Pour les appels BullMQ avec réponse, gérer timeout explicitement (`BullMQReplyTimeoutError`).
- En cas de dépendance externe indisponible (Discord), fallback propre (log + skip contrôlé).
- Utiliser Redis pour cache court/moyen TTL sur données fréquentes (ex: locale guild).

## 5) TypeScript

- Éviter `as string` brut sur des paramètres HTTP potentiellement `string | string[]`.
- Normaliser les params via helper partagé avant usage.
- Ne pas abuser de non-null assertion (`!`) sans garde en amont.

## 6) Qualité

Avant merge:

- `bun run lint`
- `bun run typecheck`
- `bun run format:check`

En cas de migration structurelle:

- lancer l’app touchée en dev (`turbo run dev --parallel` ou script ciblé),
- vérifier qu’aucune import graph cycle n’apparaît.
