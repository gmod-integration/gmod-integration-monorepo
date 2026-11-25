import { WEBSITE_CONFIG } from '../config.js'
import type { DiscordUserState } from './event.js'

type StoredGuild = {
  id: string
  name: string
  icon: string
  isPremium: boolean
}

type StoredServer = {
  id: string
  name: string
  description: string
  image: string
  ip: string
  port: number | string
  token: string
  isPublic: boolean
}

export const DEV = WEBSITE_CONFIG.dev
export function isDevEnvironment() {
  return DEV
}
export const DEV_SHOW_MISSING_TRANSLATIONS = WEBSITE_CONFIG.devShowMissingTranslations

export function isProduction() {
  return window.location.hostname === 'gmod-integration.com'
}

export const INVITE_URL = `https://discord.com/oauth2/authorize?client_id=${WEBSITE_CONFIG.discordClientId}&permissions=8&scope=bot`

export function linkifyEmails(text: string) {
  const emailPattern = /(\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b)/gi
  return text.replace(emailPattern, '<a class="text-info hover:text-info-content" href="mailto:$1">$1</a>')
}

export function readStoredObject(key: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) || '{}')
    if (value && typeof value === 'object' && !Array.isArray(value)) return { ...value }
  } catch {
    // A damaged cache must not prevent users from opening the dashboard or signing in again.
  }
  return {}
}

export function getGuild(): Partial<StoredGuild> {
  return readStoredObject('guilds')
}

export function getServer(): Partial<StoredServer> {
  return readStoredObject('server')
}

export function getDiscordUser(): Partial<DiscordUserState> {
  return readStoredObject('discordUser')
}
