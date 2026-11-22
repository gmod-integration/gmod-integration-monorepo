# `@gmod/schema`

Zod schemas shared across apps — the contracts for anything that crosses a process boundary. Uses
`zod-openapi` (`extendZodWithOpenApi`) so schemas can also generate OpenAPI docs, hence the `.openapi({...})`
metadata on most fields.

## Layout

```text
src/
  bullmq.ts    Job + Reply schema for every BullMQ action (see packages/infra-bullmq). This is the contract
               between "an app enqueues a Discord action" and "apps/discord executes and replies".
  gmod/        Schemas for entities reported by the GMod addon: players, teams, weapons, entities, positions,
               angles, screenshots, errors, capture data, server info.
  db/          Schemas describing persisted shapes not owned by Prisma directly (ServerSchema, QuerySchema).
  server/      ServerStatusChannelSchema (the "server status" embed/channel config).
```

## Rule

Every inter-app payload (BullMQ job/reply, anything a websocket handler trusts) must have a schema here, and
must be parsed at the entry point (producer and consumer), not "somewhere in the middle" — see
[best-practices.md — Contracts and validation](../best-practices.md#3-contracts-and-validation).

## Used by

`packages/infra-bullmq` (job/reply validation), `packages/domain-gmod` (typed GMod entity classes),
`apps/api` (request validation, OpenAPI generation), `apps/discord` (worker payload parsing).

## Browser destination configuration

`server/DashboardChannelSchema.ts` defines the HTTP-facing channel configuration projections for
screenshots, chat, logs and vote destinations. The browser receives only the destination channel and
optional screenshot administration flag, including read, create and remove responses. Unknown fields
are stripped by these schemas before JSON responses or feature state. Internal BullMQ/domain records
still carry their webhook credentials for server-side delivery; they are not browser DTOs.
