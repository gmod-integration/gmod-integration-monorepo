# `@gmod/domain-guild`

Everything about a Discord guild: settings, the verification flow, and Discord-facing helpers (messages,
buttons, localization) shared by both `apps/discord` command handlers and `apps/api`.

## Files

- `Guild.ts` — the `Guild` class. Per-guild settings (some `premium`-gated, e.g. `verification_dont_mp`),
  premium checks (`isGuildPremium`), and calls into `@gmod/infra-bullmq/discordQueueAdapters.js` for anything
  needing the live Discord client (admins list, bot client info, reload bot instance, update bot profile, has
  the main bot joined a guild).
- `discordModels.ts` — guild ↔ Discord member glue: verification token generation, avatar caching via
  `@gmod/infra-minio`, pushing WebSocket messages via `@gmod/infra-websocket`, fetching Discord users through
  the BullMQ bridge.
- `verifyModels.ts` — handles the "verify yourself" button interaction end to end (panel user lookup, Discord
  user lookup, delegates to `discordModels.verifyUser`).
- `discordMessages.ts` — embed/button builders for guild-facing Discord messages (e.g. the verification
  button, which deep-links to the website OAuth flow).
- `localizations.ts` — loads per-guild translation strings (falls back to English); see also
  [locales](./locales.md).

## Depends on

`@gmod/config`, `@gmod/domain-server`, `@gmod/domain-user`, `@gmod/infra-bullmq`, `@gmod/infra-prisma`,
`@gmod/infra-redis`, `@gmod/infra-websocket`, `discord.js`.

## Used by

`apps/discord` (guild commands/events), `apps/api` (dashboard guild config endpoints), `apps/websocket`
(resolving which guilds/servers a dashboard client administers).
