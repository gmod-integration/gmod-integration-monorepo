# `@gmod/infra-websocket`

BullMQ queues used to push a message to `apps/websocket` from any other app, without that app needing to know
which `websocket` replica currently owns the target connection.

## Exports (`src/queues.ts`)

- `wsSendToServerQueue` (+ `WSSendToServerData` type: `{ id, data }`) — push to one GMod server's socket.
  `enqueueWSSendToServerAndWait(data, timeoutMs)` adds the job and awaits `job.waitUntilFinished(...)` via
  `QueueEvents`, so the caller gets a real success/failure instead of fire-and-forget.
- `wsSendToAllClientsOfServerQueue` (+ `wsSendToAllClientsOfServerData` type: `{ id, action, data }`) — fan out
  to every dashboard client currently scoped to a given server.

Both queues share the BullMQ `connection` from [infra-bullmq](./infra-bullmq.md).

## Consumer

`apps/websocket/src/main.ts` runs the BullMQ `Worker`s for both queues — see
[docs/apps/websocket.md](../apps/websocket.md) for the local-delivery-then-Redis-pub/sub-fallback logic.

## Used by

`@gmod/domain-server`, `@gmod/domain-guild`, `apps/websocket` itself (`save_config` acks, `server_status`
pushes).
