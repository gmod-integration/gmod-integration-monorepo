# `@gmod/infra-bullmq`

BullMQ setup and the request/reply adapters that let any app trigger a Discord action executed by
`apps/discord`. This is the concrete implementation of the "Discord boundary" described in
[architecture.md](../architecture.md#why-go-through-bullmq-instead-of-calling-discord-directly-from-api).

## Exports

- `.` / `index.js` → `src/index.ts`: the shared BullMQ `connection` config (`BULLMQ_HOST`/`BULLMQ_PORT`,
  falling back to `REDIS_HOST`/`REDIS_PORT`). Every queue in this package and in
  [infra-websocket](./infra-websocket.md) is built with this same connection.
- `./schemas.js` → `src/schemas.ts`: re-exports `@gmod/schema/bullmq.js` (the Zod job/reply schemas) —
  imported from here for convenience so consumers don't need a second package import.
- `./discordQueueAdapters.js` → `src/discordQueueAdapters.ts`: one `enqueueX(...)` async function per Discord
  action (pseudo/group/team-role sync, guild snapshot, verify user, verification message create/delete, bot
  client info, reload bot instance, update bot profile, sync ban, admins list, send log message, server
  status/logs/screenshot/vote channel create/delete, sync-chat channel create/delete, remove sync roles,
  screenshot upload, fetch user, sync premium roles, set presence, has-guild check).

## The request/reply pattern

For calls that need a result:

1. Build a `correlationId` (`uuidv4()`), validate the payload against the matching `*JobSchema`, `queue.add(...)`.
2. `waitForReply(correlationId, parser, timeoutMs)` polls Redis key `bullmq:reply:<correlationId>` (100ms
   interval) until the worker (in `apps/discord`) writes a reply there, parses it against the `*ReplySchema`,
   and deletes the key. Throws `BullMQReplyTimeoutError` (check with `isBullMQReplyTimeoutError`) if the
   timeout elapses — callers must handle this explicitly, see
   [best-practices.md — Resilience](../best-practices.md#4-resilience).
3. `enqueueDiscordGuildSnapshot` additionally short-TTL caches results in-process (10s for hits, 3s for
   misses) and dedupes concurrent calls for the same `guildID` via an in-flight promise map — worth knowing
   before adding a similar high-frequency lookup.

Fire-and-forget calls (`enqueueUpdateGuildUserPseudo`, `enqueueUpdatePlayerUserGroup`,
`enqueueUpdateDiscordTeamRoleQueue`) just `queue.add(...)` with retry/backoff options and return.

## Adding a new Discord action

See [migration-playbook.md — Example: Discord action from API](../migration-playbook.md#example-discord-action-from-api):
add the schema pair to `@gmod/schema/src/bullmq.ts`, add the adapter here, implement the worker in
`apps/discord/src/discord/workers/discordQueueWorkers.ts`.

## Used by

`apps/api`, `apps/website` (indirectly through api/websocket), `@gmod/domain-guild`, `@gmod/domain-server`.
Consumed by `apps/discord`'s worker.
