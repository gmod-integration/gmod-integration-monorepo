# `submodules/gmod-integration`

The actual Garry's Mod addon (GLua) — the client of everything else in this monorepo. It runs on the customer's
GMod dedicated server and talks to `apps/api` (HTTP) and `apps/websocket` (persistent socket), authenticated
with a server token/ID (see [architecture.md — end-to-end data flow](../architecture.md#end-to-end-data-flow)).

This is a **separate git repository**, pinned as a submodule (`.gitmodules`: `submodules/gmod-integration` →
`git@github.com:gmod-integration/gmod-integration.git`). Editing it means editing files inside that submodule
checkout and committing there — it is not part of the Bun/Turbo workspace, has its own dependency-free GLua
toolchain, and its own release pipeline (Steam Workshop GMA packaging via `.github/workflows/auto-release.yml`
inside the submodule).

Why kept separate: see
[architecture.md — why is the GMod addon a separate submodule](../architecture.md#why-is-the-gmod-addon-a-separate-submodule-not-part-of-this-workspace).

## Its own documentation

The submodule maintains its own agent/contributor docs — read those, not this page, before changing addon
code:

- [`submodules/gmod-integration/AGENTS.md`](../../submodules/gmod-integration/AGENTS.md) — working agreement:
  repo map, non-negotiable rules (GLua syntax preservation, realm prefixes `sv_`/`cl_`/`sh_`, never expose
  tokens/screenshots/bug reports to clients, validate every net payload server-side, treat every WebSocket
  handler as privileged remote input, don't touch `gmInte.version`, don't edit persisted config keys without a
  migration).
- [`submodules/gmod-integration/docs/architecture.md`](../../submodules/gmod-integration/docs/architecture.md) —
  addon-side runtime/data-flow.
- [`submodules/gmod-integration/docs/development.md`](../../submodules/gmod-integration/docs/development.md) —
  change and validation rules.

## Repo map (from the submodule's own AGENTS.md)

- `lua/autorun/gmod_integration.lua` — bootstrap, version, config loading, realm-aware recursive loader.
- `lua/gmod_integration/core/` — HTTP, WebSocket, config, networking, security helpers, UI, shared utilities.
- `lua/gmod_integration/modules/` — product features and third-party addon integrations.
- `lua/gmod_integration/languages/` — translation tables (English is the fallback — same convention as
  [`@gmod/locales`](../packages/locales.md) on the backend side).
- `materials/gmod_integration/` — shipped UI assets.
- `addon.json` — Steam Workshop packaging manifest.

## Where it meets this monorepo

- HTTP: authenticates against `apps/api` using the server token/ID issued when a server is registered (see
  [`@gmod/domain-server`](../packages/domain-server.md)'s `Server.isValidToken`).
- WebSocket: opens a persistent connection to `apps/websocket` with the same credentials — see
  [docs/apps/websocket.md](../apps/websocket.md) for the handshake and message actions (`save_config`,
  `server_status`).
- Payload shapes on both sides are meant to line up with [`@gmod/schema/gmod/*`](../packages/schema.md) and
  [`@gmod/domain-gmod`](../packages/domain-gmod.md) — if you change a field here, check those too.
