import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({
  session: vi.fn(),
  assert: vi.fn(),
  panel: vi.fn(),
  permissions: vi.fn(),
  server: vi.fn(),
}))
const destination = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), remove: vi.fn(), snapshot: vi.fn() }))
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
vi.mock('@gmod/infra-bullmq/discordQueueAdapters.js', () => ({ enqueueDiscordGuildSnapshot: destination.snapshot }))
class DestinationUnavailable extends Error {
  readonly status = 503
  readonly code = 'provider_unavailable'
}
vi.mock('@gmod/core/models/gmod/bugReportChannels.js', () => ({
  getBugReportChannel: destination.get,
  setBugReportChannel: destination.set,
  removeBugReportChannel: destination.remove,
  BugReportChannelError: DestinationUnavailable,
}))

const { userValidator, userAdminGuildScopeValidator, userServerValidator } =
  await import('../../../src/middleware/v3/userValidator.js')
const { getServerBugReportsChannel, postServerBugReportsChannel, deleteServerBugReportsChannel } =
  await import('../../../src/controllers/website/WebsiteBugReportsControllers.js')
const { default: asyncHandler } = await import('../../../src/middleware/asyncHandler.js')
const app = express()
app.use(express.json())
const path = '/users/:discordID/guilds/:guildID/servers/:serverID/bugs/channels'
for (const [method, handler] of [
  ['get', getServerBugReportsChannel],
  ['post', postServerBugReportsChannel],
  ['delete', deleteServerBugReportsChannel],
] as const)
  app[method](path, userValidator, userAdminGuildScopeValidator, userServerValidator, asyncHandler(handler))
app.use(
  (error: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.status || 503).json({ error: 'request_rejected' })
  },
)

describe('Bug report destination authorization with actual middleware and controllers', () => {
  const endpoint = '/users/owner/guilds/guild-one/servers/server-one/bugs/channels'
  const channelID = '123456789012345678'

  beforeEach(() => {
    vi.resetAllMocks()
    auth.session.mockImplementation(async (req) => (req.headers.cookie ? { discordID: 'owner' } : null))
    auth.assert.mockImplementation((req) => {
      if (req.method !== 'GET' && req.headers['x-csrf-token'] !== 'expected')
        throw Object.assign(new Error('Rejected CSRF'), { status: 403 })
    })
    auth.permissions.mockImplementation(async (guildID) => guildID === 'guild-one')
    auth.panel.mockResolvedValue({ isAdminOfGuild: auth.permissions })
    auth.server.mockResolvedValue({ id: 'server-one', getGuildID: () => 'guild-one' })
    destination.get.mockResolvedValue({ channelID })
    destination.set.mockResolvedValue({ channelID })
    destination.remove.mockResolvedValue({})
    destination.snapshot.mockRejectedValue(new Error('Discord snapshot unavailable'))
  })

  it.each(['get', 'post', 'delete'] as const)(
    'rejects an unauthenticated %s before any configuration access',
    async (method) => {
      expect((await request(app)[method](endpoint)).status).toBe(401)
      expect(auth.permissions).not.toHaveBeenCalled()
      for (const fn of [destination.get, destination.set, destination.remove]) expect(fn).not.toHaveBeenCalled()
    },
  )

  it('rejects an account mismatch before guild or server access', async () => {
    const result = await request(app).get(endpoint.replace('/owner/', '/other/')).set('Cookie', 'session=test')
    expect(result.status).toBe(401)
    expect(auth.permissions).not.toHaveBeenCalled()
    expect(auth.server).not.toHaveBeenCalled()
  })

  it('checks the route guild instead of a body override before reading the destination', async () => {
    const result = await request(app)
      .post(endpoint.replace('/guild-one/', '/foreign-guild/'))
      .set('Cookie', 'session=test')
      .set('X-CSRF-Token', 'expected')
      .send({ channelID, guildID: 'guild-one' })
    expect(result.status).toBe(403)
    expect(auth.permissions).toHaveBeenCalledWith('foreign-guild', { fresh: true })
    expect(auth.server).not.toHaveBeenCalled()
    expect(destination.set).not.toHaveBeenCalled()
  })

  it('rejects a server outside the authorized guild before any destination access', async () => {
    auth.server.mockResolvedValueOnce({ id: 'foreign-server', getGuildID: () => 'foreign-guild' })
    const result = await request(app).get(endpoint).set('Cookie', 'session=test')
    expect(result.status).toBe(403)
    expect(destination.get).not.toHaveBeenCalled()
    expect(destination.snapshot).not.toHaveBeenCalled()
  })

  it.each(['post', 'delete'] as const)(
    'rejects a %s without its CSRF token before permissions or storage',
    async (method) => {
      const result = await request(app)[method](endpoint).set('Cookie', 'session=test').send({ channelID })
      expect(result.status).toBe(403)
      expect(auth.permissions).not.toHaveBeenCalled()
      expect(auth.server).not.toHaveBeenCalled()
      expect(destination.set).not.toHaveBeenCalled()
      expect(destination.remove).not.toHaveBeenCalled()
    },
  )

  it('reads the destination without requiring Discord channel metadata', async () => {
    const result = await request(app).get(endpoint).set('Cookie', 'session=test')
    expect(result.status).toBe(200)
    expect(result.headers['cache-control']).toBe('no-store')
    expect(result.body).toEqual({ channelID })
    expect(destination.get).toHaveBeenCalledExactlyOnceWith('server-one')
    expect(destination.snapshot).not.toHaveBeenCalled()
  })

  it('removes the destination after fresh authorization even when the Discord snapshot worker is down', async () => {
    const result = await request(app).delete(endpoint).set('Cookie', 'session=test').set('X-CSRF-Token', 'expected')
    expect(result.status).toBe(200)
    expect(result.body).toEqual({})
    expect(auth.permissions).toHaveBeenCalledWith('guild-one', { fresh: true })
    expect(destination.remove).toHaveBeenCalledExactlyOnceWith('server-one')
    expect(destination.snapshot).not.toHaveBeenCalled()
  })

  it('reports an unavailable destination validation without acknowledging a save', async () => {
    destination.set.mockRejectedValueOnce(new DestinationUnavailable('Safe provider failure'))
    const result = await request(app)
      .post(endpoint)
      .set('Cookie', 'session=test')
      .set('X-CSRF-Token', 'expected')
      .send({ channelID })
    expect(result.status).toBe(503)
    expect(result.body).toEqual({ error: 'provider_unavailable' })
    expect(destination.set).toHaveBeenCalledExactlyOnceWith('server-one', { channelID })
    expect(destination.snapshot).not.toHaveBeenCalled()
  })
})
