import { describe, expect, it } from 'vitest'
import { ConfigSchema } from '../src/schema.js'

// A minimal fully-valid env object satisfying every required field in ConfigSchema, used as the
// baseline that individual tests below tweak one field at a time.
function validEnv(overrides: Record<string, string | undefined> = {}) {
  const base: Record<string, string> = {
    MARIA_HOST: '127.0.0.1',
    MARIA_USER: 'test',
    MARIA_PASSWORD: 'a-secret-that-is-long-enough',
    MARIA_NAME: 'gmod_test',
    MARIA_ROOT_PASSWORD: 'another-secret-thats-long-enough',
    SCREENSHOTS_CHANNEL_ID: '000000000000000000',
    WEBSITE_URL: 'https://gmod-integration.com',
    DOMAIN_URL: 'https://api.gmod-integration.com',
    DISCORD_CLIENT_ID: '000000000000000000',
    DISCORD_CLIENT_SECRET: 'a-discord-client-secret',
    DISCORD_GUILD_ID: '000000000000000000',
    DISCORD_BOT_TOKEN: 'a-discord-bot-token',
    DISCORD_BOT_INVITE_URL: 'https://discord.com/oauth2/authorize',
    OAUTH_PANEL_URL: 'https://gmod-integration.com/oauth',
    OAUTH_REDIRECT_URL: 'https://gmod-integration.com/oauth/callback',
    BARER_DISCORD_RELAY: 'a-barer-token-relay-value',
    DISCORD_GUILD_PREMIUM_ROLE_ID: '000000000000000000',
    DISCORD_GUILD_GMODSTORE_PREMIUM_ROLE_ID: '000000000000000000',
    DISCORD_GUILD_DISCORD_PREMIUM_ROLE_ID: '000000000000000000',
    DISCORD_SUBSCRIPTION_SKU_ID: '000000000000000000',
    STEAM_API_KEY: 'a-steam-api-key',
    GMODSTORE_API_KEY: 'a-gmodstore-api-key',
    SIGNING_SECRET_WEBHOOK: 'a-signing-secret-webhook',
    GMODSTORE_SECRET_WEBHOOK: 'a-gmodstore-secret-webhook',
    MINIO_ENDPOINT: 'http://127.0.0.1:9060',
    MINIO_REGION: 'us-east-1',
    MINIO_ACCESS_KEY: 'a-minio-access-key',
    MINIO_SECRET_KEY: 'a-minio-secret-that-is-long-enough',
  }

  const merged: Record<string, string | undefined> = { ...base, ...overrides }
  for (const key of Object.keys(merged)) {
    if (merged[key] === undefined) {
      delete merged[key]
    }
  }
  return merged
}

describe('ConfigSchema', () => {
  it('parses a fully valid environment', () => {
    const result = ConfigSchema.safeParse(validEnv())
    expect(result.success).toBe(true)
  })

  it('defaults DEV to "false" when omitted', () => {
    const result = ConfigSchema.parse(validEnv())
    expect(result.DEV).toBe('false')
  })

  it('accepts an explicit DEV=true', () => {
    const result = ConfigSchema.parse(validEnv({ DEV: 'true' }))
    expect(result.DEV).toBe('true')
  })

  it('rejects an unknown DEV value', () => {
    expect(ConfigSchema.safeParse(validEnv({ DEV: 'maybe' })).success).toBe(false)
  })

  it('leaves optional SENTRY_DSN/SENTRY_AUTH_TOKEN undefined when omitted', () => {
    const result = ConfigSchema.parse(validEnv())
    expect(result.SENTRY_DSN).toBeUndefined()
    expect(result.SENTRY_AUTH_TOKEN).toBeUndefined()
  })

  it('rejects a malformed SENTRY_DSN when provided', () => {
    expect(ConfigSchema.safeParse(validEnv({ SENTRY_DSN: 'not-a-url' })).success).toBe(false)
  })

  it('coerces MARIA_PORT and MARIA_CONNECTION_LIMIT from strings to numbers', () => {
    const result = ConfigSchema.parse(validEnv({ MARIA_PORT: '3306', MARIA_CONNECTION_LIMIT: '10' }))
    expect(result.MARIA_PORT).toBe(3306)
    expect(result.MARIA_CONNECTION_LIMIT).toBe(10)
  })

  it('rejects a MARIA_PORT out of the valid TCP port range', () => {
    expect(ConfigSchema.safeParse(validEnv({ MARIA_PORT: '70000' })).success).toBe(false)
  })

  it('accepts a quoted MARIA_URL and strips the quotes', () => {
    const result = ConfigSchema.parse(validEnv({ MARIA_URL: '"mysql://user:pass@127.0.0.1:3306/db"' }))
    expect(result.MARIA_URL).toBe('mysql://user:pass@127.0.0.1:3306/db')
  })

  it('accepts a single-quoted MARIA_URL and strips the quotes', () => {
    const result = ConfigSchema.parse(validEnv({ MARIA_URL: "'mysql://user:pass@127.0.0.1:3306/db'" }))
    expect(result.MARIA_URL).toBe('mysql://user:pass@127.0.0.1:3306/db')
  })

  it('leaves an unquoted MARIA_URL untouched', () => {
    const result = ConfigSchema.parse(validEnv({ MARIA_URL: 'mysql://user:pass@127.0.0.1:3306/db' }))
    expect(result.MARIA_URL).toBe('mysql://user:pass@127.0.0.1:3306/db')
  })

  it('rejects a MARIA_URL that is not a valid URL once unquoted', () => {
    expect(ConfigSchema.safeParse(validEnv({ MARIA_URL: '"not-a-url"' })).success).toBe(false)
  })

  it('leaves MARIA_URL undefined when omitted (it is optional)', () => {
    const result = ConfigSchema.parse(validEnv())
    expect(result.MARIA_URL).toBeUndefined()
  })

  describe('strong secrets (MARIA_PASSWORD, MARIA_ROOT_PASSWORD, MINIO_SECRET_KEY)', () => {
    it('rejects a secret that is exactly 16 characters (one below the minimum)', () => {
      expect(ConfigSchema.safeParse(validEnv({ MARIA_PASSWORD: '1234567890123456' })).success).toBe(false)
    })

    it('accepts a secret that is exactly 17 characters', () => {
      expect(ConfigSchema.safeParse(validEnv({ MARIA_PASSWORD: '12345678901234567' })).success).toBe(true)
    })

    it('rejects the forbidden value "secret" case-insensitively', () => {
      expect(ConfigSchema.safeParse(validEnv({ MARIA_PASSWORD: 'SECRETSECRETSECRET'.slice(0, 17) })).success).toBe(
        true,
      )
      expect(ConfigSchema.safeParse(validEnv({ MARIA_PASSWORD: 'SeCrEt' })).success).toBe(false)
    })

    it('rejects the forbidden value "root" regardless of case', () => {
      expect(ConfigSchema.safeParse(validEnv({ MARIA_ROOT_PASSWORD: 'RoOt' })).success).toBe(false)
    })

    it('trims surrounding whitespace before checking length/forbidden values', () => {
      expect(ConfigSchema.safeParse(validEnv({ MINIO_SECRET_KEY: '   root   ' })).success).toBe(false)
      expect(
        ConfigSchema.safeParse(validEnv({ MINIO_SECRET_KEY: '   a-valid-secret-value-here   ' })).success,
      ).toBe(true)
    })
  })

  it('requires SCREENSHOTS_CHANNEL_ID to be a non-empty string', () => {
    expect(ConfigSchema.safeParse(validEnv({ SCREENSHOTS_CHANNEL_ID: '' })).success).toBe(false)
  })

  it('rejects an invalid WEBSITE_URL', () => {
    expect(ConfigSchema.safeParse(validEnv({ WEBSITE_URL: 'not-a-url' })).success).toBe(false)
  })

  it('rejects an invalid MINIO_ENDPOINT', () => {
    expect(ConfigSchema.safeParse(validEnv({ MINIO_ENDPOINT: 'not-a-url' })).success).toBe(false)
  })

  it('rejects a missing required field (DISCORD_BOT_TOKEN)', () => {
    expect(ConfigSchema.safeParse(validEnv({ DISCORD_BOT_TOKEN: undefined })).success).toBe(false)
  })
})
