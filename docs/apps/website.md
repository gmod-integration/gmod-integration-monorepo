# `apps/website`

React + Vite frontend: public marketing site and the user/guild/server dashboard. Talks to `apps/api` (HTTP)
and `apps/websocket` (live status/notifications).

## Structure

```text
src/
  index.tsx           Vite/React entry
  app/
    App.tsx            top-level router/shell
    AppDashboard.tsx    dashboard shell (guild/server management)
    AppAdminDashboard.tsx  internal admin views
  pages/
    Home.tsx, Login.tsx, Logout.tsx, Account.tsx, Servers.tsx, Premium.tsx, Notifications.tsx, ToDo.tsx,
    NotFound.tsx
    legal/             legal pages
    dashboard/          dashboard sub-pages
  components/
  middleware/           client-side route guards
  locales/               UI translations
  config.ts              runtime config (API/WS base URLs)
  i18n.tsx
  sentry.ts
```

## Auth model

Dashboard auth is Discord-OAuth based (`PanelUser`, see
[docs/packages/domain-user.md](../packages/domain-user.md)). The site opens a WebSocket to `apps/websocket`
using `discordID` + token, scoped server-side to the guilds/servers that user administers — see
[docs/apps/websocket.md](./websocket.md).

## Run it

```bash
bun run website:dev   # vite --host
```
