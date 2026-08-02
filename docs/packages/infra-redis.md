# `@gmod/infra-redis`

The shared `ioredis` client. One Redis instance, three jobs across the codebase:

1. **Cache** — short/medium-TTL caching of hot lookups (e.g. guild locale, Discord guild snapshots in
   [infra-bullmq](./infra-bullmq.md)).
2. **Pub/sub** — cross-replica delivery in `apps/websocket` (`ws:send-to-server:broadcast` channel + ack
   keys), see [docs/apps/websocket.md](../apps/websocket.md).
3. **BullMQ backing store** — [infra-bullmq](./infra-bullmq.md) and [infra-websocket](./infra-websocket.md)
   both build their `connection` config from the same `REDIS_HOST`/`REDIS_PORT` env vars this package reads.

## Exports (`src/index.ts`)

- default export: the `Redis` instance (`REDIS_URL` if set, else host/port/db from env).
- `gracefulShutdownRedis()`.

## Used by

Almost everything — `domain-*` packages for caching, `apps/websocket` for pub/sub, and indirectly via
`infra-bullmq`/`infra-websocket` for queues.
