# `@gmod/domain-user`

Player and dashboard-user identity.

## Files

- `User.ts` — the `User` class: `steamID64` + `discordID` + `rank` + `trustLevel` + last verification date.
  This is the in-game/verified-player identity, independent of whether that person ever logs into the
  dashboard.
- `PanelUser.ts` — the `PanelUser` class: wraps a `User` plus dashboard session state (`panelToken`,
  `discordToken` with refresh token, expirations). This is the identity used by `apps/website` (dashboard
  login) and `apps/websocket` (dashboard client auth) — see
  [architecture.md — data flow](../architecture.md#end-to-end-data-flow).

## Depends on

`@gmod/infra-prisma`, `@gmod/infra-redis`.

## Used by

`apps/api`, `apps/websocket` (both connection types resolve through here), `@gmod/domain-guild`,
`@gmod/domain-compliance` (GDPR requests operate on a `User`).
