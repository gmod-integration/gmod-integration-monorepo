import { refreshAccess } from './accessEvents.js'
import { WEBSITE_CONFIG } from '../config'
import { getDiscordUser, getGuild, getServer } from './utils.js'
import { authenticatedFetch, authSession } from './authClient.js'

export const Api = 'v3'
const apiBaseUrl = WEBSITE_CONFIG.apiUrl
export const API_FQDN = apiBaseUrl + '/' + Api

export function getAPIUrl(withVersion = true) {
  if (withVersion) {
    return API_FQDN
  }
  return apiBaseUrl
}

export function getUrlWithActualParams(url: string) {
  // The route and the access snapshot share the same scope on direct links.
  const pathname = typeof window.location?.pathname === 'string' ? window.location.pathname : ''
  const match = pathname.match(/^\/dashboard\/guilds\/([^/]+)(?:\/config\/servers\/([^/]+))?/)
  const routeID = (value?: string) => {
    try {
      return value ? decodeURIComponent(value) : undefined
    } catch {
      return undefined
    }
  }
  const parameters = {
    discordID: authSession()?.user.id || localStorage.getItem('discordID') || getDiscordUser().id,
    serverID: routeID(match?.[2]) ?? getServer().id,
    userID: getDiscordUser().id,
    guildID: routeID(match?.[1]) ?? getGuild().id,
  }
  for (const [key, value] of Object.entries(parameters)) {
    url = url.replaceAll(`:${key}`, typeof value === 'string' ? encodeURIComponent(value) : '')
  }
  return url
}

export async function fetchAPI(endpoint: string, method: string, body?: unknown) {
  endpoint = getUrlWithActualParams(endpoint)
  const response = await authenticatedFetch(`${endpoint.startsWith('/v6/') ? apiBaseUrl : API_FQDN}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (response.status === 403 || (response.ok && method !== 'GET')) refreshAccess()
  return response
}
