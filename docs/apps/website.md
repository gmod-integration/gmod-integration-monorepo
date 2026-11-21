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
    Home.tsx, Login.tsx, Logout.tsx, Account.tsx, Servers.tsx, Premium.tsx, Notifications.tsx, ToDo.tsx,
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

## Server ranking

`/servers` requests the authenticated, paginated `/v3/users/:discordID/servers/ranking` endpoint.
It displays 10 servers by default (25 and 50 are available), with search, game-mode and online-state
filters. Changing a filter resets the page. The first three results on page one are highlighted without
duplicating them in the remaining list; ranks use votes from the last thirty days.

Each card includes a seven-day chart of daily peak player counts. Historical activity and the last-known
map/mode remain visible after the server goes offline. Missing days remain gaps, and an empty history
has an explicit placeholder. Discord buttons use validated invitations returned by the worker; missing
permissions disable the invitation button without hiding the server.

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
acceptance clears account data and sockets while retaining preferences and the recovery receipt.
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

Dashboard auth is Discord-OAuth based (`PanelUser`, see
[docs/packages/domain-user.md](../packages/domain-user.md)). The site opens a WebSocket to `apps/websocket`
using `discordID` + token, scoped server-side to the guilds/servers that user administers — see
[docs/apps/websocket.md](./websocket.md).

## Run it

```bash
bun run website:dev   # vite --host
```

Vite uses the port configured in `WEBSITE_URL` (3000 when the URL has no explicit port), with
`strictPort` enabled. It fails on a collision instead of silently moving the website away from the
OAuth return URL. `OAUTH_REDIRECT_URL` must point to `/login` on that website origin. For concurrent
local development, set `APP_PORT=3002` in `apps/webhook-relay/.env` to keep the relay separate.
