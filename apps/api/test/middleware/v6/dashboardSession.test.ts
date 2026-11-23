import { beforeEach, describe, expect, it, vi } from 'vitest'

const resolveSessionMock = vi.fn()
const assertSessionRequestMock = vi.fn()
const readSessionCredentialMock = vi.fn()
const assertTrustedOriginMock = vi.fn()
vi.mock('@gmod/domain-auth/authSessions.js', () => ({
  resolveRequestSession: resolveSessionMock,
  assertSessionRequest: assertSessionRequestMock,
  readSessionCredential: readSessionCredentialMock,
  assertTrustedOrigin: assertTrustedOriginMock,
}))
const getPanelUserMock = vi.fn()
vi.mock('@gmod/domain-user/PanelUser.js', () => ({ getPanelUserFromDiscordID: getPanelUserMock }))
const getServerMock = vi.fn()
vi.mock('@gmod/domain-server/Server.js', () => ({ getServerFromID: getServerMock }))
vi.mock('@gmod/config', () => ({ ConfigServer: { websiteUrl: 'https://site.test' } }))
vi.mock('@gmod/domain-guild/Guild.js', () => ({
  Guild: class {
    id: string
    constructor(value: { id: string }) {
      this.id = value.id
    }
  },
}))
const { dashboardSession, dashboardGuild, dashboardServer } =
  await import('../../../src/middleware/v6/dashboardSession.js')
const current = { id: 'session-A', discordID: 'd1', actorDiscordID: 'developer' }
const panel = { discordID: 'd1', isAdminOfGuild: vi.fn() }
const req = (extra: Record<string, unknown> = {}): any => ({
  method: 'GET',
  headers: {},
  params: { guildID: 'g1', serverID: 's1' },
  ...extra,
})
const res = (): any => {
  const response = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn(), append: vi.fn() }
  response.status.mockReturnValue(response)
  response.json.mockReturnValue(response)
  return response
}
beforeEach(() => {
  assertTrustedOriginMock.mockReset().mockImplementation((request) => {
    if (request.headers.origin && !['https://site.test', 'https://api.test'].includes(request.headers.origin))
      throw Object.assign(new Error('This origin is not allowed.'), { status: 403, code: 'origin_forbidden' })
  })
  resolveSessionMock.mockReset().mockResolvedValue(current)
  assertSessionRequestMock.mockReset()
  readSessionCredentialMock.mockReset().mockReturnValue('cookie-token-A')
  getPanelUserMock.mockReset().mockResolvedValue(panel)
  getServerMock.mockReset().mockResolvedValue({ id: 's1', guild: 'g1' })
  panel.isAdminOfGuild.mockReset().mockResolvedValue(true)
})

describe('v6 exact session context', () => {
  it('rejects a session whose account disappeared and tolerates a missing compatibility credential', async () => {
    readSessionCredentialMock.mockReturnValue(undefined)
    getPanelUserMock.mockResolvedValue(null)
    const response = res(),
      next = vi.fn()
    await dashboardSession(req(), response, next)
    expect(getPanelUserMock).toHaveBeenCalledWith('d1', undefined, current)
    expect(response.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })
  it('uses the authenticated session identity and delegation marker instead of a client identity', async () => {
    const request = req({ headers: { cookie: 'gmi_session=cookie-token-A' }, query: { discordID: 'attacker' } })
    const response = res(),
      next = vi.fn()
    await dashboardSession(request, response, next)
    expect(resolveSessionMock).toHaveBeenCalledWith(request, { touch: true })
    expect(getPanelUserMock).toHaveBeenCalledWith('d1', 'cookie-token-A', current)
    expect(request.authSession).toBe(current)
    expect(request.panelUser).toBe(panel)
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
    expect(next).toHaveBeenCalledWith()
  })
  it('rejects a foreign Origin before touching a session', async () => {
    const response = res()
    await expect(
      dashboardSession(req({ headers: { origin: 'https://other.test' } }), response, vi.fn()),
    ).rejects.toMatchObject({ status: 403, code: 'origin_forbidden' })
    expect(resolveSessionMock).not.toHaveBeenCalled()
  })
  it('accepts the configured API documentation origin through the shared origin guard', async () => {
    const request = req({ headers: { origin: 'https://api.test' } })
    const next = vi.fn()
    await dashboardSession(request, res(), next)
    expect(assertTrustedOriginMock).toHaveBeenCalledWith(request)
    expect(assertSessionRequestMock).toHaveBeenCalledWith(request, current)
    expect(next).toHaveBeenCalled()
  })
  it('rejects missing and revoked sessions without looking up a latest session', async () => {
    resolveSessionMock.mockResolvedValue(null)
    const response = res()
    await dashboardSession(req(), response, vi.fn())
    expect(response.status).toHaveBeenCalledWith(401)
    expect(getPanelUserMock).not.toHaveBeenCalled()
  })
  it('requires the shared CSRF protections for a cookie mutation', async () => {
    const invalid = Object.assign(new Error('Invalid CSRF'), { status: 403, code: 'csrf_invalid' })
    assertSessionRequestMock.mockImplementationOnce(() => {
      throw invalid
    })
    const request = req({ method: 'PUT' })
    await expect(dashboardSession(request, res(), vi.fn())).rejects.toBe(invalid)
    expect(getPanelUserMock).not.toHaveBeenCalled()
  })
  it('does not fabricate unauthorized when session storage temporarily fails', async () => {
    resolveSessionMock.mockRejectedValueOnce(new Error('Database unavailable'))
    const response = res()
    await expect(dashboardSession(req(), response, vi.fn())).rejects.toThrow('Database unavailable')
    expect(response.status).not.toHaveBeenCalledWith(401)
  })
})

describe('v6 authorization stays separate from session and provider failures', () => {
  it('rejects requests without a guild, panel context or server scope before accessing storage', async () => {
    for (const authorize of [dashboardGuild, dashboardServer]) {
      for (const value of [req({ params: {} }), req({ panelUser: undefined })]) {
        const response = res()
        await authorize(value, response, vi.fn())
        expect(response.status).toHaveBeenCalledWith(403)
      }
    }
    const response = res()
    await dashboardServer(req({ panelUser: panel, params: { guildID: 'g1' } }), response, vi.fn())
    expect(response.status).toHaveBeenCalledWith(404)
    expect(getServerMock).not.toHaveBeenCalled()
  })
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'requires fresh community permissions before %s for both scopes',
    async (method) => {
      for (const authorize of [dashboardGuild, dashboardServer]) {
        panel.isAdminOfGuild.mockClear()
        await authorize(req({ method, panelUser: panel }), res(), vi.fn())
        expect(panel.isAdminOfGuild).toHaveBeenCalledExactlyOnceWith('g1', { fresh: true })
      }
    },
  )
  it('allows the bounded read cache for GET', async () => {
    await dashboardGuild(req({ panelUser: panel }), res(), vi.fn())
    expect(panel.isAdminOfGuild).toHaveBeenCalledExactlyOnceWith('g1')
  })

  it('returns forbidden for a verified absence of administration permission', async () => {
    panel.isAdminOfGuild.mockResolvedValueOnce(false)
    const response = res()
    await dashboardGuild(req({ panelUser: panel }), response, vi.fn())
    expect(response.status).toHaveBeenCalledWith(403)
  })
  it('propagates provider outages for the typed error middleware instead of reporting a permission refusal', async () => {
    const unavailable = Object.assign(new Error('Discord unavailable'), { status: 503, code: 'provider_unavailable' })
    panel.isAdminOfGuild.mockRejectedValueOnce(unavailable)
    const response = res()
    await expect(dashboardGuild(req({ panelUser: panel }), response, vi.fn())).rejects.toBe(unavailable)
    expect(response.status).not.toHaveBeenCalledWith(403)
  })
  it('requires the requested server to belong to the authorized community', async () => {
    getServerMock.mockResolvedValueOnce({ id: 's1', guild: 'other' })
    const response = res()
    await dashboardServer(req({ panelUser: panel }), response, vi.fn())
    expect(response.status).toHaveBeenCalledWith(404)
  })
  it('attaches the authorized server and guild only after successful checks', async () => {
    const request = req({ panelUser: panel }),
      next = vi.fn()
    await dashboardServer(request, res(), next)
    expect(request.server).toEqual({ id: 's1', guild: 'g1' })
    expect(request.guild.id).toBe('g1')
    expect(next).toHaveBeenCalledWith()
  })
})
