import { z } from 'zod'

const MIN_SECRET_LENGTH = 17
const forbiddenSecretValues = new Set(['secret', 'root'])

function strongSecretSchema(key: string) {
  return z
    .string()
    .trim()
    .min(MIN_SECRET_LENGTH, `${key} must be longer than 16 characters`)
    .refine((value) => !forbiddenSecretValues.has(value.toLowerCase()), `${key} cannot be "SECRET" or "root"`)
}

export const ConfigSchema = z.object({
  DEV: z.enum(['true', 'false']).default('false'),
  SENTRY_DSN: z.string().url().optional(),

  MARIA_HOST: z.string().min(1),
  MARIA_USER: z.string().min(1),
  MARIA_PASSWORD: strongSecretSchema('MARIA_PASSWORD'),
  MARIA_NAME: z.string().min(1),
  MARIA_ROOT_PASSWORD: strongSecretSchema('MARIA_ROOT_PASSWORD'),

  SCREENSHOTS_CHANNEL_ID: z.string().min(1),

  WEBSITE_URL: z.string().url(),
  DOMAIN_URL: z.string().url(),

  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_CLIENT_SECRET: z.string().min(1),
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
