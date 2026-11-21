# `@gmod/domain-auth`

Application sessions and Discord OAuth credentials have independent lifetimes. A provider outage or
rejected Discord grant does not revoke a dashboard session. Operations requiring Discord permissions
return `503 provider_unavailable` during a temporary failure or `403 discord_reauth_required` when the
grant must be renewed. Only an invalid application session returns `401`.

## Session contract

New credentials are 32 random bytes. SQL stores their SHA-256 digest, never the raw credential. The API
sets a host-only, HttpOnly, SameSite=Lax cookie, prefixed `__Host-` and Secure on HTTPS. Deployment must
keep the website and API on the same site; an arbitrary cross-site frontend is not supported by this
cookie policy. Configure their exact public origins in `WEBSITE_URL` and `DOMAIN_URL`.

The default absolute lifetime is 30 days and the inactivity deadline is 7 days, bounded by that absolute
deadline. Valid requests renew inactivity at most once per minute. The cookie expires at the absolute
deadline; SQL remains authoritative for inactivity, revocation and erasure. Session reads never issue
cookies, so an older response cannot overwrite a more recent login cookie.

Cookie-authenticated mutations require the current `X-CSRF-Token` from `GET /v6/auth/session`, as well as
an allowed Origin when supplied. Historical explicit Bearer clients remain supported through the same
session resolver. Session lists contain device metadata, dates and `isCurrent`, without credentials.
Logout revokes the presented session and its delegates. Revocation is persisted before best-effort
Redis publication; gateways also revalidate SQL state periodically.

The browser exchanges an existing, valid localStorage credential through the JSON-only
`POST /v6/auth/legacy-session` endpoint. A conditional write rotates it once into a hashed session.
Expired, revoked and already migrated credentials cannot be exchanged. A different signed-in account
cannot be replaced through this route. Browser URL credentials are ignored and removed. Historical
rows retain their original deadline until this explicit owner exchange or a new Discord login.

## OAuth and provider refresh

`oauthState.ts` stores a ten-minute, one-use state record in Redis, bound to an HttpOnly browser cookie
and a PKCE S256 verifier. Callback redirects accept only an internal website path. Authorization codes,
verifiers, state and credentials must be redacted from request logs. Login returns the session cookie;
the frontend redirect contains no application credential.

`discordOAuth.ts` validates token responses, encrypts credentials with AES-256-GCM and account/type
associated data, and performs refresh through a local single-flight operation plus an owned Redis lease.
Conditional SQL writes check both the credential version and the refresh credential, so a late response
cannot overwrite a concurrent login. A genuine `invalid_grant` removes only the rejected version.
Network errors, malformed responses, 429 and 5xx retain credentials and schedule bounded retry with
backoff and Retry-After support. A usable access token remains available during a failed early refresh.

Only API startup explicitly starts the refresh worker, after database readiness. It scans ordered
batches of 20 with concurrency 4, schedules the next pass after completion, and drains active work before
Redis/Prisma shutdown. Importing a domain module starts no worker. Requests can also refresh on demand.

`AUTH_TOKEN_ENCRYPTION_KEY` is an optional, stable secret of at least 32 characters shared by all services
that use this package. Without it, the key is derived from `DISCORD_CLIENT_SECRET` for compatibility.
Configure the dedicated key before first deployment when possible. Changing either active key material
requires explicit re-encryption or renewed Discord authorization; adding the dedicated key later is also
a key change. Existing plaintext provider credentials remain readable and are encrypted on rotation or
login. The migration does not eagerly rewrite existing credentials.

## WebSocket and delegation

The browser obtains a single-use ticket from `POST /v6/auth/ws-ticket`. Redis stores its digest for at
most 30 seconds; consumption revalidates the application session. The gateway accepts `?ticket=...`,
without durable application credentials in its URL. See [the gateway contract](../apps/websocket.md).

Developer impersonation creates a distinct session lasting at most 15 minutes and bound to the actor's
session. The original actor credential stays in a separate HttpOnly cookie. Start, end and delegated
requests log actor, subject and session ID without credentials. Delegates cannot erase an account,
manage its sessions or start another delegation. Revoking/erasing the actor also invalidates delegates.

## Deployment procedure

This release changes persisted credentials and the browser/gateway protocol. Do not mix old and new
services: old binaries cannot read newly encrypted grants or hashed application credentials.

1. Back up the database and keep the existing encryption material available for recovery. Configure
   stable auth key material and the correct website/API/WS origins on all services.
2. Prepare the release with `bun install --frozen-lockfile`, `bun run prisma:generate`,
   `bun run build` and `bun run --cwd apps/website build`.
3. Stop the old API, Discord workers and WebSocket gateways, including any process that imports the
   old automatic refresh timer. Keep the previous website from issuing authenticated traffic during
   the transition.
4. Apply the checked-in migrations with `bun run prisma:migrate:prod` against the intended database.
   The migration `20261121170000_auth_sessions` adds session deadlines/actor fields and provider
   credential versioning, and widens encrypted token columns. Never use `prisma:reset` for this upgrade.
5. Start all backend services from the same new release, then publish the matching website. Verify
   login, legacy conversion, a CSRF-protected save, two browser tabs, logout and gateway reconnection.
   Check refresh-worker errors and provider retry behavior before resuming normal traffic.

The code change prepares this procedure; it does not apply migrations or alter a running deployment.
After new encrypted/hashed writes, rolling back binaries alone is insufficient. Restore a consistent
database/release backup or use a reviewed forward repair; do not restore erased personal data.

Configuration: `AUTH_SESSION_ABSOLUTE_TTL_SECONDS` defaults to `2592000` (minimum 300),
`AUTH_SESSION_IDLE_TTL_SECONDS` defaults to `604800` (minimum 60, clamped to the absolute lifetime).
Both are validated and capped at one year. See [config](./config.md).
