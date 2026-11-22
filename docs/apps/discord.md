# `apps/discord`

The Discord bot(s) and the BullMQ workers that execute Discord actions requested by other apps. Entry point:
[`src/main.ts`](../../apps/discord/src/main.ts).

## Two bot flavors

- **Main bot** (`loadDiscordMain`): the primary Gmod Integration bot, shared across all guilds that don't opt
  for a custom bot.
- **Slave/custom bots** (`loadDiscordSlave`): premium guilds can run their own bot identity (see the product
  guide [`guides/dashboard/guild/custom_bot.md`](https://docs.gmod-integration.com) on the public docs site).
  Both are managed from `src/discord/index.ts` (`getGuildClient` resolves which client answers for a given
  guild).

`main.ts` wires `@gmod/domain-server`'s `discordBridge` to whichever client should answer for a guild
(`setDiscordGuildClientResolver`) and to the status-message builder (`setDiscordStatusMessageBuilder`) — this
is how `domain-server` can ask "send this to Discord" without importing `discord.js` itself.

## Structure

```text
src/
  main.ts                          bootstrap: connect Prisma, load bots, start BullMQ workers
  discord/
    index.ts                       client loading/resolution (main + slave bots), graceful shutdown
    commands/
      player/                      vote, statistic, profile, chart, leaderboard
      general/                     link, premium
      admin/                       rcon, warn, verify
    contexts/                      right-click "app" commands (user/, admin/)
    events/                        discord.js gateway event handlers (guildCreate, memberAdd, messageCreate, ...)
    workers/
      discordQueueWorkers.ts       consumes the BullMQ queues defined in packages/infra-bullmq
    utils/                         messages.ts (embed builders), buttons.ts
```

## The BullMQ bridge (why this app exists as a separate process)

`apps/discord` is the only process allowed to hold a live `discord.js` client. Every other app that needs a
Discord-side effect (post a log message, sync a role, fetch a user, upload a screenshot, manage a guild's
status/logs/vote channels, ...) enqueues a job instead of calling Discord directly:

1. Caller: `@gmod/infra-bullmq/discordQueueAdapters.js` (`enqueueDiscordGuildX(...)`) — validates the payload
   against a Zod schema in `packages/schema/src/bullmq.ts`, pushes it to a named BullMQ queue.
2. Here: `src/discord/workers/discordQueueWorkers.ts` consumes the queue and performs the action with the live
   client.
3. If the caller expects a result, the worker writes it to Redis key `bullmq:reply:<correlationId>`; the
   caller polls for it and gets a `BullMQReplyTimeoutError` if it never shows up.

See [architecture.md — Discord boundary](../architecture.md#discord-boundary) and
[migration-playbook.md](../migration-playbook.md#example-discord-action-from-api) for adding a new job type.

## Status preview rendering

`serverStatusPreview` creates a temporary server view with in-memory settings/button overrides and
calls the same `getStatusMessage` renderer used for publication. It uses the guild's preferred locale,
player formatting/truncation and button layout. The reply serializes embeds and buttons and converts
any chart buffer to a PNG data URL.

Preview rendering uses `getStatusMessage(..., { persistChart: false })`, which calls
`getServerChart(server, { persist: false })`. This mode renders the chart without reading/writing its
Redis cache, accessing MinIO or uploading files. The default publication path retains its cache.
The preview handler does not save settings or call Discord message send/edit/delete methods.

## Authorization

Platform developer commands use the root `developers.json` allowlist through the shared user model,
not the stored database rank. Prefix maintenance commands are limited to `ConfigDiscord.guildID` and
log their actor/action/target without recording the raw command payload.

`/warn` and every warning pagination action require the game server to belong to the interaction's
Discord community. A linked account may view its own warning history; viewing someone else's requires
the Discord owner or Administrator permission. New replies are private. Interacting with a historical
public message creates a private copy instead of updating its contents publicly.

`/rcon` requires a linked Steam account, a server in the interaction's community and the console
capability. Its Discord command remains restricted by default. The current game authority is checked
in the addon: the linked player must be online and pass the configured `gmIntIsAdmin()` rule. Stored
player statistics do not authorize execution. The new `wsAuthorizedRcon` command is expired and
deduplicated by request ID; only an authenticated matching addon acknowledgement confirms that the
console accepted it. A timeout leaves execution uncertain and is never retried automatically. Older
addons do not recognize this new command and cannot execute it through the old unchecked handler.

Member role/removal events and role permission, deletion, ownership and guild removal events invalidate
the shared Discord permission revisions. Gateways clear matching snapshots and verify durable revisions
before using cached permissions. `guildAdmins` replies distinguish an unavailable Discord lookup from
a verified empty list, so the dashboard can offer retry feedback.

## Run it

```bash
bun run discord:dev     # tsx watch apps/discord/src/main.ts --env DEV=true
```
