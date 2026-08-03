import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API_FQDN, Api, fetchAPI, getAPIUrl, getUrlWithActualParams } from '../../src/utils/api.js'

describe('utils/api.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
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

    it('substitutes empty strings when nothing is stored', () => {
      expect(getUrlWithActualParams(':guildID-:serverID-:userID-:discordID')).toBe('---')
    })
  })

  describe('fetchAPI', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('resolves the endpoint params, sends JSON headers/body, and hits the versioned API base', async () => {
      window.localStorage.setItem('accessToken', 'tok1')
      window.localStorage.setItem('server', JSON.stringify({ id: 's1' }))
      const fetchMock = vi.fn().mockResolvedValue(new Response('{}'))
      vi.stubGlobal('fetch', fetchMock)

      await fetchAPI('/servers/:serverID', 'POST', { hello: 'world' })

      expect(fetchMock).toHaveBeenCalledWith('http://localhost:5001/v3/servers/s1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok1' },
        body: JSON.stringify({ hello: 'world' }),
      })
    })
  })
})
