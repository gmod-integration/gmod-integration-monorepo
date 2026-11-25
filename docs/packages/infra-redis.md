# `@gmod/infra-redis`

The shared `ioredis` client. One Redis instance, three jobs across the codebase:

1. **Cache** — short/medium-TTL caching of hot lookups (e.g. guild locale, Discord guild snapshots in
   [infra-bullmq](./infra-bullmq.md)).
2. **Pub/sub** — cross-replica delivery in `apps/websocket` (`ws:send-to-server:broadcast` channel + ack
   keys), see [docs/apps/websocket.md](../apps/websocket.md).
3. **BullMQ backing store** — [infra-bullmq](./infra-bullmq.md) and [infra-websocket](./infra-websocket.md)
   resolve connection settings through `@gmod/config/infrastructure.js`; BullMQ can use dedicated `BULLMQ_HOST`/`BULLMQ_PORT` overrides.

## Exports (`src/index.ts`)

- default export: the `Redis` instance (`REDIS_URL` if set, else host/port/db, resolved by `getRedisConfig()` from `@gmod/config/infrastructure.js`).
- `gracefulShutdownRedis()`.

## Addon traffic (`src/addonTelemetry.ts`)

The `@gmod/infra-redis/addonTelemetry.js` subpath records authenticated addon activity and reads
per-server telemetry in batches for platform monitoring. Its fixed 60-slot ring uses the Redis clock
to count requests received in the current and preceding 59 seconds, separately for HTTP and
WebSocket. Counter storage stays bounded for each server, regardless of request volume; inactive
metadata expires after seven days. Reads never extend retention or socket-presence leases.

Recording failures are contained in this telemetry helper. They do not introduce a new authentication
or request failure. The existing `server:<id>:version` and `server:<id>:last_request` cache entries
remain available to older consumers and provide metadata fallback when no telemetry has been
recorded yet. Versions are validated, and neither credentials nor request bodies are stored.
Unknown metadata and unavailable counters remain null; a successful empty counter read returns zero.
Collection is best effort: offline Redis is skipped, and a 250 ms wait limit plus a cap of 32 pending
commands prevents a stalled metrics store from accumulating work. Traffic can be undercounted during
an outage or saturation; these operational counters are not an exhaustive request ledger.

## Temporary console viewers (`src/consoleViewers.ts`)

`@gmod/infra-redis/consoleViewers.js` stores one expiring sorted-set member per authenticated dashboard
socket and server. `renewConsoleViewer` refreshes a 30-second lease and notifies addon owners on
`ws:console-stream:changed`; `removeConsoleViewer` removes only that socket's member. The read helper
returns the latest unexpired viewer deadline without extending it. Console output is never stored.

The Redis clock decides expiry. An absolute invocation deadline prevents a delayed or replayed
activation from starting a fresh lease after timeout; late successful replies are compensated by
removing only the exact old lease, preserving a newer renewal. Clock differences above the short
acceptance window fail closed. Offline Redis is rejected instead of using its offline command queue;
waits are limited to 500 ms and 32 pending commands. The gateway disables export if viewer state
cannot be checked, and the addon independently expires its capture lease.

## Used by

Almost everything — `domain-*` packages for caching, `apps/websocket` for pub/sub, and indirectly via
`infra-bullmq`/`infra-websocket` for queues.
