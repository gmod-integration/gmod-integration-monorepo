import express from 'express'
vi.mock('@gmod/domain-user/dashboardAccess.js', async () => ({
  canAccessDashboardGuild: (await import('../../helpers/dashboardAccessFixture.js')).dashboardAccessFromAdminFixture,
  resolveDashboardAccess: (await import('../../helpers/dashboardAccessFixture.js'))
    .resolveDashboardAccessFromAdminFixture,
}))
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  sessions: vi.fn(),
  panel: vi.fn(),
  auth: vi.fn(),
  admin: vi.fn(),
  server: vi.fn(),
  saveServer: vi.fn(),
  saveGuild: vi.fn(),
}))
vi.mock('@gmod/infra-prisma', () => ({ default: { gm_panelToken: { findMany: mocks.sessions } } }))
vi.mock('@gmod/domain-user/PanelUser.js', () => ({ getPanelUserFromDiscordID: mocks.panel }))
vi.mock('@gmod/domain-server/Server.js', () => ({ getServerFromID: mocks.server }))
vi.mock('@gmod/domain-guild/Guild.js', () => ({
  Guild: class {
    id: string
    constructor(input: { id: string }) {
      this.id = input.id
    }
  },
}))
vi.mock('@gmod/config', () => ({
  ConfigServer: { websiteUrl: 'https://dashboard.example.test', domain: 'https://api.example.test', dev: false },
  ConfigDiscord: { clientSecret: 'test-oauth-client-secret' },
  ConfigAuth: { credentialEncryptionKey: 'test-auth-key', sessionIdleTtlSeconds: 604800 },
}))
vi.mock('@gmod/infra-prisma/privacy.js', () => ({ isErasureBlocked: vi.fn().mockResolvedValue(false) }))
vi.mock('@gmod/infra-redis', () => ({ default: { publish: vi.fn() } }))
const { csrfTokenForSession, hashSessionToken } = await import('@gmod/domain-auth/authSessions.js')
function sessionRow(overrides: Record<string, unknown> = {}) {
  const now = new Date()
  return {
    id: 'session-A',
    discordID: 'owner',
    accessToken: hashSessionToken('session-token'),
    revoke: false,
    creationDate: now,
    createdAt: now,
    lastSeenAt: now,
    expirationDate: new Date(now.getTime() + 600_000),
    absoluteExpiresAt: new Date(now.getTime() + 3_600_000),
    ...overrides,
  }
}
function csrf() {
  const row = sessionRow()
  return csrfTokenForSession({
    id: row.id,
    discordID: row.discordID,
    tokenHash: row.accessToken,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
    expiresAt: row.expirationDate,
    absoluteExpiresAt: row.absoluteExpiresAt,
  })
}

vi.mock('@gmod/core/models/v6/dashboardSettings.js', () => ({
  saveServerDashboardSettings: mocks.saveServer,
  saveGuildDashboardSettings: mocks.saveGuild,
}))
const { default: router } = await import('../../../src/routes/v6/dashboardSettingsRoutes.js')
const serverURL = '/v6/guilds/guild/servers/server/settings'
const guildURL = '/v6/guilds/guild/settings'
const target = { id: 'server', guild: 'guild' }
function app() {
  const instance = express()
  instance.use(express.json())
  instance.use('/v6', router)
  instance.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) =>
    res.status(error.status || 503).json({ error: { code: error.code || 'service_unavailable' } }),
  )
  return instance
}
const put = (url = serverURL, body: unknown = { settings: { log_hide_ip: true } }) =>
  request(app()).put(url).set('Authorization', 'Bearer session-token').send(body)

beforeEach(() => {
  vi.resetAllMocks()
  mocks.sessions.mockResolvedValue([sessionRow()])
  mocks.panel.mockResolvedValue({ authAllowed: mocks.auth, isAdminOfGuild: mocks.admin })
  mocks.auth.mockResolvedValue(true)
  mocks.admin.mockResolvedValue(true)
  mocks.server.mockResolvedValue(target)
  mocks.saveServer.mockResolvedValue({ settings: { log_hide_ip: true }, sync: 'applied' })
  mocks.saveGuild.mockResolvedValue({ settings: { verification_dont_mp: true }, sync: 'applied' })
})

describe('dashboard section endpoints and session authorization', () => {
  it('supports cookie-authenticated saves from the API docs origin while still requiring CSRF', async () => {
    const perform = () =>
      request(app())
        .put(serverURL)
        .set('Origin', 'https://api.example.test')
        .set('Cookie', '__Host-gmi_session=session-token')
    expect((await perform().send({ settings: { log_hide_ip: true } })).status).toBe(403)
    expect(mocks.saveServer).not.toHaveBeenCalled()
    const saved = await perform()
      .set('X-CSRF-Token', csrf())
      .send({ settings: { log_hide_ip: true } })
    expect(saved.status).toBe(200)
    expect(mocks.saveServer).toHaveBeenCalledTimes(1)
  })
  it('rejects invalid community settings without saving or dropping the authenticated session', async () => {
    const response = await put(guildURL, { settings: { unknown: true } })
    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('invalid_settings')
    expect(mocks.saveGuild).not.toHaveBeenCalled()
  })
  it('saves only to the server resolved under the authenticated guild', async () => {
    const response = await put()
    expect(response.status).toBe(200)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(mocks.panel).toHaveBeenCalledWith(
      'owner',
      'session-token',
      expect.objectContaining({ id: 'session-A', discordID: 'owner' }),
    )
    expect(mocks.auth).not.toHaveBeenCalled()
    expect(mocks.admin).toHaveBeenCalledWith('guild', { fresh: true })
    expect(mocks.saveServer).toHaveBeenCalledExactlyOnceWith(target, { log_hide_ip: true })
  })
  it('saves guild preferences with the same authorization', async () => {
    expect((await put(guildURL, { settings: { verification_dont_mp: true } })).status).toBe(200)
    expect(mocks.saveGuild).toHaveBeenCalledWith(expect.objectContaining({ id: 'guild' }), {
      verification_dont_mp: true,
    })
  })
  it.each([{ sessions: [] }, { sessions: [{ discordID: 'owner' }, { discordID: 'other' }] }])(
    'rejects missing or ambiguous sessions',
    async ({ sessions }) => {
      mocks.sessions.mockResolvedValue(sessions)
      expect((await put()).status).toBe(401)
      expect(mocks.saveServer).not.toHaveBeenCalled()
    },
  )
  it('rejects malformed authorization, revoked authentication and foreign origins', async () => {
    expect((await request(app()).put(serverURL).set('Authorization', 'Basic secret').send({})).status).toBe(401)
    mocks.sessions.mockResolvedValue([sessionRow({ revoke: true })])
    expect((await put()).status).toBe(401)
    mocks.sessions.mockResolvedValue([sessionRow()])
    expect((await put().set('Origin', 'https://foreign.test')).status).toBe(403)
    expect(mocks.saveServer).not.toHaveBeenCalled()
  })
  it('accepts a cookie with the session CSRF token and rejects missing or unrelated tokens', async () => {
    const cookiePut = () =>
      request(app())
        .put(serverURL)
        .set('Cookie', '__Host-gmi_session=session-token')
        .set('Origin', 'https://dashboard.example.test')
    expect((await cookiePut().send({ settings: { log_hide_ip: true } })).status).toBe(403)
    expect(
      (
        await cookiePut()
          .set('X-CSRF-Token', 'another-session')
          .send({ settings: { log_hide_ip: true } })
      ).status,
    ).toBe(403)
    expect(mocks.saveServer).not.toHaveBeenCalled()
    expect(
      (
        await cookiePut()
          .set('X-CSRF-Token', csrf())
          .send({ settings: { log_hide_ip: true } })
      ).status,
    ).toBe(200)
    expect(mocks.saveServer).toHaveBeenCalledTimes(1)
    expect(mocks.auth).not.toHaveBeenCalled()
  })
  it('does not turn an unavailable provider permission check into a false authentication failure', async () => {
    mocks.admin.mockRejectedValueOnce(
      Object.assign(new Error('Discord unavailable'), { status: 503, code: 'provider_unavailable' }),
    )
    const response = await put()
    expect(response.status).toBe(503)
    expect(response.body.error.code).toBe('provider_unavailable')
    expect(mocks.saveServer).not.toHaveBeenCalled()
  })
  it('rejects non-admins and a server from another guild before any writes', async () => {
    mocks.admin.mockResolvedValueOnce(false)
    expect((await put()).status).toBe(403)
    mocks.server.mockResolvedValueOnce({ ...target, guild: 'other' })
    expect((await put()).status).toBe(404)
    expect(mocks.saveServer).not.toHaveBeenCalled()
  })
  it.each([
    { settings: {} },
    { settings: { log_hide_ip: 'true' } },
    { settings: { unknown: true } },
    { settings: { log_hide_ip: true }, discordID: 'victim' },
  ])('rejects an invalid or overbroad request: %j', async (body) => {
    expect((await put(serverURL, body)).status).toBe(400)
    expect(mocks.saveServer).not.toHaveBeenCalled()
  })
})
