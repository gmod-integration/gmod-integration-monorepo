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

## Run it

```bash
bun run discord:dev     # tsx watch apps/discord/src/main.ts --env DEV=true
```
