# `@gmod/domain-server`

Everything about a registered GMod server: identity/token, per-server settings, status channel, and the
Discord bridge that lets this package trigger Discord effects without importing `discord.js`.

## Files

- `Server.ts` — the `Server` class (Prisma-backed). Token validation (`isValidToken`, used by
  `apps/websocket`'s `verifyClient`), per-server settings with allowed value validation (e.g.
  `sync_role_direction`, `syncChatDirection`, `log_hide_ip`, `log_include_file`), in-game settings
  persistence (`saveIGSettings`, called from the `save_config` WebSocket action).
- `playerAccess.ts` — fresh whitelist decisions and game-side recheck notifications. Manual player
  exceptions remain separate from Discord role membership.
- `ServerStatusChannel.ts` — the "server status" Discord channel/message config, validated against
  `@gmod/schema/server/ServerStatusChannelSchema.js`.
- `serversModels.ts` — Discord-command-facing helpers (autocomplete server lists, etc.).
- `discordBridge.ts` — **the seam that keeps this package free of `discord.js`.** It exposes
  `setDiscordGuildClientResolver` / `setDiscordStatusMessageBuilder` (called once, from
  `apps/discord/src/main.ts`) and `resolveDiscordGuildClient` / `buildDiscordStatusMessage` (called from here
  and from `apps/websocket`). Anything that needs "the live Discord client for this guild" or "render a status
  embed" goes through these functions instead of a direct import — see
  [architecture.md — Discord boundary](../architecture.md#discord-boundary).

## Depends on

`@gmod/config`, `@gmod/infra-bullmq`, `@gmod/infra-prisma`, `@gmod/infra-redis`, `@gmod/infra-websocket`, `@gmod/schema`,
`discord.js` (types only, via the bridge pattern above).

## Used by

`apps/api`, `apps/discord`, `apps/websocket`, `@gmod/domain-guild`, `@gmod/domain-moderation`.

## Discord status recovery

The Discord process checks published server messages every 30 seconds. A heartbeat older than six
minutes is offline, including after an extended Discord outage. The sweep retries failed message
edits and isolates each server's failure so later servers can still refresh. Overlapping sweeps in
the same process are skipped.

Only a confirmed Discord edit records an offline acknowledgement in Redis. Its value identifies the
last heartbeat and the channel/message target; a newer heartbeat or replacement message needs its
own acknowledgement. Entries expire after seven days to bound abandoned cache entries while avoiding
repeated Discord edits for servers that stay offline. A fresh heartbeat discovered during the sweep
keeps or restores the message online, including when it arrives during a Discord edit. Redis cache
failures do not prevent the message edit from being attempted.

## Whitelist mode

The panel calls the existing maintenance gate **Whitelist mode**. Persisted `ig_maintenance`,
addon `maintenance` and player `bypassMaintenance` names remain compatible with existing settings.
`maintenance_whitelist_role` is a server setting containing a Discord role ID, or an empty string to
remove the binding. It applies only to that server's Discord community and needs no SQL migration.

`getPlayerStats()` remains a raw recorded-player read. `getPlayerAccess()` instead returns explicit
boolean `bypassMaintenance` and `discordAdmin` fields for the game gate. Manual grants authorize
independently; a role grant is never written into a manual player exception. Discord role membership
uses a fresh BullMQ provider lookup. The role setting and Steam/Discord link are read durably and
checked again after the provider request, alongside any newly added manual grant. An unavailable
provider or overtaken decision produces a sanitized 503 rather than a confirmed denial.

The authenticated `GET /servers/:serverID/players/:steamID64/access` dispatch is shared by HTTP and
the addon WebSocket. Raw `/players/:steamID64` reads remain available for ordinary ban checks when
whitelist mode is disabled. Discord membership/role events, role-setting changes and manual access
edits ask the addon to refresh current access; they never transmit a positive permission grant.
