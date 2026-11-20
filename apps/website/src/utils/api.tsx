import { WEBSITE_CONFIG } from '../config'
import { getDiscordUser, getGuild, getServer } from './utils.js'

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
  const parameters = {
    discordID: localStorage.getItem('discordID'),
    serverID: getServer().id,
    userID: getDiscordUser().id,
    guildID: getGuild().id,
  }
  for (const [key, value] of Object.entries(parameters)) {
    url = url.replaceAll(`:${key}`, typeof value === 'string' ? encodeURIComponent(value) : '')
  }
  return url
}

export function fetchAPI(endpoint: string, method: string, body?: unknown) {
  endpoint = getUrlWithActualParams(endpoint)
  return fetch(`${API_FQDN}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
    },
    body: JSON.stringify(body),
  })
}
