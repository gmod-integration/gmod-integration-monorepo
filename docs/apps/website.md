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

## Privacy controls

The legal documents at `/legal/terms` and `/legal/privacy` follow the selected UI language for French,
with English as the fallback for other languages. Their revision date is explicit rather than the build date.

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
