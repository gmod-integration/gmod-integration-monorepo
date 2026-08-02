# `@gmod/infra-mongo`

Thin MongoDB client wrapper. Used for high-volume, loosely structured data that doesn't belong in the
relational schema — primarily server logs and in-game error reports.

## Exports (`src/index.ts`)

- `mongoClient` — a `MongoClient` built from `MONGO_URI` (or `MONGO_HOST`/`MONGO_PORT`).
- `connectToMongoDB()` — connects, or `process.exit(1)` on failure (called once at app bootstrap).

No schema/ODM layer here — collections are accessed directly (see
`@gmod/core/database/gm_server_logs.js` and `@gmod/domain-gmod/GmodErrors.js`, both of which open
`mongoClient.db('gmod_integration')` and a specific collection).

## Used by

`@gmod/core` (`gm_server_logs`), `@gmod/domain-gmod` (`GmodErrors`), `apps/api`, `apps/discord` (both connect
and gracefully disconnect Mongo at startup/shutdown).
