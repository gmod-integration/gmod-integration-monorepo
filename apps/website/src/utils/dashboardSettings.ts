import { refreshAccess } from './accessEvents.js'
import { getAPIUrl, getUrlWithActualParams } from './api.js'

/** A section is validated and persisted together by the versioned API. */
export async function saveDashboardSettings(
  scope: 'server' | 'guild',
  settings: Record<string, unknown>,
): Promise<{ settings: Record<string, unknown>; sync: 'applied' | 'pending' }> {
  const path = scope === 'server' ? '/v6/guilds/:guildID/servers/:serverID/settings' : '/v6/guilds/:guildID/settings'
  const response = await fetch(getAPIUrl(false) + getUrlWithActualParams(path), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
    body: JSON.stringify({ settings }),
  })
  if (response.status === 403 || response.ok) refreshAccess()
  if (!response.ok) throw new Error('The settings could not be saved')
  const data: unknown = await response.json()
  if (
    !data ||
    typeof data !== 'object' ||
    !('settings' in data) ||
    !data.settings ||
    typeof data.settings !== 'object' ||
    !('sync' in data) ||
    !['applied', 'pending'].includes(String(data.sync))
  )
    throw new Error('Invalid settings acknowledgement')
  return data as { settings: Record<string, unknown>; sync: 'applied' | 'pending' }
}
