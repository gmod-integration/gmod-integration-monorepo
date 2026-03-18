# Architecture

## Overview

This repository is a Turbo + Bun monorepo.

- Runtime: `apps/*`
- Shared and reusable code: `packages/*`

```text
apps/
  api        -> HTTP API (Express)
  discord    -> Discord bot + BullMQ workers
  websocket  -> WebSocket gateway + workers BullMQ
  website    -> Frontend

packages/
  config     -> env loading + Zod validation
  schema     -> Zod contracts (BullMQ + business schemas)
  infra-*    -> technical adapters (Redis, Prisma, BullMQ, etc.)
  domain-*   -> domain-oriented business logic
  core       -> cross-cutting logic / application services
```

## Allowed Dependencies

General rule: only “downward” dependencies.

- `apps/*` can depend on `packages/*`.
- `core` can depend on `domain-*`, `infra-*`, `config`, and `schema`.
- `domain-*` can depend on `infra-*`, `config`, and `schema`.
- `infra-*` must not depend on `apps/*`.
- `schema` should only depend on validation libraries (`zod`).

## Critical Boundaries

### Discord Boundary

- Any Discord action triggered outside `apps/discord` must go through BullMQ.
- Use `@gmod/infra-bullmq/discordQueueAdapters.js`.
- Define/update payloads in `packages/schema/src/bullmq.ts`.
- Implement worker handlers in `apps/discord/src/discord/workers/discordQueueWorkers.ts`.

### Config Boundary

- Single source of truth: `@gmod/config`.
- `@gmod/config` loads workspace `.env` files and validates with Zod.
- Avoid reading `process.env` directly in business modules.

### Data Boundary

- Prisma client is generated in `packages/infra-prisma/generated/prisma`.
- Import Prisma client through `@gmod/infra-prisma`.
- Do not duplicate Prisma clients in apps.

## Composition Patterns

### API Endpoint Pattern

1. Route (`apps/api/src/routes/*`)
2. Validation/Auth middleware (`apps/api/src/middleware/*`)
3. Thin controller (`apps/api/src/controllers/*`)
4. Extracted logic in `packages/core/src/models/*` or `packages/domain-*`

### WebSocket Pattern

- Asynchronous sending through BullMQ queues (`@gmod/infra-websocket/queues.js`).
- Processing in the websocket app via workers.

### Global Express Typing

- `Request` extensions (`req.server`, `req.panelUser`, etc.) are centralized in:
  - `packages/core/src/types/express.d.ts`

## Anti-Patterns to Avoid

- Importing `apps/discord/...` from API/core/domain.
- Heavy business logic in controllers/routes.
- Duplicating payload schemas outside `packages/schema`.
- Introducing new cycles between domain packages.
