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
  session: vi.fn(),
  panel: vi.fn(),
  admin: vi.fn(),
  server: vi.fn(),
  execute: vi.fn(),
}))
vi.mock('@gmod/infra-prisma', () => ({
  default: { gm_panelToken: { findMany: mocks.sessions, findFirst: mocks.session } },
}))
vi.mock('@gmod/domain-user/PanelUser.js', () => ({ getPanelUserFromDiscordID: mocks.panel }))
vi.mock('@gmod/domain-server/Server.js', () => ({ getServerFromID: mocks.server }))
vi.mock('@gmod/domain-guild/Guild.js', () => ({ Guild: class {} }))
vi.mock('@gmod/config', () => ({
  ConfigServer: { websiteUrl: 'https://dashboard.example.test', domain: 'https://api.example.test', dev: false },
  ConfigDiscord: { clientSecret: 'test-oauth-client-secret' },
  ConfigAuth: { credentialEncryptionKey: 'test-auth-key', sessionIdleTtlSeconds: 604800 },
}))
vi.mock('@gmod/config/developers.js', () => ({ isDeveloper: (id: string) => id === 'support' }))
vi.mock('@gmod/infra-prisma/privacy.js', () => ({ isErasureBlocked: vi.fn().mockResolvedValue(false) }))
vi.mock('@gmod/infra-redis', () => ({ default: { publish: vi.fn() } }))
vi.mock('@gmod/core/models/v6/serverConsole.js', () => ({
  executeServerConsoleCommand: mocks.execute,
  ServerConsoleError: class extends Error {
    constructor(
      public status: number,
      public code: string,
    ) {
      super(code)
    }
  },
}))

const { csrfTokenForSession, hashSessionToken } = await import('@gmod/domain-auth/authSessions.js')
const { ServerConsoleError } = await import('@gmod/core/models/v6/serverConsole.js')
const { default: router } = await import('../../../src/routes/v6/serverConsoleRoutes.js')
const endpoint = '/v6/guilds/g1/servers/s1/console/commands'
const requestID = 'ccb34ff3-d4c7-4d2a-b9a1-1462197ed367'
const input = { requestID, command: 'status' }
const server = { id: 's1', guild: 'g1' }
const response = { serverID: 's1', requestID, status: 'executed', code: 'executed' }

function sessionRow(patch: Record<string, unknown> = {}) {
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
    ...patch,
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
function app() {
  const instance = express()
  instance.use(express.json())
  instance.use('/v6', router)
  instance.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) =>
    res.status(error.status || 503).json({ error: { code: error.code || 'service_unavailable' } }),
  )
  return instance
}
const post = (body: unknown = input) =>
  request(app()).post(endpoint).set('Authorization', 'Bearer session-token').send(body)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.sessions.mockResolvedValue([sessionRow()])
  mocks.panel.mockResolvedValue({ isAdminOfGuild: mocks.admin })
  mocks.admin.mockResolvedValue(true)
  mocks.server.mockResolvedValue(server)
  mocks.execute.mockResolvedValue(response)
})

describe('dashboard console command HTTP route', () => {
  it('uses the verified session and server scope with fresh guild permissions', async () => {
    const result = await post({ ...input, command: ' status ' })
    expect(result.status).toBe(200)
    expect(result.body).toEqual(response)
    expect(result.headers['cache-control']).toBe('no-store')
    expect(mocks.admin).toHaveBeenCalledExactlyOnceWith('g1', { fresh: true })
    expect(mocks.execute).toHaveBeenCalledExactlyOnceWith(
      server,
      expect.objectContaining({ id: 'session-A', discordID: 'owner' }),
      input,
    )
  })

  it.each([
    { status: 'executed', code: 'executed' },
    { status: 'rejected', code: 'permission_denied' },
    { status: 'rejected', code: 'expired' },
    { status: 'rejected', code: 'execution_failed' },
    { status: 'unknown', code: 'delivery_uncertain' },
  ])('returns a structured HTTP200 execution acknowledgement: %j', async (outcome) => {
    mocks.execute.mockResolvedValueOnce({ ...response, ...outcome })
    const result = await post()
    expect(result.status).toBe(200)
    expect(result.body).toEqual({ ...response, ...outcome })
  })

  it('requires a valid session and fresh community administration rights', async () => {
    expect((await request(app()).post(endpoint).send(input)).status).toBe(401)
    mocks.admin.mockResolvedValueOnce(false)
    expect((await post()).status).toBe(403)
    mocks.sessions.mockResolvedValueOnce([sessionRow({ expirationDate: new Date(0) })])
    expect((await post()).status).toBe(401)
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('requires cookie CSRF and rejects foreign origins before submission', async () => {
    const cookie = '__Host-gmi_session=session-token'
    const denied = await request(app()).post(endpoint).set('Cookie', cookie).send(input)
    expect(denied.status).toBe(403)
    expect(denied.body.error.code).toBe('csrf_invalid')
    expect(denied.body.error).not.toHaveProperty('reason')
    expect((await post().set('Origin', 'https://foreign.example.test')).status).toBe(403)
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(
      (
        await request(app())
          .post(endpoint)
          .set('Cookie', cookie)
          .set('X-CSRF-Token', csrf())
          .set('Origin', 'https://dashboard.example.test')
          .send(input)
      ).status,
    ).toBe(200)
  })

  it('returns a policy denial with a safe reason before dispatching a command', async () => {
    mocks.admin.mockResolvedValueOnce(false)
    const result = await post()
    expect(result.status).toBe(403)
    expect(result.body).toEqual({
      error: {
        code: 'dashboard_access_denied',
        reason: 'discord_admin_required',
        message: 'Access to this dashboard is not permitted.',
      },
    })
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('rejects a server belonging to a different community', async () => {
    mocks.server.mockResolvedValueOnce({ ...server, guild: 'g2' })
    expect((await post()).status).toBe(404)
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it.each([
    {},
    { ...input, command: '' },
    { ...input, command: 'status\nquit' },
    { ...input, command: 'status\rquit' },
    { ...input, command: 'status\0quit' },
    { ...input, command: 'é'.repeat(4097) },
    { ...input, steamID: '76561198000000002' },
    { ...input, discordID: 'other' },
    { ...input, actorDiscordID: '234567890123456789' },
    { ...input, serverID: 's2' },
  ])('rejects malformed commands and caller-supplied identities: %j', async (body) => {
    const result = await post(body)
    expect(result.status).toBe(400)
    expect(result.body.error.code).toBe('invalid_request')
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('rejects query parameters rather than using them as identities or command data', async () => {
    expect((await post().query({ steamID: '76561198000000002' })).status).toBe(400)
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('allows a valid delegated panel session while passing its actor and subject from authentication', async () => {
    mocks.sessions.mockResolvedValueOnce([
      sessionRow({ discordID: 'customer', actorDiscordID: 'support', actorSessionID: 'parent' }),
    ])
    mocks.session.mockResolvedValueOnce(sessionRow({ id: 'parent', discordID: 'support' }))
    const result = await post()
    expect(result.status).toBe(200)
    expect(mocks.execute).toHaveBeenCalledWith(
      server,
      expect.objectContaining({ discordID: 'customer', actorDiscordID: 'support', actorSessionID: 'parent' }),
      input,
    )
  })

  it('passes unexpected provider failures to the error handler without leaking private command data', async () => {
    mocks.execute.mockRejectedValueOnce(new Error('private provider details'))
    const result = await post({ ...input, command: 'echo private-console-command' })
    expect(result.status).toBe(503)
    expect(result.body).toEqual({ error: { code: 'service_unavailable' } })
    expect(JSON.stringify(result.body)).not.toMatch(/private|session-token/)
  })

  it.each([
    [409, 'request_pending'],
    [409, 'command_in_progress'],
    [409, 'request_conflict'],
    [409, 'server_offline'],
    [429, 'rate_limited'],
    [503, 'console_unavailable'],
  ] as const)('returns a safe predispatch %s error for %s', async (status, code) => {
    mocks.execute.mockRejectedValueOnce(new ServerConsoleError(status, code))
    const result = await post({ ...input, command: 'echo private-console-command' })
    expect(result.status).toBe(status)
    expect(result.body).toEqual({ error: { code, message: expect.any(String) } })
    expect(JSON.stringify(result.body)).not.toContain('private-console-command')
    expect(JSON.stringify(result.body)).not.toContain('session-token')
  })
})
