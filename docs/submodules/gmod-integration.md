# `submodules/gmod-integration`

The actual Garry's Mod addon (GLua) — the client of everything else in this monorepo. It runs on the customer's
GMod dedicated server and talks to `apps/websocket` through an authenticated persistent socket.
Screenshots, reports and errors from players travel over Garry's Mod `net` to that server and then
through its socket; platform credentials stay on the dedicated server. The new addon does not use HTTP
for connected features. Existing HTTP routes remain for older installed releases during transition.
The legacy server-info response projects only ID, name and community, matching the non-secret identity
fields used by connection checks. Admin config snapshots and console output omit the stored token;
the in-game token field accepts a new value and displays only whether a token is configured. Connection
test callbacks revalidate the recipient's live permission before sending a projected response.
DNS WebSocket destinations use TLS; the local plaintext exception accepts only exact `localhost` or
canonical private/loopback IPv4 addresses, with an optional port.

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

- WebSocket: authenticates using the server token/ID issued at registration, through
  [`@gmod/domain-server`](../packages/domain-server.md)'s `Server.isValidToken`. The shared
  [addon protocol](../packages/addon-transport.md) uses `addon.ready`, `addon.request` and
  `addon.response`, with explicit endpoint allowlisting and no requests to the HTTP application.
- The gateway reuses shared core models for configuration, lifecycle, moderation, player telemetry,
  money trackers and client tools. Existing server-to-addon command methods retain explicit validators.
- Payload shapes on both sides are meant to line up with [`@gmod/schema/gmod/*`](../packages/schema.md) and
  [`@gmod/domain-gmod`](../packages/domain-gmod.md) — if you change a field here, check those too.

Run `python3 submodules/gmod-integration/scripts/test_lua.py` from this repository for mocked transport
and relay regressions. These checks complement the TypeScript schema/core/gateway tests; they do not
replace staging on a dedicated Garry's Mod server with GWSockets and ordinary/admin test clients.

Dashboard console commands use `wsPanelRcon`: the API checks current server dashboard permissions
and the addon validates the bounded command, authenticated Discord actor, UUID and deadline. Dashboard
access requires Discord administrator plus a recorded rank enabled on the target server, except for
the Discord owner or linked active GmodStore buyer. The addon adds no player connection or live rank
requirement to that authorization. Discord RCON continues to
use `wsAuthorizedRcon`, with its linked SteamID64 and online `gmInte.config.adminRank` check.
Both methods reject the legacy `wsRcon` handler. Request IDs are deduplicated before console submission. It returns a
matching `addon.command-result`; success means console acceptance, not verification of command
output. The old method is rejected. An older addon cannot execute the new method, so upgrade the
addon with the matching backend release. Deadlines require reasonably aligned server clocks.
