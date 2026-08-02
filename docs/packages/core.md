# `@gmod/core`

Cross-cutting application logic that doesn't belong to one specific domain. The catch-all for shared
utilities, v3 API request/response models, and shared Express types.

## Layout

```text
src/
  classes/
    db/          Query.js, Server.js — low-level query/DB helper classes
    v3/          Angle, BaseClass, CustomValues, PlayerGmod, Position, Team — shared v3 API value classes
  database/
    gm_server_logs.js   MongoDB-backed server logs (chat/kill/event history), used by apps/api and by
                         domain-compliance for GDPR export/erasure
  models/
    gmod/         gmodErrorsModels.js — in-game error report shapes
    v3/           one file per v3 API resource (clients, guilds, leaderboard, main, servers,
                   serversPlayers, steam, usersAdmin, users) — request/response models consumed by
                   apps/api's v3 controllers
    webhooks/      gmodStoreModels.js
  types/
    express.d.ts   global Express Request augmentation (req.server, req.panelUser, ...) — see
                    architecture.md#global-express-typing
  utils/
    instrument.js, discordFormat.js, localizations.js, logger.js, tools.js, update-log.js
```

## When to put logic here vs. `domain-*`

- `core`: applies across domains (logging, localization, formatting, generic DB/query helpers, Express
  typing) or is the v3 API's own request/response modeling.
- `domain-*`: business logic tied to one concept (a server, a guild, a user, a ban).

`core` is allowed to depend on every `domain-*` and `infra-*` package (see
[architecture.md — Allowed dependencies](../architecture.md#allowed-dependencies)); the reverse is not true.

## Used by

`apps/api` most heavily (v3 models, Express types, DB logging); `logger.js`/`tools.js` are used from almost
every app and package.
