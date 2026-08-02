import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { ZodError } from 'zod'
import { ConfigSchema, type ConfigInput } from './schema.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export function findWorkspaceRoot(startDir: string): string {
  let current = startDir

  while (true) {
    const packageJsonPath = resolve(current, 'package.json')

    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { workspaces?: unknown }
        if (packageJson.workspaces) {
          return current
        }
      } catch {
        // ignore invalid json while traversing upward
      }
    }

    const parent = dirname(current)
    if (parent === current) {
      return startDir
    }

    current = parent
  }
}

function loadEnvFiles() {
  const workspaceRoot = findWorkspaceRoot(resolve(__dirname, '..'))

  const candidates = [
    process.env.CONFIG_ENV_FILE,
    resolve(workspaceRoot, '.env'),
    resolve(workspaceRoot, '.env.local'),
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '.env.local'),
  ].filter((path): path is string => Boolean(path))

  const loadedPaths = new Set<string>()

  for (const envPath of candidates) {
    if (!existsSync(envPath) || loadedPaths.has(envPath)) {
      continue
    }

    dotenv.config({ path: envPath, override: false })
    loadedPaths.add(envPath)
  }
}

let parsedConfig: ConfigInput | null = null

export function parseConfig(): ConfigInput {
  if (parsedConfig) {
    return parsedConfig
  }

  loadEnvFiles()

  try {
    parsedConfig = ConfigSchema.parse(process.env)
    return parsedConfig
  } catch (err) {
    if (err instanceof ZodError) {
      console.error('❌  Invalid environment variables:\n')

      for (const issue of err.errors) {
        console.error(`  → ${issue.path.join('.')} [${issue.code}]: ${issue.message}`)
      }

      console.error('\nFix the environment variables and try again.\n')
      process.exit(1)
    }

    throw err
  }
}

export const config = parseConfig()

export const ConfigInstance = {
  isSelfHosted: config.DEV === 'true' ? false : !config.DOMAIN_URL.includes('gmod-integration.com'),
}

export const ConfigServer = {
  dev: config.DEV === 'true',
  bodyLimit: '10mb',
  sentryDSN: config.SENTRY_DSN,
  domain: config.DOMAIN_URL,
  screenshotChannel: config.SCREENSHOTS_CHANNEL_ID,
  websiteUrl: config.WEBSITE_URL,
  ports: {
    website: 53134,
    panel: 53135,
    api: 53136,
    verify: 53137,
    websocket: 53139,
  },
  version: 'v0.4.9',
}

export const ConfigDiscord = {
  clientID: config.DISCORD_CLIENT_ID,
  clientSecret: config.DISCORD_CLIENT_SECRET,
  guildID: config.DISCORD_GUILD_ID,
  botToken: config.DISCORD_BOT_TOKEN,
  oauthPanel: config.OAUTH_PANEL_URL,
  oauthPanelRedirect: config.OAUTH_REDIRECT_URL,
  invite: config.DISCORD_BOT_INVITE_URL,
  barerTokenRelay: config.BARER_DISCORD_RELAY,
  premiumRoleID: config.DISCORD_GUILD_PREMIUM_ROLE_ID,
  gmodStorePremiumRoleID: config.DISCORD_GUILD_GMODSTORE_PREMIUM_ROLE_ID,
  discordPremiumRoleID: config.DISCORD_GUILD_DISCORD_PREMIUM_ROLE_ID,
  subscriptionSKUID: config.DISCORD_SUBSCRIPTION_SKU_ID,
  gmodIntegrationLogo: 'https://gmod-integration.com/src/assets/brand/logo.png',
  embedColor: 0x393a41,
}

export const ConfigSteam = {
  apiKey: config.STEAM_API_KEY,
}

export const ConfigGmodStore = {
  apiKey: config.GMODSTORE_API_KEY,
  signingSecretKey: config.SIGNING_SECRET_WEBHOOK,
  secretWebhook: config.GMODSTORE_SECRET_WEBHOOK,
}

export const ConfigMinIO = {
  endpoint: config.MINIO_ENDPOINT,
  accessKey: config.MINIO_ACCESS_KEY,
  secretKey: config.MINIO_SECRET_KEY,
  region: config.MINIO_REGION,
}
