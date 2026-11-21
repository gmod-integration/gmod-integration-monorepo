import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { acceptAuthSession, authSession, resetAuthentication } from '../../src/utils/authClient.js'
import { saveDashboardSettings } from '../../src/utils/dashboardSettings.js'
import { ACCESS_REFRESH_EVENT } from '../../src/utils/accessEvents.js'
import { sessionFixture } from '../authFixture.js'

beforeEach(() => {
  localStorage.clear()
  resetAuthentication()
  acceptAuthSession(sessionFixture())
  window.history.replaceState(null, '', '/dashboard/guilds/g1/config/servers/s1')
})
afterEach(() => {
  resetAuthentication()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})
describe('authenticated atomic settings client', () => {
  it.each([
    ['server', '/v6/guilds/g1/servers/s1/settings'],
    ['guild', '/v6/guilds/g1/settings'],
  ] as const)('saves a %s draft together using the session CSRF and cookie', async (scope, path) => {
    const settings = { name: 'Draft name', enabled: false }
    const acknowledgement = { settings, sync: 'pending' as const }
    const network = vi.fn().mockResolvedValue(new Response(JSON.stringify(acknowledgement)))
    vi.stubGlobal('fetch', network)
    await expect(saveDashboardSettings(scope, settings)).resolves.toEqual(acknowledgement)
    const [url, init] = network.mock.calls[0]
    expect(url).toBe('http://localhost:5001' + path)
    expect(init).toMatchObject({ method: 'PUT', credentials: 'include', body: JSON.stringify({ settings }) })
    expect(new Headers(init.headers).get('X-CSRF-Token')).toBe('csrf-token')
    expect(new Headers(init.headers).has('Authorization')).toBe(false)
  })
  it('requests access verification on a permission denial without discarding identity or replaying the write', async () => {
    const refresh = vi.fn()
    window.addEventListener(ACCESS_REFRESH_EVENT, refresh)
    try {
      const network = vi.fn().mockResolvedValue(new Response('{}', { status: 403 }))
      vi.stubGlobal('fetch', network)
      await expect(saveDashboardSettings('guild', { name: 'Unsaved draft' })).rejects.toThrow('could not be saved')
      expect(network).toHaveBeenCalledTimes(1)
      expect(refresh).toHaveBeenCalledOnce()
      expect(authSession()?.user.id).toBe('u1')
    } finally {
      window.removeEventListener(ACCESS_REFRESH_EVENT, refresh)
    }
  })
  it.each([null, { settings: null, sync: 'applied' }, { settings: {}, sync: 'unknown' }])(
    'rejects a malformed save acknowledgement instead of accepting the submitted draft',
    async (value) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(value))))
      await expect(saveDashboardSettings('server', { name: 'Draft' })).rejects.toThrow(
        'Invalid settings acknowledgement',
      )
    },
  )
})
