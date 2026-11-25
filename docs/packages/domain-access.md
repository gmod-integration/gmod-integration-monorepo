# @gmod/domain-access

The server-side source of commercial access decisions for communities and their GMod servers.
It depends on configuration, Prisma, Redis and shared schemas, without importing Guild or Server.
Those classes delegate to this package, avoiding a dependency cycle.

## Catalogue and sources

`packages/schema/src/server/AccessPolicySchema.ts` exports the browser-safe `ACCESS_POLICY`, capability
keys, response schemas and pure `hasCapability`, `capabilityLimit` and `limitResources` functions.
A `null` limit means no commercial count limit; technical request and Discord limits remain separate.

`resolveGuildAccess(guildID)` returns `guildID`, `premium`, `customBot`, `state`, `sources`, `revision`
and `validUntil`. Sources are a legacy community grant, an assigned non-revoked GmodStore purchase,
or a valid Discord subscription entitlement. The custom bot requires the GmodStore source specifically.
Removing one source preserves access granted by another valid source.

Discord lookup validates the application, configured SKU, community, dates, deletion and consumption
state, and follows bounded pagination. Provider failure produces `state: unknown` when no independent
source proves access. It is not recorded as a confirmed free subscription.

The shared snapshot cache lasts at most 60 seconds, shortened by known subscription expiry.
`invalidateGuildAccess` removes the snapshot and legacy boolean cache. An observed invalidation also
fences in-flight resolutions in that process. Cache failures do not remove a valid database grant.
Periodic revalidation bounds recovery from missed provider events; there is no indefinite grace period.

## Current limits

| Capability              | Free               | Premium                     |
| ----------------------- | ------------------ | --------------------------- |
| `guild.servers`         | 1                  | No commercial count limit   |
| `guild.links`           | 2                  | No commercial count limit   |
| `guild.auto_roles`      | 3                  | No commercial count limit   |
| `verification.roles`    | 2                  | No commercial count limit   |
| `sync.roles.rules`      | 4                  | No commercial count limit   |
| `sync.nicknames.rules`  | 3                  | No commercial count limit   |
| `status.buttons`        | 3 custom buttons   | 25 custom buttons           |
| `logs.history`          | Latest 500 records | No commercial history limit |
| `errors.history`        | Latest 50 records  | No commercial history limit |
| `sync.nicknames.format` | Available          | Available                   |

Teams, chat filters, log triggers, status charts, reverse synchronization, custom relay defaults,
verification preferences, bot presence and RCON require their named paid capabilities. `bot.custom`
requires a GmodStore purchase, independently of a Discord subscription. The automatic Connect button
is not included in the custom-button quota.

## Enforcement and expiry

`assertCapability` and `assertQuota` raise `AccessDeniedError` with a stable code, capability and
optional count information: `upgrade_required`, `quota_reached` or `entitlement_unknown`.
Unknown verification maps to HTTP 503; verified entitlement/quota denials map to 403. Authentication
and administration checks remain separate and precede commercial access checks.

Historical and complete creation payloads call the same commands. Count checks and inserts use a
transaction with a parent community/server row lock, preventing concurrent use of the last free slot.
Existing configuration is retained after expiry; cleanup does not require an upgrade.

Stored and effective settings are separate. `getSetting` returns saved values for editors;
`getEffectiveSetting` applies the free fallback to an unauthorized paid option. Returning to the free
value is permitted; keeping an unchanged stored value does not reactivate its paid execution.
Paid rules can be disabled or deleted without buying access again.

Runtime consumers use effective rules and settings. Count-limited lists select a deterministic initial
window before filtering enabled entries; remaining configuration is preserved. Team rules, chat filters,
triggers and charts stop taking effect without their capability. The registered-server quota prevents
additional registrations; it does not delete existing records or disconnect addon sessions.

Queued synchronization and RCON are checked again before WebSocket delivery, including delivery by
another gateway instance. Subscription create/update/delete events invalidate snapshots. GmodStore
revocation attempts bot reload after its durable update. Connected custom bots also reconcile access
periodically, including bots with custom presence disabled.

History queries select the latest permitted records first, then apply sort and pagination within that
window. History access is distinct from physical retention, live log delivery and personal data exports.

## Dashboard

Authenticated `/v6/guilds/:guildID/access` and its server-scoped counterpart return the snapshot plus
`usages` and optional `serverID`, without purchaser identity or credentials. The website consumes this
through `AccessProvider`, never a local-storage Premium flag. Scope changes, expiry, foreground refresh
and access errors trigger revalidation.

Entitlement verification and guild/server usage counts run concurrently after scope authorization;
usage counts remain live database reads. The provider shares an in-flight read for background refreshes
and preserves the snapshot when navigating within the same guild/server scope. Mutations and access
change events during a pending read queue one subsequent refresh so updated quotas are not lost.

The pure catalogue drives gates, quota displays and the comparison page. Network errors and missing
permissions remain distinct from upgrade requirements. A fresh unknown snapshot permits free actions
below their limits while paid access remains unavailable pending verification.

This catalogue implements the current free/Premium/historical offers. Module purchases and checkout
remain part of the broader v6 commerce work; a capability alone does not create a new product.
