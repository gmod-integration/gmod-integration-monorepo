import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

// Runs before every test file in every project (wired via vitest.config.base.ts's
// `setupFiles`). Points @gmod/config at .env.test so anything that imports it (directly or
// transitively) gets schema-valid dummy values instead of process.exit(1)-ing or requiring a
// real .env.
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const envTestPath = resolve(repoRoot, '.env.test')

// @gmod/config's own env loading uses dotenv's `override: false`, so it never overwrites a var
// that's already present in process.env when it runs. That's normally the right call, but it
// means .env.test can silently lose to *anything* already sitting in process.env when tests
// start — a developer's shell that happens to have the real (gitignored) repo .env exported
// (sourced by some other tool, a previous `source .env`, etc.), or Vite/Vitest's own env
// handling. Rather than depending on no such value ever being present, clear .env.test's own
// keys first so .env.test is unconditionally authoritative for every test run, in every shell.
const envTestKeys = new Set(Object.keys(dotenv.parse(readFileSync(envTestPath, 'utf8'))))

// packages/config/src/website.ts reads a few of its own env vars that aren't part of
// ConfigSchema/.env.test above (its own separate WebsiteConfigSchema) — clear those too, for
// the same reason. Keep in sync with WebsiteConfigSchema's fields in that file.
for (const key of ['WEBSITE_WS_URL', 'WEBSITE_DEV_SHOW_MISSING_TRANSLATIONS']) {
  envTestKeys.add(key)
}

for (const key of envTestKeys) {
  delete process.env[key]
}

process.env.CONFIG_ENV_FILE = envTestPath
