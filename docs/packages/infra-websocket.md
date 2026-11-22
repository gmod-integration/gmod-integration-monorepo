# `@gmod/infra-websocket`

BullMQ queues used to push a message to `apps/websocket` from any other app, without that app needing to know
which `websocket` replica currently owns the target connection.

## Exports (`src/queues.ts`)

- `wsSendToServerQueue` (+ `WSSendToServerData` type: `{ id, data }`) — push to one GMod server's socket.
  `enqueueWSSendToServerAndWait(data, timeoutMs)` adds the job and awaits `job.waitUntilFinished(...)` via
  `QueueEvents`, so the caller gets a real success/failure instead of fire-and-forget.
- `wsSendToAllClientsOfServerQueue` (+ `wsSendToAllClientsOfServerData` type: `{ id, action, data }`) — fan out
  to every authorized dashboard client for a given server, across all gateway replicas. Its worker
  publishes once to Redis pub/sub; each replica revalidates the session and current permissions before
  sending to local sockets. The publishing replica uses the same path, without a duplicate local send.

Both queues share the BullMQ `connection` from [infra-bullmq](./infra-bullmq.md).

`src/addonCommands.ts` adds `enqueueAddonRconAndWait({ serverID, steamID, command })`: it sends the
validated `wsAuthorizedRcon` command and awaits the addon's execution acknowledgement within five
seconds. `acceptAddonCommandResult(serverID, packet)` is called only by an authenticated gateway;
its Redis operation atomically matches the pending server/request ID and accepts only the first
unexpired terminal result. A successful queue/socket dispatch is insufficient. Timeouts remain
uncertain, are not automatically replayed, and clean up the pending keys.

## Consumer

`apps/websocket/src/main.ts` runs the BullMQ `Worker`s for both queues — see
[docs/apps/websocket.md](../apps/websocket.md) for server delivery with a remote acknowledgement and
dashboard broadcasts. Dashboard live delivery is best effort: Redis pub/sub has no replay or per-client
acknowledgement; available log history remains accessible through HTTP.

## Used by

`@gmod/domain-server`, `@gmod/domain-guild`, `apps/websocket` itself (`save_config` acks, `server_status`
pushes).
