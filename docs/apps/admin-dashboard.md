# Internal administration dashboard

The platform back office lives at `/dashboard/admins`. It uses the website's shared dashboard shell,
controls, status badges and localized English/French wording. The index redirects to the overview;
the six pages are lazy-loaded from `apps/website/src/pages/dashboard/admins/`.

| Page        | Route suffix    | Current behavior                                                                                                                                                                                                             |
| ----------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview    | `/informations` | Separate counts for communities, game servers, Discord accounts, linked accounts, Steam profiles, memberships, active sessions and recorded Premium sources; registrations over the last seven days and community languages. |
| Communities | `/guilds`       | Search/filter the community directory, inspect effective access and its sources, and open the community's server directory.                                                                                                  |
| Servers     | `/servers`      | Filter by community, verification and visibility; inspect recent activity and addon version; edit identity/flags, rotate a token or delete a server.                                                                         |
| Users       | `/users`        | Search/filter accounts, inspect Discord/Steam identity, effective read-only role and active sessions, revoke another account's sessions or start support access.                                                             |
| Premium     | `/premium`      | Inspect recorded manual/GmodStore sources and effective access separately; add or remove a local manual grant.                                                                                                               |
| Support     | `/impersonate`  | Select an account and confirm temporary access with that account's permissions; return to the operator account when delegated.                                                                                               |

`/stop-impersonate` is the return helper, not an additional administration page. IDs remain strings and
copyable. User identity uses Discord avatars and read-only `@name` mentions, with an ID fallback when
the name is missing.

## Authorization and session boundaries

[`AdminAccessGuard`](../../apps/website/src/components/AdminAccessGuard.tsx) waits for the shared cookie
session and verifies `GET /v6/admin/access` before mounting protected page content. Its acknowledgement
must name the current Discord account, and verification is bound to the current application session ID.
The operator must use their own session and belong to the root
[`developers.json`](../../developers.json) allowlist. That file is the sole source of platform developer
privileges and currently contains only Discord ID `333650866747867137`. Database ranks, Discord roles
and environment variables cannot grant this access. The server projects an effective `developer` or
`user` rank into session/user DTOs; the browser displays that result and never imports the allowlist.
A delegated session cannot open platform administration, even when its target is a developer. The
return routes remain available while delegated.

The guard refreshes on focus. A definitive 401/403 removes the protected view. A temporary verification
failure preserves already-mounted editors and exposes retry feedback; an initial failure does not mount
the pages. Cached profile data, navigation visibility and localStorage flags grant no authority.

Every `/v6/admin` request independently passes
[`adminSession`](../../apps/api/src/middleware/v6/adminSession.ts): trusted-origin validation, a valid
application session, the session request/CSRF contract and the server's developer allowlist check.
Both delegation markers (`actorDiscordID`, `actorSessionID`) are rejected. Responses use `Cache-Control: no-store`.
Website mutations use the normal authenticated HTTP client and `X-CSRF-Token`; failed mutations are
never replayed automatically.

The server-only `@gmod/config/developers.js` module reads and validates the checked-in list once on
import. After changing it, redeploy/restart all backend services and replicas, including the API,
WebSocket gateway, Discord processes and workers, so no process retains the previous list. There is
no dashboard role editor or rank mutation endpoint.

## Data and pagination

[`AdminDashboardSchema`](../../packages/schema/src/admin/AdminDashboardSchema.ts) defines strict request
schemas and safe response DTOs. The thin
[`adminRoutes`](../../apps/api/src/routes/v6/adminRoutes.ts) router delegates reads and server/Premium
commands to [`adminDashboard`](../../packages/core/src/models/v6/adminDashboard.ts), and account commands
to [`adminUserManagement`](../../packages/core/src/models/v6/adminUserManagement.ts).

The directory endpoints are `GET /v6/admin/{guilds,servers,users,premium}`. They accept flat
`offset`, `limit`, `search`, `sort`, `orderBy` and resource-specific filters, returning
`{ items, total, query }`. Page sizes are 25, 50, 250 or 500; search is limited to 100 characters and sort
fields are allowlisted. The server clamps an out-of-range offset to the last valid page and uses a
stable ID tie-breaker. Filtering/searching/sorting resets the offset; pagination preserves the filters.
The browser never paginates a previously fetched partial list.

The user directory's `rank=user|developer` filter matches IDs against the same allowlist, independently
of the stored `gm_user.rank`. Database rank is not an allowed user sort field.

[`adminApi.ts`](../../apps/website/src/pages/dashboard/admins/adminApi.ts) shares request handling and
`createAdminList`; `AdminListToolbar` shares search, filters, sorting and refresh. Row schemas validate
received data. Shared `Pagination` sits in the panel footer outside the table's horizontal scroll area.
Loading, an empty result and a failed request have distinct presentations and retry controls.

Projections exclude credentials, tokens, raw purchase transactions and server network coordinates.
Session aggregates and Redis metadata are fetched for the requested page rather than one remote
request per row. Cached avatar URLs are optional and do not trigger individual Discord profile calls.
Effective community access is resolved on inspection through `GET /v6/admin/guilds/:guildID`, not for
every list row.

The overview comes from `GET /v6/admin/overview`. Membership counts can include the same person in
several communities; they are not an additional unique-user total. Recent registrations are counts
over seven days, not a historical time series. User last activity comes from active-session metadata.
Server activity means a cached request within two minutes, not confirmed live WebSocket presence;
unavailable or malformed cache data remains unknown.

## Changes, confirmations and audit events

Business edits use explicit drafts and Save/Cancel. Command confirmations name the target and explain
the consequence. Server edits, deletion, token rotation, session revocation and manual
Premium changes require a trimmed reason of 5–500 characters. Deletion, token rotation and account
session revocation additionally send `confirm` matching the target ID.

| Command                 | Endpoint under `/v6/admin`            | Successful acknowledgement                                                             |
| ----------------------- | ------------------------------------- | -------------------------------------------------------------------------------------- |
| Edit server             | `PATCH /servers/:serverID`            | The updated safe server DTO.                                                           |
| Delete server           | `DELETE /servers/:serverID`           | `{ deleted: true }`.                                                                   |
| Rotate server token     | `POST /servers/:serverID/reset-token` | `{ reset: true }`; the replacement secret is not returned.                             |
| Revoke account sessions | `POST /users/:userID/revoke-sessions` | `{ revoked: true }`.                                                                   |
| Change manual Premium   | `PUT /guilds/:guildID/premium`        | `{ guildID, manualPremium, access, pending }` matching the submitted target and grant. |

The UI validates command acknowledgements before closing or displaying success. A failed request or
malformed success response preserves the draft/confirmation for retry. Pending work blocks duplicate
requests, dismissal and navigation. `ConfirmActionDialog.disabled` gates confirmation; its optional
`children` can be a render callback receiving the pending accessor, so reason fields are disabled while
the command runs. See the [UI catalogue](./website-ui.md#existing-components-to-reuse).

Roles remain read-only: `developer` means the account is in the root allowlist, and every other account
is projected as `user`, including legacy database ranks. The platform operator manages developer access
through deployment configuration. Operators cannot use the admin command to revoke their own sessions.
Account session revocation includes delegations originating from the target and uses the existing
session-revocation lifecycle.

Successful administration commands emit structured `gmLog('admin', ...)` events with action, actor,
target and reason. These are log events; the back office does not expose an audit-history directory.
Token rotation and deletion reuse the existing server domain methods; the owner reconnects through the
ordinary server configuration.

## Temporary support access

Support uses the existing auth commands rather than an admin credential exchange:
`POST /v6/auth/impersonations` starts delegation and `POST /v6/auth/impersonations/end` restores the
operator. Starting requires the operator's own live session, an ID in the server's root developer
allowlist and a different registered account. A stored database rank cannot authorize this command.
The confirmation explains that access uses the target's permissions.

The delegated session lasts at most 15 minutes, bounded further by the remaining operator-session
lifetime. Actor markers link it to the originating session; the operator credential stays in an
HttpOnly actor cookie. No target credential is copied into browser storage or a URL. Starting, ending
and recovering support access emit structured auth events. These auth commands do not take the admin
mutation reason field.

While delegated, the support view renders only the return action and does not request the user
directory. `/stop-impersonate` attempts the return automatically and retains a retry action after
failure. The shared auth client validates the returned session before adopting it and supports the
actor-session recovery challenge when the delegated session has expired. Delegation grants no platform
administration privilege.

## Premium sources and deployment

List flags and the `manual`/`gmodstore`/`none` filters describe recorded active grants only. “No active
recorded grant” does not establish that the community lacks Discord Premium. The details view uses the
access resolver's snapshot for effective Premium and keeps unknown provider access distinct from a
confirmed negative result.

The manual command changes only the local legacy grant. Granting creates/reactivates its
`gm_guild_premium` row; removing sets `revoked = true`. It preserves transaction/buyer evidence and
does not revoke Discord entitlements or GmodStore purchases. Cache invalidation and access resolution
follow the write. `pending: true` means the local change was saved but effective access could not yet
be confirmed; the UI retains that distinction and permits an explicit access refresh.

Apply
[`20261122160000_revoke_manual_premium_grants`](../../packages/infra-prisma/migrations/20261122160000_revoke_manual_premium_grants/migration.sql)
and regenerate the Prisma client before deploying code that reads/writes `gm_guild_premium.revoked`.
The migration adds a non-null boolean with default `false`, preserving existing grants. The shared
access resolver and administration queries exclude revoked local grants; this is a non-destructive
grant migration, not deletion of purchase records.
