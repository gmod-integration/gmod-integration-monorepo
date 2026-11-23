import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ session: vi.fn(), assert: vi.fn(), panel: vi.fn() }))
const profile = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@gmod/domain-auth/authSessions.js', () => ({
  resolveRequestSession: auth.session,
  assertSessionRequest: auth.assert,
  readSessionCredential: () => 'test-session',
}))
vi.mock('@gmod/core/utils/tools.js', () => ({ badArgument: (values: unknown[]) => values.some((value) => !value) }))
vi.mock('@gmod/domain-user/PanelUser.js', () => ({ getPanelUserFromDiscordID: auth.panel }))
vi.mock('@gmod/domain-server/Server.js', () => ({ getServerFromID: vi.fn() }))
vi.mock('@gmod/domain-user/User.js', () => ({ getUserFromDiscordID: vi.fn() }))
vi.mock('@gmod/domain-guild/Guild.js', () => ({ Guild: class {} }))
vi.mock('@gmod/infra-bullmq/discordQueueAdapters.js', () => ({ enqueueDiscordGuildSnapshot: vi.fn() }))
vi.mock('@gmod/core/models/v3/playerProfileModels.js', () => ({ processGetPlayerProfile: profile.get }))

const { userValidator } = await import('../../../src/middleware/v3/userValidator.js')
const { getPlayerProfile } = await import('../../../src/controllers/website/WebsitePlayerProfileControllers.js')
const { default: asyncHandler } = await import('../../../src/middleware/asyncHandler.js')

const app = express()
app.get('/users/:discordID/player-profile', userValidator, asyncHandler(getPlayerProfile))
app.get('/users/:discordID/players/:steamID64', userValidator, asyncHandler(getPlayerProfile))
app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(503).json({ error: 'profile_unavailable' })
})

describe('player profile authenticated HTTP access', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    auth.session.mockImplementation(async (req) => (req.headers.cookie ? { discordID: 'viewer' } : null))
    auth.panel.mockResolvedValue({ discordID: 'viewer' })
    profile.get.mockResolvedValue({ status: 200, body: { player: { name: 'Player' } } })
  })

  it.each(['/users/viewer/player-profile', '/users/viewer/players/76561198000000001'])(
    'rejects an unauthenticated request to %s before profile reads',
    async (endpoint) => {
      const result = await request(app).get(endpoint)
      expect(result.status).toBe(401)
      expect(profile.get).not.toHaveBeenCalled()
    },
  )

  it('rejects a different account in the viewer path despite an authenticated cookie', async () => {
    const result = await request(app)
      .get('/users/another-viewer/players/76561198000000001')
      .set('Cookie', 'session=test')
    expect(result.status).toBe(401)
    expect(profile.get).not.toHaveBeenCalled()
  })

  it('uses the authenticated viewer while passing target identity and pagination to the model', async () => {
    const result = await request(app)
      .get('/users/viewer/players/76561198000000001')
      .query({ limit: 25, offset: 25 })
      .set('Cookie', 'session=test')
    expect(result.status).toBe(200)
    expect(profile.get).toHaveBeenCalledExactlyOnceWith('viewer', '76561198000000001', {
      limit: '25',
      offset: '25',
    })
    expect(result.headers['cache-control']).toBe('no-store')
  })

  it('resolves the own-player identity through the account rather than a query override', async () => {
    const result = await request(app)
      .get('/users/viewer/player-profile')
      .query({ steamID64: '76561198000000002' })
      .set('Cookie', 'session=test')
    expect(result.status).toBe(200)
    expect(profile.get).toHaveBeenCalledExactlyOnceWith('viewer', undefined, { steamID64: '76561198000000002' })
  })

  it('preserves not-found responses from the profile privacy checks', async () => {
    profile.get.mockResolvedValueOnce({ status: 404, body: { error: 'player_not_found' } })
    const result = await request(app).get('/users/viewer/player-profile').set('Cookie', 'session=test')
    expect(result.status).toBe(404)
    expect(result.body).toEqual({ error: 'player_not_found' })
  })

  it('forwards unexpected failures without returning storage details', async () => {
    profile.get.mockRejectedValueOnce(new Error('private storage details'))
    const result = await request(app).get('/users/viewer/player-profile').set('Cookie', 'session=test')
    expect(result.status).toBe(503)
    expect(result.body).toEqual({ error: 'profile_unavailable' })
    expect(result.text).not.toContain('private storage details')
  })
})
