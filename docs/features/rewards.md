# Rewards

Rewards connects durable verification, accepted votes and recorded playtime to per-server reward rules.
The dashboard also supports explicitly authorized manual rules. Steam and Discord must be linked.
This first version supports DarkRP money, Pointshop points, Pointshop 2 standard points and additive
Discord roles, plus custom server-side Lua actions. Boosts, temporary ranks, XP and arbitrary addon
events are not implemented.

## Ownership and access

- `packages/schema/src/server/RewardsSchema.ts` defines strict rule, history, simulation, poll and receipt contracts.
- `packages/core/src/models/v6/rewards.ts` owns eligibility, persistence, deduplication, delivery and expiry.
- `rewardsEvents.ts` reconciles successful verification, votes, connection and recorded session events.
  A reward failure cannot roll back the source event; addon polls repair missed evaluations.
- `apps/api/src/routes/v6/rewardsRoutes.ts` uses application sessions, trusted origins, CSRF and fresh
  mutation permissions through the shared dashboard middleware. Servers must belong to the named community.
- `rewards.rules` is a Premium capability. Delivery rechecks current entitlement and the saved rule;
  administrators can still disable or delete rules after access expires. History remains readable.

MongoDB stores `gm_reward_rules`, `gm_reward_grants` and `gm_reward_integrations` in `gmod_integration`.
The engine creates its indexes lazily; no SQL schema migration is required. Grants freeze the recipient,
rule name, action amounts, Lua source and delivery deadline. Rule updates use a revision compare-and-swap; deletion
preserves history. Editing a one-shot rule does not reset previously earned grants.

## Dashboard HTTP contract

The prefix is `/v6/guilds/:guildID/servers/:serverID/rewards`.

| Method | Suffix                    | Purpose                                                                    |
| ------ | ------------------------- | -------------------------------------------------------------------------- |
| GET    | `/`                       | Rules and last integration report                                          |
| POST   | `/rules`                  | Create a complete rule                                                     |
| PUT    | `/rules/:ruleID`          | Replace a rule using `{ revision, rule }`                                  |
| DELETE | `/rules/:ruleID`          | Soft-delete using `{ revision }`                                           |
| GET    | `/history`                | Paginated history; filters: status, ruleID, steamID64                      |
| POST   | `/rules/:ruleID/simulate` | Read eligibility for `{ steamID64 }`; no grant or delivery                 |
| POST   | `/rules/:ruleID/grant`    | Manual attribution with rule revision, Steam ID, reason and UUID requestID |

Rules contain one to five configured actions, an optional schedule and a one-to-thirty-day pending deadline.
Verification and playtime rewards are one-shot per rule/player. Vote rules use accepted durable vote
records and respect both the vote source cooldown and the configured reward cooldown. Manual rules use
a retained request UUID so retrying a lost response cannot repeat attribution. A manual attribution of
a one-shot rule shares its automatic deduplication boundary.

Playtime means persisted `gm_server_stat.total_time`, currently updated when a session ends. It is not
an AFK-filtered live timer. Existing linked identities and recorded playtime can qualify when a rule is
enabled; creating a rule does not itself distribute anything. Votes predating rule creation do not qualify.

## Addon delivery

The new server-only `modules/rewards/sv_rewards.lua` polls through the acknowledged `gmInte.api`
WebSocket transport. The gateway binds both endpoints to the authenticated game server:

- `POST /servers/:serverID/rewards/poll`: detected integrations plus up to 64 online Steam IDs.
- `POST /servers/:serverID/rewards/ack`: delivery UUID/token and per-action results.

Each response contains at most 10 deliveries of at most 5 immutable economy or Lua actions, with Unix
expiry seconds. Lua actions carry only their UUID, explicit `lua` type and validated source; economy
actions carry bounded integer amounts. Wallet readiness and optional dependencies are checked locally.
Offline players and unavailable wallets remain pending until the deadline.

Before applying an economy or Lua action, the addon commits a `started` record to local GMod SQLite.
A repeat delivery reads that journal instead of executing again. Lua journal fingerprints bind the
exact script source, recipient, action and expiry. A crash between the effect and its final record
leaves the result uncertain; the action is never automatically replayed. Missing or failed journal
storage prevents execution. Preserve the GMod SQLite database when moving/restoring a server.

Backend action updates use a version compare-and-swap. Late or repeated failure receipts cannot undo
a confirmed success. Pending, delivered, failed, expired and uncertain outcomes remain distinguishable;
partial bundles retain each action's result. An uncertain game action requires staff investigation.

## Lua actions

The administrative rule editor accepts a `lua` action with a nonblank source of at most 16,384 UTF-16
characters; multiline source is preserved and NUL bytes are rejected. Saving or simulating a rule does
not execute its script. The existing server administration and Premium capability checks apply.

The addon compiles the script with `CompileString` and executes the compiled chunk only after recording
the durable start marker, on the dedicated server with its normal Lua environment. Chunk locals are:

- `ply`: the currently connected recipient Player.
- `steamID64`: that recipient's Steam ID64 string.
- `reward`: `{ id, actionID, name, steamID64 }`, describing this immutable delivery.

No string placeholder substitution occurs. Compile errors report `failed / lua_compile_failed` before
any script execution; runtime errors or an explicit false return leave the result `uncertain` because
side effects may already have happened. Scripts and raw error details are not written to player chat
or delivery logs. Successful execution means the synchronous chunk returned successfully; callbacks
scheduled by a script have their own lifecycle.

Script source is available only in administrative rule configuration and authenticated addon delivery.
Player reward views, action history and recipient account exports omit it. Lua does not depend on an
economy addon; a compatible Gmod Integration addon is still required.

## Discord

`/rewards server:<server> [page:<n>]` privately shows the invoking player's conditions, recorded progress,
contents and latest outcomes. It never exposes another player's history or accepts a foreign server.

Role delivery uses `enqueueDiscordRewardRole`, the existing `discord-guildOps` queue and a correlated
provider acknowledgement. The worker rechecks the persisted grant, identity, rule and entitlement before
adding only the selected role. Managed, everyone and unmanageable roles are rejected. Rechecking an
uncertain additive role is idempotent. `startRewardsWorker` performs bounded background sweeps so Discord
rewards and expiry continue while the game server is offline.

Account exports include recipient reward history without delivery tokens, Lua source or deduplication internals.
Erasure removes recipient grants and anonymizes the erased administrator on other grants and rules,
preserving other players' grants and community configuration.

## Validation and release

Run the Rewards schema/core tests, API route/session tests, website behavior tests, Discord command/role
tests and the addon's mocked Lua suite. Typecheck, lint and architecture checks cover the application
boundaries. Deploy the compatible API, gateway and Discord worker before distributing the addon.
Register the new Discord slash command through the existing command publication workflow.

These checks do not replace a dedicated Garry's Mod acceptance test: verify each installed economy's
wallet loading and persistence, a connected player, offline delivery, map change, restart, dropped
acknowledgement, journal failure and expired entitlement. In particular, a third-party integration
returning without an error does not prove its own asynchronous database commit survived a process crash.
