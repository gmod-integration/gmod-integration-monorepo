# `@gmod/infra-prisma`

The Prisma client for MariaDB — the relational source of truth (servers, guilds, users, bans, warns, config,
...).

## Exports

- `.` / `index.js` → `src/index.ts`: builds a `PrismaClient` over `PrismaMariaDb` (the MariaDB driver adapter),
  using `getMariaDbConfig()` from `@gmod/config/infrastructure.js`. `MARIA_PORT` is forwarded to the driver (default `3306`); `MARIA_CONNECTION_LIMIT` is capped at 10 in dev and defaults to 50 in prod.
  Exports the client as default, plus `connectPrisma()` (idempotent, memoized connect promise — safe to call
  from every app's bootstrap) and `gracefulShutdownPrisma()`.
- `./client.js` → `src/client.ts`: re-exports the generated Prisma types/client
  (`../generated/prisma/client.js`) — import enum/model **types** from here.
- `./enums.js` → `src/enums.ts`: generated Prisma enums (e.g. `gm_server_logs_triggers_action`,
  `gm_server_logs_triggers_operator`).

## Generated client

`packages/infra-prisma/generated/prisma` is generated output (`bun run prisma:generate`) — never edit by hand.
Schema source: `packages/infra-prisma/schema.prisma`. Migrations: `packages/infra-prisma/migrations`.

The `20261123120000_dashboard_lookup_indexes` migration adds nonunique indexes for session lookup by
`accessToken`/`revoke`/`expirationDate` and purchase lookup by `guild`/`revoke`. These cover the filters
used by authenticated dashboard requests and access resolution without requiring token uniqueness for
historical records. Apply this migration through the normal deployment migration workflow.

The `20261123160000_guild_partner_badge` migration adds `gm_guild.isPartner`, defaulting to false.
Only platform administration changes this designation; public ranking responses project it as
`partner`. Apply the migration before deploying the API that reads or updates the new field, and
regenerate the Prisma client during the build.

## Used by

Nearly every `domain-*` package and every app. Always import the shared client (`prisma` default export) —
never instantiate a second `PrismaClient` in an app, see
[architecture.md — Data boundary](../architecture.md#data-boundary).
