# `@gmod/infra-prisma`

The Prisma client for MariaDB — the relational source of truth (servers, guilds, users, bans, warns, config,
...).

## Exports

- `.` / `index.js` → `src/index.ts`: builds a `PrismaClient` over `PrismaMariaDb` (the MariaDB driver adapter),
  with a connection limit read from `MARIA_CONNECTION_LIMIT` (capped at 10 in dev, defaults to 50 in prod).
  Exports the client as default, plus `connectPrisma()` (idempotent, memoized connect promise — safe to call
  from every app's bootstrap) and `gracefulShutdownPrisma()`.
- `./client.js` → `src/client.ts`: re-exports the generated Prisma types/client
  (`../generated/prisma/client.js`) — import enum/model **types** from here.
- `./enums.js` → `src/enums.ts`: generated Prisma enums (e.g. `gm_server_logs_triggers_action`,
  `gm_server_logs_triggers_operator`).

## Generated client

`packages/infra-prisma/generated/prisma` is generated output (`bun run prisma:generate`) — never edit by hand.
Schema source: `packages/infra-prisma/schema.prisma`. Migrations: `packages/infra-prisma/migrations`.

## Used by

Nearly every `domain-*` package and every app. Always import the shared client (`prisma` default export) —
never instantiate a second `PrismaClient` in an app, see
[architecture.md — Data boundary](../architecture.md#data-boundary).
