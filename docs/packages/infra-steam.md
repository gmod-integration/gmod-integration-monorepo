# `@gmod/infra-steam`

Steam Web API client wrapper (via the `steamapi` package).

## Exports (`src/index.ts`)

- `getSteamApi()` — the underlying `steamApi` client (`ConfigSteam.apiKey`).
- `getSteamUserSummary(steamID64)`, `getSteamUserAvatars(steamID64)` — raw Steam profile lookups.
- `getSteamUserAvatarLarge(steamID64)` — fetches the large avatar and stores it via
  [infra-minio](./infra-minio.md)'s `ensureAvatarStored`, so repeated lookups don't re-hit Steam.

## Used by

`apps/api` (Steam-linked profile endpoints, `steamRoutes.ts` / `steamControllers.ts`).
