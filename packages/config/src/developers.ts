import { readFileSync } from 'node:fs'

// This checked-in, server-only list is the sole source of platform privileges. Database ranks,
// Discord roles and environment variables cannot grant developer access.
const configured: unknown = JSON.parse(readFileSync(new URL('../../../developers.json', import.meta.url), 'utf8'))
if (!Array.isArray(configured) || configured.some((id) => typeof id !== 'string' || !/^\d{17,20}$/.test(id)))
  throw new Error('Invalid root developer allowlist')

export const developerDiscordIDs: readonly string[] = Object.freeze([...new Set<string>(configured)])

export function isDeveloper(discordID: unknown): boolean {
  return typeof discordID === 'string' && developerDiscordIDs.includes(discordID)
}

export function getPlatformRank(discordID: unknown): 'developer' | 'user' {
  return isDeveloper(discordID) ? 'developer' : 'user'
}
