import express from 'express'
vi.mock('@gmod/domain-user/dashboardAccess.js', async () => ({
  canAccessDashboardGuild: (await import('../../helpers/dashboardAccessFixture.js')).dashboardAccessFromAdminFixture,
  resolveDashboardAccess: (await import('../../helpers/dashboardAccessFixture.js'))
    .resolveDashboardAccessFromAdminFixture,
}))
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({
  session: vi.fn(),
  assert: vi.fn(),
  panel: vi.fn(),
  permissions: vi.fn(),
  server: vi.fn(),
  snapshot: vi.fn(),
}))
const statistics = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock('@gmod/domain-auth/authSessions.js', () => ({
  resolveRequestSession: auth.session,
  assertSessionRequest: auth.assert,
  readSessionCredential: () => 'test-session',
}))
vi.mock('@gmod/core/utils/tools.js', () => ({ badArgument: (values: unknown[]) => values.some((value) => !value) }))
vi.mock('@gmod/domain-user/PanelUser.js', () => ({ getPanelUserFromDiscordID: auth.panel }))
vi.mock('@gmod/domain-server/Server.js', () => ({ getServerFromID: auth.server }))
vi.mock('@gmod/domain-user/User.js', () => ({ getUserFromDiscordID: vi.fn() }))
vi.mock('@gmod/domain-guild/Guild.js', () => ({
  Guild: class {
    id: string
    constructor(data: { id: string }) {
      this.id = data.id
    }
  },
}))
vi.mock('@gmod/infra-bullmq/discordQueueAdapters.js', () => ({ enqueueDiscordGuildSnapshot: auth.snapshot }))
vi.mock('@gmod/core/models/v3/serverStatisticsModels.js', () => ({ processGetServerStatistics: statistics.get }))

const { userValidator, userAdminGuildScopeValidator, userServerValidator } =
  await import('../../../src/middleware/v3/userValidator.js')
const { getServerStatistics } = await import('../../../src/controllers/website/WebsiteStatisticsControllers.js')
const { default: asyncHandler } = await import('../../../src/middleware/asyncHandler.js')

const app = express()
app.get(
  '/users/:discordID/guilds/:guildID/servers/:serverID/statistics',
  userValidator,
  userAdminGuildScopeValidator,
  userServerValidator,
  asyncHandler(getServerStatistics),
)
app.use(
  (error: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.status || 503).json({ error: 'request_rejected' })
  },
)

describe('server statistics authorization with actual middleware and controller', () => {
  const endpoint = '/users/owner/guilds/guild-one/servers/server-one/statistics'
  const body = { period: '7d', traffic: [] }

  beforeEach(() => {
    vi.resetAllMocks()
    auth.session.mockImplementation(async (req) => (req.headers.cookie ? { discordID: 'owner' } : null))
    auth.permissions.mockImplementation(async (guildID) => guildID === 'guild-one')
    auth.panel.mockResolvedValue({ isAdminOfGuild: auth.permissions })
    auth.server.mockResolvedValue({
      id: 'server-one',
      isPublic: false,
      getID: () => 'server-one',
      getGuildID: () => 'guild-one',
    })
    auth.snapshot.mockRejectedValue(new Error('Discord snapshot unavailable'))
    statistics.get.mockResolvedValue({ status: 200, body })
  })

  it('rejects an unauthenticated request before guild, server or statistics access', async () => {
    const result = await request(app).get(endpoint)
    expect(result.status).toBe(401)
    expect(auth.permissions).not.toHaveBeenCalled()
    expect(auth.server).not.toHaveBeenCalled()
    expect(statistics.get).not.toHaveBeenCalled()
  })

  it('rejects a different account in the route before any server access', async () => {
    const result = await request(app).get(endpoint.replace('/owner/', '/other/')).set('Cookie', 'session=test')
    expect(result.status).toBe(401)
    expect(auth.permissions).not.toHaveBeenCalled()
    expect(auth.server).not.toHaveBeenCalled()
    expect(statistics.get).not.toHaveBeenCalled()
  })

  it('checks the route guild before loading a server despite a query override', async () => {
    const result = await request(app)
      .get(endpoint.replace('/guild-one/', '/foreign-guild/'))
      .query({ guildID: 'guild-one' })
      .set('Cookie', 'session=test')
    expect(result.status).toBe(403)
    expect(result.body).toEqual({ error: 'dashboard_access_denied', reason: 'discord_admin_required' })
    expect(auth.permissions).toHaveBeenCalledExactlyOnceWith('foreign-guild')
    expect(auth.server).not.toHaveBeenCalled()
    expect(statistics.get).not.toHaveBeenCalled()
  })

  it('rejects a server belonging to another guild before reading statistics', async () => {
    auth.server.mockResolvedValueOnce({ getID: () => 'server-one', getGuildID: () => 'foreign-guild' })
    const result = await request(app).get(endpoint).set('Cookie', 'session=test')
    expect(result.status).toBe(403)
    expect(result.body).toEqual({ error: 'dashboard_access_denied', reason: 'scope_unavailable' })
    expect(auth.server).toHaveBeenCalledExactlyOnceWith('server-one')
    expect(statistics.get).not.toHaveBeenCalled()
    expect(auth.snapshot).not.toHaveBeenCalled()
  })

  it('returns 404 for a missing server without accessing statistics', async () => {
    auth.server.mockResolvedValueOnce(null)
    const result = await request(app).get(endpoint).set('Cookie', 'session=test')
    expect(result.status).toBe(404)
    expect(result.body).toEqual({ error: 'server_not_found' })
    expect(statistics.get).not.toHaveBeenCalled()
  })

  it('reads a private server after authorization without requiring Discord metadata', async () => {
    const result = await request(app).get(endpoint).query({ period: '7d' }).set('Cookie', 'session=test')
    expect(result.status).toBe(200)
    expect(result.headers['cache-control']).toBe('no-store')
    expect(result.body).toEqual(body)
    expect(auth.permissions).toHaveBeenCalledTimes(2)
    expect(auth.permissions).toHaveBeenNthCalledWith(1, 'guild-one')
    expect(auth.permissions).toHaveBeenNthCalledWith(2, 'guild-one')
    expect(statistics.get).toHaveBeenCalledExactlyOnceWith('server-one', { period: '7d' })
    expect(auth.snapshot).not.toHaveBeenCalled()
  })

  it('returns query validation failures from the statistics model', async () => {
    statistics.get.mockResolvedValueOnce({ status: 400, body: { error: 'invalid_query' } })
    const result = await request(app).get(endpoint).query({ period: 'invalid' }).set('Cookie', 'session=test')
    expect(result.status).toBe(400)
    expect(result.body).toEqual({ error: 'invalid_query' })
    expect(statistics.get).toHaveBeenCalledExactlyOnceWith('server-one', { period: 'invalid' })
  })

  it('forwards a statistics storage failure without returning a successful result', async () => {
    statistics.get.mockRejectedValueOnce(new Error('Private storage detail'))
    const result = await request(app).get(endpoint).set('Cookie', 'session=test')
    expect(result.status).toBe(503)
    expect(result.body).toEqual({ error: 'request_rejected' })
    expect(result.text).not.toContain('Private storage detail')
  })
})
