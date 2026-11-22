# Addon WebSocket transport

The current addon sends platform requests exclusively through the dedicated GMod server's authenticated
WebSocket. Its `gmInte.api` façade retains local endpoint names to keep module behavior consistent;
the gateway dispatches those requests directly to shared core models, without calling the HTTP app.
Existing HTTP routes remain available for older installations during transition.

## Connection and messages

GWSockets is required on the dedicated server. The handshake sends `id`, `token` and
`gmod-integrations-version` headers over WSS (WS is allowed for local development addresses).
Only `{ "action": "addon.ready", "protocol": 1 }` confirms the authenticated application protocol.

```json
{
  "action": "addon.request",
  "id": "connection-1",
  "method": "GET",
  "endpoint": "/servers/SERVER_ID"
}
```

POST requests add a JSON `body`. Replies have `action: "addon.response"`, the same `id`, a numeric
`status` and a JSON `body`. The status preserves the existing success/error callback convention;
it does not indicate that an HTTP request occurred. Schema and limits live in
`packages/schema/src/gmod/AddonTransportSchema.ts`. The core dispatcher lives in
`packages/core/src/models/gmod/addonTransport.ts` and the connection adapter in
`apps/websocket/src/addonGateway.ts`.

The dispatcher allows only the addon operations: server information/configuration, status/start/stop,
player statistics and telemetry, logs, account-link checks, supported synchronization/economy events,
warning imports and client screenshots/bugs/errors. Each endpoint is bound to the authenticated server.
Configuration uses the shared strict settings schema and atomic persistence. Existing feature access,
privacy safeguards, Discord queue adapters and per-player upload rate windows remain authoritative.

## Delivery and limits

Frames are limited to 12 MiB before JSON parsing. JSON depth, node count, fields and operation payloads
are bounded. The addon keeps at most 128 buffered requests / 24 MiB, sends at most four simultaneously
and drains its FIFO as replies free capacity. Queued and sent requests each have a 30-second deadline.
The gateway also limits active work to four requests / 24 MiB and returns an uncertain result after
25 seconds without a confirmed outcome. A timed-out operation keeps its work slot until it finishes.

Request IDs deduplicate identical requests on the same connection for up to two minutes within a
bounded cache. Reusing an ID for different content is rejected. This is not durable exactly-once
delivery across reconnects. Already-sent requests are never replayed automatically; their outcome may
be uncertain. Only unsent, unexpired requests can survive a transient disconnect. Credential changes
clear pending and queued work. Reconnection uses exponential backoff from 1 to 60 seconds with jitter;
an unanswered protocol handshake expires after 15 seconds.

Every request revalidates server credentials, including requests for cached results. Invalid frames,
excessive traffic and revoked credentials close the connection. Logs identify operations without
recording credentials, images or report contents. Existing privileged server-to-addon methods are
explicitly allowlisted and validated in Lua, with no global-function lookup.

## Player tools

Players send compressed JSON as paced 30,000-byte base64 chunks through the allowlisted Garry's Mod
net channel. A player may have one transfer at a time; only screenshots, bugs and client errors are
accepted. The relay binds server and Steam IDs itself and reconstructs player details from the sender.
No API token or generic endpoint relay is exposed to the client.

Transfers are limited to 8 MiB encoded and 10 MiB decoded, with a 32 MiB shared reservation budget that
includes both sizes. The relay validates nesting before JSON parsing, capture metadata and report
fields, enforces per-player rate windows and cleans up on timeout/disconnect. Assembly expires after
60 seconds, forwarding after 65 seconds, and the client wait after 90 seconds. Client responses contain
only a sanitized outcome, never the stored report, image or server configuration.

## Verification and release order

Run the schema/core/gateway TypeScript suites and `python3 submodules/gmod-integration/scripts/test_lua.py`.
The Lua runner checks transport and relay behavior with mocked engine APIs; it is not a dedicated GMod
server test. Before publishing the addon, test startup, an ordinary player and an admin, optional
integrations, screenshots/reports, malformed/large inputs, connection loss, credential rotation and map
changes on staging. Deploy the compatible gateway before distributing the new addon. A new addon
connected to an older gateway fails the protocol handshake visibly and has no HTTP fallback.
