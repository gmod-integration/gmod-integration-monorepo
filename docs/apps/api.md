# `apps/api`

Express HTTP API. Entry point: [`src/gm_integration_api.ts`](../../apps/api/src/gm_integration_api.ts).

## Interactive developer reference

Open `/v6/docs` on the API origin (locally, `http://localhost:53136/v6/docs`). The HTTP tab exposes
the currently implemented v6 routes through Swagger UI, with request/response schemas and live
requests. The WebSocket tab provides the message catalogue, examples and a dashboard connection
console. These references describe mounted contracts, not the future v6 roadmap.

Machine-readable documents are available at `/v6/docs/openapi.json` and `/v6/docs/asyncapi.json`.
The UI and its assets are served locally by the API, without a documentation CDN.

Sign in through the dashboard before testing cookie-authenticated operations. The developer console
reads the HTTP session and obtains the current CSRF token; mutations use the same session and
authorization checks as other clients. Each WebSocket connection obtains a fresh single-use ticket.
The browser console covers dashboard messages; native addon connections require the `id` and `token`
headers described in the AsyncAPI contract. See [the gateway reference](./websocket.md) for lifecycle,
delivery limits and the distinction between dashboard and addon messages.

## Who talks to it

- The GMod addon (submodule), authenticated with a server token/ID.
- `apps/website` (dashboard), authenticated as a panel user.
- External webhooks (GmodStore purchases).

## Structure

```text
src/
  gm_integration_api.ts   Express app bootstrap: CORS, helmet, useragent, graceful shutdown, mounts mainRoutes.
  routes/
    mainRoutes.ts          top-level router
    v3/                    current API version: clients, servers, users, bans, ...
    v6/                    independent contracts, beginning with account erasure
    webhooks/               gmodstore/ (purchase webhooks)
    steamRoutes.ts
  controllers/
    v3/                    one controller file per resource (usersControllers, serversControllers, ...)
    gmod/                   GmodErrorsControllers (in-game error reports)
    website/                WebsiteErrorsControllers
    webhooks/                gmodstoreControllers
  middleware/
    v3/                    serverValidator, clientValidator, userValidator, loggers
    webhooks/               gmodStoreValidator
    errorMiddleware.ts, asyncHandler.ts, requestBudget.ts
```

## Request pattern

Route → validation/auth middleware → thin controller → logic in `packages/core/src/models/*` or
`packages/domain-*`. See [architecture.md — API endpoint pattern](../architecture.md#api-endpoint-pattern).

Controllers should stay thin (rule of thumb: extract past ~10 lines, see
[best-practices.md](../best-practices.md)); the actual server/guild/user logic lives in `@gmod/domain-*`
classes, not in the controller.

## Linked Steam profile

`GET /v3/users/:discordID/steam-profile` requires the account's authenticated dashboard session and
returns `{steamID64, steamProfile: {name, avatarURL} | null}` with `Cache-Control: no-store`. The Steam
ID comes from the account's stored link; clients cannot request arbitrary Steam profiles through this
route. Unlinked accounts return both fields as `null`; missing or erased accounts return 404.
Steam and avatar lookup share a three-second budget. Provider failures preserve the linked ID, and
avatar failures preserve an already resolved name with a `null` avatar URL.

## Custom bot removal

`DELETE /v3/users/:discordID/guilds/:guildID/bot` requires the authenticated account and fresh
administrator permissions for the target guild, without requiring a snapshot from the effective bot.
Cleanup remains available after commercial access expires. It first checks membership through the main Discord client, independently of the custom
client. Missing membership returns 409 `main_bot_required`; an unavailable check returns 503
`main_bot_unavailable`. Neither response changes the custom connection.

The operation transactionally clears the guild's saved custom credentials and presence setting,
preserving the purchase, its guild assignment and other access sources. It then invalidates the
presence cache and waits for the Discord worker to reload the guild from storage. A final guild-scoped
storage read must still find no configured credential before a positive acknowledgement returns 200
`{removed: true, tokenConfigured: false}`. A new configuration observed during the operation is preserved
and returns 409 `{error: 'custom_bot_reconfigured', tokenConfigured: true}`. An unavailable final check
returns 503 `{error: 'custom_bot_state_unavailable'}` without claiming a known token state. Both outcomes
require refreshing the summary and opening a new confirmation before another removal. A failure after durable removal
returns 503 `{error: 'custom_bot_disconnect_pending', tokenConfigured: false}`; retrying repeats cleanup
and reload even when the token is already empty. No response contains a credential.

The dashboard names the bot and consequences in a confirmation dialog, blocks duplicates while
pending, guides administrators to invite the main bot when required, and distinguishes a removed
credential awaiting cleanup from a confirmed disconnection. Reloads for one guild are serialized in
the Discord runtime so a preceding reload cannot reconnect an old credential after removal completes.
The worker acknowledgement assumes one Discord runtime owner; see the singleton deployment contract
in [the Discord app documentation](./discord.md#custom-bot-removal).

## Account notifications

The authenticated v3 user routes share the dashboard's notification contract:
`GET /users/:discordID/notifications` returns `{notifications, unreadCount}`, while
`GET /users/:discordID/notifications/count` returns `{unreadCount}`. The list is ordered newest first.
`PATCH /users/:discordID/notifications/:notificationID` marks one owned item as read; the static
`PATCH /users/:discordID/notifications/mark-all-read` route marks the account's unread items as read.
Both mutation responses contain the freshly queried `{unreadCount}`. Reading an item again is
idempotent; a missing or foreign item returns 404. Invalid positive integer IDs return 400 before
storage access. Every read and update is scoped to the authenticated route's Discord account.

The handlers delegate to `@gmod/core/models/v3/userNotificationModels.js`.
`apps/api/test/routes/v3/usersRoutes.test.ts` exercises the mounted Express routes with real
notification controllers and models, replacing only authentication and storage boundaries.

## Dashboard authentication

`/v6/auth` owns application sessions independently of Discord access-token expiry:

| Route                      | Contract                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `GET /session`             | Authoritative user/rank, session deadlines and CSRF token; no credential or Set-Cookie. |
| `POST /legacy-session`     | Strict JSON `{token}` exchanges the owner's valid legacy credential once.               |
| `POST /logout`             | Revokes the presented session and delegates, clears cookies; idempotent.                |
| `GET /sessions`            | Safe device/date metadata and `isCurrent`, without credentials.                         |
| `DELETE /sessions/:id`     | Revokes only a session owned by the authenticated account.                              |
| `POST /ws-ticket`          | Issues a single-use ticket valid for at most 30 seconds.                                |
| `POST /impersonations`     | Developer-only `{discordID}` creates a separate, audited delegate session.              |
| `POST /impersonations/end` | Revokes the delegate and restores the bound actor cookie.                               |

Cookie mutations require `X-CSRF-Token`. CORS allows credentials only for the configured website/API
origins (development also permits localhost origins). All auth responses use `Cache-Control: no-store`.
Historical Bearer clients use the same exact-session resolver; a database token digest cannot itself
authenticate. Discord-dependent actions return `503 provider_unavailable` for temporary provider failure
or `403 discord_reauth_required` for a rejected grant. They do not revoke the application session.

The v3 Discord login callback uses browser-bound, one-use state and PKCE S256, sets the HttpOnly session
cookie and redirects without a credential in the URL. API startup owns the bounded provider refresh
worker; shutdown drains it before closing storage. See [domain-auth](../packages/domain-auth.md) for
lifetimes, legacy migration, encryption and the required coordinated deployment procedure.

## Account erasure under v6

`POST /v6/account/erasure-requests` accepts a strict JSON body with `confirmation: "DELETE"`,
`idempotencyKey` (UUID) and `receipt` (64 hexadecimal characters). Generate and retain both random values
before sending the request: the public request ID equals the idempotency key, while the receipt is its
separate recovery credential. The route derives the Discord identity from exactly one valid, unrevoked
panel session matching the cookie or explicit Bearer credential, then revalidates that session. Cookie
mutations require CSRF protection. It accepts no client-selected
account identifier and checks the configured website origin when an Origin header is present.

A durable accepted request returns 202 with `requestId`, `status`, `requestedAt`, `completedAt` and the
receipt. The status is `pending`, `running`, `retry` or `completed`; dates are ISO strings and
`completedAt` is null until completion. Request acceptance revokes the account's sessions. A repeated
request with matching identity, key and receipt reuses the durable request; a conflicting request returns 409. Since acceptance can revoke the session before its HTTP acknowledgement arrives, clients recover
with the saved ID and receipt rather than resubmitting with a revoked session.

`GET /v6/account/erasure-requests/:requestId` uses `Authorization: Bearer <receipt>` independently of the
revoked account session. It returns the same status fields without the receipt or account identifiers.
A different receipt or request ID returns 404; query-string receipts are never accepted. These endpoints
use `Cache-Control: no-store` and versioned errors shaped as `{error: {code, message}}`; raw service errors
and credentials are excluded. Request logging redacts receipts, including rejected query/body values.
The domain service and durable worker live in `@gmod/domain-compliance/accountErasure.js`.

Server-tracked delegate sessions cannot request erasure. Acceptance revokes sessions belonging to the
subject and delegate sessions created by that actor, then removes auth profile and provider retry caches.
The erasure barrier is checked before and after authentication writes to prevent credential recreation.

`apps/api/test/routes/v6/_v6Routes.test.ts` mounts the real versioned Express router with mocked database
and domain boundaries. It verifies session ownership, absent/revoked/ambiguous sessions, strict input,
Origin checks, conflict handling, receipt-scoped follow-up after session revocation, invalid service
states, secret stripping and parser failures. Schema and logger tests cover the shared contract and
receipt redaction. `/v6` is mounted separately from `/v3`; it does not alias historical routes.

## Community access and capabilities

`GET /v6/guilds/:guildID/access` and
`GET /v6/guilds/:guildID/servers/:serverID/access` use the same authenticated administration and
server-ownership checks as settings saves. They return `guildID`, `premium`, `customBot`, `state`,
`sources`, `revision`, `validUntil`, `usages` keyed by capability, and `serverID` for a server scope.
They expose no purchaser identity or provider credentials and use `Cache-Control: no-store`.

The shared [access domain](../packages/domain-access.md) resolves historical grants, assigned GmodStore
purchases and valid Discord entitlements. `state: unknown` distinguishes verification failure from
a confirmed free plan. The browser uses the server snapshot and the shared capability catalogue;
each command still rechecks access on the server.

Access failures use stable codes: `upgrade_required` and `quota_reached` return 403;
`entitlement_unknown` returns 503. v6 errors contain `{error: {code, message, capability, limit?, used?}}`.
Historical v3 callers retain a string `error` code with capability/count details alongside it.
Authentication and administration errors remain separate.

Both old and complete creation payloads enforce the same quotas through transactionally locked
commands. Free history queries select the latest 500 logs or 50 errors before sorting and pagination;
the limit is not merely a page size or a browser-side display restriction. Cleanup and disabling a
paid configuration remain available after its entitlement expires.

## Dashboard section saves under v6

`PUT /v6/guilds/:guildID/settings` and
`PUT /v6/guilds/:guildID/servers/:serverID/settings` accept `{settings: {...}}`. The strict, nonempty
allowlists live in `DashboardSettingsSchema`: guild verification preferences, server configuration,
synchronization directions, nickname format, chat preferences and log content. Unknown fields and invalid
types return 400. Values must fit their existing storage limits. Premium requirements are enforced before
writing, including when a request mixes restricted and unrestricted settings.

The dashboard session middleware resolves exactly one valid cookie or explicit Bearer session, revalidates authentication,
checks community administration and confirms that the requested server belongs to that community.
An Origin header must match the configured website. Responses use `Cache-Control: no-store`.

All submitted settings are committed in one SQL transaction. The response is
`{settings: {...}, sync: "applied" | "pending"}`. `settings` acknowledges durable storage; `pending`
indicates that cache invalidation or external synchronization is not confirmed. Addon configuration
remains `pending` after enqueueing because queue acceptance does not confirm application in the game.
These section endpoints do not provide optimistic concurrency revisions.

## Status configuration under v6

`GET /v6/guilds/:guildID/servers/:serverID/status/configuration` returns
`{configuration: {settings, buttons}, revision}`. The settings are player-list visibility, its format and
chart visibility. Buttons contain their optional existing ID, name, emoji, HTTP(S) URL and enabled state.
The endpoint can read incomplete legacy buttons so an administrator can repair them.

`PUT` on the same path accepts that snapshot, validates the complete aggregate, checks button ownership,
limits and Premium entitlements, then locks the server row and commits settings and buttons together.
The SHA-256 revision must match the saved snapshot; a conflict returns 409 without changing either part.
New buttons receive their IDs only during this transaction. Empty names, invalid URLs, duplicate IDs and
foreign button IDs are rejected.

The response returns the canonical configuration, its new revision and
`sync: "applied" | "pending" | "not_published"`. An existing Discord message refresh occurs after commit
through the queue adapter. A failed refresh leaves the stored configuration acknowledged as `pending`.
Saving does not publish a new message; publication remains an explicit action using the saved values.

The legacy v3 creation routes for links, synchronization roles/teams, nickname rules, chat filters and
verification roles also accept complete creation payloads validated by `DashboardEntitiesSchema`.
The dashboard sends these only when the creation form is confirmed. Historical empty-body calls remain
compatible; the new dashboard no longer creates placeholder rows through them.

## Paginated public ranking

`GET /v3/users/:discordID/servers/ranking` uses panel-user authentication and the shared
`PublicServerRankingSchema` contract. It accepts `limit` (10, 25 or 50), `offset`, `search`, `gameMode`
and `status` (`all`, `online`, `offline`). The response contains `servers`, `pagination` and the known
public game modes in `filters`. The existing `/servers` endpoint retains its array response.

The core model aggregates votes from the last thirty days, applies filters and stable ordering, and
paginates in MariaDB. Only the selected page's server details and seven-day daily-maximum histories
are loaded. A status is online when its snapshot is at most five minutes old; stale metadata and
historical points remain available. Invitations are resolved once per displayed community through
the Discord queue adapter, with cached successful/unavailable results.

## Status message drafts

`POST /v3/users/:discordID/guilds/:guildID/servers/:serverID/status/preview` requires the normal session,
guild-administrator and server checks. Its shared `StatusMessagePreviewSchema` contract accepts
optional draft settings and buttons, then returns the bot identity, embed fields, button rows and an
optional PNG image. Preview settings and buttons use the effective access policy, including a disabled
chart and the free custom-button limit after entitlement expiry. The worker rechecks access when
rendering a queued preview; the saved configuration remains unchanged.
The optional `simulation` flag uses five temporary fictional players and returns `simulation:true`.
Without that flag, the endpoint continues to preview the actual server state. The flag is not a
stored setting and is never used by the publication endpoints.

The endpoint enqueues `serverStatusPreview`; it does not save settings or create/edit a message.
Invalid drafts return 400 and worker timeouts return 503, allowing the editor to retry without
publishing partial changes.

## Platform administration

`/v6/admin` exposes platform statistics, paginated community/server/user/Premium directories and
administrative mutations. Every route requires the operator's own application session and membership
in the root `developers.json` allowlist; delegated support sessions are refused. Origin and CSRF checks
use the shared session helpers. Mutations validate strict payloads and record the actor, target and
reason. Server token rotation returns an acknowledgement without exposing the replacement secret.
User roles are computed from that static list. There is no HTTP endpoint to grant or edit a role.
Community/server mutations request fresh Discord permissions before modifying data; reads can use
the bounded, revision-checked permission cache.

See [the admin dashboard contract](./admin-dashboard.md) for endpoints, safeguards and the required
Premium grant migration before deployment.

## Discord side effects

`api` never imports `discord.js` directly. Anything Discord-related is enqueued via
`@gmod/infra-bullmq/discordQueueAdapters.js` and executed by `apps/discord`'s worker — see
[architecture.md — Discord boundary](../architecture.md#discord-boundary).

## Config

Reads all runtime config (ports, DB URLs, Discord tokens, ...) through `@gmod/config` — never `process.env`
directly. Default internal port: `53136` (see root [README.md](../../README.md) for the full port table and
reverse-proxy setup).

## Data

- Relational data via `@gmod/infra-prisma` (MariaDB).
- High-volume server logs via `@gmod/core/database/gm_server_logs.js` (MongoDB, through `@gmod/infra-mongo`).

## Run it

```bash
bun run dev                # tsx watch, from repo root
# or
turbo run dev --parallel   # all apps at once
```

## Request parsing and proxy peers

v6 requests are parsed with a 256 KiB decoded-body limit. Form requests also have bounded parameter
counts and nesting. Legacy transports retain their 10 MiB parser limit, followed by a shared iterative
JSON budget before schema validation or logging: depth 16, 8,192 nodes, 500 array entries and 256 keys per
object. Ordinary strings are limited to 64 KiB and total characters to 256 KiB. Only existing legacy
custom-bot routes permit a 3 MiB image string budget and legacy screenshot/bug uploads retain a 10 MiB
image budget. Query parameters have a smaller structural budget. Status configuration rejects more
than 25 buttons before validating individual entries. These checks classify paths case-insensitively,
matching Express routing. Unsupported structures return a bounded error without reflecting input.

There is no independent raw-body stream collector. A future signature protocol requiring exact bytes
must use a route-specific, size-limited parser/verify operation. Image data URLs and credentials are
redacted before request logging. HTTP/HTTPS URL rules apply to link and status-button edits as well as
creation; an invalid legacy entry can still be disabled.

Proxy trust is disabled by default. `API_TRUSTED_PROXIES` is an explicit comma-separated list of proxy
IP addresses/CIDRs or Express's named private ranges. Configure only the actual trusted immediate
peers, and prevent direct access to an origin intended for a tunnel. Global IPv4/IPv6 CIDRs and boolean
trust shortcuts are rejected. Session/request metadata and logs use the peer address resolved by
Express, not an arbitrary `CF-Connecting-IP` header.
