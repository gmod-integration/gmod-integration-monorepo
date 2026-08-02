# `apps/websocket`

Real-time WebSocket gateway. Entry point: [`src/main.ts`](../../apps/websocket/src/main.ts). Default internal
port `53139` (see root [README.md](../../README.md)).

## Two kinds of connections

Both connect to the same `WebSocketServer`; `verifyClient` decides which one based on the handshake:

- **GMod server** — headers `id` + `token`, checked against `@gmod/domain-server` (`server.isValidToken`).
  Tracked in an in-memory `clients.server` list. Can send `save_config` to persist in-game settings changes.
- **Dashboard client** — query params `discordID` + `token`, checked against `@gmod/domain-user`
  (`getPanelUserFromDiscordID` + `user.authAllowed`). Tracked in `clients.client`, along with which guilds/
  servers that user administers (used to scope pushes). Can request `server_status` (version, last-request
  time, live-connected flag from `clients.server`).

Both sides get a 1s `ws.ping()` keepalive.

## Cross-replica delivery

`apps/websocket` runs multiple replicas in production (target `2/2`, see
[deployment/swarm.md](../deployment/swarm.md)). A given GMod server's socket lives in the memory of exactly one
replica. When another app wants to push to that server (`@gmod/infra-websocket/queues.js` →
`wsSendToServerQueue`), a BullMQ worker here first tries local delivery; if the client isn't connected to
*this* replica, it re-publishes the payload on the Redis pub/sub channel `ws:send-to-server:broadcast` with a
`requestId`, and every replica that owns that connection tries to deliver it and increments a short-TTL Redis
ack key (`ws:send-to-server:ack:<requestId>`) that the original worker polls for up to 600ms.

`wsSendToAllClientsOfServerQueue` fans out to every connected dashboard client scoped to a given server
(`serverAdminListID`).

## Structure

```text
src/
  main.ts    everything: WebSocketServer, verifyClient auth, both connection handlers, the two BullMQ
             workers (wsSendToServerWorker, wsSendToAllClientsOfServerWorker), graceful shutdown.
  index.ts
```

There is no further folder split today — `main.ts` is the whole app. If it grows, connection handling and the
BullMQ workers are the natural seams to extract along.

## Run it

```bash
bun run websocket:dev
```
