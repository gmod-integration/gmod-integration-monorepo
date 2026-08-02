# Documentation Map

Technical documentation for engineers and AI agents working in this monorepo.

This is **not** the product documentation (installation, Discord commands, dashboard guides). That lives in
[`apps/docs`](../apps/docs) and is published at [docs.gmod-integration.com](https://docs.gmod-integration.com).
This `./docs` folder is internal: it explains how the codebase is built, why it's built that way, and what
each folder is responsible for.

Start here: [`AGENT.md`](../AGENT.md) at the repo root has the non-negotiable rules. This file is the index
of everything else.

## Read first

| Doc | Answers |
| --- | --- |
| [architecture.md](./architecture.md) | What are the moving pieces, why this split, how does a request flow end to end? |
| [best-practices.md](./best-practices.md) | Where do I put new code, how do I keep it consistent with the rest? |
| [migration-playbook.md](./migration-playbook.md) | How do I move code from an `app` into a shared `package` safely? |
| [deployment/swarm.md](./deployment/swarm.md) | How do I deploy/operate the production Docker Swarm stack? |

## Repo map

Everything below is a short description with a link to a dedicated file that goes into detail (key files,
responsibilities, gotchas, what depends on it and what it depends on).

### `apps/*` — runtime entrypoints

| App | Role | Detail |
| --- | --- | --- |
| `api` | Express HTTP API. Entry point for the GMod addon, the website/dashboard, and outside webhooks (GmodStore). | [docs/apps/api.md](./apps/api.md) |
| `discord` | The Discord bot(s) (one main bot + per-guild custom bots) and the BullMQ workers that execute Discord actions requested by other apps. | [docs/apps/discord.md](./apps/discord.md) |
| `websocket` | Real-time WebSocket gateway. Keeps a live connection to each GMod server and to connected dashboard clients. | [docs/apps/websocket.md](./apps/websocket.md) |
| `website` | React/Vite frontend: public site + user/guild dashboard, talks to `api` and `websocket`. | [docs/apps/website.md](./apps/website.md) |
| `docs` | The Docusaurus site that publishes the **product** documentation (this `./docs` folder is not part of it). | [docs/apps/docs.md](./apps/docs.md) |

### `packages/*` — shared code

Nothing in `apps/*` should contain business logic that another app also needs — that logic lives here instead.

| Package | Role | Detail |
| --- | --- | --- |
| `config` | Loads and validates all environment variables (Zod). Single source of truth for config. | [docs/packages/config.md](./packages/config.md) |
| `schema` | Zod schemas shared across apps: BullMQ job/reply payloads, GMod entities, DB-facing shapes. | [docs/packages/schema.md](./packages/schema.md) |
| `core` | Cross-cutting application logic: v3 API models, DB helpers, formatting/localization/logging utilities, shared Express types. | [docs/packages/core.md](./packages/core.md) |
| `domain-server` | Everything about a registered GMod server: settings, status channel, Discord bridge. | [docs/packages/domain-server.md](./packages/domain-server.md) |
| `domain-guild` | Everything about a Discord guild: settings, verification, custom bot, links to servers. | [docs/packages/domain-guild.md](./packages/domain-guild.md) |
| `domain-user` | Player/panel user identity: Steam ID, Discord ID, rank, dashboard auth. | [docs/packages/domain-user.md](./packages/domain-user.md) |
| `domain-moderation` | Warns and bans (in-game moderation actions). | [docs/packages/domain-moderation.md](./packages/domain-moderation.md) |
| `domain-compliance` | GDPR data export/erasure requests. | [docs/packages/domain-compliance.md](./packages/domain-compliance.md) |
| `domain-gmod` | Typed models for in-game concepts reported by the addon (players, entities, teams, weapons, screenshots, errors). | [docs/packages/domain-gmod.md](./packages/domain-gmod.md) |
| `infra-prisma` | Prisma client (MariaDB) — the relational database. | [docs/packages/infra-prisma.md](./packages/infra-prisma.md) |
| `infra-mongo` | MongoDB client — used for high-volume logs. | [docs/packages/infra-mongo.md](./packages/infra-mongo.md) |
| `infra-redis` | Redis client — cache, pub/sub, BullMQ backing store. | [docs/packages/infra-redis.md](./packages/infra-redis.md) |
| `infra-bullmq` | BullMQ queues + the request/reply adapters used to call Discord from any app. | [docs/packages/infra-bullmq.md](./packages/infra-bullmq.md) |
| `infra-websocket` | BullMQ queues used to push messages to the `websocket` app from other apps. | [docs/packages/infra-websocket.md](./packages/infra-websocket.md) |
| `infra-minio` | S3-compatible object storage (avatars, screenshots, GDPR export archives). | [docs/packages/infra-minio.md](./packages/infra-minio.md) |
| `infra-steam` | Steam Web API client (user summaries, avatars). | [docs/packages/infra-steam.md](./packages/infra-steam.md) |
| `locales` | Raw translation JSON files consumed by `core`'s localization utilities and the website. | [docs/packages/locales.md](./packages/locales.md) |

### `submodules/*` — the actual Garry's Mod addon

| Submodule | Role | Detail |
| --- | --- | --- |
| `gmod-integration` | The Lua (GLua) addon that runs on the GMod server and talks to `api`/`websocket`. This is the client of everything documented above. It has its own `AGENTS.md`. | [docs/submodules/gmod-integration.md](./submodules/gmod-integration.md) |

## Not in this map

- `packages/*/generated`, `dist`, `node_modules`, `.turbo`: build/generated output, never edit by hand.
- `backup/`, `logs/`: runtime artifacts, not source.
