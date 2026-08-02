import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Runs before every test file in every project (wired via vitest.config.base.ts's
// `setupFiles`). Points @gmod/config at .env.test so anything that imports it (directly or
// transitively) gets schema-valid dummy values instead of process.exit(1)-ing or requiring a
// real .env. See docs/ (test coverage implementation plan) for why this exists.
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))

process.env.CONFIG_ENV_FILE = resolve(repoRoot, '.env.test')
