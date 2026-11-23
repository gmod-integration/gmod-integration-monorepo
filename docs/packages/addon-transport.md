# Addon WebSocket transport

The current addon sends platform requests exclusively through the dedicated GMod server's authenticated
WebSocket. Its `gmInte.api` façade retains local endpoint names to keep module behavior consistent;
the gateway dispatches those requests directly to shared core models, without calling the HTTP app.
Existing HTTP routes remain available for older installations during transition.

## Connection and messages

GWSockets and a working WebSocket connection are mandatory for the entire addon; without them,
the addon is unusable. GWSockets must be installed on the dedicated server. The handshake sends `id`, `token` and
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
Final lifecycle packets during engine shutdown are best effort: teardown may end before their replies.

Every request revalidates server credentials, including requests for cached results. Invalid frames,
excessive traffic and revoked credentials close the connection. Logs identify operations without
recording credentials, images or report contents. Existing privileged server-to-addon methods are
explicitly allowlisted and validated in Lua, with no global-function lookup.

## Player tools

### Whitelist access

Whitelist-mode joins and online rechecks use `GET /servers/:serverID/players/:steamID64/access`.
Successful replies contain explicit boolean `bypassMaintenance` and `discordAdmin` fields; unknown
Discord authorization is non-2xx. The original player-statistics endpoint remains independent of
Discord role availability for normal joins with whitelist mode disabled.

`wsRefreshPlayerAccess` accepts only its method and an optional exact SteamID64. Omitting the ID
requests a recheck of online players. It invalidates decisions instead of carrying a permission.
The addon checks current access before expelling a player, preserves local administrator exemptions,
ignores superseded/disconnected-session replies, and limits online checks to two requests at a time.
A confirmed denial expels an online player only while whitelist mode remains enabled; provider
failures retry without treating uncertainty as a denial. New whitelist joins remain fail-closed.

### Screenshots, reports and errors

Players send compressed JSON as paced 30,000-byte base64 chunks through the allowlisted Garry's Mod
net channel. A player may have one transfer at a time; only screenshots, bugs and client errors are
accepted. The relay binds server and Steam IDs itself and reconstructs player details from the sender.
No API token or generic endpoint relay is exposed to the client.

Transfers are limited to 8 MiB encoded and 10 MiB decoded, with a 32 MiB shared reservation budget that
includes both sizes. The relay validates nesting before JSON parsing, capture metadata and report
fields, enforces per-player rate windows and cleans up on timeout/disconnect. Assembly expires after
60 seconds, forwarding after 65 seconds, and the client wait after 90 seconds. Client responses contain
only a sanitized outcome, never the stored report, image or server configuration.

Screenshot acknowledgements distinguish storage from Discord publication: `saved: true` confirms
the capture is available in the panel; `discordDelivered: true` additionally confirms publication.
When Discord is unavailable or no screenshot destination is configured, the saved capture is kept
and the player receives an explicit notice instead of a false delivery confirmation. These results
contain only booleans and the fixed `delivery` values `unavailable` or `not_configured`.

Bug report acknowledgements contain only `success: true`, `saved: true` and the attachment outcome
`none`, `saved` or `failed`. Invalid optional capture metadata or capture-storage errors do not discard
an otherwise valid report. The client closes the accepted form and explains a failed attachment without
resending the report. Older acknowledgements without attachment metadata are shown as unconfirmed when
a capture was submitted. No stored report, screenshot URL or exception details are returned to the player.

Game-to-Discord chat returns a failed acknowledgement when its relay rejects the message or is
unreachable. Configured filtering and disabled relay directions remain intentional skips. Backend
and administrator diagnostics are rate limited and exclude chat contents and webhook credentials.
The backend relay address is configured with `DISCORD_RELAY_URL`; development defaults to the local
relay on port `3002`, independently of the addon's WebSocket tunnel.

## Verification and release order

The bug-report client checks the optional capture against the relay's raw JSON and compressed transfer
budgets before sending anything. An attachment that cannot fit is replaced by the bounded failure
marker and the report is sent once. This does not retry an already sent or uncertain operation.

Run the schema/core/gateway TypeScript suites and `python3 submodules/gmod-integration/scripts/test_lua.py`.
The Lua runner checks transport and relay behavior with mocked engine APIs; it is not a dedicated GMod
server test. Before publishing the addon, test startup, an ordinary player and an admin, optional
integrations, screenshots/reports, malformed/large inputs, connection loss, credential rotation and map
changes on staging. Deploy the compatible gateway before distributing the new addon. A new addon
connected to an older gateway fails the protocol handshake visibly and has no HTTP fallback.
