import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ServerMapSnapshotSchema } from '@gmod/schema/server/ServerMapSchema.js'

const auth = vi.hoisted(() => ({
  session: vi.fn(),
  assert: vi.fn(),
  panel: vi.fn(),
  permissions: vi.fn(),
  server: vi.fn(),
  discordSnapshot: vi.fn(),
}))
const map = vi.hoisted(() => ({ get: vi.fn() }))

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
vi.mock('@gmod/infra-bullmq/discordQueueAdapters.js', () => ({
  enqueueDiscordGuildSnapshot: auth.discordSnapshot,
}))
vi.mock('@gmod/core/models/v3/serverMapModels.js', () => ({ processGetServerMap: map.get }))

const { userValidator, userAdminGuildScopeValidator, userServerValidator } =
  await import('../../../src/middleware/v3/userValidator.js')
const { getServerMap } = await import('../../../src/controllers/website/WebsiteMapControllers.js')
const { default: asyncHandler } = await import('../../../src/middleware/asyncHandler.js')

const app = express()
app.get(
  '/users/:discordID/guilds/:guildID/servers/:serverID/map',
  userValidator,
  userAdminGuildScopeValidator,
  userServerValidator,
  asyncHandler(getServerMap),
)
app.use(
  (error: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.status || 503).json({ error: 'request_rejected' })
  },
)

describe('server map authorization with actual middleware and controller', () => {
  const endpoint = '/users/owner/guilds/guild-one/servers/server-one/map'
  const snapshot = ServerMapSnapshotSchema.parse({
    serverID: 'server-one',
    map: 'gm_construct',
    gameMode: 'sandbox',
    players: 0,
    maxPlayers: 32,
    updatedAt: '2026-11-23T12:00:00.000Z',
    online: true,
  })

  beforeEach(() => {
    vi.resetAllMocks()
    auth.session.mockImplementation(async (req) => (req.headers.cookie ? { discordID: 'owner' } : null))
    auth.permissions.mockImplementation(async (guildID) => guildID === 'guild-one')
    auth.panel.mockResolvedValue({ discordID: 'owner', isAdminOfGuild: auth.permissions })
    auth.server.mockResolvedValue({
      id: 'server-one',
      isPublic: false,
      getID: () => 'server-one',
      getGuildID: () => 'guild-one',
    })
    auth.discordSnapshot.mockRejectedValue(new Error('Discord metadata unavailable'))
    map.get.mockResolvedValue(snapshot)
  })

  it('rejects an anonymous request before permission, server or snapshot reads', async () => {
    const result = await request(app).get(endpoint)
    expect(result.status).toBe(401)
    expect(auth.permissions).not.toHaveBeenCalled()
    expect(auth.server).not.toHaveBeenCalled()
    expect(map.get).not.toHaveBeenCalled()
  })

  it('rejects a mismatched viewer before looking up a guild or server', async () => {
    const result = await request(app).get(endpoint.replace('/owner/', '/other/')).set('Cookie', 'session=test')
    expect(result.status).toBe(401)
    expect(auth.permissions).not.toHaveBeenCalled()
    expect(auth.server).not.toHaveBeenCalled()
    expect(map.get).not.toHaveBeenCalled()
  })

  it('does not permit an account without a dashboard user', async () => {
    auth.panel.mockResolvedValueOnce(null)
    const result = await request(app).get(endpoint).set('Cookie', 'session=test')
    expect(result.status).toBe(401)
    expect(auth.permissions).not.toHaveBeenCalled()
    expect(map.get).not.toHaveBeenCalled()
  })

  it('checks the route guild instead of accepting an authorized query override', async () => {
    const result = await request(app)
      .get(endpoint.replace('/guild-one/', '/foreign-guild/'))
      .query({ guildID: 'guild-one' })
      .set('Cookie', 'session=test')
    expect(result.status).toBe(403)
    expect(result.body).toEqual({ error: 'not_admin_of_guild' })
    expect(auth.permissions).toHaveBeenCalledExactlyOnceWith('foreign-guild')
    expect(auth.server).not.toHaveBeenCalled()
    expect(map.get).not.toHaveBeenCalled()
  })

  it('rejects a server from another guild before reading its map', async () => {
    auth.server.mockResolvedValueOnce({ getID: () => 'server-one', getGuildID: () => 'foreign-guild' })
    const result = await request(app).get(endpoint).set('Cookie', 'session=test')
    expect(result.status).toBe(403)
    expect(result.body).toEqual({ error: 'server_not_in_guild' })
    expect(auth.server).toHaveBeenCalledExactlyOnceWith('server-one')
    expect(map.get).not.toHaveBeenCalled()
    expect(auth.discordSnapshot).not.toHaveBeenCalled()
  })

  it('returns 404 for a missing server without reading any map data', async () => {
    auth.server.mockResolvedValueOnce(null)
    const result = await request(app).get(endpoint).set('Cookie', 'session=test')
    expect(result.status).toBe(404)
    expect(result.body).toEqual({ error: 'server_not_found' })
    expect(map.get).not.toHaveBeenCalled()
  })

  it('reads only the authorized private server and needs no Discord metadata snapshot', async () => {
    const result = await request(app)
      .get(endpoint)
      .query({ serverID: 'another-server', map: 'another-map' })
      .set('Cookie', 'session=test')
    expect(result.status).toBe(200)
    expect(result.headers['cache-control']).toBe('no-store')
    expect(result.body).toEqual(snapshot)
    expect(auth.assert).toHaveBeenCalledOnce()
    expect(auth.permissions).toHaveBeenCalledExactlyOnceWith('guild-one')
    expect(map.get).toHaveBeenCalledExactlyOnceWith('server-one')
    expect(auth.discordSnapshot).not.toHaveBeenCalled()
    for (const sensitive of ['token', 'playersList', 'position', 'ip'])
      expect(result.body).not.toHaveProperty(sensitive)
  })

  it('honors a rejected session request before any authorization or map read', async () => {
    auth.assert.mockImplementationOnce(() => {
      throw Object.assign(new Error('Invalid session origin'), { status: 403 })
    })
    const result = await request(app).get(endpoint).set('Cookie', 'session=test')
    expect(result.status).toBe(403)
    expect(auth.permissions).not.toHaveBeenCalled()
    expect(auth.server).not.toHaveBeenCalled()
    expect(map.get).not.toHaveBeenCalled()
  })

  it('propagates a failed map read without exposing storage details or returning success', async () => {
    map.get.mockRejectedValueOnce(new Error('Private database connection detail'))
    const result = await request(app).get(endpoint).set('Cookie', 'session=test')
    expect(result.status).toBe(503)
    expect(result.headers['cache-control']).toBe('no-store')
    expect(result.body).toEqual({ error: 'request_rejected' })
    expect(result.text).not.toContain('Private database connection detail')
  })
})
