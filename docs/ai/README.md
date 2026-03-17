# AI Docs

Guide rapide pour agents IA contribuant à ce monorepo.

## Ordre de lecture recommandé

1. `AGENT.md`
2. `docs/ai/ARCHITECTURE.md`
3. `docs/ai/BEST_PRACTICES.md`
4. `docs/ai/MIGRATION_PLAYBOOK.md`

## Résumé en 20 secondes

- `apps/*` = runtime/entrypoints.
- `packages/*` = logique partagée.
- Pas d’import direct entre apps.
- Discord = BullMQ (`@gmod/infra-bullmq`) + schémas `@gmod/schema`.
- Env centralisée dans `@gmod/config`.
- Prisma centralisé dans `@gmod/infra-prisma`.
