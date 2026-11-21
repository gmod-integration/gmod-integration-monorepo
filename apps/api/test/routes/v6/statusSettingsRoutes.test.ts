import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  sessions: vi.fn(),
  panel: vi.fn(),
  auth: vi.fn(),
  admin: vi.fn(),
  server: vi.fn(),
  get: vi.fn(),
  save: vi.fn(),
  refresh: vi.fn(),
}))
vi.mock('@gmod/infra-prisma', () => ({ default: { gm_panelToken: { findMany: mocks.sessions } } }))
vi.mock('@gmod/domain-user/PanelUser.js', () => ({ getPanelUserFromDiscordID: mocks.panel }))
vi.mock('@gmod/domain-server/Server.js', () => ({ getServerFromID: mocks.server }))
vi.mock('@gmod/domain-guild/Guild.js', () => ({ Guild: class {} }))
vi.mock('@gmod/config', () => ({ ConfigServer: { websiteUrl: 'https://dashboard.example.test' } }))
vi.mock('@gmod/infra-bullmq/discordQueueAdapters.js', () => ({ enqueueDiscordServerStatusRefresh: mocks.refresh }))
vi.mock('@gmod/domain-server/statusConfiguration.js', () => ({
  getStatusConfiguration: mocks.get,
  saveStatusConfiguration: mocks.save,
  StatusConfigurationError: class extends Error {
    constructor(public code: string) {
      super(code)
    }
  },
}))
const { default: router } = await import('../../../src/routes/v6/statusSettingsRoutes.js')
const { StatusConfigurationError } = await import('@gmod/domain-server/statusConfiguration.js')
const endpoint = '/v6/guilds/g1/servers/s1/status/configuration'
const configuration = {
  settings: { show_player_list_status: true, status_player_list_format: '{name}', show_status_chart: false },
  buttons: [{ id: 1, name: 'Website', url: 'https://example.com', emoji: '', enable: true }],
}
const snapshot = { configuration, revision: 'a'.repeat(64) }
const server = { id: 's1', guild: 'g1' }
function app() {
  const instance = express()
  instance.use(express.json())
  instance.use('/v6', router)
  instance.use((_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) =>
    res.status(503).json({ error: { code: 'service_unavailable' } }),
  )
  return instance
}
const get = () => request(app()).get(endpoint).set('Authorization', 'Bearer session-token')
const put = (body: unknown = snapshot) =>
  request(app()).put(endpoint).set('Authorization', 'Bearer session-token').send(body)
beforeEach(() => {
  vi.clearAllMocks()
  mocks.sessions.mockResolvedValue([{ discordID: 'owner' }])
  mocks.panel.mockResolvedValue({ authAllowed: mocks.auth, isAdminOfGuild: mocks.admin })
  mocks.auth.mockResolvedValue(true)
  mocks.admin.mockResolvedValue(true)
  mocks.server.mockResolvedValue(server)
  mocks.get.mockResolvedValue(snapshot)
  mocks.save.mockResolvedValue({ ...snapshot, sync: 'applied' })
  mocks.refresh.mockResolvedValue(true)
})

describe('v6 aggregate status settings', () => {
  it('loads one aggregate with an authenticated database identity and server ownership', async () => {
    const response = await get()
    expect(response.status).toBe(200)
    expect(response.body).toEqual(snapshot)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(mocks.get).toHaveBeenCalledWith('s1')
    expect(mocks.panel).toHaveBeenCalledWith('owner')
    expect(mocks.admin).toHaveBeenCalledWith('g1')
  })
  it('validates the whole aggregate before calling one domain save with an explicit refresh callback', async () => {
    const response = await put()
    expect(response.status).toBe(200)
    expect(mocks.save).toHaveBeenCalledTimes(1)
    expect(mocks.save).toHaveBeenCalledWith(server, snapshot, expect.any(Function))
    await mocks.save.mock.calls[0][2]()
    expect(mocks.refresh).toHaveBeenCalledWith('s1')
  })
  it.each([
    {},
    { configuration },
    { ...snapshot, revision: 'invalid' },
    { ...snapshot, user: 'another-owner' },
    { ...snapshot, configuration: { ...configuration, extra: true } },
    {
      ...snapshot,
      configuration: {
        ...configuration,
        settings: { ...configuration.settings, status_player_list_format: 'x'.repeat(256) },
      },
    },
    {
      ...snapshot,
      configuration: { ...configuration, buttons: [{ ...configuration.buttons[0], url: 'javascript:alert(1)' }] },
    },
  ])('rejects incomplete, overlong or unrecognized request fields', async (body) => {
    const response = await put(body)
    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('invalid_request')
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('rejects missing authentication and denied guild permissions before loading or writing', async () => {
    expect((await request(app()).get(endpoint)).status).toBe(401)
    mocks.admin.mockResolvedValue(false)
    expect((await put()).status).toBe(403)
    expect(mocks.get).not.toHaveBeenCalled()
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('does not accept a server from another guild', async () => {
    mocks.server.mockResolvedValue({ ...server, guild: 'g2' })
    expect((await put()).status).toBe(404)
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('rejects ambiguous sessions and unexpected origins', async () => {
    mocks.sessions.mockResolvedValue([{ discordID: 'one' }, { discordID: 'two' }])
    expect((await get()).status).toBe(401)
    expect(
      (
        await request(app())
          .put(endpoint)
          .set('Authorization', 'Bearer session-token')
          .set('Origin', 'https://evil.example.test')
          .send(snapshot)
      ).status,
    ).toBe(403)
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it.each([
    ['conflict', 409],
    ['premium_required', 403],
    ['invalid_button', 400],
  ] as const)('returns a safe %s response', async (code, status) => {
    mocks.save.mockRejectedValue(new StatusConfigurationError(code))
    const response = await put()
    expect(response.status).toBe(status)
    expect(response.body).toEqual({ error: { code, message: expect.any(String) } })
  })
  it('returns a successful persisted state when Discord synchronization remains pending', async () => {
    mocks.save.mockResolvedValue({ ...snapshot, sync: 'pending' })
    const response = await put()
    expect(response.status).toBe(200)
    expect(response.body.sync).toBe('pending')
  })
  it('does not report success after an unexpected domain failure', async () => {
    mocks.save.mockRejectedValue(new Error('private database failure'))
    const response = await put()
    expect(response.status).toBe(503)
    expect(JSON.stringify(response.body)).not.toContain('private')
  })
})
