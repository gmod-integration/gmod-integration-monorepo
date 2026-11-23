# `apps/website`

SolidJS + Vite frontend: public marketing site and the user/guild/server dashboard. Talks to `apps/api` (HTTP)
and `apps/websocket` (live status/notifications).

## Structure

```text
src/
  index.tsx           Vite/SolidJS entry
  app/
    App.tsx            top-level router/shell
    AppDashboard.tsx    dashboard shell (guild/server management)
    AppAdminDashboard.tsx  internal admin views
  pages/
    Home.tsx, Login.tsx, Logout.tsx, Account.tsx, PlayerProfile.tsx, Servers.tsx, Premium.tsx, Notifications.tsx, ToDo.tsx,
    NotFound.tsx
    legal/             French/English legal content and shared accessible document renderer
    dashboard/          dashboard sub-pages
  components/
  middleware/           client-side route guards
  locales/               UI translations
  config.ts              runtime config (API/WS base URLs)
  i18n.tsx
```

## Navigation and loading

The website's shared controls and interaction contracts are listed in the
[UI component catalogue](./website-ui.md). `components/ui/index.ts` is the entry point for generic
controls; `AdminPanel`, `AdminModal`, the selectors and pagination remain the shared feature shells.

`App.tsx` provides a skip link and main landmark, with a compact header on dashboard routes and the
public footer elsewhere. Community/server management and admin views share an application shell with
grouped sidebar navigation, saved collapse preference, mobile navigation and contextual breadcrumbs.
Shared panels, controls and tables use the light/dark visual system in `src/styles/dashboard.css`,
scoped to the site shell. Public page layouts in `src/styles/site.css` reuse these tokens and controls.
Community and server selectors display searchable identity cards and handle loading, empty results and
request failures. All UI icons use the shared Lucide SVG registry; icon fonts are no longer loaded.

The public header has collapsible mobile navigation and mutually exclusive navigation, language and
account menus. The home, premium and ranking pages share heading, card and action patterns. Account
settings reuse dashboard panels and tables; notifications use a responsive list with pending/error
feedback. `ButtonLink` preserves native navigation semantics while matching `Button`, and `PageState`
provides the authentication, redirect and missing-page presentation. The footer uses a single landmark.
Dates and numbers follow the selected UI locale.

Dashboard settings use shared `SettingGroup`/`SettingRow` layouts, with global behavior separated from
rule lists and channel actions kept beside their destination. Server configuration groups the options
by purpose and supports translated search and category filters. Advanced options and defaults use
native disclosures; filtering preserves values and pending saves. Status player-list formatting appears
under its enabled list option. Sensitive server actions are separated from routine identity editing.

The public home, authentication pages and layouts are available immediately. The remaining route pages
use Solid's `lazy` imports, with a translated `Suspense` fallback inside the main content area so the
header and footer remain available while a page loads. Home statistics show placeholders during their
request without suspending the landing page. `JsonViewer` registers only the JSON syntax highlighter,
keeping unrelated language definitions out of the generated chunks.

The homepage uses the Console hero and Ribbon statistics without visitor-facing design selectors.
The integration preview tabs remain interactive. Statistics show non-negative safe integer totals in
the selected locale; invalid or missing totals stay unknown. The ribbon becomes label/value rows on
narrow screens so translated labels and large numbers remain readable.

## Internal administration

`/dashboard/admins` provides the overview, communities, servers, users, Premium and support pages.
The shell verifies the operator's own developer session with the v6 API before mounting protected
content; delegated sessions retain the return action without gaining platform administration access.
Directories use server pagination and shared search/filter controls. Business commands require explicit
confirmation or Save/Cancel, and failures preserve drafts. See the
[admin dashboard contracts](./admin-dashboard.md) for authorization, API shapes, audit reasons, support
session limits and the non-destructive manual Premium migration.

## Server ranking

`/servers` requests the authenticated, paginated `/v3/users/:discordID/servers/ranking` endpoint.
It displays 10 servers by default (25 and 50 are available), with search, game-mode and online-state
filters. Changing a filter resets the page. The first three results on page one are highlighted without
duplicating them in the remaining list; ranks use votes from the last thirty days.

Each card includes a seven-day chart of daily peak player counts. Historical activity and the last-known
map/mode remain visible after the server goes offline. Missing days remain gaps, and an empty history
has an explicit placeholder. Discord buttons use validated invitations returned by the worker; missing
permissions disable the invitation button without hiding the server.

## Player profiles

Authenticated users can open `/profile` for their linked Steam player or `/players/:steamID64` for
another recorded player. The account menu and linked Steam card open the user's profile; player names
and profile actions in the server player directory open the corresponding player's profile.

Profiles display the stored trust score out of 100 (including zero; unavailable scores stay unknown),
aggregate playtime, kills, deaths and connection counts, and paginated per-server statistics. The owner
can see all their recorded servers; other users see only public servers. Summary totals and activity
dates use that same visibility filter, and another player's displayed name comes from a visible server.
The page explains this visibility and handles missing Steam links, missing players, errors and empty
statistics separately. Dates and numbers follow the selected language. Last activity is the last stored
statistics update, which may include administrative edits; it is not live player presence.

## Discord status preview

The server status page shares a draft between its settings and button editors. A 250 ms debounce
requests the bot's serialized status render, with stale responses ignored after edits or navigation.
The preview is also visible inside the format/button dialogs and the channel-send confirmation.
On wide screens the settings and buttons sit on the left and the preview stays on the right; smaller
screens stack them. The editor requests simulation mode with five clearly marked fictional players,
so the player-list format can be tested even when the game server is offline. These players exist
only in the preview; publication always reads the actual game-server status.

Typing, toggling options and selecting a destination do not publish the draft. Settings and buttons
are applied only after an explicit save, and creating the message requires the separate send action.
These actions wait for the current preview to finish successfully. Canceling a dialog restores its
previous draft, and preview buttons cannot open links or launch the game.

## Privacy controls

Account data management includes a confirmed v6 erasure request and receipt-only progress tracking.
The browser generates and stores its request ID and recovery credential before submission, so a lost
acknowledgement can be recovered after session revocation. `pending`/`running`/`retry` do not display a
success message; only `completed` does. Polling is bounded and can be resumed explicitly. Confirmed
acceptance clears account data and sockets while retaining preferences and the recovery receipt. A
non-secret storage event asks other tabs to revalidate their cookie session, including tabs without a
live WebSocket. Delegated sessions cannot request account erasure.
See [domain-compliance](../packages/domain-compliance.md) for cleanup scope, retention and deployment.

The legal documents at `/legal/terms` and `/legal/privacy` follow the selected UI language for French,
with English as the fallback for other languages. Their revision date is explicit rather than the build date.
Their shared renderer includes a collapsible table of contents, anchored sections and horizontally
scrollable data tables; presentation changes do not alter the document content.

The website does not initialize browser Sentry monitoring or load Google AdSense. Optional tracking must not
be reintroduced before the required prior consent and withdrawal controls exist and the notice is updated.
Server-side Sentry diagnostics have separate configuration and remain covered by the privacy notice.

Legal content must stay aligned with verified operator details and operational data handling policies;
the published text alone does not establish GDPR compliance.

## Auth model

Discord OAuth creates an application session held in an HttpOnly cookie. `AuthProvider` bootstraps
identity, session deadlines, the optional delegation actor and a CSRF token from `GET /v6/auth/session`.
The server snapshot supplies login/admin state; cached profile or selection data cannot authenticate
the browser. `Header` displays this state and does not run a separate authentication lifecycle.

Authenticated HTTP requests go through `utils/authClient.ts`: `authenticatedFetch` sends cookies,
adds `X-CSRF-Token` to mutations and coordinates session recovery across v3/v6 callers. A failed GET
can retry once after session validation; mutations are never replayed automatically. Only a definitive
session 401 clears identity. Network errors and 503 responses retain the session and mounted editors;
permission 403 responses do not sign out. `discord_reauth_required` offers Discord OAuth in a new tab
so the current draft stays mounted. A denied OAuth callback requires an explicit retry.

The OAuth callback returns to `/login` without credentials in the URL. Historical URL credentials are
removed immediately and ignored. A pre-existing localStorage token can be converted once through
`POST /v6/auth/legacy-session`; successful conversion removes the durable token and old expiry fields.
A rejected conversion checks the cookie again before signing out, covering another tab completing the
conversion first. New application requests never send a durable Bearer token.

Login, logout, delegation and accepted account erasure publish a non-secret `gmi:auth-event` storage
notification. Other tabs reread their cookie rather than trusting an identity in the event. Superseded
requests are aborted and stale acknowledgements are ignored. Focus, visibility, connectivity and the
session deadline also trigger validation. Logout reports when server revocation could not be confirmed.
The account page lists and revokes session IDs without exposing credentials; delegation switches the
cookie session and uses the server's actor marker when returning to the operator account.
When a delegated session expires, a valid operator cookie can return a 401 recovery challenge with
`actor_session_available` and an operator CSRF token, without exposing identity. The shared session
client submits that challenge to `POST /v6/auth/impersonations/end` and adopts only its validated
session DTO. A revoked operator signs out; a temporary recovery failure keeps the editor mounted and
allows retry. Successful recovery notifies other tabs about the changed cookie.

Each WebSocket connection requests a fresh short-lived ticket through the CSRF-protected
`POST /v6/auth/ws-ticket`. The URL carries the ticket and selected scope, with no durable token or
Discord identity. Reconnect uses bounded exponential backoff with jitter, obtains a new ticket and
rechecks session revocation. Discord authorization failures stop retries until authorization is
restored. See [apps/websocket](./websocket.md) for the server-side scope checks.

The account-erasure receipt is a separate recovery credential: its receipt-only status request retains
its own Bearer header after the application session is revoked.

## Run it

```bash
bun run website:dev   # vite --host
```

Vite uses the port configured in `WEBSITE_URL` (3000 when the URL has no explicit port), with
`strictPort` enabled. It fails on a collision instead of silently moving the website away from the
OAuth return URL. `OAUTH_REDIRECT_URL` must point to `/login` on that website origin. For concurrent
local development, set `APP_PORT=3002` in `apps/webhook-relay/.env` to keep the relay separate.
