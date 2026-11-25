# `@gmod/shared`

Small runtime primitives shared by applications and domain packages. This package has no application
workflows, Discord clients, database access, queues or domain dependencies.

## Direct exports

- `@gmod/shared/BaseClass.js`: the existing object validation base class used by v3 value objects and servers.
- `@gmod/shared/generateToken.js`: cryptographically random alphanumeric tokens with rejection sampling.
  The requested length must be a positive integer.
- `@gmod/shared/logger.js`: `gmLog(type, message, debug?)`, which writes timestamped operational messages.
  Debug messages follow `ConfigServer.dev`.

Import the required module directly. There is no aggregate package export and no compatibility proxy
through core. `BaseClass` and token generation have no workspace dependencies; only the logger imports
`@gmod/config` to read the development flag. Node's `randomUUID()` creates UUIDs where a UUID, rather
than an alphanumeric token, is required.

## Ownership

Keep game/server event logging in `@gmod/core/utils/logger.js`. Keep integration clients, data access and
business rules in their owning packages. Adding a primitive here must not create a dependency back to
core, a domain package, infrastructure clients or an application.

The workspace architecture check validates imports and declared dependencies together to prevent
cross-application imports and dependency cycles. Tests for the three primitives live in
`packages/shared/test`.

## JSON structural budgets

`@gmod/shared/jsonBudget.js` exports `hasJSONBudget(value, budget)`, an iterative preflight for decoded
JSON. Callers supply depth, node, array, object-key and string/total-character limits. It rejects cycles,
non-JSON objects, non-finite numbers and reserved prototype keys without recursively allocating schema
errors. It complements transport byte limits and typed route validation; it grants no authority.
