import { z } from 'zod'

// Deliberately NOT @gmod/config: that schema requires every variable of the whole stack (MariaDB,
// Discord bot, MinIO, ...), and the relay has to boot on its own, on a host that has none of them.
// The relay reads exactly these three variables and nothing else.

// `.env.example`-style files ship `APP_PORT=''`; treat an empty value like an unset one.
const emptyAsUndefined = (value: unknown) => (value === '' ? undefined : value)

const RelayConfigSchema = z.object({
  // Shared secret the API sends as `Authorization: Bearer <token>` (BARER_DISCORD_RELAY on the API
  // side). Required: the original relay compared against `process.env.BARER_TOKEN` unchecked, so an
  // unset variable let any request without an Authorization header through.
  BARER_TOKEN: z.string().min(1, 'BARER_TOKEN is required'),
  APP_PORT: z.preprocess(emptyAsUndefined, z.coerce.number().int().min(1).max(65535).default(3000)),
  APP_HOST: z.preprocess(emptyAsUndefined, z.string().default('0.0.0.0')),
})

export interface RelayConfig {
  barerToken: string
  port: number
  hostname: string
}

export function loadConfig(env: Record<string, string | undefined> = process.env): RelayConfig {
  const parsed = RelayConfigSchema.safeParse(env)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
    throw new Error(`Invalid webhook-relay configuration: ${issues}`)
  }
  return {
    barerToken: parsed.data.BARER_TOKEN,
    port: parsed.data.APP_PORT,
    hostname: parsed.data.APP_HOST,
  }
}
