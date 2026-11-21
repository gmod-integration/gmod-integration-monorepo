import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { acceptAuthSession, resetAuthentication } from '../../src/utils/authClient.js'
import { sessionFixture } from '../authFixture.js'
import { API_FQDN, Api, fetchAPI, getAPIUrl, getUrlWithActualParams } from '../../src/utils/api.js'

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
  })
})
