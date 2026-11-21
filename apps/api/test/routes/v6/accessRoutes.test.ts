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
vi.mock('@gmod/config', () => ({ ConfigServer: { websiteUrl: 'https://dashboard.example.test' } }))
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
  return instance
}
const get = (url = guildURL) => request(app()).get(url).set('Authorization', 'Bearer session-token')

beforeEach(() => {
  vi.resetAllMocks()
  mocks.sessions.mockResolvedValue([{ discordID: 'owner' }])
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
  it('returns an unknown entitlement state without replacing it with a Free snapshot', async () => {
    mocks.access.mockResolvedValue({ ...snapshot, state: 'unknown' })
    expect((await get()).body).toMatchObject({ state: 'unknown' })
  })
})
