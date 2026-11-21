import express from 'express'
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
vi.mock('@gmod/config', () => ({ ConfigServer: { websiteUrl: 'https://dashboard.example.test' } }))
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
  return instance
}
const put = (url = serverURL, body: unknown = { settings: { log_hide_ip: true } }) =>
  request(app()).put(url).set('Authorization', 'Bearer session-token').send(body)

beforeEach(() => {
  vi.resetAllMocks()
  mocks.sessions.mockResolvedValue([{ discordID: 'owner' }])
  mocks.panel.mockResolvedValue({ authAllowed: mocks.auth, isAdminOfGuild: mocks.admin })
  mocks.auth.mockResolvedValue(true)
  mocks.admin.mockResolvedValue(true)
  mocks.server.mockResolvedValue(target)
  mocks.saveServer.mockResolvedValue({ settings: { log_hide_ip: true }, sync: 'applied' })
  mocks.saveGuild.mockResolvedValue({ settings: { verification_dont_mp: true }, sync: 'applied' })
})

describe('dashboard section endpoints and session authorization', () => {
  it('saves only to the server resolved under the authenticated guild', async () => {
    const response = await put()
    expect(response.status).toBe(200)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(mocks.panel).toHaveBeenCalledWith('owner')
    expect(mocks.auth).toHaveBeenCalledWith('session-token')
    expect(mocks.admin).toHaveBeenCalledWith('guild')
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
    mocks.auth.mockResolvedValue(false)
    expect((await put()).status).toBe(401)
    mocks.auth.mockResolvedValue(true)
    expect((await put().set('Origin', 'https://foreign.test')).status).toBe(403)
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
