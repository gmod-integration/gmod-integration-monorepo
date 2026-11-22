import { z } from 'zod'
import { isIP } from 'node:net'

const MIN_SECRET_LENGTH = 17
const forbiddenSecretValues = new Set(['secret', 'root'])

function unquoteString(value: unknown) {
  if (typeof value !== 'string') {
    return value
  }
  const trimmed = value.trim()
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function strongSecretSchema(key: string) {
  return z
    .string()
    .trim()
    .min(MIN_SECRET_LENGTH, `${key} must be longer than 16 characters`)
    .refine((value) => !forbiddenSecretValues.has(value.toLowerCase()), `${key} cannot be "SECRET" or "root"`)
}

export const ConfigSchema = z.object({
  DEV: z.enum(['true', 'false']).default('false'),
  API_TRUSTED_PROXIES: z
    .string()
    .default('')
    .refine(
      (value) =>
        value.split(',').every((part) => {
          const entry = part.trim()
          if (!entry || ['loopback', 'linklocal', 'uniquelocal'].includes(entry)) return true
          const parts = entry.split('/')
          if (parts.length > 2) return false
          const [address, prefix] = parts
          const family = isIP(address)
          return (
            !!family &&
            (prefix === undefined ||
              (/^\d+$/.test(prefix) && Number(prefix) > 0 && Number(prefix) <= (family === 4 ? 32 : 128)))
          )
        }),
      'Use a comma-separated list of trusted proxy IPs or non-global CIDRs.',
    ),
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_AUTH_TOKEN: z.string().min(1).optional(),

  MARIA_URL: z.preprocess(unquoteString, z.string().url().optional()),
  MARIA_HOST: z.string().min(1),
  MARIA_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  MARIA_USER: z.string().min(1),
  MARIA_PASSWORD: strongSecretSchema('MARIA_PASSWORD'),
  MARIA_NAME: z.string().min(1),
  MARIA_CONNECTION_LIMIT: z.coerce.number().int().positive().optional(),
  MARIA_ROOT_PASSWORD: strongSecretSchema('MARIA_ROOT_PASSWORD'),

  SCREENSHOTS_CHANNEL_ID: z.string().min(1),

  WEBSITE_URL: z.string().url(),
  DOMAIN_URL: z.string().url(),

  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_CLIENT_SECRET: z.string().min(1),
  AUTH_TOKEN_ENCRYPTION_KEY: z.string().trim().min(32).optional(),
  AUTH_SESSION_ABSOLUTE_TTL_SECONDS: z.coerce.number().int().min(300).max(31536000).default(2592000),
  AUTH_SESSION_IDLE_TTL_SECONDS: z.coerce.number().int().min(60).max(31536000).default(604800),
  PRIVACY_HASH_SECRET: strongSecretSchema('PRIVACY_HASH_SECRET').optional(),
  DISCORD_GUILD_ID: z.string().min(1),
  DISCORD_BOT_TOKEN: z.string().min(1),
  DISCORD_BOT_INVITE_URL: z.string().url(),

  OAUTH_PANEL_URL: z.string().url(),
  OAUTH_REDIRECT_URL: z.string().url(),
  BARER_DISCORD_RELAY: z.string().min(1),

  DISCORD_GUILD_PREMIUM_ROLE_ID: z.string().min(1),
  DISCORD_GUILD_GMODSTORE_PREMIUM_ROLE_ID: z.string().min(1),
  DISCORD_GUILD_DISCORD_PREMIUM_ROLE_ID: z.string().min(1),
  DISCORD_SUBSCRIPTION_SKU_ID: z.string().min(1),

  STEAM_API_KEY: z.string().min(1),

  GMODSTORE_API_KEY: z.string().min(1),
  SIGNING_SECRET_WEBHOOK: z.string().min(1),
  GMODSTORE_SECRET_WEBHOOK: z.string().min(1),

  MINIO_ENDPOINT: z.string().url(),
  MINIO_REGION: z.string().min(1),
  MINIO_ACCESS_KEY: z.string().min(1),
  MINIO_SECRET_KEY: strongSecretSchema('MINIO_SECRET_KEY'),
})

export type ConfigInput = z.infer<typeof ConfigSchema>
