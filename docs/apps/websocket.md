# `apps/websocket`

Real-time WebSocket gateway. Entry point: [`src/main.ts`](../../apps/websocket/src/main.ts). Default internal
port `53139` (see root [README.md](../../README.md)).

## Two kinds of connections

Both connect to the same `WebSocketServer`. The handshake stores a verified connection type, which the
connection handler consumes once:

- **GMod server** — headers `id` + `token`, checked against `@gmod/domain-server` (`server.isValidToken`).
  Missing, malformed or invalid addon credentials are rejected without falling back to dashboard
  authentication. Tracked in `clients.server`; a newly authenticated connection replaces the previous
  socket for that server. The current addon waits for `addon.ready` and uses correlated `addon.request` /
  `addon.response` exchanges. Its operations go directly to shared models; no HTTP request is made by the gateway.
- **Dashboard client** — query parameter `ticket`, consumed by
  [`@gmod/domain-auth/authSessions.ts`](../../packages/domain-auth/src/authSessions.ts). The resolved
  application session supplies the Discord identity; durable bearer tokens in WebSocket URLs are rejected.
  Tracked per socket in `clients.client`, with its exact session and allowed guild/server IDs.

The dashboard first obtains its session and CSRF token through `GET /v6/auth/session`, then requests
`POST /v6/auth/ws-ticket` with the session cookie and `X-CSRF-Token`. Each connection attempt needs a new
ticket. Tickets have a maximum lifetime of 30 seconds, bounded by session expiry, and Redis atomically
consumes them with `GETDEL`; only their hash is used in the Redis key. HTTP bearer clients can also request
a ticket. Supplied browser origins must pass the shared origin check.

## Sessions, permissions and connection lifecycle

Multiple tabs may connect using the same session, and multiple sessions may belong to the same account.
Closing one socket removes only that socket. Every dashboard message and outgoing delivery revalidates
the exact application session. A timer also revalidates idle sockets at least every 60 seconds, or sooner
at their current expiry. Validation enforces inactivity/absolute deadlines, revocation, privacy erasure
and the parent session of a delegated login. WebSocket traffic does not extend an application session;
authenticated HTTP activity handles the sliding inactivity deadline.

After delegation expiry, an HTTP session check can return `actor_session_available` with a CSRF recovery
token. Returning to the original account uses the explicit HTTP impersonation-end endpoint, followed by
a fresh ticket for that account; the gateway never switches the socket's identity in place.

All replicas subscribe to `gmi:auth:session-revoked` (`{sessionID, discordID}`) and immediately close sockets
for that session and its delegated children. They also subscribe to `gmi:privacy:revoked` and close sockets
whose subject or delegation actor is the erased account. Durable validation remains authoritative if a
revocation publication is missed.

Guild/server permissions are resolved on connection and checked again before scoped operations when
their local snapshot is at least 30 seconds old. The underlying Discord guild cache lasts 120 seconds.
Discord member/role/ownership changes invalidate shared revisions and notify all gateways; each scoped
operation also checks the durable revision, so a missed notification cannot preserve an old snapshot.
Revision checks fence pending lookups. The provider grant is checked before cached rights are returned.
A temporary permission lookup failure clears the socket's allowed IDs and delays its
next lookup by five seconds. A `server_status` request must name an allowed server, and its response goes
only to the requesting socket. Live pushes also require an allowed server ID.
Closed or revoked sockets cannot be registered after pending authentication or permission lookups.
The dashboard discards live status on transport loss and never applies another server's status.

Addon console execution uses `wsAuthorizedRcon` with an expiry and request ID. The gateway accepts
`addon.command-result` only on a ready, reauthenticated addon connection and binds it to the actual
server before completing its pending result. Socket delivery alone does not confirm console execution.

Application login remains independent of the Discord OAuth grant. The dashboard distinguishes these
close codes:

| Code   | Meaning                                                            | Dashboard handling                                                                        |
| ------ | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `1008` | Application session revoked, expired or unavailable as an identity | Refresh the HTTP session before reconnecting.                                             |
| `4003` | Discord grant requires reconnection                                | Keep the application session and drafts; stop reconnecting until Discord is reauthorized. |
| `1013` | Temporary session or permission-service failure                    | Retry with backoff and a new ticket.                                                      |
| `1001` | Service restart                                                    | Reconnect with a new ticket.                                                              |

Both connection types receive a ping every 30 seconds. A socket that has not answered with a pong by the
following heartbeat is terminated. Socket closure and graceful shutdown remove heartbeat and session
timers.

## Cross-replica delivery

`apps/websocket` runs multiple replicas in production (target `2/2`, see
[deployment/swarm.md](../deployment/swarm.md)). A given GMod server's socket lives in the memory of exactly one
replica. When another app wants to push to that server (`@gmod/infra-websocket/queues.js` →
`wsSendToServerQueue`), a BullMQ worker here first tries local delivery; if the client isn't connected to
_this_ replica, it re-publishes the payload on the Redis pub/sub channel `ws:send-to-server:broadcast` with a
`requestId`, and every replica that owns that connection tries to deliver it and increments a short-TTL Redis
ack key (`ws:send-to-server:ack:<requestId>`) that the original worker polls for up to 600ms.

`wsSendToAllClientsOfServerQueue` fans out to every authorized dashboard socket scoped to a given server
(`serverAdminListID`), including multiple tabs, with session and permission checks before delivery.

## Structure

```text
src/
  main.ts    everything: WebSocketServer, verifyClient auth, both connection handlers, the two BullMQ
             workers (wsSendToServerWorker, wsSendToAllClientsOfServerWorker), graceful shutdown.
  index.ts
```

`src/main.ts` owns authentication, connection registration and queue delivery.
`src/addonGateway.ts` owns the addon request lifecycle, limits and correlated replies.

## Addon request protocol

The [addon transport contract](../packages/addon-transport.md) documents the shared schema, operation
allowlist, delivery guarantees, player relay and release order. `src/addonGateway.ts` handles frame
limits, credential revalidation, correlation, duplicate IDs, bounded concurrency and sanitized errors.
The Lua addon uses a bounded FIFO and reconnect backoff; sent-but-unconfirmed requests are never
replayed automatically. `save_config` / `config_save` remain narrow compatibility paths, with local
credentials stripped before strict business-settings validation.

Player uploads arrive through the authenticated dedicated-server socket after the Lua relay validates
and rebuilds their actor identity. Console live output is size/rate bounded and forwarded only after
checking console capability; recipient sessions and server permissions remain revalidated.

Run the gateway tests, including an actual loopback WebSocket with mocked feature stores:

```bash
node_modules/.bin/vitest run apps/websocket/test --config apps/websocket/vitest.config.ts
```

## Run it

```bash
bun run websocket:dev
```

## Dashboard request budgets

Authenticated dashboard sockets accept text frames up to 16 KiB, at most 30 messages per 10-second
window and two concurrent metadata operations. Binary/oversized frames and excessive cadence close the socket
with 1008 before JSON parsing or identity/provider reads. Polls beyond the two in-flight operations
are ignored without disconnecting a healthy client when a provider is slow. Each accepted handler releases its slot after
success, failure or early return. Server-status identifiers are bounded to 255 safe characters before
a community permission lookup. Addon transport frames keep their separate contract and limits.
