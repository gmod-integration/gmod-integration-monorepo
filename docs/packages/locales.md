# `@gmod/locales`

Raw translation JSON files: `en.json`, `fr.json`, `de.json`, `es.json`, `it.json`, `nl.json`, `pl.json`,
`ru.json`, `tr.json`. No code — just data. Dutch currently covers the server status message and its
connection button; other keys fall back to English.

## Used by

- `@gmod/core/utils/localizations.js` and `@gmod/domain-guild/localizations.ts` (backend/Discord-facing
  strings — English is the fallback when a key is missing in another language).
- `apps/website/src/locales` and `apps/website/src/i18n.tsx` (frontend UI strings).

Status previews can supply the website's selected language through the optional `locale` field in
`StatusMessagePreviewInputSchema`. When omitted, rendering uses the Discord guild's preferred language.

## Adding a string

Add the key to `en.json` first (the fallback), then to every other language file you can translate; missing
keys elsewhere fall back to English rather than breaking.
