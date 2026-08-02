import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// packages/config/src/index.ts runs `parseConfig()` as a top-level side effect on import and
// memoizes the result in a module-scoped variable, so every scenario below needs a *fresh*
// module instance (vi.resetModules() + a dynamic import) instead of the static top-of-file
// import used elsewhere in this repo's tests.

const DUMMY_ENV_LINES = [
  'DEV=true',
  'MARIA_HOST=127.0.0.1',
  'MARIA_USER=test',
  'MARIA_PASSWORD=a-secret-that-is-long-enough',
  'MARIA_NAME=gmod_test',
  'MARIA_ROOT_PASSWORD=another-secret-thats-long-enough',
  'SCREENSHOTS_CHANNEL_ID=000000000000000000',
  'WEBSITE_URL=https://gmod-integration.com',
  'DOMAIN_URL=https://api.gmod-integration.com',
  'DISCORD_CLIENT_ID=000000000000000000',
  'DISCORD_CLIENT_SECRET=a-discord-client-secret',
  'DISCORD_GUILD_ID=000000000000000000',
  'DISCORD_BOT_TOKEN=a-discord-bot-token',
  'DISCORD_BOT_INVITE_URL=https://discord.com/oauth2/authorize',
  'OAUTH_PANEL_URL=https://gmod-integration.com/oauth',
  'OAUTH_REDIRECT_URL=https://gmod-integration.com/oauth/callback',
  'BARER_DISCORD_RELAY=a-barer-token-relay-value',
  'DISCORD_GUILD_PREMIUM_ROLE_ID=000000000000000000',
  'DISCORD_GUILD_GMODSTORE_PREMIUM_ROLE_ID=000000000000000000',
  'DISCORD_GUILD_DISCORD_PREMIUM_ROLE_ID=000000000000000000',
  'DISCORD_SUBSCRIPTION_SKU_ID=000000000000000000',
  'STEAM_API_KEY=a-steam-api-key',
  'GMODSTORE_API_KEY=a-gmodstore-api-key',
  'SIGNING_SECRET_WEBHOOK=a-signing-secret-webhook',
  'GMODSTORE_SECRET_WEBHOOK=a-gmodstore-secret-webhook',
  'MINIO_ENDPOINT=http://127.0.0.1:9060',
  'MINIO_REGION=us-east-1',
  'MINIO_ACCESS_KEY=a-minio-access-key',
  'MINIO_SECRET_KEY=a-minio-secret-that-is-long-enough',
]

describe('packages/config src/index.ts module (parseConfig on import)', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    originalEnv = { ...process.env }
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
    vi.resetModules()
    vi.doUnmock('../src/schema.js')
  })

  it('parses successfully with the test env and exposes the grouped config objects', async () => {
    vi.resetModules()
    const mod = await import('../src/index.js')

    expect(mod.ConfigServer.dev).toBe(true)
    expect(mod.ConfigServer.ports.api).toBe(53136)
    expect(mod.ConfigServer.version).toBe('v0.4.9')
    expect(mod.ConfigDiscord.clientID).toBe('000000000000000000')
    expect(mod.ConfigMinIO.endpoint).toBe('http://127.0.0.1:9060')
    expect(mod.ConfigSteam.apiKey).toBeTruthy()
    expect(mod.ConfigGmodStore.apiKey).toBeTruthy()
  })

  it('memoizes: calling the exported parseConfig() again returns the cached config', async () => {
    vi.resetModules()
    const mod = await import('../src/index.js')
    const first = mod.config
    const second = mod.parseConfig()
    expect(second).toBe(first)
  })

  it('sets ConfigInstance.isSelfHosted = false when DEV is true, regardless of domain', async () => {
    process.env.DEV = 'true'
    process.env.DOMAIN_URL = 'https://api.my-self-hosted-domain.example'
    vi.resetModules()
    const mod = await import('../src/index.js')
    expect(mod.ConfigInstance.isSelfHosted).toBe(false)
  })

  it('sets ConfigInstance.isSelfHosted = false when DEV is false and the domain is the official one', async () => {
    process.env.DEV = 'false'
    process.env.DOMAIN_URL = 'https://api.gmod-integration.com'
    vi.resetModules()
    const mod = await import('../src/index.js')
    expect(mod.ConfigInstance.isSelfHosted).toBe(false)
  })

  it('sets ConfigInstance.isSelfHosted = true when DEV is false and the domain is not the official one', async () => {
    process.env.DEV = 'false'
    process.env.DOMAIN_URL = 'https://api.my-self-hosted-domain.example'
    vi.resetModules()
    const mod = await import('../src/index.js')
    expect(mod.ConfigInstance.isSelfHosted).toBe(true)
  })

  it('prints a friendly error and exits the process when required env vars are invalid', async () => {
    process.env.MARIA_PASSWORD = 'too-short'
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`)
    }) as never)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.resetModules()
    await expect(import('../src/index.js')).rejects.toThrow('process.exit(1)')

    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid environment variables'))
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('MARIA_PASSWORD'))
  })

  it('rethrows a non-Zod error instead of treating it as an invalid-env case', async () => {
    const boom = new Error('boom: not a zod error')
    vi.doMock('../src/schema.js', () => ({
      ConfigSchema: {
        parse: () => {
          throw boom
        },
      },
    }))
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('should not have called process.exit')
    })

    vi.resetModules()
    await expect(import('../src/index.js')).rejects.toBe(boom)
    expect(exitSpy).not.toHaveBeenCalled()
  })

  it('does not reload a candidate env file path it has already loaded', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'gmod-config-dedup-'))
    const envPath = join(tempDir, '.env')
    writeFileSync(envPath, DUMMY_ENV_LINES.join('\n'))

    try {
      // Point CONFIG_ENV_FILE directly at the temp file, and make `process.cwd()` resolve to
      // the same directory — the `resolve(process.cwd(), '.env')` candidate then collides with
      // the `CONFIG_ENV_FILE` candidate, exercising the `loadedPaths.has(...)` dedup branch.
      process.env.CONFIG_ENV_FILE = envPath
      vi.spyOn(process, 'cwd').mockReturnValue(tempDir)

      vi.resetModules()
      const mod = await import('../src/index.js')
      expect(mod.ConfigServer.dev).toBe(true)
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
