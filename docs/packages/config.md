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
- `./developers.js` → `src/developers.ts`: server-only platform privilege lookup from the root
  `developers.json`. Exposes the frozen `developerDiscordIDs`, `isDeveloper(discordID)` and
  `getPlatformRank(discordID)`. This submodule reads the file through `node:fs`; never import it into
  browser code.
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

## Platform developer allowlist

The checked-in root [`developers.json`](../../developers.json) is the only source of platform developer
access. It currently contains only Discord ID `333650866747867137`. The module validates an array of
17–20 digit string IDs, rejects an invalid file at import and freezes a deduplicated copy. Neither
environment variables, Discord roles nor `gm_user.rank` can add privileges.

`isDeveloper` checks an exact string ID. `getPlatformRank` projects `developer` for a listed ID and
`user` otherwise; those are the only platform roles. Session and admin-directory responses expose this
effective rank to the frontend. The dashboard has no role editor or rank mutation route; backend
administration and support-start authorization consult the allowlist themselves.

The file is loaded once when the server module is imported, with no live reload. After changing the
list, redeploy/restart all backend services and replicas, including the API, WebSocket gateway, Discord
processes and workers, with the same root file. An old process otherwise keeps its previous privilege
list. No database rank update is required. The browser receives the computed role and must never bundle
the JSON file or the server-only helper.

## Used by

`ConfigAuth` contains the optional stable `AUTH_TOKEN_ENCRYPTION_KEY` (minimum 32 characters),
`AUTH_SESSION_ABSOLUTE_TTL_SECONDS` (30 days by default) and `AUTH_SESSION_IDLE_TTL_SECONDS` (7 days,
clamped to the absolute lifetime). OAuth state lasts ten minutes; single-use WebSocket tickets last at
most 30 seconds. Key changes require re-encryption or renewed Discord authorization. See the
[auth contract and deployment procedure](./domain-auth.md) before upgrading or rotating key material.

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
