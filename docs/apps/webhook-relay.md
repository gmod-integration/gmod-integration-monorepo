# `apps/webhook-relay`

Small HTTP service that posts messages to Discord **webhooks** on behalf of the API. Entry point:
[`src/index.ts`](../../apps/webhook-relay/src/index.ts) → [`src/main.ts`](../../apps/webhook-relay/src/main.ts).
Default port `3000`.

Migrated from the standalone repo `gmod-integration/webhook_relay` (last commit there: `7df59c6`).

## Who calls it

`packages/core`, over plain HTTP. `getRandomDiscordRelay()` in
[`packages/core/src/utils/tools.ts`](../../packages/core/src/utils/tools.ts) picks a relay URL at random from a
hardcoded list (today `https://1-dsc-relay.gmod-integration.com`, or `https://dsc-relay-dev.gmod-integration.com`
in dev), and sends `Authorization: Bearer <BARER_DISCORD_RELAY>`:

| Caller                              | Feature                   | Payload `data`                                  |
| ----------------------------------- | ------------------------- | ----------------------------------------------- |
| `models/v3/serversPlayersModels.ts` | Chat sync, GMod → Discord | `username`, `avatarURL`, `content`              |
| `models/v3/clientsModels.ts`        | Screenshot reports        | `username`, `avatarURL`, `embeds`               |
| `utils/logger.ts`                   | Server logs channels      | `username`, `avatarURL`, `embeds`, `filesToAdd` |

Webhooks need no bot login, so this path does not go through `apps/discord` / BullMQ like other Discord
side effects do (see [architecture.md](../architecture.md)).

## Standalone by design

The relay runs on hosts that have none of the rest of the stack (no MariaDB, Redis, bot token...), so:

- **No `@gmod/*` imports.** Enforced by an ESLint `no-restricted-imports` rule scoped to `apps/webhook-relay`.
  This is the one app that does _not_ read its env through `@gmod/config`: that schema requires every variable
  of the whole stack.
- **Its own three env vars**, validated at startup by [`src/config.ts`](../../apps/webhook-relay/src/config.ts):

  | Variable      | Default      |                                                                                           |
  | ------------- | ------------ | ----------------------------------------------------------------------------------------- |
  | `BARER_TOKEN` | _(required)_ | Must equal `BARER_DISCORD_RELAY` in the API's env. The relay refuses to start without it. |
  | `APP_PORT`    | `3000`       |                                                                                           |
  | `APP_HOST`    | `0.0.0.0`    |                                                                                           |

- **Its own image**: [`Dockerfile`](../../apps/webhook-relay/Dockerfile) bundles the app into one file
  (`bun build`) and ships only that on `oven/bun:*-slim`, running as the non-root `bun` user, with a
  `HEALTHCHECK` on `GET /`. CI publishes it as `ghcr.io/gmod-integration/gmod-integration-webhook-relay`
  (`latest` + `sha-<commit>`), only when `apps/webhook-relay/**` or `bun.lock` change.
- **Runs on Bun** (`Bun.serve`), not Node.

## HTTP contract

| Route          | Auth                                  |                                                     |
| -------------- | ------------------------------------- | --------------------------------------------------- |
| `GET /`        | none                                  | `Hello World`. Uptime check and Docker healthcheck. |
| `GET /metrics` | none                                  | Prometheus metrics (see below).                     |
| `POST /`       | `Authorization: Bearer <BARER_TOKEN>` | Relays one message.                                 |

`POST /` body: `{ "webhookID": "<digits>", "webhookToken": "<[A-Za-z0-9_-]>", "data": { ... } }`. `data` is
passed to discord.js's `WebhookClient.send()` as is, except:

- `filesToAdd: [{ name, content }]` becomes text attachments;
- a caller-supplied `files` is dropped: discord.js would resolve string entries as paths or URLs _on the relay
  host_.

| Status | When                                                                                                                                            |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `200`  | Sent; body is the message Discord returned.                                                                                                     |
| `400`  | Invalid JSON, `Missing parameters` (empty id/token/data, e.g. a channel never configured), `Invalid parameters`, or the webhook is blacklisted. |
| `401`  | Missing or wrong bearer token.                                                                                                                  |
| `500`  | Discord refused the message; `error` carries the reason.                                                                                        |

The API callers only check `res.ok`.

## Behaviour worth knowing

- **One discord.js `WebhookClient` per webhook**, cached so its rate-limit state survives between requests.
  The cache is LRU, capped at 2000 clients; evicted clients are `destroy()`ed.
- **Dead webhooks are skipped for 10 minutes.** After Discord answers `Unknown Webhook` (10015) or
  `Invalid Webhook Token` (50027), further requests for that id/token get `400` without calling Discord.
  The blacklist is in memory, per replica.
- **Logs never contain webhook tokens or message content**: only the webhook id and the error.
- **Metrics** (names unchanged from the standalone repo, so existing dashboards keep working):
  `relay_messages_total`, `relay_messages_failed_total`, `relay_messages_last_60_seconds`,
  `relay_messages_last_300_seconds`, plus `@hono/prometheus`'s `http_request_duration_seconds` /
  `http_requests_total`.
- **SIGTERM/SIGINT** stop accepting connections, let in-flight requests finish, then exit `0`.

## Run it

```bash
# Local, from the repo root. Reads apps/webhook-relay/.env (see .env.example), never the root .env.
bun run webhook-relay:dev

# Docker, from the repo root
docker build -f apps/webhook-relay/Dockerfile -t webhook-relay .
docker run --rm -e BARER_TOKEN=... -p 3000:3000 webhook-relay
```

## Changes from the standalone repo

- Fixed: the published image ran `node dist/index.js` on a Bun-style `export default { fetch, port }`, which
  Node does not serve. The app now calls `Bun.serve` explicitly and the image runs on Bun.
- Fixed: with `BARER_TOKEN` unset, a request without an `Authorization` header was accepted
  (`undefined === undefined`). The token is now required at startup and compared in constant time.
- Fixed: logs printed `webhookID:webhookToken` and the content of every message.
- Fixed: the client cache and blacklist grew without bound.
- Added: input validation (`webhookID`/`webhookToken` format), `400` on invalid JSON instead of a `500`,
  `files` stripping, graceful shutdown, `50027` added to the blacklist trigger (was: message text
  `Unknown Webhook` only).
- Dropped: `dotenv` (Bun loads `.env` itself) and the unused `DISCORD_BOT_TOKEN` variable.
- Not migrated: the old repo's `docker-compose.yml` (Traefik + 4 replicas + Watchtower + Prometheus +
  Grafana), its `k8s` branch, and its own Sonar project. Hosts still running
  `ghcr.io/gmod-integration/webhook_relay:latest` through Watchtower keep that image until they are pointed at
  the new one.
