# `@gmod/domain-gmod`

Typed models for the in-game concepts the Lua addon reports up: players, entities, teams, weapons, positions,
angles, screenshots, captured error reports, and a server snapshot that composes them.

## Files

Each file is a small class validated against the matching `@gmod/schema/gmod/*Schema.js` Zod schema:

- `GmodServer.ts` — a server snapshot (hostname, ip, port, map, player count, `playersList: GmodPlayer[]`).
- `GmodPlayers.ts` — a connected player (Steam ID, name, user group, kills/deaths, connect time, position,
  angle, team, weapon).
- `GmodTeam.ts`, `GmodWeapon.ts`, `GmodEntity.ts`, `GmodPosition.ts`, `GmodAngle.ts` — supporting value types.
- `GmodScreenshot.ts` — a screenshot report (used by the Discord screenshot-relay feature via
  `enqueueMainClientUploadScreenshot`, see [infra-bullmq](./infra-bullmq.md)).
- `GmodCaptureData.ts` — generic captured payload wrapper.
- `GmodErrors.ts` — in-game Lua error reports, stored in MongoDB (`gmod_integration.errors` collection via
  `@gmod/infra-mongo`), with count/offset/limit querying — used by `apps/api`'s `GmodErrorsControllers` and by
  `@gmod/domain-compliance` for GDPR export.

## Depends on

`@gmod/infra-mongo`, `@gmod/schema`.

## Used by

`apps/api` (parsing what the addon posts), `@gmod/domain-compliance`.

## See also

The addon side of these payloads: [docs/submodules/gmod-integration.md](../submodules/gmod-integration.md).
