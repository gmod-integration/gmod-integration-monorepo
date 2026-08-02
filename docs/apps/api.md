# `apps/api`

Express HTTP API. Entry point: [`src/gm_integration_api.ts`](../../apps/api/src/gm_integration_api.ts).

## Who talks to it

- The GMod addon (submodule), authenticated with a server token/ID.
- `apps/website` (dashboard), authenticated as a panel user.
- External webhooks (GmodStore purchases).

## Structure

```text
src/
  gm_integration_api.ts   Express app bootstrap: CORS, helmet, useragent, graceful shutdown, mounts mainRoutes.
  routes/
    mainRoutes.ts          top-level router
    v3/                    current API version: clients, servers, users, bans, ...
    webhooks/               gmodstore/ (purchase webhooks)
    steamRoutes.ts
  controllers/
    v3/                    one controller file per resource (usersControllers, serversControllers, ...)
    gmod/                   GmodErrorsControllers (in-game error reports)
    website/                WebsiteErrorsControllers
    webhooks/                gmodstoreControllers
  middleware/
    v3/                    serverValidator, clientValidator, userValidator, loggers
    webhooks/               gmodStoreValidator
    errorMiddleware.ts, asyncHandler.ts, rawBodyMiddleware.ts
```

## Request pattern

Route → validation/auth middleware → thin controller → logic in `packages/core/src/models/*` or
`packages/domain-*`. See [architecture.md — API endpoint pattern](../architecture.md#api-endpoint-pattern).

Controllers should stay thin (rule of thumb: extract past ~10 lines, see
[best-practices.md](../best-practices.md)); the actual server/guild/user logic lives in `@gmod/domain-*`
classes, not in the controller.

## Discord side effects

`api` never imports `discord.js` directly. Anything Discord-related is enqueued via
`@gmod/infra-bullmq/discordQueueAdapters.js` and executed by `apps/discord`'s worker — see
[architecture.md — Discord boundary](../architecture.md#discord-boundary).

## Config

Reads all runtime config (ports, DB URLs, Discord tokens, ...) through `@gmod/config` — never `process.env`
directly. Default internal port: `53136` (see root [README.md](../../README.md) for the full port table and
reverse-proxy setup).

## Data

- Relational data via `@gmod/infra-prisma` (MariaDB).
- High-volume server logs via `@gmod/core/database/gm_server_logs.js` (MongoDB, through `@gmod/infra-mongo`).

## Run it

```bash
bun run dev                # tsx watch, from repo root
# or
turbo run dev --parallel   # all apps at once
```
