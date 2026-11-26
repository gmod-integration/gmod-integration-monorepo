# `@gmod/domain-user`

Player and dashboard-user identity.

## Files

- `User.ts` — the `User` class: `steamID64` + `discordID` + effective `rank` + `trustLevel` + last verification date.
  This is the in-game/verified-player identity, independent of whether that person ever logs into the
  dashboard.
- `PanelUser.ts` — the `PanelUser` class: wraps a `User`, the exact application `authSession`, and a
  compatibility `panelToken` view. HTTP middleware passes the resolved session; WebSocket clients receive
  it from their single-use handshake ticket. Provider credentials are resolved when needed through
  `@gmod/domain-auth`; refresh tokens are not stored on `PanelUser`.
- `dashboardAccess.ts` — shared community/server dashboard authorization and discovery, independent
  of commercial capability checks.
- `privacy.ts` — account-erasure checks, minimized retained trust, and explicit OAuth reactivation after
  completed erasure. Ordinary token refreshes cannot reactivate an erased account.
- `purchasePrivacy.ts` — pseudonymous purchase keys for preserving a community entitlement after its
  former owner's personal data is erased.

## Application sessions and Discord authorization

`getPanelUserFromDiscordID(discordID, token?, resolvedSession?)` preserves the presented session identity.
Request handlers supply the credential and/or resolved session instead of selecting the account's newest
session. A session for a different Discord account is rejected. The no-credential lookup exists for
internal account-based callers; it is not an HTTP authentication check.

`authAllowed(token)` and `isValidPanelToken(token)` validate the application session and erasure state
through [`@gmod/domain-auth/authSessions.ts`](../../packages/domain-auth/src/authSessions.ts). They do not
contact Discord or require a current Discord grant. Cookie/bearer extraction, origin checks and CSRF
protection for cookie-authenticated writes belong to the API middleware and the shared session service.
New application credentials are hashed in storage, and session-list DTOs do not return bearer tokens.

`getDiscordToken()` is asynchronous and obtains usable provider credentials from
`@gmod/domain-auth/discordOAuth.ts`, including refresh when needed. A definitively rejected grant becomes
HTTP `403` / `discord_reauth_required` for dashboard operations. Temporary provider failures remain
retryable `503` errors. Neither condition revokes an otherwise valid application session.

## Platform developer access

The root [`developers.json`](../../developers.json) is the sole authority for platform developer
privileges. It currently contains only Discord ID `333650866747867137`. The server-only
`@gmod/config/developers.js` helper supplies `isDeveloper(discordID)` and
`getPlatformRank(discordID)`, projecting `developer` for listed IDs and `user` for every other account.
`User.rank` and `User.isDeveloper()` use this helper; a stored `gm_user.rank` or a legacy constructor
rank does not grant privileges. No additional platform roles are defined.

Session and admin-directory DTOs expose this effective rank for display. Browser code consumes the DTO,
never the allowlist or its filesystem reader. Administration and the start of support delegation check
the server allowlist independently of frontend presentation; the dashboard cannot edit ranks.

The helper loads the list once per process. After changing it, redeploy/restart all backend services
and replicas, including the API, WebSocket gateway, Discord processes and workers. See the
[configuration contract](./config.md#platform-developer-allowlist).

## Returning from a delegated session

Developer impersonation uses a short-lived primary session linked to the actor's original session. The
start command requires the actor's own live session and an ID in the server developer allowlist. Its
duration is at most 15 minutes, bounded by the remaining actor-session lifetime. The original credential
stays in a separate HttpOnly actor cookie. If the delegation expires or its primary
cookie disappears, `GET /v6/auth/session` returns `401` / `actor_session_available` and an actor CSRF token
when that original session remains valid. This response exposes no identity and does not set cookies.

`POST /v6/auth/impersonations/end` explicitly restores the actor cookie as the primary session. A still-valid
delegation must match that actor and supply the delegation's CSRF token; an absent or expired delegation
requires the actor's CSRF token instead. A valid normal primary session or a delegation linked to another
actor cannot be replaced through this endpoint. Revoked or expired actor sessions cannot be recovered.

Logout from a delegation revokes its matching parent as well as the delegated session before clearing
both cookies. After delegation expiry, logout requires the actor CSRF token and revokes the actor and
its delegated children. A successful legacy-session migration clears any old actor cookie.

## Guild permissions

`findGuilds()` checks the current Discord grant before returning any cached rights. Guild lists are cached
in Redis for 120 seconds. On a miss, an owner-token lock uses `SET NX PX` with a 30-second lease, a
three-second wait deadline, and conditional owner-only release. Discord guild requests time out after
eight seconds; an HTTP `401` triggers one credential refresh and one retry.

Rate limiting, provider/network failures and malformed provider payloads fail as
`GuildPermissionsUnavailableError` (`503`, `provider_unavailable`) rather than an empty permission list.
A guild-list `429` stores Discord's `Retry-After` deadline in Redis and exposes the remaining delay on
the error. Both new requests and lock waiters check it before calling the provider; API responses retain
the `Retry-After` header. Expired or invalidated rights are never served to work around a provider outage.
A repeated provider `401` requires Discord reauthorization. If erasure starts during a lookup, fetched
personal data is not cached or returned.

`findGuildsWithPerms()` accepts guild owners or the Discord administrator permission, using `BigInt` for
permission bitfields. `isAdminOfGuild(guildID)` remains a Discord-only permission lookup.

Dashboard access uses `canAccessDashboardGuild` instead: the subject must have both Discord
administrator permission and a linked Steam account whose recorded server rank is enabled (`true`)
in that server's `ig_adminRank` map. Community scope requires an administrator rank on at least one
of its servers; server scope requires the rank on that exact server. A missing setting defaults to
`superadmin: true`; a malformed or explicitly disabled entry grants nothing. Rank checks use the
last value reported by the addon in `gm_server_stat`, without requiring an online player.

`resolveDashboardAccess` returns the same policy decision with a safe refusal reason defined by
`@gmod/schema/user/DashboardAccessSchema.js`. The boolean helper remains available for sockets and
discovery. Missing or foreign server scopes use the same `scope_unavailable` result; diagnostics
never disclose recorded ranks, configuration, owner identities or purchase details. External failures
remain exceptions and are not converted into missing-permission decisions.

The Discord community owner and the buyer of an active GmodStore purchase linked to that exact
community are separate exceptions to the dual-administrator requirement. Purchase ownership uses
the account's current durable Steam link, never the GmodStore account ID or a purchase from another
community. These checks reread the link, purchase, settings and ranks from the database. Buyer rights
remain verifiable during a Discord permission outage; unknown owner/admin rights never grant access.
`findDashboardGuilds` applies the same rule to community discovery, including linked buyer communities.
Platform developer status adds no community exception, and delegated sessions use the subject's rights.
The [WebSocket gateway](../apps/websocket.md) adds its own bounded permission snapshot and revalidates sessions
before messages and delivery.

Dashboard mutations use `canAccessDashboardGuild(panel, guildID, { fresh: true, serverID? })` to bypass
cached Discord rights as well. API callers pass a `permissionScope` object for the current request;
`PanelUser.findGuilds` receives it as `requestScope` and reuses verified Discord facts within that scope.
It still rechecks the grant, privacy barrier and permission revisions, while every policy decision rereads
durable purchase/rank/server data. Cached read facts cannot satisfy a fresh mutation check.

Read caches carry user and per-guild revision vectors from `guildPermissions.ts` for all OAuth memberships,
including communities where the account is not yet an administrator. Role/ownership changes invalidate
affected memberships without invalidating unrelated communities. A global epoch detects changes during
provider lookups whose membership scope is not yet known. Guild revision and epoch updates are atomic;
an invalidated in-flight result cannot restore old permissions. Old cache formats are discarded.
Gateways check durable revisions before scoped delivery and conservatively invalidate when membership
scope cannot be read. Provider failures honor the shared retry deadline before another lookup.

## Depends on

`@gmod/config`, `@gmod/domain-auth`, `@gmod/infra-prisma`, `@gmod/infra-redis`, `@gmod/schema`.

## Used by

`apps/api`, `apps/websocket` (dashboard connections), `@gmod/domain-guild`,
`@gmod/domain-compliance` (GDPR requests operate on a `User`).
