# `@gmod/locales`

Raw translation JSON files: `en.json`, `fr.json`, `de.json`, `es.json`, `it.json`, `pl.json`, `ru.json`,
`tr.json`. No code — just data.

## Used by

- `@gmod/core/utils/localizations.js` and `@gmod/domain-guild/localizations.ts` (backend/Discord-facing
  strings — English is the fallback when a key is missing in another language).
- `apps/website/src/locales` and `apps/website/src/i18n.tsx` (frontend UI strings).

## Adding a string

Add the key to `en.json` first (the fallback), then to every other language file you can translate; missing
keys elsewhere fall back to English rather than breaking.
