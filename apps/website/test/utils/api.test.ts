import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { acceptAuthSession, resetAuthentication } from '../../src/utils/authClient.js'
import { sessionFixture } from '../authFixture.js'
import { API_FQDN, Api, fetchAPI, getAPIUrl, getUrlWithActualParams } from '../../src/utils/api.js'
import { ACCESS_REFRESH_EVENT } from '../../src/utils/accessEvents.js'

describe('utils/api.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
    resetAuthentication()
    window.history.replaceState(null, '', '/')
  })

  it('builds API_FQDN from the configured apiUrl + version', () => {
    expect(Api).toBe('v3')
    expect(API_FQDN).toBe('http://localhost:5001/v3')
  })

  describe('getAPIUrl', () => {
    it('returns the versioned URL by default', () => {
      expect(getAPIUrl()).toBe(API_FQDN)
    })

    it('returns the bare base URL when withVersion is false', () => {
      expect(getAPIUrl(false)).toBe('http://localhost:5001')
    })
  })

  describe('getUrlWithActualParams', () => {
    it('substitutes every placeholder from localStorage', () => {
      window.localStorage.setItem('discordID', 'd1')
      window.localStorage.setItem('server', JSON.stringify({ id: 's1' }))
      window.localStorage.setItem('discordUser', JSON.stringify({ id: 'u1' }))
      window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1' }))
      expect(getUrlWithActualParams('/guilds/:guildID/servers/:serverID/users/:userID/discord/:discordID')).toBe(
        '/guilds/g1/servers/s1/users/u1/discord/d1',
      )
    })

    it('uses the current route scope instead of a stale stored community and server', () => {
      localStorage.setItem('guilds', JSON.stringify({ id: 'old-guild' }))
      localStorage.setItem('server', JSON.stringify({ id: 'old-server' }))
      window.history.replaceState(null, '', '/dashboard/guilds/current-guild/config/servers/current-server/roles')
      expect(getUrlWithActualParams('/guilds/:guildID/servers/:serverID')).toBe(
        '/guilds/current-guild/servers/current-server',
      )
    })

    it('retains the stored scope when an embedded location has no pathname', () => {
      const originalLocation = window.location
      Object.defineProperty(window, 'location', { configurable: true, value: { href: '/account' }, writable: true })
      localStorage.setItem('guilds', JSON.stringify({ id: 'g1' }))
      try {
        expect(getUrlWithActualParams('/guilds/:guildID')).toBe('/guilds/g1')
      } finally {
        Object.defineProperty(window, 'location', { configurable: true, value: originalLocation, writable: true })
      }
    })

    it('substitutes empty strings when nothing is stored', () => {
      expect(getUrlWithActualParams(':guildID-:serverID-:userID-:discordID')).toBe('---')
    })

    it('escapes identifiers, replaces repeated parameters and tolerates damaged stored selections', () => {
      window.localStorage.setItem('guilds', JSON.stringify({ id: 'guild/with space' }))
      window.localStorage.setItem('server', '{invalid')
      expect(getUrlWithActualParams('/guilds/:guildID/copy/:guildID/server/:serverID')).toBe(
        '/guilds/guild%2Fwith%20space/copy/guild%2Fwith%20space/server/',
      )
    })
  })

  describe('fetchAPI', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it.each([false, true])(
      'binds verified account IDs after restoration while keeping the original route scope (stale cache: %s)',
      async (stale) => {
        window.history.replaceState(null, '', '/dashboard/guilds/original-guild/config/servers/original-server/roles')
        if (stale) {
          localStorage.setItem('discordID', 'old-account')
          localStorage.setItem('discordUser', JSON.stringify({ id: 'old-account' }))
        }
        let finish!: (response: Response) => void
        const restoration = new Promise<Response>((resolve) => {
          finish = resolve
        })
        const network = vi
          .fn()
          .mockImplementation(async (input: string) => (input.endsWith('/session') ? restoration : new Response('{}')))
        vi.stubGlobal('fetch', network)
        const pending = fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/players/:userID', 'GET')
        expect(network).toHaveBeenCalledTimes(1)
        expect(network.mock.calls[0][0]).toBe('http://localhost:5001/v6/auth/session')
        window.history.replaceState(null, '', '/dashboard/guilds/new-guild/config/servers/new-server/roles')
        finish(new Response(JSON.stringify(sessionFixture())))
        expect((await pending).ok).toBe(true)
        expect(network.mock.calls[1][0]).toBe(
          'http://localhost:5001/v3/users/u1/guilds/original-guild/servers/original-server/players/u1',
        )
      },
    )

    it('keeps a pending read on its original community when recovery occurs during navigation', async () => {
      acceptAuthSession(sessionFixture())
      window.history.replaceState(null, '', '/dashboard/guilds/original-guild/config/servers/original-server/roles')
      let finish!: (response: Response) => void
      const restoration = new Promise<Response>((resolve) => {
        finish = resolve
      })
      let reads = 0
      const network = vi
        .fn()
        .mockImplementation(async (input: string) =>
          input.endsWith('/session') ? restoration : new Response('{}', { status: ++reads === 1 ? 401 : 200 }),
        )
      vi.stubGlobal('fetch', network)
      const pending = fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/roles', 'GET')
      await vi.waitFor(() => expect(network).toHaveBeenCalledTimes(2))
      window.history.replaceState(null, '', '/dashboard/guilds/new-guild/config/servers/new-server/roles')
      finish(new Response(JSON.stringify(sessionFixture())))
      expect((await pending).ok).toBe(true)
      const readsSent = network.mock.calls.filter(([input]) => !input.endsWith('/session')).map(([input]) => input)
      expect(readsSent).toEqual(
        Array(2).fill('http://localhost:5001/v3/users/u1/guilds/original-guild/servers/original-server/roles'),
      )
    })

    it('resolves the endpoint params, sends JSON headers/body, and hits the versioned API base', async () => {
      acceptAuthSession(sessionFixture())
      window.localStorage.setItem('server', JSON.stringify({ id: 's1' }))
      const fetchMock = vi.fn().mockResolvedValue(new Response('{}'))
      vi.stubGlobal('fetch', fetchMock)

      await fetchAPI('/servers/:serverID', 'POST', { hello: 'world' })

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:5001/v3/servers/s1')
      expect(fetchMock.mock.calls[0][1]).toMatchObject({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ hello: 'world' }),
      })
      const headers = new Headers(fetchMock.mock.calls[0][1].headers)
      expect(headers.get('Content-Type')).toBe('application/json')
      expect(headers.get('X-CSRF-Token')).toBe('csrf-token')
      expect(headers.has('Authorization')).toBe(false)
    })

    it('forwards optional cancellation through the authenticated request', async () => {
      acceptAuthSession(sessionFixture())
      const controller = new AbortController()
      const fetchMock = vi.fn(
        (_input: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true })
          }),
      )
      vi.stubGlobal('fetch', fetchMock)

      const request = fetchAPI('/guilds/g1/roles', 'GET', undefined, { signal: controller.signal })
      const rejection = expect(request).rejects.toMatchObject({ name: 'AbortError' })
      controller.abort()

      await rejection
      expect(fetchMock).toHaveBeenCalledOnce()
      expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'include', method: 'GET' })
      expect(fetchMock.mock.calls[0][1].signal?.aborted).toBe(true)
    })

    it.each([
      [
        '/users/:discordID/guilds/:guildID/servers/:serverID/status/preview',
        'http://localhost:5001/v3/users/u1/guilds/g1/servers/s1/status/preview',
      ],
      [
        '/v6/guilds/:guildID/servers/:serverID/rewards/rules/r1/simulate',
        'http://localhost:5001/v6/guilds/g1/servers/s1/rewards/rules/r1/simulate',
      ],
    ])('calculates read-only POST results without invalidating access: %s', async (endpoint, resolvedURL) => {
      acceptAuthSession(sessionFixture())
      localStorage.setItem('guilds', JSON.stringify({ id: 'g1' }))
      localStorage.setItem('server', JSON.stringify({ id: 's1' }))
      const refresh = vi.fn()
      window.addEventListener(ACCESS_REFRESH_EVENT, refresh)
      const network = vi.fn().mockImplementation(async () => new Response('{}'))
      vi.stubGlobal('fetch', network)
      try {
        for (const name of ['Draft', 'Draft revised']) {
          await fetchAPI(endpoint, 'POST', {
            settings: { status_player_list_format: name },
          })
        }
        expect(network).toHaveBeenCalledTimes(2)
        expect(refresh).not.toHaveBeenCalled()
        for (const [url, init] of network.mock.calls) {
          expect(url).toBe(resolvedURL)
          expect(init).toMatchObject({ method: 'POST', credentials: 'include' })
          expect(new Headers(init.headers).get('X-CSRF-Token')).toBe('csrf-token')
        }
      } finally {
        window.removeEventListener(ACCESS_REFRESH_EVENT, refresh)
      }
    })

    it.each([
      ['/users/u1/guilds/g1/servers/s1/status', 'POST', 200],
      ['/users/u1/guilds/g1/servers/s1/status/buttons', 'POST', 200],
      ['/users/u1/guilds/g1/servers/s1/status/preview/publish', 'POST', 200],
      ['/v6/guilds/g1/servers/s1/status/configuration', 'PUT', 200],
      ['/users/u1/guilds/g1/servers/s1/status/preview', 'POST', 403],
      ['/v6/guilds/g1/servers/s1/rewards/rules/r1/simulate', 'POST', 403],
      ['/v6/guilds/g1/servers/s1/rewards/rules/r1/grant', 'POST', 200],
      ['/v6/guilds/g1/servers/s1/rewards/rules/r1/simulate/grant', 'POST', 200],
    ])('refreshes access for mutations and denied previews: %s %s %s', async (endpoint, method, status) => {
      acceptAuthSession(sessionFixture())
      const refresh = vi.fn()
      window.addEventListener(ACCESS_REFRESH_EVENT, refresh)
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async () => new Response('{}', { status })),
      )
      try {
        await fetchAPI(endpoint, method, {})
        expect(refresh).toHaveBeenCalledOnce()
      } finally {
        window.removeEventListener(ACCESS_REFRESH_EVENT, refresh)
      }
    })
  })
})
