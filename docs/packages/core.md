# `@gmod/core`

Cross-cutting application logic: v3 API request/response models, server event logging, localization,
database helpers and shared Express types. Small runtime primitives live in
[`@gmod/shared`](./shared.md) so domain packages do not import application workflows to use them.

## Layout

```text
src/
  classes/
    db/          Query.js, Server.js — low-level query/DB helper classes
    v3/          Angle, CustomValues, PlayerGmod, Position, Team — v3 API value classes
  database/
    gm_server_logs.js   MongoDB-backed server logs (chat/kill/event history), used by apps/api and by
                         domain-compliance for GDPR export/erasure
  models/
    discordProfile.js  best-effort Discord profile decoration for browser sessions
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

- `core`: applies across domains (server event logging, localization, formatting, DB/query helpers, Express
  typing) or is the v3 API's own request/response modeling.
- `domain-*`: business logic tied to one concept (a server, a guild, a user, a ban).
- `shared`: object validation (`BaseClass`), secure token generation and simple operational logging
  (`gmLog`). Import these modules directly from `@gmod/shared`; they do not load core workflows.

`core` depends on domain and infrastructure packages. Do not introduce a reverse dependency that creates
a cycle. Existing compliance exports and moderation localization consume specific core modules; the
workspace architecture check verifies their actual imports and declared dependencies.

`models/discordProfile.js` reads the shared profile cache and restores missing avatar decoration
through the existing Discord queue adapter. Cache and provider deadlines, deduplicated lookups and a
short retry cooldown keep profile failures separate from authentication. The returned names and
avatar URL contain presentation data only; session identity and permissions still come from the
authenticated session and database user.

## Used by

`apps/api` most heavily (v3 models, Express types, DB logging), and Discord/WebSocket workflows where
shared application logic is needed. `utils/logger.js` owns server event logging; operational messages
come from `@gmod/shared/logger.js`.

## Screenshot image storage

`utils/boundedRasterScreenshot.js` is the common raster boundary used by `models/v3/clientsModels.js`
for ordinary screenshot uploads and optional bug-report captures, regardless of HTTP or addon
transport. It accepts canonical inline base64 or JPEG/PNG data URLs, capped at 10 MiB of base64 payload
(approximately 7.5 MiB decoded); the surrounding HTTP/body and WebSocket/frame limits still apply.
Only decoded JPEG/PNG signatures are accepted. Input dimensions are limited to 8192 per side and
32,000,000 pixels with a single page; normal 3840×2160 captures remain supported. The image is decoded
and re-encoded to the selected PNG or JPEG format (JPEG quality95), stripping metadata and trailing
content before storage. Encoded output is limited to 10 MiB. Sharp receives only Buffer input.

Capture-coordinate/quality metadata retains its existing JSON shape; it does not determine decoder
limits. Personal-data collection is checked before decoding, again immediately before the first
storage operation and after existing storage/publication/database boundaries. Validation failures
become the controlled `invalid_screenshot` upload response; invalid optional bug-report attachments
continue to be omitted without discarding the textual report. No legacy stored object is decoded on
read by this workflow.
