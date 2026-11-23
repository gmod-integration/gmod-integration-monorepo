import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  sessions: vi.fn(),
  panel: vi.fn(),
  auth: vi.fn(),
  admin: vi.fn(),
  server: vi.fn(),
  access: vi.fn(),
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

vi.mock('@gmod/core/models/v6/access.js', () => ({ getDashboardAccess: mocks.access }))
const { default: router } = await import('../../../src/routes/v6/accessRoutes.js')
const guildURL = '/v6/guilds/guild/access'
const serverURL = '/v6/guilds/guild/servers/server/access'
const snapshot = {
  guildID: 'guild',
  premium: false,
  customBot: false,
  state: 'ready',
  sources: [],
  revision: 'test',
  validUntil: '2030-01-01T00:00:00.000Z',
  usages: { 'guild.servers': 1 },
}
function app() {
  const instance = express()
  instance.use('/v6', router)
  instance.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) =>
    res.status(error.status || 503).json({ error: { code: error.code || 'service_unavailable' } }),
  )
  return instance
}
const get = (url = guildURL) => request(app()).get(url).set('Authorization', 'Bearer session-token')

beforeEach(() => {
  vi.resetAllMocks()
  mocks.sessions.mockResolvedValue([sessionRow()])
  mocks.panel.mockResolvedValue({ authAllowed: mocks.auth, isAdminOfGuild: mocks.admin })
  mocks.auth.mockResolvedValue(true)
  mocks.admin.mockResolvedValue(true)
  mocks.server.mockResolvedValue({ id: 'server', guild: 'guild' })
  mocks.access.mockResolvedValue(snapshot)
})

describe('v6 access endpoint authorization', () => {
  it('resolves only the authenticated guild scope and prevents caching', async () => {
    const response = await get()
    expect(response.status).toBe(200)
    expect(response.body).toEqual(snapshot)
    expect(response.headers['cache-control']).toBe('no-store')
    for (const step of ['session', 'user', 'permissions', 'access'])
      expect(response.headers['server-timing']).toMatch(new RegExp(`${step};dur=\\d+\\.\\d`))
    expect(mocks.access).toHaveBeenCalledExactlyOnceWith('guild')
    expect(mocks.admin).toHaveBeenCalledWith('guild')
  })
  it('resolves usage only for a server belonging to the authorized guild', async () => {
    expect((await get(serverURL)).status).toBe(200)
    expect(mocks.access).toHaveBeenCalledExactlyOnceWith('guild', 'server')
    mocks.server.mockResolvedValueOnce({ id: 'server', guild: 'another' })
    expect((await get(serverURL)).status).toBe(404)
    expect(mocks.access).toHaveBeenCalledTimes(1)
  })
  it('rejects missing sessions, non-admins and foreign origins before resolving access', async () => {
    expect((await request(app()).get(guildURL)).status).toBe(401)
    mocks.admin.mockResolvedValueOnce(false)
    expect((await get()).status).toBe(403)
    expect((await get().set('Origin', 'https://foreign.example.test')).status).toBe(403)
    expect(mocks.access).not.toHaveBeenCalled()
  })
  it('accepts a cookie session and does not require Discord token validity for base authentication', async () => {
    mocks.auth.mockRejectedValue(new Error('Expired provider token must not be consulted'))
    expect((await request(app()).get(guildURL).set('Cookie', '__Host-gmi_session=session-token')).status).toBe(200)
    expect(mocks.panel).toHaveBeenCalledWith('owner', 'session-token', expect.objectContaining({ id: 'session-A' }))
    expect(mocks.auth).not.toHaveBeenCalled()
  })
  it('rejects an absolutely expired session even when its idle expiration is in the future', async () => {
    mocks.sessions.mockResolvedValue([sessionRow({ absoluteExpiresAt: new Date(Date.now() - 1000) })])
    expect((await get()).status).toBe(401)
    expect(mocks.access).not.toHaveBeenCalled()
  })
  it('returns an unknown entitlement state without replacing it with a Free snapshot', async () => {
    mocks.access.mockResolvedValue({ ...snapshot, state: 'unknown' })
    expect((await get()).body).toMatchObject({ state: 'unknown' })
  })
})
