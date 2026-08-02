# `@gmod/domain-moderation`

In-game moderation actions: warns and bans.

## Files

- `warnModels.ts` — server-scoped player warns (`getServerUserWarn`, paginated), warn Discord embeds/buttons.
- `bansModels.ts` — global ban lookups by IP (`isGlobalBanIP`) or Steam ID (`isGlobalBanSteamID64`), backed by
  the `banUsers` Prisma table. "Global" here means across all servers, not scoped to one `Server`.

## Depends on

`@gmod/config`, `@gmod/domain-server`, `@gmod/infra-prisma`, `discord.js`.

## Used by

`apps/discord` (`/warn` admin command, ban-check flows), `apps/api` (moderation endpoints).
