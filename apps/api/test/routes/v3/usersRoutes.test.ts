import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const notificationDatabase = vi.hoisted(() => ({ findMany: vi.fn(), count: vi.fn(), updateMany: vi.fn() }))
vi.mock('@gmod/infra-prisma', () => ({ default: { gm_users_notifications: notificationDatabase } }))

vi.mock('@/controllers/v3/usersControllers.js', () => ({
  createGuildVerificationsRoles: vi.fn(),
  createNewServer: vi.fn(),
  createServerStatusButtons: vi.fn(),
  createVerificationMessage: vi.fn(),
  deleteAutoRoles: vi.fn(),
  deleteGmodPurchase: vi.fn(),
  deleteUserGmodPurchase: vi.fn(),
  deleteGmodToDiscordFilter: vi.fn(),
  deleteGuildBotInstance: vi.fn(),
  deleteGuildLinks: vi.fn(),
  deleteGuildServer: vi.fn(),
  deleteGuildVerificationsRoles: vi.fn(),
  deleteLogsChannel: vi.fn(),
  deleteServerLogsTrigger: vi.fn(),
  deleteServerPseudo: vi.fn(),
  deleteServerRoles: vi.fn(),
  deleteServerScreenshots: vi.fn(),
  deleteServerStatus: vi.fn(),
  deleteServerStatusButtons: vi.fn(),
  deleteServerSyncChat: vi.fn(),
  deleteServerTeams: vi.fn(),
  deleteUserSession: vi.fn(),
  deleteVerificationMessage: vi.fn(),
  deleteVoteChannels: vi.fn(),
  findCurrentUser: vi.fn(),
  findGuild: vi.fn(),
  findGuildChannels: vi.fn(),
  findGuildServer: vi.fn(),
  findGuildServers: vi.fn(),
  findServerScreenshots: vi.fn(),
  findServerStatus: vi.fn(),
  findServerSyncChat: vi.fn(),
  getAdminGuilds: vi.fn(),
  getAdminInformations: vi.fn(),
  getAutoRoles: vi.fn(),
  getGmodToDiscordFilter: vi.fn(),
  getGuildAdmins: vi.fn(),
  getGuildBans: vi.fn(),
  getGuildBotInstance: vi.fn(),
  getGuildBotRoleSubordination: vi.fn(),
  getGuildEmojis: vi.fn(),
  getGuildLinks: vi.fn(),
  getGuildRoles: vi.fn(),
  getGuildSetting: vi.fn(),
  getGuildSettings: vi.fn(),
  getGuildVerificationsRoles: vi.fn(),
  getLogsChannel: vi.fn(),
  getProfile: vi.fn(),
  getSteamProfile: vi.fn(),
  getPublicServers: vi.fn(),
  getPublicServerRanking: vi.fn(),
  getScreenshotsList: vi.fn(),
  getServerLogs: vi.fn(),
  getServerLogsTrigger: vi.fn(),
  getServerPlayers: vi.fn(),
  getServerPseudo: vi.fn(),
  getServerReportBugs: vi.fn(),
  getServerRoles: vi.fn(),
  getServerSetting: vi.fn(),
  getServerSettings: vi.fn(),
  getServerStatusButtons: vi.fn(),
  getServerTeams: vi.fn(),
  getServerWarns: vi.fn(),
  getUserDataRequest: vi.fn(),
  getUserGmodStorePurchases: vi.fn(),
  getUserGuildsOwnOrAdmins: vi.fn(),
  getUserSessions: vi.fn(),
  getVerificationCheck: vi.fn(),
  getVerificationMessage: vi.fn(),
  getVoteChannels: vi.fn(),
  logOut: vi.fn(),
  oauthLogin: vi.fn(),
  patchGuildBotInstance: vi.fn(),
  postAutoRoles: vi.fn(),
  postGmodPurchase: vi.fn(),
  postGmodToDiscordFilter: vi.fn(),
  postGuildLinks: vi.fn(),
  postGuildServerToken: vi.fn(),
  postLogsChannel: vi.fn(),
  postServerLogsTrigger: vi.fn(),
  postServerPseudo: vi.fn(),
  postServerRoles: vi.fn(),
  postServerScreenshots: vi.fn(),
  postServerStatus: vi.fn(),
  previewServerStatus: vi.fn(),
  postServerSyncChat: vi.fn(),
  postServerTeams: vi.fn(),
  postUserDataRequest: vi.fn(),
  postUserStartVerification: vi.fn(),
  postVerificationCheck: vi.fn(),
  postVoteChannels: vi.fn(),
  putGmodToDiscordFilter: vi.fn(),
  putGuildBotInstance: vi.fn(),
  putGuildLinks: vi.fn(),
  putGuildServer: vi.fn(),
  putGuildSetting: vi.fn(),
  putGuildVerificationsRoles: vi.fn(),
  putPlayerBypassMaintenance: vi.fn(),
  putServerLogsTrigger: vi.fn(),
  putServerPseudo: vi.fn(),
  putServerRoles: vi.fn(),
  putServerSetting: vi.fn(),
  putServerStatusButtons: vi.fn(),
  putServerTeams: vi.fn(),
}))

vi.mock('@/middleware/v3/userValidator.js', () => ({
  userAdminGuildValidator: vi.fn(),
  userAdminGuildBotRemovalValidator: vi.fn(),
  userAdminValidator: vi.fn(),
  userServerValidator: vi.fn(),
  userValidator: vi.fn(),
}))
vi.mock('@/controllers/v3/usersAdminControllers.js', () => ({ getAllPanelUsers: vi.fn() }))
vi.mock('@/controllers/website/WebsiteErrorsControllers.js', () => ({ getServerErrors: vi.fn() }))
vi.mock('@/controllers/v3/serversControllers.js', () => ({ getIGSettings: vi.fn(), postIGSettings: vi.fn() }))
vi.mock('@/controllers/v3/users/ServerStatusChannelControllers.js', () => ({ putServerStatusChannel: vi.fn() }))

const { default: router } = await import('../../../src/routes/v3/usersRoutes.js')
const { userValidator, userAdminGuildValidator, userAdminGuildBotRemovalValidator, userServerValidator } =
  await import('@/middleware/v3/userValidator.js')
const { getSteamProfile, deleteGuildBotInstance } = await import('@/controllers/v3/usersControllers.js')

describe('usersRoutes', () => {
  it('registers a representative sample of routes across the whole file', () => {
    const paths = router.stack.map((layer: any) => layer.route?.path).filter(Boolean)
    expect(paths).toContain('/')
    expect(paths).toContain('/login')
    expect(paths).toContain('/:discordID')
    expect(paths).toContain('/:discordID/guilds/:guildID/servers/:serverID/status/buttons/:buttonID')
    expect(paths).toContain('/:discordID/guilds/:guildID/bans')
    expect(paths).toContain('/:discordID/guilds/:guildID/servers/:serverID/chats/filters/:filterID')
    expect(paths.length).toBeGreaterThan(80)
  })

  it('registers ranking after session authentication and before guild administration restrictions', () => {
    const ranking = router.stack.findIndex((layer: any) => layer.route?.path === '/:discordID/servers/ranking')
    const authentication = router.stack.findIndex((layer: any) => layer.handle === userValidator)
    const guildAdministration = router.stack.findIndex((layer: any) => layer.handle === userAdminGuildValidator)
    expect(ranking).toBeGreaterThan(authentication)
    expect(ranking).toBeLessThan(guildAdministration)
    expect(router.stack[ranking].route.methods.get).toBe(true)
  })

  it('registers Steam profile decoration after account authentication', () => {
    const profile = router.stack.findIndex((layer: any) => layer.route?.path === '/:discordID/steam-profile')
    const authentication = router.stack.findIndex((layer: any) => layer.handle === userValidator)
    const guildAdministration = router.stack.findIndex((layer: any) => layer.handle === userAdminGuildValidator)
    expect(profile).toBeGreaterThan(authentication)
    expect(profile).toBeLessThan(guildAdministration)
    expect(router.stack[profile].route.methods.get).toBe(true)
  })

  it('protects draft previews with both guild-administrator and server access checks', () => {
    const preview = router.stack.findIndex(
      (layer: any) => layer.route?.path === '/:discordID/guilds/:guildID/servers/:serverID/status/preview',
    )
    const guild = router.stack.findIndex((layer: any) => layer.handle === userAdminGuildValidator)
    const server = router.stack.findIndex((layer: any) => layer.handle === userServerValidator)
    expect(preview).toBeGreaterThan(guild)
    expect(preview).toBeGreaterThan(server)
    expect(router.stack[preview].route.methods.post).toBe(true)
  })

  it('protects custom-bot removal with account and guild-administrator checks', () => {
    const removal = router.stack.findIndex(
      (layer: any) => layer.route?.path === '/:discordID/guilds/:guildID/bot' && layer.route.methods.delete,
    )
    expect(removal).toBeGreaterThan(router.stack.findIndex((layer: any) => layer.handle === userValidator))
    expect(removal).toBeLessThan(router.stack.findIndex((layer: any) => layer.handle === userAdminGuildValidator))
    expect(router.stack[removal].route.stack[0].handle).toBe(userAdminGuildBotRemovalValidator)
  })
})

describe('Steam profile account authentication', () => {
  const app = express()
  app.use('/v3/users', router)

  beforeEach(() => {
    vi.mocked(getSteamProfile)
      .mockReset()
      .mockImplementation((_req, res) => res.json({ steamProfile: null }))
    vi.mocked(userValidator).mockImplementation((req, res, next) => {
      if (req.header('x-test-user') !== req.params.discordID) return res.status(401).json({ error: 'Unauthorized' })
      next()
    })
  })

  it.each([undefined, 'other'])('rejects an absent or mismatched account session (%s)', async (user) => {
    const pending = request(app).get('/v3/users/owner/steam-profile')
    const response = await (user ? pending.set('x-test-user', user) : pending)
    expect(response.status).toBe(401)
    expect(getSteamProfile).not.toHaveBeenCalled()
  })

  it('allows the matching account session through to the profile handler', async () => {
    const response = await request(app).get('/v3/users/owner/steam-profile').set('x-test-user', 'owner')
    expect(response.status).toBe(200)
    expect(getSteamProfile).toHaveBeenCalledTimes(1)
  })
})

describe('custom-bot removal HTTP authorization', () => {
  const app = express()
  app.use('/v3/users', router)

  beforeEach(() => {
    vi.mocked(deleteGuildBotInstance)
      .mockReset()
      .mockImplementation((_req, res) => res.json({ removed: true }))
    vi.mocked(userValidator).mockImplementation((req, res, next) => {
      if (req.header('x-test-user') !== req.params.discordID) return res.status(401).json({ error: 'Unauthorized' })
      next()
    })
    vi.mocked(userAdminGuildValidator)
      .mockReset()
      .mockImplementation((_req, res) => res.status(404).json({ error: 'guild_not_found' }))
    vi.mocked(userAdminGuildBotRemovalValidator)
      .mockReset()
      .mockImplementation((req, res, next) => {
        if (req.header('x-test-admin-guild') !== req.params.guildID)
          return res.status(403).json({ error: 'not_admin_of_guild' })
        next()
      })
  })

  it('rejects an anonymous removal before invoking the command', async () => {
    const response = await request(app).delete('/v3/users/owner/guilds/g1/bot')
    expect(response.status).toBe(401)
    expect(deleteGuildBotInstance).not.toHaveBeenCalled()
  })

  it('does not let an administrator remove another guild’s custom bot', async () => {
    const response = await request(app)
      .delete('/v3/users/owner/guilds/g2/bot')
      .set('x-test-user', 'owner')
      .set('x-test-admin-guild', 'g1')
    expect(response.status).toBe(403)
    expect(deleteGuildBotInstance).not.toHaveBeenCalled()
  })

  it('allows the authenticated administrator of the target guild', async () => {
    const response = await request(app)
      .delete('/v3/users/owner/guilds/g1/bot')
      .set('x-test-user', 'owner')
      .set('x-test-admin-guild', 'g1')
    expect(response.status).toBe(200)
    expect(deleteGuildBotInstance).toHaveBeenCalledTimes(1)
    expect(userAdminGuildValidator).not.toHaveBeenCalled()
  })

  it('reaches the main-bot-required response for authorized expired cleanup without a guild snapshot', async () => {
    vi.mocked(deleteGuildBotInstance).mockImplementationOnce((_req, res) =>
      res.status(409).json({ error: 'main_bot_required' }),
    )
    const response = await request(app)
      .delete('/v3/users/owner/guilds/expired-guild/bot')
      .set('x-test-user', 'owner')
      .set('x-test-admin-guild', 'expired-guild')
    expect(response.status).toBe(409)
    expect(response.body).toEqual({ error: 'main_bot_required' })
    expect(userAdminGuildValidator).not.toHaveBeenCalled()
  })
})

describe('notification HTTP contracts with real routes, controllers and models', () => {
  let notifications: { id: number; discordID: string; read: boolean; createdAt: string }[]
  const endpoint = '/v3/users/owner/notifications'
  const app = express()
  app.use('/v3/users', router)
  app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: 'Unexpected error' })
  })

  beforeEach(() => {
    notifications = [
      { id: 1, discordID: 'owner', read: false, createdAt: '2026-11-22T10:00:00Z' },
      { id: 2, discordID: 'owner', read: false, createdAt: '2026-11-22T12:00:00Z' },
      { id: 3, discordID: 'owner', read: true, createdAt: '2026-11-22T11:00:00Z' },
      { id: 4, discordID: 'other', read: false, createdAt: '2026-11-22T12:00:00Z' },
    ]
    notificationDatabase.findMany
      .mockReset()
      .mockImplementation(async ({ where }) =>
        notifications.filter((notification) => notification.discordID === where.discordID),
      )
    notificationDatabase.count
      .mockReset()
      .mockImplementation(
        async ({ where }) =>
          notifications.filter((notification) => notification.discordID === where.discordID && !notification.read)
            .length,
      )
    notificationDatabase.updateMany.mockReset().mockImplementation(async ({ where }) => {
      const matching = notifications.filter(
        (notification) =>
          notification.discordID === where.discordID &&
          (where.id === undefined || notification.id === where.id) &&
          (where.read === undefined || notification.read === where.read),
      )
      matching.forEach((notification) => {
        notification.read = true
      })
      return { count: matching.length }
    })
    // Authentication is a boundary stub; the real route must invoke it before any notification handler.
    vi.mocked(userValidator).mockImplementation((req, res, next) => {
      if (req.header('x-test-user') !== req.params.discordID) return res.status(401).json({ error: 'Unauthorized' })
      next()
    })
  })

  it('returns the list and its actual unread count for the authenticated account', async () => {
    const response = await request(app).get(endpoint).set('x-test-user', 'owner')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ notifications: notifications.slice(0, 3), unreadCount: 2 })
    expect(notificationDatabase.findMany).toHaveBeenCalledWith({
      where: { discordID: 'owner' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })
  })

  it('mounts the header count endpoint and counts unread items only', async () => {
    const response = await request(app).get(`${endpoint}/count`).set('x-test-user', 'owner')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ unreadCount: 2 })
    expect(notificationDatabase.count).toHaveBeenCalledWith({ where: { discordID: 'owner', read: false } })
  })

  it('returns the remaining count after reading one item, including repeated reads', async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await request(app).patch(`${endpoint}/1`).set('x-test-user', 'owner')
      expect(response.status).toBe(200)
      expect(response.body).toEqual({ unreadCount: 1 })
    }
    expect(notifications.find((notification) => notification.id === 2)?.read).toBe(false)
  })

  it('mounts mark-all-read before the dynamic ID route and leaves other accounts untouched', async () => {
    const response = await request(app).patch(`${endpoint}/mark-all-read`).set('x-test-user', 'owner')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ unreadCount: 0 })
    expect(notificationDatabase.updateMany).toHaveBeenCalledWith({
      where: { discordID: 'owner', read: false },
      data: { read: true },
    })
    expect(notifications.find((notification) => notification.id === 4)?.read).toBe(false)
  })

  it('does not hide a notification arriving between marking all and recounting', async () => {
    notificationDatabase.count.mockImplementationOnce(async () => 1)
    const response = await request(app).patch(`${endpoint}/mark-all-read`).set('x-test-user', 'owner')
    expect(response.body).toEqual({ unreadCount: 1 })
  })

  it('returns the same 404 for a missing item and another account’s item', async () => {
    for (const id of [4, 999]) {
      const response = await request(app).patch(`${endpoint}/${id}`).set('x-test-user', 'owner')
      expect(response.status).toBe(404)
      expect(response.body).toEqual({ error: 'Notification not found' })
    }
    expect(notifications.find((notification) => notification.id === 4)?.read).toBe(false)
    expect(notificationDatabase.count).not.toHaveBeenCalled()
  })

  it.each(['0', '-1', '1.5', '1abc', '2147483648'])(
    'rejects an invalid notification ID %s without querying storage',
    async (id) => {
      const response = await request(app).patch(`${endpoint}/${id}`).set('x-test-user', 'owner')
      expect(response.status).toBe(400)
      expect(notificationDatabase.updateMany).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['get', ''],
    ['get', '/count'],
    ['patch', '/1'],
    ['patch', '/mark-all-read'],
  ] as const)('requires account authentication for %s %s', async (method, path) => {
    const response = await request(app)[method](`${endpoint}${path}`)
    expect(response.status).toBe(401)
    expect(notificationDatabase.findMany).not.toHaveBeenCalled()
    expect(notificationDatabase.count).not.toHaveBeenCalled()
    expect(notificationDatabase.updateMany).not.toHaveBeenCalled()
  })

  it('does not turn a failed unread query into a successful zero count', async () => {
    notificationDatabase.count.mockRejectedValueOnce(new Error('storage unavailable'))
    const response = await request(app).get(`${endpoint}/count`).set('x-test-user', 'owner')
    expect(response.status).toBe(500)
    expect(response.body).not.toHaveProperty('unreadCount')
  })
})
