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
- `./website-runtime.js` → `dist/website.js`: prebuilt output of `website.ts` for environments that can't run
  the TS loader.

## Used by

Everything. Every app and most `packages/*` import `@gmod/config` for ports, URLs, and credentials instead of
`process.env`.

## Gotcha

The workspace-root lookup means `@gmod/config` behaves differently depending on *where* `.env` actually is —
it is always the repo root `.env`, regardless of which app/package imports it from.
