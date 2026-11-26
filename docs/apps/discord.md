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

The website's editor and administrator previews are built locally by the API and rendered by its
shared `DiscordMessagePreview` component. They do not enqueue `serverStatusPreview` or require a live
Discord client. Status construction and chart rendering live in shared core utilities, so real
publication uses the same player formatting/truncation and button layout. The old worker operation
remains available for already-queued jobs and compatibility.

Both the API and Discord runtime images install Fontconfig and Roboto, DejaVu Sans and Noto Sans.
The shared chart renderer uses these fonts to rasterize SVG labels with sharp. Installing fonts only
in the Discord image leaves API-generated preview axes unreadable; the host's fonts are not used.

Preview rendering uses `getStatusMessage(..., { persistChart: false })`, which calls
`getServerChart(server, { persist: false })`. This mode renders the chart without reading/writing its
Redis cache, accessing MinIO or uploading files. The default publication path retains its cache.
The preview handlers do not save settings or call Discord message send/edit/delete methods. Local
preview access uses a valid cached snapshot or database grants and never verifies entitlements with
Discord; missing local verification is reported to the UI and applies conservative free limits.

## Authorization

Platform developer commands use the root `developers.json` allowlist through the shared user model,
not the stored database rank. Prefix maintenance commands are limited to `ConfigDiscord.guildID` and
log their actor/action/target without recording the raw command payload.

`/chart`, server-scoped `/statistic`, `/leaderboard` and `/vote` resolve each supplied server against
the interaction's Discord community. A public directory flag does not grant cross-community command
access. The core `getDiscordCommunityServer` helper uses the current server record, and leaderboard
category suggestions, rendering and every saved pagination action reapply that community boundary.
Unavailable or unauthorized targets receive the same private response. Autocomplete offers at most
25 choices and is a convenience rather than an authorization step. The explicit `/statistic global`
option continues to show platform profile aggregates; it is separate from any game-server identifier.

Vote registration uses one Prisma transaction and a prepared `SELECT … FOR UPDATE` on the matching
server/community row. The cooldown check and vote creation happen while that row is locked, so Discord bot
processes cannot create simultaneous votes for the same cooldown window. A changed or removed community
association aborts registration. The three-hour cooldown is unchanged. A failed Discord notification
does not undo or misreport the saved vote, and vote notifications disable parsed mentions.

Discord-to-game chat resolves fresh sync mappings for the exact source community/channel, then sends
only to servers listed in those mappings and still belonging to that community. It also checks each
server's effective direction. Independent servers with different channels stay separate; several
servers intentionally mapped to one source channel can receive the same message.

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

## Custom bot profile updates

`guildUpdateBotProfile` rechecks the community's custom-bot capability and refuses the shared main
client. Its avatar field accepts only uploaded JPEG/PNG data URLs through the shared
`CustomBotAvatarSchema`; remote URLs and local paths are not supported. `prepareCustomBotAvatar`
limits decoded input to 2 MiB and 16,777,216 pixels, refuses dimensions over 4096×4096 and multi-page
images, verifies the raster signature, strips metadata and re-encodes at most 512×512 PNG bytes.
The worker passes a `Buffer` to `ClientUser.edit`, so the SDK never resolves user-supplied image
resources. Username and avatar changes share one Discord profile edit after image validation. Worker
failures return a generic profile error rather than details from Discord or the image processor.
Deploy the API, website and Discord workers together for this upload contract; old jobs carrying URL
or path avatars are rejected and are not converted into downloads.

## Custom bot removal

An acknowledged `guildReloadBotInstance` kills the guild's current custom client before rereading its
saved credential. An empty credential keeps the main-client fallback without creating a replacement.
Reloads for the same guild run sequentially, including startup discovery and a failed preceding reload;
independent guilds remain independent. Startup rereads credentials inside that same lock. This prevents
an already running reload or a stale startup snapshot from reconnecting a removed token.

The Discord application requires a single runtime owner (`replicas: 1`) with `stop-first` updates and
rollbacks. Its clients and reload serialization live in process memory. BullMQ delivers each reload to
one worker; the reply is not a broadcast acknowledgement across multiple gateway owners. Multiple
Discord replicas or overlapping deployments therefore cannot provide the removal confirmation
contract. API and WebSocket replicas do not share this singleton restriction.

## Bot departure and community retention

A guild-departure event only permits cleanup when it comes from the currently effective client
instance. When that client is a custom bot, its departed credential cannot establish whether the main
bot is still present. The handler stops the custom client and performs a fresh guild lookup using the
main client. A successful lookup or an ambiguous failure preserves the community, purchase and profile
metadata. Cleanup is permitted for an authoritative main-client departure or a confirmed unknown-guild
response from that independent lookup. Events from replaced instances leave shared data intact.
