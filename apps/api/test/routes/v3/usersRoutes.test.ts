import { describe, expect, it, vi } from 'vitest'

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
  getPublicServers: vi.fn(),
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
  getUserNotifications: vi.fn(),
  getUserSessions: vi.fn(),
  getVerificationCheck: vi.fn(),
  getVerificationMessage: vi.fn(),
  getVoteChannels: vi.fn(),
  logOut: vi.fn(),
  oauthLogin: vi.fn(),
  patchGuildBotInstance: vi.fn(),
  patchUserNotifications: vi.fn(),
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
  userAdminValidator: vi.fn(),
  userServerValidator: vi.fn(),
  userValidator: vi.fn(),
}))
vi.mock('@/controllers/v3/usersAdminControllers.js', () => ({ getAllPanelUsers: vi.fn() }))
vi.mock('@/controllers/website/WebsiteErrorsControllers.js', () => ({ getServerErrors: vi.fn() }))
vi.mock('@/controllers/v3/serversControllers.js', () => ({ getIGSettings: vi.fn(), postIGSettings: vi.fn() }))
vi.mock('@/controllers/v3/users/ServerStatusChannelControllers.js', () => ({ putServerStatusChannel: vi.fn() }))

const { default: router } = await import('../../../src/routes/v3/usersRoutes.js')

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
})
