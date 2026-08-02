import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { z } from 'zod'

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

const WebsiteConfigSchema = z.object({
  DEV: z.enum(['true', 'false']).default('false'),
  DOMAIN_URL: z.string().url().default('https://api.gmod-integration.com'),
  WEBSITE_URL: z.string().url().default('https://gmod-integration.com'),
  DISCORD_CLIENT_ID: z.string().optional(),
  WEBSITE_WS_URL: z.string().url().optional(),
  WEBSITE_DEV_SHOW_MISSING_TRANSLATIONS: z.enum(['true', 'false']).default('false'),
})

loadEnvFiles()

const parsed = WebsiteConfigSchema.parse(process.env)

const devClientIdFallback = '1136093457782415420'
const prodClientIdFallback = '1110121451501129758'
const websiteHost = new URL(parsed.WEBSITE_URL).hostname.replace(/^www\./, '')

export const ConfigWebsite = {
  dev: parsed.DEV === 'true',
  devShowMissingTranslations: parsed.WEBSITE_DEV_SHOW_MISSING_TRANSLATIONS === 'true',
  websiteUrl: parsed.WEBSITE_URL,
  // DOMAIN_URL has a Zod .default(), so it is never falsy once parsing succeeds — no fallback needed.
  apiUrl: parsed.DOMAIN_URL,
  wsUrl: parsed.WEBSITE_WS_URL || (parsed.DEV === 'true' ? 'ws://localhost:53139' : `wss://ws.${websiteHost}`),
  discordClientId: parsed.DISCORD_CLIENT_ID || (parsed.DEV === 'true' ? devClientIdFallback : prodClientIdFallback),
}
