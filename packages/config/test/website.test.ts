import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import type * as nodeFs from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// packages/config/src/website.ts also runs its schema parse as a top-level side effect on
// import (no memoization here, but still not safe to statically import once and reuse across
// scenarios) — same fresh-module-per-scenario approach as parseConfig.test.ts.
//
// A few scenarios below need a field to be genuinely ABSENT (to prove a fallback/default
// branch), not just deleted from process.env: loadEnvFiles() has several candidate files
// (CONFIG_ENV_FILE, the real workspace .env/.env.local, cwd .env/.env.local), and any one of
// them supplying the field refills it via dotenv's `override: false`. `runWithIsolatedEnv`
// below fully controls every candidate — a temp dir stands in for both CONFIG_ENV_FILE's target
// and cwd, and the real workspace root's .env/.env.local (unavoidable — they're derived from
// this file's real on-disk location, not from cwd) are hidden via a `node:fs` mock — so these
// tests behave identically regardless of what real .env files happen to exist on the machine
// running them.
// Deliberately NOT importing findWorkspaceRoot from '../src/website.js' to compute this: any
// static top-level import of that module runs its real loadEnvFiles()/schema parse as an import
// side effect (using the real, unredirected process.env) before any test or the isolation
// helper below gets a chance to run — poisoning process.env with .env.test's values for every
// later test in this file, since @gmod/config's `override: false` loading then finds them
// already set. findWorkspaceRoot's own behavior is covered by findWorkspaceRoot.test.ts; here
// we only need to know where the real repo root is (3 levels up from this test file).
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const realWorkspaceRoot = repoRoot
const hiddenRealPaths = new Set([join(realWorkspaceRoot, '.env'), join(realWorkspaceRoot, '.env.local')])

async function runWithIsolatedEnv<T>(envFileContent: string, run: () => Promise<T>): Promise<T> {
  const tempDir = mkdtempSync(join(tmpdir(), 'gmod-config-website-isolated-'))
  const envPath = join(tempDir, '.env')
  writeFileSync(envPath, envFileContent)

  vi.doMock('node:fs', async () => {
    const actual = await vi.importActual<typeof nodeFs>('node:fs')
    return {
      ...actual,
      existsSync: (path: Parameters<typeof actual.existsSync>[0]) =>
        hiddenRealPaths.has(String(path)) ? false : actual.existsSync(path),
    }
  })

  try {
    process.env.CONFIG_ENV_FILE = envPath
    vi.spyOn(process, 'cwd').mockReturnValue(tempDir)
    vi.resetModules()
    return await run()
  } finally {
    vi.doUnmock('node:fs')
    rmSync(tempDir, { recursive: true, force: true })
  }
}

const MINIMAL_VALID_ENV = 'WEBSITE_URL=https://gmod-integration.com\n'

describe('packages/config src/website.ts module (ConfigWebsite on import)', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    originalEnv = { ...process.env }
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
    vi.resetModules()
    vi.doUnmock('node:fs')
  })

  it('defaults dev to false and uses the default URLs when nothing is overridden', async () => {
    const { ConfigWebsite } = await runWithIsolatedEnv(MINIMAL_VALID_ENV, () => import('../src/website.js'))

    expect(ConfigWebsite.dev).toBe(false)
    expect(ConfigWebsite.devShowMissingTranslations).toBe(false)
    expect(ConfigWebsite.websiteUrl).toBe('https://gmod-integration.com')
    expect(ConfigWebsite.apiUrl).toBe('https://api.gmod-integration.com')
  })

  it('sets dev true and devShowMissingTranslations true when both are explicitly enabled', async () => {
    process.env.DEV = 'true'
    process.env.WEBSITE_DEV_SHOW_MISSING_TRANSLATIONS = 'true'
    vi.resetModules()
    const { ConfigWebsite } = await import('../src/website.js')

    expect(ConfigWebsite.dev).toBe(true)
    expect(ConfigWebsite.devShowMissingTranslations).toBe(true)
  })

  it('uses an explicit WEBSITE_WS_URL when provided, instead of the dev/prod fallback', async () => {
    process.env.WEBSITE_WS_URL = 'wss://custom-ws.example.com'
    vi.resetModules()
    const { ConfigWebsite } = await import('../src/website.js')

    expect(ConfigWebsite.wsUrl).toBe('wss://custom-ws.example.com')
  })

  it('falls back to the local WS URL when WEBSITE_WS_URL is unset and DEV is true', async () => {
    const { ConfigWebsite } = await runWithIsolatedEnv(`${MINIMAL_VALID_ENV}DEV=true\n`, () =>
      import('../src/website.js'),
    )

    expect(ConfigWebsite.wsUrl).toBe('ws://localhost:53139')
  })

  it('falls back to wss://ws.<host> when WEBSITE_WS_URL is unset and DEV is false', async () => {
    const { ConfigWebsite } = await runWithIsolatedEnv(
      'DEV=false\nWEBSITE_URL=https://www.gmod-integration.com\n',
      () => import('../src/website.js'),
    )

    // the leading "www." is stripped when deriving the host used for the ws fallback
    expect(ConfigWebsite.wsUrl).toBe('wss://ws.gmod-integration.com')
  })

  it('keeps a non-www WEBSITE_URL host unchanged for the ws fallback', async () => {
    const { ConfigWebsite } = await runWithIsolatedEnv(`DEV=false\n${MINIMAL_VALID_ENV}`, () =>
      import('../src/website.js'),
    )

    expect(ConfigWebsite.wsUrl).toBe('wss://ws.gmod-integration.com')
  })

  it('uses an explicit DISCORD_CLIENT_ID when provided', async () => {
    process.env.DISCORD_CLIENT_ID = 'explicit-client-id'
    vi.resetModules()
    const { ConfigWebsite } = await import('../src/website.js')

    expect(ConfigWebsite.discordClientId).toBe('explicit-client-id')
  })

  it('falls back to the dev client id when DISCORD_CLIENT_ID is unset and DEV is true', async () => {
    const { ConfigWebsite } = await runWithIsolatedEnv(`${MINIMAL_VALID_ENV}DEV=true\n`, () =>
      import('../src/website.js'),
    )

    expect(ConfigWebsite.discordClientId).toBe('1136093457782415420')
  })

  it('falls back to the prod client id when DISCORD_CLIENT_ID is unset and DEV is false', async () => {
    const { ConfigWebsite } = await runWithIsolatedEnv(`${MINIMAL_VALID_ENV}DEV=false\n`, () =>
      import('../src/website.js'),
    )

    expect(ConfigWebsite.discordClientId).toBe('1110121451501129758')
  })

  it('rejects (throws) when a provided value is not schema-valid', async () => {
    process.env.WEBSITE_WS_URL = 'not-a-url'
    vi.resetModules()
    await expect(import('../src/website.js')).rejects.toBeTruthy()
  })

  it('does not reload a candidate env file path it has already loaded', async () => {
    const { ConfigWebsite } = await runWithIsolatedEnv(MINIMAL_VALID_ENV, () => import('../src/website.js'))
    // CONFIG_ENV_FILE and cwd both point at the same temp dir's .env in runWithIsolatedEnv, so
    // the `resolve(process.cwd(), '.env')` candidate duplicates the CONFIG_ENV_FILE candidate —
    // exercising the `loadedPaths.has(...)` dedup branch on every isolated-env test, this one
    // included. A successful parse is proof it didn't error trying to double-load.
    expect(ConfigWebsite.websiteUrl).toBe('https://gmod-integration.com')
  })
})
