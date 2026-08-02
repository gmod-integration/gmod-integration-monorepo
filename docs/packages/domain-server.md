# `@gmod/domain-server`

Everything about a registered GMod server: identity/token, per-server settings, status channel, and the
Discord bridge that lets this package trigger Discord effects without importing `discord.js`.

## Files

- `Server.ts` — the `Server` class (Prisma-backed). Token validation (`isValidToken`, used by
  `apps/websocket`'s `verifyClient`), per-server settings with allowed value validation (e.g.
  `sync_role_direction`, `syncChatDirection`, `log_hide_ip`, `log_include_file`), in-game settings
  persistence (`saveIGSettings`, called from the `save_config` WebSocket action).
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

`@gmod/config`, `@gmod/infra-prisma`, `@gmod/infra-redis`, `@gmod/infra-websocket`, `@gmod/schema`,
`discord.js` (types only, via the bridge pattern above).

## Used by

`apps/api`, `apps/discord`, `apps/websocket`, `@gmod/domain-guild`, `@gmod/domain-moderation`.
