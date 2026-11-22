import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  operator: vi.fn(),
  log: vi.fn(),
  overview: vi.fn(),
  guilds: vi.fn(),
  servers: vi.fn(),
  users: vi.fn(),
  premium: vi.fn(),
  detail: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  reset: vi.fn(),
  grant: vi.fn(),
  revoke: vi.fn(),
}))
vi.mock('@gmod/config', () => ({
  ConfigServer: { websiteUrl: 'https://dashboard.example.test', domain: 'https://api.example.test', dev: false },
  ConfigDiscord: { clientSecret: 'test-admin-csrf-key' },
  ConfigAuth: { credentialEncryptionKey: 'test-admin-csrf-key' },
}))
vi.mock('@gmod/infra-prisma', () => ({ default: { gm_user: { findFirst: mocks.operator } } }))
vi.mock('@gmod/infra-redis', () => ({ default: {} }))
vi.mock('@gmod/domain-auth/authSessions.js', async (actual) => ({
  ...(await actual<typeof import('@gmod/domain-auth/authSessions.js')>()),
  resolveRequestSession: mocks.session,
}))
vi.mock('@gmod/shared/logger.js', () => ({ gmLog: mocks.log }))
vi.mock('@gmod/core/models/v6/adminDashboard.js', () => ({
  getAdminOverview: mocks.overview,
  listAdminGuilds: mocks.guilds,
  listAdminServers: mocks.servers,
  listAdminUsers: mocks.users,
  listAdminPremium: mocks.premium,
  getAdminGuildDetail: mocks.detail,
  updateAdminServer: mocks.update,
  deleteAdminServer: mocks.remove,
  resetAdminServerToken: mocks.reset,
  updateAdminPremium: mocks.grant,
}))
vi.mock('@gmod/core/models/v6/adminUserManagement.js', () => ({
  revokeAdminUserSessions: mocks.revoke,
}))
const { csrfTokenForSession } = await import('@gmod/domain-auth/authSessions.js')
const { default: router } = await import('../../../src/routes/v6/adminRoutes.js')
const developerID = '333650866747867137'
const auth = () => ({
  id: 'session-admin',
  discordID: developerID,
  tokenHash: 'sha256:fixture',
  createdAt: new Date(),
  lastSeenAt: new Date(),
  expiresAt: new Date(Date.now() + 600_000),
  absoluteExpiresAt: new Date(Date.now() + 3_600_000),
})
const app = () => {
  const instance = express()
  instance.use(express.json())
  instance.use('/v6/admin', router)
  instance.use(
    (
      error: { status?: number; code?: string },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => res.status(error.status || 503).json({ error: { code: error.code || 'service_unavailable' } }),
  )
  return instance
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.session.mockResolvedValue(auth())
  mocks.operator.mockResolvedValue({ id: developerID, rank: 'developer' })
  for (const key of [
    'overview',
    'guilds',
    'servers',
    'users',
    'premium',
    'detail',
    'update',
    'remove',
    'reset',
    'grant',
    'revoke',
  ] as const)
    mocks[key].mockResolvedValue({ acknowledged: true })
})
const write = (method: 'post' | 'put' | 'patch' | 'delete', path: string, body: unknown, csrf = true) => {
  const operation = request(app())
    [method]('/v6/admin' + path)
    .set('Cookie', '__Host-gmi_session=fixture')
    .set('Origin', 'https://dashboard.example.test')
  if (csrf) operation.set('X-CSRF-Token', csrfTokenForSession(auth()))
  return operation.send(body)
}

describe('platform admin API and own-session authorization', () => {
  it('provides a non-cacheable fresh access acknowledgement', async () => {
    const result = await request(app()).get('/v6/admin/access')
    expect(result.status).toBe(200)
    expect(result.body).toEqual({ authorized: true, discordID: developerID })
    expect(result.headers['cache-control']).toBe('no-store')
    expect(mocks.operator).toHaveBeenCalledWith({ where: { id: developerID }, select: { id: true } })
  })
  it('rejects an unlisted operator even with a stored developer rank', async () => {
    mocks.session.mockResolvedValue({ ...auth(), discordID: 'unlisted' })
    mocks.operator.mockResolvedValue({ id: 'unlisted', rank: 'developer' })
    expect((await request(app()).get('/v6/admin/overview')).status).toBe(403)
    expect(mocks.operator).not.toHaveBeenCalled()
    expect(mocks.overview).not.toHaveBeenCalled()
  })
  it('authorizes the listed owner independently of the stored rank', async () => {
    mocks.operator.mockResolvedValue({ id: developerID, rank: 'user' })
    expect((await request(app()).get('/v6/admin/overview')).status).toBe(200)
  })
  it('rejects a listed operator whose account no longer exists', async () => {
    mocks.operator.mockResolvedValue(null)
    expect((await request(app()).get('/v6/admin/overview')).status).toBe(403)
  })
  it('rejects an unavailable or revoked session before database/list access', async () => {
    mocks.session.mockResolvedValue(null)
    expect((await request(app()).get('/v6/admin/users')).status).toBe(401)
    expect(mocks.operator).not.toHaveBeenCalled()
    expect(mocks.users).not.toHaveBeenCalled()
  })
  it.each([
    { actorDiscordID: 'developer' },
    { actorSessionID: 'parent' },
    { actorDiscordID: 'developer', actorSessionID: 'parent' },
  ])('rejects delegated admin access %j', async (delegation) => {
    mocks.session.mockResolvedValue({ ...auth(), ...delegation })
    expect((await request(app()).get('/v6/admin/guilds')).body.error.code).toBe('own_admin_session_required')
    expect(mocks.operator).not.toHaveBeenCalled()
    expect(mocks.guilds).not.toHaveBeenCalled()
  })
  it('requires CSRF on cookie mutations and rejects foreign origins', async () => {
    expect(
      (await write('post', '/users/target/revoke-sessions', { confirm: 'target', reason: 'Support correction' }, false))
        .status,
    ).toBe(403)
    expect(mocks.revoke).not.toHaveBeenCalled()
    const foreign = await request(app()).get('/v6/admin/access').set('Origin', 'https://foreign.example.test')
    expect(foreign.status).toBe(403)
    expect(mocks.operator).not.toHaveBeenCalled()
  })
  it.each([
    ['/overview', 'overview'],
    ['/guilds', 'guilds'],
    ['/servers', 'servers'],
    ['/users', 'users'],
    ['/premium', 'premium'],
    ['/guilds/g1', 'detail'],
  ] as const)('mounts read feature %s', async (path, key) => {
    const result = await request(app()).get('/v6/admin' + path)
    expect(result.status).toBe(200)
    expect(mocks[key]).toHaveBeenCalledOnce()
  })
  it('normalizes bounded paging and rejects sort injection or unknown query fields', async () => {
    expect(
      (await request(app()).get('/v6/admin/users?limit=25&offset=50&search=target&sort=username&orderBy=ASC')).status,
    ).toBe(200)
    expect(mocks.users).toHaveBeenCalledWith({
      limit: 25,
      offset: 50,
      search: 'target',
      sort: 'username',
      orderBy: 'ASC',
    })
    mocks.users.mockClear()
    expect((await request(app()).get('/v6/admin/users?sort=token')).status).toBe(400)
    expect((await request(app()).get('/v6/admin/users?limit=5000')).status).toBe(400)
    expect((await request(app()).get('/v6/admin/users?includeCredentials=true')).status).toBe(400)
    expect(mocks.users).not.toHaveBeenCalled()
  })
  it.each([
    ['patch', '/servers/s1', { name: 'New name', reason: 'Support correction' }, 'update'],
    ['delete', '/servers/s1', { confirm: 's1', reason: 'Support correction' }, 'remove'],
    ['post', '/servers/s1/reset-token', { confirm: 's1', reason: 'Support correction' }, 'reset'],
    ['put', '/guilds/g1/premium', { enabled: true, reason: 'Support correction' }, 'grant'],
  ] as const)('validates and audits %s %s', async (method, path, body, key) => {
    expect((await write(method, path, body)).status).toBe(200)
    expect(mocks[key]).toHaveBeenCalledWith(key === 'grant' ? 'g1' : 's1', body)
    expect(mocks.log).toHaveBeenCalledWith('admin', expect.stringContaining(`"actor":"${developerID}"`))
  })
  it('binds account mutations to the actor and selected account', async () => {
    expect((await write('put', '/users/target/rank', { rank: 'developer', reason: 'Support correction' })).status).toBe(
      404,
    )
    const revoke = { confirm: 'target', reason: 'Support correction' }
    expect((await write('post', '/users/target/revoke-sessions', revoke)).status).toBe(200)
    expect(mocks.revoke).toHaveBeenCalledWith(developerID, 'target', revoke)
  })
  it('rejects unknown fields and missing confirmation/reason before side effects', async () => {
    expect((await write('put', '/guilds/g1/premium', { enabled: true, reason: 'x' })).status).toBe(400)
    expect((await write('patch', '/servers/s1', { token: 'forged', reason: 'Support correction' })).status).toBe(400)
    expect((await write('post', '/servers/s1/reset-token', { reason: 'Support correction' })).status).toBe(400)
    expect(mocks.grant).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.reset).not.toHaveBeenCalled()
  })
  it('propagates safe feature errors and hides unexpected service details', async () => {
    mocks.update.mockRejectedValueOnce(
      Object.assign(new Error('Record not found'), { name: 'AdminDashboardError', status: 404, code: 'not_found' }),
    )
    expect((await write('patch', '/servers/s1', { name: 'Name', reason: 'Support correction' })).body).toEqual({
      error: { code: 'not_found', message: 'Record not found' },
    })
    mocks.overview.mockRejectedValueOnce(new Error('database private credentials'))
    const result = await request(app()).get('/v6/admin/overview')
    expect(result.status).toBe(503)
    expect(JSON.stringify(result.body)).not.toContain('private')
  })
})
