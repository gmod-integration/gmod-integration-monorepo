# Migration Playbook

Guide to move code from `apps/*` to `packages/*` without breaking architecture.

## Migration Checklist

1. Identify “shared” code (reusable by api/discord/ws).
2. Choose the target package:
   - business logic -> `domain-*`
   - cross-cutting application logic -> `core`
   - technical integration -> `infra-*`
   - contracts/validation -> `schema`
3. Move files and fix imports to package paths (`@gmod/...`).
4. Remove obsolete wrappers/re-exports from `apps/api/src/...`.
5. Ensure no package imports files from `apps/*`.
6. Check Turbo for dependency cycles.
7. Run lint + typecheck + targeted dev run.

## Example: Discord Action from API

Goal: do not call Discord directly.

1. Add the job/reply schema in `packages/schema/src/bullmq.ts`.
2. Add the adapter in `packages/infra-bullmq/src/discordQueueAdapters.ts`.
3. Implement the worker in `apps/discord/src/discord/workers/discordQueueWorkers.ts`.
4. Replace previous direct calls in `apps/api` / `packages/core`.

## Example: Add a field to `req`

1. Declare the field in `packages/core/src/types/express.d.ts`.
2. Ensure `tsconfig` includes this types directory.
3. Set the value in middleware.
4. Consume it without unsafe casts in controllers/models.

## Cycle Management

If Turbo reports a cycle between domain packages:

1. Move shared types/functions to a neutral package (`core` or a new dedicated package).
2. Avoid reciprocal dependencies (domain A `<->` domain B).
3. Replace direct calls with contracts (schema + event/job) when needed.

## Definition of Done (DoD)

- Imports point to `@gmod/*`, not app file paths.
- Controllers are thin, with extracted logic.
- No package cycle remains.
- `lint`, `typecheck`, and targeted dev startup pass.
