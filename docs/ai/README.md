# AI Docs

Quick guide for AI agents contributing to this monorepo.

## Recommended Reading Order

1. `AGENT.md`
2. `docs/ai/ARCHITECTURE.md`
3. `docs/ai/BEST_PRACTICES.md`
4. `docs/ai/MIGRATION_PLAYBOOK.md`

## 20-Second Summary

- `apps/*` = runtime/entrypoints.
- `packages/*` = shared logic.
- No direct imports between apps.
- Discord = BullMQ (`@gmod/infra-bullmq`) + schemas in `@gmod/schema`.
- Env is centralized in `@gmod/config`.
- Prisma is centralized in `@gmod/infra-prisma`.
