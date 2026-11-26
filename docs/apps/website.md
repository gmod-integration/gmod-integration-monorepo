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

A confirmed dashboard authorization refusal opens `DashboardAccessHelpModal` once while keeping the
editor mounted, hidden and inert. Its safe API reason explains the missing Discord permission, Steam
link or game administrator group. The translated procedure links to Account, identifies who can grant
each permission, and explains joining then leaving the game once to synchronize a changed group.
The owner and active linked GmodStore buyer exceptions remain explicit. Rechecking is read-only and
preserves the draft; a successful check closes the dialog and restores the same editor. The user can
dismiss and reopen help without repeated background prompts. `authenticatedFetch` forwards policy
refusals from writes as well as reads only to the matching community/server and session. Provider,
reauthorization and commercial failures do not trigger this permission procedure.

Community discovery opens general access guidance after a successful empty result and always offers
a help button. Filtering an existing list to zero results or failing to load communities does not open
that dialog. A successful recheck closes it when an accessible community appears. The guidance neither
assigns permissions nor displays inaccessible communities or private administrator configuration.

The public header has collapsible mobile navigation and mutually exclusive navigation, language and
account menus. The home, premium and ranking pages share heading, card and action patterns. Account
settings reuse dashboard panels and tables; notifications use a responsive list with pending/error
feedback. `ButtonLink` preserves native navigation semantics while matching `Button`, and `PageState`
provides the authentication, redirect and missing-page presentation. The footer uses a single landmark.
Dates and numbers follow the selected UI locale.

GWSockets guidance is shown until the selected Garry's Mod server's WebSocket connection is
confirmed. A matching server-status reply and an open dashboard transport hide the notice; browser
connectivity alone does not. Server changes and disconnects show it again until confirmation.
The notice polls status on pages that need it, sharing throttled requests with connection details.
Installation guidance states that WebSocket is mandatory for the entire addon.

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

## Rewards

The server Rewards page manages Premium reward rules, integration reports, dry-run eligibility,
confirmed manual attribution and paginated per-action history. Entity editors retain complete drafts
and optimistic revisions; access suspension still permits disabling/deleting saved rules. See the
[Rewards contracts](../features/rewards.md) for delivery and lifecycle details.

## Live server console

`/dashboard/guilds/:guildID/config/servers/:serverID/console` opens a live console for the selected
server. It requires the existing `console.rcon` capability and server administration rights. The page
subscribes over the shared dashboard WebSocket, renews every 10 seconds while mounted and
unsubscribes on navigation, pagehide, scope change, socket replacement or access loss. Restoring the
page or reconnecting starts a fresh subscription. Other dashboard pages are not console subscribers.

`ServerConsole.tsx` renders incoming chunks as text, preserves their line breaks, keeps at most
2,000 lines / 128 Ki characters, and supports follow/clear. It ignores other servers and malformed
packets and shows explicit pending/offline/denied/unavailable states. A gateway acknowledgement
confirms subscription only; a compatible updated addon is required to produce console messages.
The capture covers Lua `print`, `Msg`, `MsgN` and `MsgC` rather than native engine/binary output.
For a Lua-output check, submit `lua_run print("Gmod Integration Lua output")` from the command field;
the printed text appears in the live stream. Native commands such as `status` can execute without
their native output appearing in this viewer.
There is no persisted console history. See the [gateway lifecycle](./websocket.md#temporary-server-console-viewers)
for last-viewer shutdown and the 30-second fallback after abnormal network loss.

The command form captures the current server, account session, request UUID and validated single-line
command when submitted. Pressing Enter or the execute icon to the right of the input posts directly to
`/v6/guilds/:guildID/servers/:serverID/console/commands`; page loading and reconnection never execute a
command. Dashboard access requires Discord administrator permission and an enabled in-game rank on
the target server, except for the Discord owner or the buyer of an active purchase linked to that
community. The API checks the linked Steam account's recorded rank without requiring an online player.
Authorized support sessions use their authenticated operator as the
actor while retaining the subject account's server permissions. The API derives that identity,
enforces fresh community permissions and `console.rcon`, and reserves the request across replicas
for ten minutes, bound to the actor, subject, server and command digest. Confirmed outcomes are accepted, rejected or
uncertain; only a matching addon acknowledgement confirms console submission, without promising
command effects or captured native output. A timeout is never automatically replayed. Failed or
uncertain actions preserve the draft; successful submission clears it only if it still matches the
submitted draft. No command history is persisted in the browser and command bodies are redacted from
API request logs.

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

Cards show independent Premium and Partner badges for their Discord community. Premium comes from
the shared entitlement resolver; unavailable verification does not award the badge or hide the card.
Partnership is assigned in the platform administration community directory and applies to all listed
servers belonging to that community. Both badges can appear together without changing vote order.

Each card includes a seven-day chart of daily peak player counts. Historical activity and the last-known
map/mode remain visible after the server goes offline. Missing days remain gaps, and an empty history
has an explicit placeholder. Discord buttons use validated invitations returned by the worker; missing
permissions disable the invitation button without hiding the server.

## Map viewer

Map is a private server-dashboard page at
`/dashboard/guilds/:guildID/config/servers/:serverID/map`, linked from the server Activity menu.
The former public `/map` page and public-ranking map links have been removed.
The page reads the selected server's map through the authorized `/v3/users/:discordID/guilds/:guildID/servers/:serverID/map`
endpoint and embeds Map Forge at
`https://map-forge.linv.dev/api/embed/<name>?view=3d&theme=<resolved-theme>&labels=1`.
Map names come from the server snapshot, with no arbitrary picker, query override or default map.

The page focuses on the viewer, with reload and external-open actions in its header. Server status,
mode, player counts and update timestamps are not displayed here. Absent or invalid map names have
an empty state. Visible pages poll every fifteen seconds and clean up requests/timers on unmount.
An unchanged map preserves the iframe and its camera during automatic refresh. Map changes, theme
changes and explicit viewer reloads replace it; manual reload first reads the selected server's map.

Viewer styles are imported directly from the lazy page's colocated `ServerMap.css`, so stale global
CSS import expansion in the dev server cannot leave the map unstyled. The responsive viewport has a
minimum height, and explicit iframe width/height attributes prevent the native 150 px height even
before styles are applied.

The embed supplies 2D/3D controls, loading feedback and render errors. Only maps published on Map Forge
can render; iframe load is not treated as proof of success. The page has no player-position markers
yet. The addon currently records positions only with status snapshots every forty to fifty-five
seconds; the external embed also needs a marker-message bridge before it can display player telemetry.

## Player profiles

Authenticated users can open `/profile` for their linked Steam player or `/players/:playerID` with
either a Steam ID64 or a linked Discord ID. The page also provides an ID lookup. Explicit
`/players/steam/:steamID64` and `/players/discord/:discordID` links disambiguate numeric IDs;
automatic lookup prefers a known Discord account before treating an unmatched seventeen-digit ID
as Steam. The account menu and linked Steam card open the user's profile; player names and profile
actions in the server player directory open the corresponding player's profile.

Profiles display aggregate playtime, kills, deaths and connection counts, and paginated per-server
statistics. The stored trust score remains available to internal account/API logic but is not shown
on the player profile. The owner
can see all their recorded servers; other users see only public servers. Summary totals and activity
dates use that same visibility filter, and another player's displayed name comes from a visible server.
Profiles show Steam and linked Discord avatars with copyable platform identifiers. External profile
links and sharing actions sit to the right on desktop and below the identity on smaller screens.
Avatars load as optional decoration after visibility and erasure checks; provider failures keep the
recorded statistics available. Share uses the native
browser share sheet when available, with a clipboard fallback; a separate copy action always provides
the stable explicit Steam profile URL. Report player opens Discord support, with guidance to include
that URL. It does not create a report record or issue a sanction.

Recorded warnings and bans have separate pagination, server names, reasons and dates. Owners can see
their own sanctions on all servers; other visitors only see public-server sanctions. Moderator IDs
are omitted. A public moderation record can make a profile visible even without gameplay statistics.
Ban duration is recorded in minutes, with zero indicating permanence; expiry and status are calculated
from that duration. An early unban may not be reflected because the addon records ban additions.

The page explains visibility and handles missing Steam links, missing players, errors and empty
statistics or moderation histories separately. Dates and numbers follow the selected language.
Last activity is the last stored statistics update, which may include administrative edits;
it is not live player presence.

## Server statistics

Each managed server has a Statistics entry at
`/dashboard/guilds/:guildID/config/servers/:serverID/statistics`. It reads
`GET /v3/users/:discordID/guilds/:guildID/servers/:serverID/statistics` after account, guild-administrator
and server-membership checks. These database-only reads do not require a Discord metadata snapshot.
Responses are private and use `Cache-Control: no-store`.

The page offers rolling 24-hour, seven-day and thirty-day periods, plus a custom UTC interval of at
most ninety days. Population uses hourly buckets for intervals up to forty-eight hours and daily
buckets otherwise; unobserved buckets remain unknown. A UTC weekday/hour heatmap exposes sampled
attendance. New-player counts use the first recorded arrival. Session counts, hours, duration
distribution, median duration, active players and the top-player list cover sessions completed in
the selected interval, attributed to their end time. They exclude sessions still in progress.
The registered-player total is explicitly all-time.

Player countries count distinct players with a retained connection event on this server in the
selected interval, using each player's latest connection in that interval. This population differs
from completed-session players: connections are counted even if the session is still running.
MongoDB groups connections by player and then address; the API resolves those addresses locally
through `@gmod/infra-geoip` and returns only country totals. Missing, private and invalid addresses
remain in the unknown category and percentage denominator. Logs that have been erased or are no
longer retained are excluded. New connection logs store the joining player's explicit Steam ID;
legacy logs require one unambiguous subject, since names may contain unrelated Steam IDs. VPNs/proxies
and database age affect these estimates. A bounded MongoDB failure marks only the country panel
unavailable, preserving the independently stored SQL statistics.

The client-branch distribution describes only the latest connected-player snapshot, independent of
the selected historical period. Snapshots older than five minutes are shown as unavailable for live
statistics. Graphs provide readable exact-value tables and explicit loading, error and empty states.
The shared HTTP schemas are in `@gmod/schema/server/ServerStatisticsSchema.js`; the core model
aggregates the data in SQL and MongoDB rather than loading entire histories in the API process.
MariaDB connections explicitly use UTC, matching Prisma's timestamp serialization and the date
buckets. The server/date indexes for arrivals and completed sessions ship in the
`20261123140000_server_statistics_indexes` migration.

## Discord status preview

Automatic preview requests compare the effective draft, locale and account/server scope. Reapplying a
saved draft or assigning database IDs to unchanged link buttons does not render it again. A changed
server-normalized value does trigger a new preview. One render is in flight at a time; further edits
coalesce to the latest draft, with a 30-second timeout and cancellation on unmount. Explicit refresh and
retry remain available. Successful preview and reward-simulation POSTs do not invalidate the access
snapshot; permission refusals still refresh access.

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
