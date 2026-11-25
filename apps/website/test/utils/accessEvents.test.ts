import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ACCESS_REFRESH_EVENT,
  DASHBOARD_ACCESS_DENIED_EVENT,
  notifyDashboardAccessDenied,
  refreshAccess,
} from '../../src/utils/accessEvents.js'

const denied = (reason = 'game_admin_required') => ({ error: { code: 'dashboard_access_denied', reason } })
const listener = vi.fn()
beforeEach(() => {
  listener.mockReset()
  window.addEventListener(DASHBOARD_ACCESS_DENIED_EVENT, listener)
})
afterEach(() => {
  window.removeEventListener(DASHBOARD_ACCESS_DENIED_EVENT, listener)
  vi.restoreAllMocks()
})
const detail = () => (listener.mock.calls[0][0] as CustomEvent).detail

describe('safe scoped dashboard denial events', () => {
  it.each([
    { url: 'http://localhost:5001/v6/guilds/g1/servers/s1/settings', body: denied() },
    {
      url: 'http://localhost:5001/v3/users/u1/guilds/g1/servers/s1/config',
      body: { error: 'dashboard_access_denied', reason: 'game_admin_required' },
    },
  ])('uses the authenticated request URL for either API error envelope: $url', ({ url, body }) => {
    notifyDashboardAccessDenied(url, { ...body, guildID: 'spoofed', serverID: 'spoofed' }, 'session-one')
    expect(listener).toHaveBeenCalledOnce()
    expect(detail()).toEqual({ guildID: 'g1', serverID: 's1', reason: 'game_admin_required', sessionID: 'session-one' })
  })

  it.each(['discord_admin_required', 'steam_link_required', 'game_admin_required', 'scope_unavailable'])(
    'accepts only a known procedure reason: %s',
    (reason) => {
      notifyDashboardAccessDenied(
        '/v6/guilds/community-1/servers/server_2/settings?private=ignored#fragment',
        denied(reason),
      )
      expect(detail()).toEqual({ guildID: 'community-1', serverID: 'server_2', reason, sessionID: undefined })
    },
  )

  it.each([
    '/v6/guilds/g1/settings',
    '/v3/users/u1/guilds/g1/settings',
    '/v3/users/u1/guilds/g1/servers',
    '/v3/users/u1/guilds/g1/servers/',
  ])('retains a valid community request without inventing a selected server: %s', (url) => {
    notifyDashboardAccessDenied(url, denied('discord_admin_required'), 'session-one')
    expect(detail()).toEqual({
      guildID: 'g1',
      serverID: undefined,
      reason: 'discord_admin_required',
      sessionID: 'session-one',
    })
  })

  it('never reads, carries or renders the response message or raw markup', () => {
    const readMessage = vi.fn(() => {
      throw new Error('Raw message must not be read')
    })
    const body = {
      error: {
        code: 'dashboard_access_denied',
        reason: 'steam_link_required',
        get message() {
          return readMessage()
        },
      },
      message: '<img src=x onerror=alert(1)>',
      rank: 'private-rank',
      adminRank: { 'private-required-rank': true },
    }
    const markup = document.body.innerHTML
    expect(() => notifyDashboardAccessDenied('/v6/guilds/g1/servers/s1/settings', body, 'session-one')).not.toThrow()
    expect(readMessage).not.toHaveBeenCalled()
    expect(detail()).toEqual({ guildID: 'g1', serverID: 's1', reason: 'steam_link_required', sessionID: 'session-one' })
    expect(document.body.innerHTML).toBe(markup)
    expect(JSON.stringify(detail())).not.toMatch(/private|img|onerror|message|adminRank/)
  })

  it.each([
    null,
    false,
    [],
    {},
    { error: 'dashboard_access_denied' },
    { error: 'dashboard_access_denied', reason: 'unknown' },
    { error: 'dashboard_access_denied', reason: ['game_admin_required'] },
    { error: { code: 'dashboard_access_denied', reason: '<script>alert(1)</script>' } },
    { error: { code: 'premium_required', reason: 'game_admin_required' } },
    { error: { code: 'capability_required', reason: 'game_admin_required' } },
    { error: { code: 'provider_unavailable', reason: 'game_admin_required' } },
    { error: { code: 'discord_reauth_required', reason: 'discord_admin_required' } },
    { error: 'forbidden', reason: 'game_admin_required' },
  ])('does not turn unrelated, unknown or malformed refusals into missing access: %j', (body) => {
    notifyDashboardAccessDenied('/v6/guilds/g1/servers/s1/settings', body)
    expect(listener).not.toHaveBeenCalled()
  })

  it.each([
    '/v6/auth/session',
    '/v3/users/u1/gmod-store/g1',
    '/v6/admin/servers/s1',
    '/unrelated/guilds/g1',
    '/v6/guilds//settings',
    '/v6/guilds/%2Fbad/settings',
    '/v6/guilds/g1/servers/%2Fbad/settings',
    '/v6/guilds/g1/servers/%5Cbad/settings',
    '/v6/guilds/g1/servers/%3Cscript%3E/settings',
    '/v6/guilds/g1/servers/%E0%A4%A/settings',
    '/v6/guilds/g1/servers//settings',
    '/v6/guilds/g1//servers/s1/settings',
    '/v3/users/%2Fbad/guilds/g1/servers/s1/settings',
    `/v6/guilds/${'g'.repeat(256)}/settings`,
    `/v6/guilds/g1/servers/${'s'.repeat(256)}/settings`,
    'http://[',
    'javascript:/v6/guilds/g1/servers/s1',
    'data:/v6/guilds/g1/servers/s1',
    'https://evil.example/v6/guilds/g1/servers/s1',
  ])('rejects malformed or unrelated scopes rather than broadening a server refusal: %s', (url) => {
    notifyDashboardAccessDenied(url, denied(), 'session-one')
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('dashboard access refresh requests', () => {
  it('preserves explicit background refreshes separately from invalidation', () => {
    const refreshing = vi.fn()
    window.addEventListener(ACCESS_REFRESH_EVENT, refreshing)
    try {
      refreshAccess()
      refreshAccess('background')
      expect(refreshing.mock.calls.map(([event]) => (event as CustomEvent).detail)).toEqual([
        { reason: 'invalidate' },
        { reason: 'background' },
      ])
    } finally {
      window.removeEventListener(ACCESS_REFRESH_EVENT, refreshing)
    }
  })
})
