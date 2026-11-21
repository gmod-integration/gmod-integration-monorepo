# `@gmod/config`

Single source of truth for environment configuration. Loads `.env` files and validates them with Zod —
nothing else in the codebase should read `process.env` directly (see
[best-practices.md](../best-practices.md)).

## Exports

- `.` / `index.js` → `src/index.ts`: server-side config. Walks up from the package dir to find the workspace
  root (the first ancestor with a `package.json` that has a `workspaces` field), loads `.env` /
  `.env.local` from there (and from `CONFIG_ENV_FILE` if set), then parses `process.env` against
  `ConfigSchema`. Exposes grouped accessors (`ConfigServer`, `ConfigDiscord`, `ConfigMinIO`, `ConfigSteam`,
  ...) built from the validated `config` object. Invalid/missing env vars print a readable Zod error list and
  `process.exit(1)` — config errors fail fast at boot, not at first use.
- `./schema.js` → `src/schema.ts`: the `ConfigSchema` Zod definition (all env vars, types, defaults). Secrets
  (`MARIA_PASSWORD`, `MARIA_ROOT_PASSWORD`, ...) go through `strongSecretSchema`, which rejects short values
  and the literal strings `"secret"`/`"root"`.
- `./website.js` → `src/website.ts`: a **separate**, smaller Zod schema for the subset of config the frontend
  needs at build/runtime (`DOMAIN_URL`, `WEBSITE_URL`, `DISCORD_CLIENT_ID`, `WEBSITE_WS_URL`). Kept apart from
  the server schema so the website bundle never has a reason to reference server secrets.
- `./infrastructure.js` → `src/infrastructure.ts`: lightweight getters for Redis, MongoDB, BullMQ and
  MariaDB driver configuration. They read the already-loaded environment or an explicitly supplied
  environment object. Importing this submodule does not run the global server bootstrap, load `.env`
  files, validate unrelated service credentials or connect a client. Application entrypoints retain
  responsibility for the normal server config bootstrap.
- `./website-runtime.js` → `dist/website.js`: prebuilt output of `website.ts` for environments that can't run
  the TS loader.

## Used by

`ConfigPrivacy.hashSecret` reads optional `PRIVACY_HASH_SECRET` through the strong-secret validator.
Account erasure refuses new requests until this separate, stable key is configured. It must be shared by
the API, WebSocket and Discord workers that read the erasure registry. Do not rotate it with ordinary
OAuth credentials: provider-scoped HMAC lookup keys, retained reputation and detached purchase keys
depend on it. Migration/rekeying needs an explicit plan before the original identities are erased.

Everything. Every app and most `packages/*` import `@gmod/config` for ports, URLs, and credentials instead of
`process.env`.

Infrastructure adapters import their specific getter from `@gmod/config/infrastructure.js`:

| Getter                | Precedence and defaults                                                                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `getRedisConfig`      | Trimmed `REDIS_URL`, otherwise host `127.0.0.1`, port `6379`, database `0`, overridden by `REDIS_HOST`/`REDIS_PORT`/`REDIS_DB`.                                                                        |
| `getMongoConfig`      | `MONGO_URI`, otherwise `mongodb://MONGO_HOST:MONGO_PORT`, defaulting to `127.0.0.1:27017`.                                                                                                             |
| `getBullMQConnection` | `BULLMQ_HOST`/`BULLMQ_PORT`, then `REDIS_HOST`/`REDIS_PORT`, then `127.0.0.1:6379`.                                                                                                                    |
| `getMariaDbConfig`    | `MARIA_HOST`/`MARIA_PORT`/`MARIA_USER`/`MARIA_PASSWORD`/`MARIA_NAME`; port defaults to `3306`. Connection limit defaults to `10` in development, `50` otherwise, and is capped at `10` in development. |

Integer settings fall back to their defaults when not numeric or below their allowed minimum. The
normal server bootstrap still applies the global Zod schema. Tests can inject an environment object
to exercise connection settings without supplying unrelated credentials or opening a network connection.

## Gotcha

The workspace-root lookup means `@gmod/config` behaves differently depending on _where_ `.env` actually is —
it is always the repo root `.env`, regardless of which app/package imports it from.
