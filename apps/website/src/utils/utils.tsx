import { WEBSITE_CONFIG } from '../config'

export const DEV = WEBSITE_CONFIG.dev
export function isDevEnvironment() {
  return DEV
}
export const DEV_SHOW_MISSING_TRANSLATIONS = WEBSITE_CONFIG.devShowMissingTranslations

export function isProduction() {
  return window.location.href.includes('//gmod-integration.com')
}

export const INVITE_URL = `https://discord.com/oauth2/authorize?client_id=${WEBSITE_CONFIG.discordClientId}&permissions=8&scope=bot`

export function linkifyEmails(text: string) {
  const emailPattern = /(\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b)/gi
  return text.replace(emailPattern, '<a class="text-info hover:text-info-content" href="mailto:$1">$1</a>')
}

export function getGuild() {
  return JSON.parse(localStorage.getItem('guilds') || '{}')
}

export function getServer() {
  return JSON.parse(localStorage.getItem('server') || '{}')
}

export function getDiscordUser() {
  return JSON.parse(localStorage.getItem('discordUser') || '{}')
}
