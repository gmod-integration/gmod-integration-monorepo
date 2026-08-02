import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUserFromDiscordIDMock = vi.fn()
vi.mock('@gmod/domain-user/User.js', () => ({ getUserFromDiscordID: getUserFromDiscordIDMock }))

const getServersFromDiscordGuildIDMock = vi.fn()
class FakeServer {
  [key: string]: any
  constructor(obj: any) {
    Object.assign(this, obj)
  }
  async getPublicInformations() {
    return { id: this.id, name: this.name }
  }
}
vi.mock('@gmod/domain-server/Server.js', () => ({
  getServersFromDiscordGuildID: getServersFromDiscordGuildIDMock,
  Server: FakeServer,
}))

vi.mock('@gmod/config', () => ({
  ConfigDiscord: {
    oauthPanel: 'https://discord.com/oauth?redirect_uri=https%3A%2F%2Fconfigured.example%2Fcallback',
    oauthPanelRedirect: 'https://gmod-integration.com/account',
    guildID: 'main-guild-1',
  },
}))

const addUserToGuildMock = vi.fn()
const getDiscordUserFromIDMock = vi.fn()
const getUserGuildsWithPermsForPanelMock = vi.fn()
const getUserFromTokenMock = vi.fn()
const getUserTokenFromCodeMock = vi.fn()
const saveUserMock = vi.fn()
const saveUserPanelMock = vi.fn()
vi.mock('@gmod/domain-guild/discordModels.js', () => ({
  addUserToGuild: addUserToGuildMock,
  getDiscordUserFromID: getDiscordUserFromIDMock,
  getUserGuildsWithPermsForPanel: getUserGuildsWithPermsForPanelMock,
  getUserFromToken: getUserFromTokenMock,
  getUserTokenFromCode: getUserTokenFromCodeMock,
  saveUser: saveUserMock,
  saveUserPanel: saveUserPanelMock,
}))

const badArgumentMock = vi.fn()
const todoControllersMock = vi.fn()
vi.mock('@gmod/core/utils/tools.js', () => ({ badArgument: badArgumentMock, todoControllers: todoControllersMock }))

const getUserDataGRPDMock = vi.fn()
vi.mock('@gmod/domain-compliance/gdrp.js', () => ({ getUserDataGRPD: getUserDataGRPDMock }))

const redisMock = { del: vi.fn() }
vi.mock('@gmod/infra-redis', () => ({ default: redisMock }))

const prismaMock: any = {
  gm_server_links: { update: vi.fn() },
  gm_server: { update: vi.fn(), findMany: vi.fn() },
  gm_guild_verify_role: { update: vi.fn(), delete: vi.fn() },
  gm_status_button: { update: vi.fn() },
  gm_server_sync_chat_filter: { findMany: vi.fn(), create: vi.fn() },
  gm_guild_verification_check: { create: vi.fn(), update: vi.fn() },
  gm_guild_verify_msg: { findFirst: vi.fn(), delete: vi.fn() },
  gm_server_vote: { count: vi.fn() },
  gm_status: { findFirst: vi.fn() },
  gm_server_status: { findMany: vi.fn() },
  gm_guild: { findMany: vi.fn() },
  gm_server_sync_roles: { findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
  gm_server_sync_team_roles: {
    findMany: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  gm_server_pseudo: { findMany: vi.fn(), create: vi.fn() },
  gm_users_notifications: { findMany: vi.fn() },
  gm_users_data_request: { findMany: vi.fn(), findFirst: vi.fn() },
  gm_server_report_bugs: { findMany: vi.fn() },
}
vi.mock('@gmod/infra-prisma', () => ({ default: prismaMock }))

const modelMocks = {
  processCreateNewServer: vi.fn(),
  processDeleteAutoRoles: vi.fn(),
  processDeleteGmodPurchase: vi.fn(),
  processDeleteUserGmodPurchase: vi.fn(),
  processDeleteGmodToDiscordFilter: vi.fn(),
  processDeleteServerLogsTrigger: vi.fn(),
  processDeleteServerPseudo: vi.fn(),
  processDeleteUserSession: vi.fn(),
  processGetAdminInformations: vi.fn(),
  processGetAutoRoles: vi.fn(),
  processGetProfile: vi.fn(),
  processGetScreenshotsList: vi.fn(),
  processGetServerLogs: vi.fn(),
  processGetServerPlayers: vi.fn(),
  processGetServerWarns: vi.fn(),
  processGetUserGmodStorePurchases: vi.fn(),
  processGetUserSessions: vi.fn(),
  processLogOut: vi.fn(),
  processPatchUserNotifications: vi.fn(),
  processPostAutoRoles: vi.fn(),
  processPostGmodPurchase: vi.fn(),
  processPostServerLogsTrigger: vi.fn(),
  processPostUserStartVerification: vi.fn(),
  processPutGmodToDiscordFilter: vi.fn(),
  processPutPlayerBypassMaintenance: vi.fn(),
  processPutServerLogsTrigger: vi.fn(),
  processPutServerPseudo: vi.fn(),
}
vi.mock('@gmod/core/models/v3/usersControllerModels.js', () => modelMocks)

class FakeGuild {
  id: string
  constructor(obj: { id: string }) {
    this.id = obj.id
  }
}
vi.mock('@gmod/domain-guild/Guild.js', () => ({ Guild: FakeGuild }))

const bullmqMocks = {
  enqueueDiscordCreateVerificationMessage: vi.fn(),
  enqueueDiscordDeleteVerificationMessage: vi.fn(),
  enqueueDiscordGuildRunVerificationCheck: vi.fn(),
  enqueueDiscordGuildSnapshot: vi.fn(),
  enqueueDiscordServerStatusCreate: vi.fn(),
  enqueueDiscordServerStatusDelete: vi.fn(),
  enqueueDiscordServerStatusRefresh: vi.fn(),
  enqueueDiscordServerLogsChannelCreate: vi.fn(),
  enqueueDiscordServerLogsChannelDelete: vi.fn(),
  enqueueDiscordServerScreenshotChannelCreate: vi.fn(),
  enqueueDiscordServerScreenshotChannelDelete: vi.fn(),
  enqueueDiscordServerVoteChannelCreate: vi.fn(),
  enqueueDiscordServerVoteChannelDelete: vi.fn(),
  enqueueDiscordServerSyncChatCreate: vi.fn(),
  enqueueDiscordServerSyncChatDelete: vi.fn(),
}
vi.mock('@gmod/infra-bullmq/discordQueueAdapters.js', () => bullmqMocks)

const c = await import('../../../src/controllers/v3/usersControllers.js')

function makeRes() {
  const res: any = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  res.send = vi.fn().mockReturnValue(res)
  res.redirect = vi.fn().mockReturnValue(res)
  return res
}

function resetAllMocks() {
  getUserFromDiscordIDMock.mockReset()
  getServersFromDiscordGuildIDMock.mockReset()
  addUserToGuildMock.mockReset()
  getDiscordUserFromIDMock.mockReset()
  getUserGuildsWithPermsForPanelMock.mockReset()
  getUserFromTokenMock.mockReset()
  getUserTokenFromCodeMock.mockReset()
  saveUserMock.mockReset()
  saveUserPanelMock.mockReset()
  badArgumentMock.mockReset().mockReturnValue(false)
  todoControllersMock.mockReset()
  getUserDataGRPDMock.mockReset()
  redisMock.del.mockReset()
  for (const table of Object.values(prismaMock)) {
    for (const fn of Object.values(table as Record<string, any>)) {
      ;(fn as ReturnType<typeof vi.fn>).mockReset()
    }
  }
  for (const fn of Object.values(modelMocks)) fn.mockReset()
  for (const fn of Object.values(bullmqMocks)) fn.mockReset()
}

describe('usersControllers', () => {
  beforeEach(() => {
    resetAllMocks()
  })

  it('getProfile delegates to processGetProfile', async () => {
    modelMocks.processGetProfile.mockResolvedValueOnce({ status: 200, body: { id: 1 } })
    const res = makeRes()
    await c.getProfile({ query: { steamID64: '765', discordID: undefined } } as any, res)
    expect(modelMocks.processGetProfile).toHaveBeenCalledWith('765', undefined)
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('getUserSessions delegates to processGetUserSessions', async () => {
    modelMocks.processGetUserSessions.mockResolvedValueOnce({ status: 200, body: [] })
    await c.getUserSessions({ params: { discordID: 'd1' } } as any, makeRes())
    expect(modelMocks.processGetUserSessions).toHaveBeenCalledWith('d1')
  })

  it('deleteUserSession delegates to processDeleteUserSession', async () => {
    modelMocks.processDeleteUserSession.mockResolvedValueOnce({ status: 200, body: {} })
    await c.deleteUserSession({ params: { discordID: 'd1', sessionID: 's1' } } as any, makeRes())
    expect(modelMocks.processDeleteUserSession).toHaveBeenCalledWith('d1', 's1')
  })

  it('logOut delegates to processLogOut using the panel user/token', async () => {
    modelMocks.processLogOut.mockResolvedValueOnce({ status: 200, body: {} })
    const req = { panelUser: { discordID: 'd1', panelToken: { token: 'tok1' } } } as any
    await c.logOut(req, makeRes())
    expect(modelMocks.processLogOut).toHaveBeenCalledWith('d1', 'tok1')
  })

  describe('findCurrentUser', () => {
    it('sends the found user', async () => {
      getDiscordUserFromIDMock.mockResolvedValueOnce({ id: 'd1' })
      const res = makeRes()
      await c.findCurrentUser({ params: { discordID: 'd1' } } as any, res)
      expect(res.send).toHaveBeenCalledWith({ id: 'd1' })
    })

    it('sends an empty object when not found', async () => {
      getDiscordUserFromIDMock.mockResolvedValueOnce(null)
      const res = makeRes()
      await c.findCurrentUser({ params: { discordID: 'd1' } } as any, res)
      expect(res.send).toHaveBeenCalledWith({})
    })
  })

  describe('oauthLogin', () => {
    function makeReq(overrides: Record<string, any> = {}) {
      return {
        query: {},
        protocol: 'https',
        headers: { host: 'api.example' },
        originalUrl: '/oauth/callback',
        connection: {},
        ...overrides,
      } as any
    }

    it('redirects to the Discord OAuth panel when no code is given', async () => {
      const res = makeRes()
      await c.oauthLogin(makeReq({ query: {} }), res)
      expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('discord.com/oauth'))
    })

    it('includes a redirect state param when redirect is given but code is not', async () => {
      const res = makeRes()
      await c.oauthLogin(makeReq({ query: { redirect: '/dashboard' } }), res)
      expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('&state=redirect:/dashboard'))
    })

    it('defaults codeString to "" for a non-string (e.g. array-valued) code param', async () => {
      getUserTokenFromCodeMock.mockResolvedValueOnce(null)
      const res = makeRes()
      await c.oauthLogin(makeReq({ query: { code: ['abc'] } }), res)
      expect(getUserTokenFromCodeMock).toHaveBeenCalledWith('', expect.any(String))
    })

    it('responds 401 when the token exchange fails', async () => {
      getUserTokenFromCodeMock.mockResolvedValueOnce(null)
      const res = makeRes()
      await c.oauthLogin(makeReq({ query: { code: 'code1' } }), res)
      expect(res.status).toHaveBeenCalledWith(401)
    })

    it('responds 401 when the discord user cannot be resolved', async () => {
      getUserTokenFromCodeMock.mockResolvedValueOnce({
        token_type: 'Bearer',
        access_token: 'at1',
        expires_in: 3600,
      })
      getUserFromTokenMock.mockResolvedValueOnce(null)
      const res = makeRes()
      await c.oauthLogin(makeReq({ query: { code: 'code1' } }), res)
      expect(res.status).toHaveBeenCalledWith(401)
    })

    it('responds 404 when a guildID state is given but the guild snapshot is not found', async () => {
      getUserTokenFromCodeMock.mockResolvedValueOnce({
        token_type: 'Bearer',
        access_token: 'at1',
        expires_in: 3600,
      })
      getUserFromTokenMock.mockResolvedValueOnce({ id: 'd1', username: 'Bob' })
      bullmqMocks.enqueueDiscordGuildSnapshot.mockResolvedValueOnce(null)
      const res = makeRes()

      await c.oauthLogin(makeReq({ query: { code: 'code1', state: 'guildID=123456' } }), res)

      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('skips joining the support guild when the linked guild disables it', async () => {
      getUserTokenFromCodeMock.mockResolvedValueOnce({
        token_type: 'Bearer',
        access_token: 'at1',
        expires_in: 3600,
      })
      getUserFromTokenMock.mockResolvedValueOnce({ id: 'd1', username: 'Bob' })
      bullmqMocks.enqueueDiscordGuildSnapshot.mockResolvedValueOnce({ id: 'g1' })
      const getSettingMock = vi.fn().mockResolvedValueOnce(true)
      const OriginalGuild = (await import('@gmod/domain-guild/Guild.js')).Guild
      // @ts-expect-error augmenting the fake for this one test
      OriginalGuild.prototype.getSetting = getSettingMock
      saveUserPanelMock.mockResolvedValueOnce('panel-token')
      saveUserMock.mockResolvedValueOnce(true)

      await c.oauthLogin(makeReq({ query: { code: 'code1', state: 'guildID=123456' } }), makeRes())

      expect(addUserToGuildMock).not.toHaveBeenCalled()
    })

    it('joins the main guild, saves the user, and redirects on success', async () => {
      getUserTokenFromCodeMock.mockResolvedValueOnce({
        token_type: 'Bearer',
        access_token: 'at1',
        expires_in: 3600,
      })
      getUserFromTokenMock.mockResolvedValueOnce({ id: 'd1', username: 'Bob' })
      addUserToGuildMock.mockResolvedValueOnce(true)
      saveUserPanelMock.mockResolvedValueOnce('panel-token')
      saveUserMock.mockResolvedValueOnce(true)
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const res = makeRes()

      await c.oauthLogin(
        makeReq({
          query: { code: 'code1', state: 'redirect:/dashboard' },
          headers: { host: 'api.example', 'x-forwarded-for': '1.2.3.4', 'cf-ipcountry': 'FR' },
          useragent: { os: 'Linux', browser: 'Firefox' },
        }),
        res,
      )

      await vi.waitFor(() => expect(addUserToGuildMock).toHaveBeenCalled())
      expect(logSpy).toHaveBeenCalledWith('User added to guild')
      expect(saveUserPanelMock).toHaveBeenCalledWith(
        'd1',
        expect.anything(),
        expect.objectContaining({ os: 'Linux', browser: 'Firefox', ip: '1.2.3.4', country: 'FR' }),
      )
      expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('&redirect=/dashboard'))
    })

    it('logs and swallows a failure joining the guild', async () => {
      getUserTokenFromCodeMock.mockResolvedValueOnce({
        token_type: 'Bearer',
        access_token: 'at1',
        expires_in: 3600,
      })
      getUserFromTokenMock.mockResolvedValueOnce({ id: 'd1', username: 'Bob' })
      addUserToGuildMock.mockRejectedValueOnce(new Error('discord down'))
      saveUserPanelMock.mockResolvedValueOnce('panel-token')
      saveUserMock.mockResolvedValueOnce(true)
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await c.oauthLogin(makeReq({ query: { code: 'code1' } }), makeRes())

      await vi.waitFor(() => expect(errorSpy).toHaveBeenCalled())
    })

    it('defaults os/browser/country when unavailable, uses connection.remoteAddress as a fallback IP', async () => {
      getUserTokenFromCodeMock.mockResolvedValueOnce({
        token_type: 'Bearer',
        access_token: 'at1',
        expires_in: 3600,
      })
      getUserFromTokenMock.mockResolvedValueOnce({ id: 'd1', username: 'Bob' })
      addUserToGuildMock.mockResolvedValueOnce(true)
      saveUserPanelMock.mockResolvedValueOnce('panel-token')
      saveUserMock.mockResolvedValueOnce(true)

      await c.oauthLogin(
        makeReq({ query: { code: 'code1' }, connection: { remoteAddress: '9.9.9.9' } }),
        makeRes(),
      )

      expect(saveUserPanelMock).toHaveBeenCalledWith(
        'd1',
        expect.anything(),
        expect.objectContaining({ os: 'Unknown', browser: 'Unknown', ip: '9.9.9.9', country: 'XX' }),
      )
    })

    it('falls back to the runtime-derived redirect URI when oauthPanel has no redirect_uri param', async () => {
      const { ConfigDiscord } = await import('@gmod/config')
      const original = (ConfigDiscord as any).oauthPanel
      ;(ConfigDiscord as any).oauthPanel = 'https://discord.com/oauth'
      getUserTokenFromCodeMock.mockResolvedValueOnce({
        token_type: 'Bearer',
        access_token: 'at1',
        expires_in: 3600,
      })
      getUserFromTokenMock.mockResolvedValueOnce({ id: 'd1', username: 'Bob' })
      addUserToGuildMock.mockResolvedValueOnce(true)
      saveUserPanelMock.mockResolvedValueOnce('panel-token')
      saveUserMock.mockResolvedValueOnce(true)

      try {
        await c.oauthLogin(makeReq({ query: { code: 'code1' } }), makeRes())
        expect(getUserTokenFromCodeMock).toHaveBeenCalledWith('code1', 'https://api.example/oauth/callback')
      } finally {
        ;(ConfigDiscord as any).oauthPanel = original
      }
    })

    it('falls back to the runtime-derived redirect URI when oauthPanel is a malformed URL', async () => {
      const { ConfigDiscord } = await import('@gmod/config')
      const original = (ConfigDiscord as any).oauthPanel
      ;(ConfigDiscord as any).oauthPanel = 'not a valid url'
      getUserTokenFromCodeMock.mockResolvedValueOnce({
        token_type: 'Bearer',
        access_token: 'at1',
        expires_in: 3600,
      })
      getUserFromTokenMock.mockResolvedValueOnce({ id: 'd1', username: 'Bob' })
      addUserToGuildMock.mockResolvedValueOnce(true)
      saveUserPanelMock.mockResolvedValueOnce('panel-token')
      saveUserMock.mockResolvedValueOnce(true)

      try {
        await c.oauthLogin(makeReq({ query: { code: 'code1' } }), makeRes())
        expect(getUserTokenFromCodeMock).toHaveBeenCalledWith('code1', 'https://api.example/oauth/callback')
      } finally {
        ;(ConfigDiscord as any).oauthPanel = original
      }
    })
  })

  it('getUserGuildsOwnOrAdmins delegates to getUserGuildsWithPermsForPanel', async () => {
    getUserGuildsWithPermsForPanelMock.mockResolvedValueOnce([{ id: 'g1' }])
    const res = makeRes()
    await c.getUserGuildsOwnOrAdmins({ panelUser: { id: 'u1' } } as any, res)
    expect(res.send).toHaveBeenCalledWith([{ id: 'g1' }])
  })

  it('findGuild sends the trimmed guild fields', async () => {
    const res = makeRes()
    await c.findGuild({ dscGuild: { id: 'g1', name: 'N', icon: 'i', ownerID: 'o1', extra: 'x' } } as any, res)
    expect(res.send).toHaveBeenCalledWith({ id: 'g1', name: 'N', icon: 'i', ownerID: 'o1' })
  })

  it('findGuildChannels sends dscGuild.channels', async () => {
    const res = makeRes()
    await c.findGuildChannels({ dscGuild: { channels: ['ch1'] } } as any, res, vi.fn())
    expect(res.send).toHaveBeenCalledWith(['ch1'])
  })

  it('getGuildEmojis sends dscGuild.emojis', async () => {
    const res = makeRes()
    await c.getGuildEmojis({ dscGuild: { emojis: ['e1'] } } as any, res)
    expect(res.send).toHaveBeenCalledWith(['e1'])
  })

  it('getGuildRoles filters out managed/@everyone roles and sorts by position', async () => {
    const res = makeRes()
    await c.getGuildRoles(
      {
        dscGuild: {
          roles: [
            { id: '1', name: 'B', managed: false, position: 2 },
            { id: '2', name: '@everyone', managed: false, position: 0 },
            { id: '3', name: 'Managed', managed: true, position: 1 },
            { id: '4', name: 'A', managed: false, position: 1 },
          ],
        },
      } as any,
      res,
    )
    expect(res.send).toHaveBeenCalledWith([
      { id: '4', name: 'A', managed: false, position: 1 },
      { id: '1', name: 'B', managed: false, position: 2 },
    ])
  })

  it('findGuildServers delegates to getServersFromDiscordGuildID', async () => {
    getServersFromDiscordGuildIDMock.mockResolvedValueOnce([{ id: 's1' }])
    const res = makeRes()
    await c.findGuildServers({ dscGuild: { id: 'g1' } } as any, res)
    expect(getServersFromDiscordGuildIDMock).toHaveBeenCalledWith('g1')
  })

  it('findGuildServer sends req.server', async () => {
    const res = makeRes()
    await c.findGuildServer({ server: { id: 's1' } } as any, res)
    expect(res.json).toHaveBeenCalledWith({ id: 's1' })
  })

  describe('findServerStatus', () => {
    it('sends the found status', async () => {
      const server = { getStatusChannelAndMessage: vi.fn().mockResolvedValueOnce({ id: 1 }) }
      const res = makeRes()
      await c.findServerStatus({ server } as any, res)
      expect(res.send).toHaveBeenCalledWith({ id: 1 })
    })

    it('sends an empty object when not found', async () => {
      const server = { getStatusChannelAndMessage: vi.fn().mockResolvedValueOnce(null) }
      const res = makeRes()
      await c.findServerStatus({ server } as any, res)
      expect(res.send).toHaveBeenCalledWith({})
    })
  })

  it('createNewServer delegates to processCreateNewServer', async () => {
    modelMocks.processCreateNewServer.mockResolvedValueOnce({ status: 200, body: { id: 's1' } })
    const res = makeRes()
    await c.createNewServer({ guild: { id: 'g1' } } as any, res)
    expect(modelMocks.processCreateNewServer).toHaveBeenCalledWith({ id: 'g1' })
  })

  it('getGuildLinks sends the guild links', async () => {
    const guild = { getLinks: vi.fn().mockResolvedValueOnce([{ id: 1 }]) }
    const res = makeRes()
    await c.getGuildLinks({ guild } as any, res)
    expect(res.send).toHaveBeenCalledWith([{ id: 1 }])
  })

  describe('postGuildLinks', () => {
    it('returns 403 when the link limit is reached on a non-premium guild', async () => {
      const guild = {
        isPremium: vi.fn().mockResolvedValueOnce(false),
        getLinks: vi.fn().mockResolvedValueOnce([{ id: 1 }, { id: 2 }]),
      }
      const res = makeRes()
      await c.postGuildLinks({ guild } as any, res)
      expect(res.status).toHaveBeenCalledWith(403)
    })

    it('creates a new link when under the limit', async () => {
      const guild = {
        isPremium: vi.fn().mockResolvedValueOnce(false),
        getLinks: vi.fn().mockResolvedValueOnce([{ id: 1 }]),
        createNewLink: vi.fn().mockResolvedValueOnce({ id: 2 }),
      }
      const res = makeRes()
      await c.postGuildLinks({ guild } as any, res)
      expect(res.send).toHaveBeenCalledWith({ id: 2 })
    })

    it('creates a new link past the limit for a premium guild', async () => {
      const guild = {
        isPremium: vi.fn().mockResolvedValueOnce(true),
        getLinks: vi.fn().mockResolvedValueOnce([{ id: 1 }, { id: 2 }]),
        createNewLink: vi.fn().mockResolvedValueOnce({ id: 3 }),
      }
      const res = makeRes()
      await c.postGuildLinks({ guild } as any, res)
      expect(res.send).toHaveBeenCalledWith({ id: 3 })
    })
  })

  describe('putGuildLinks', () => {
    it('returns 404 when the link is not found', async () => {
      const guild = { getLink: vi.fn().mockResolvedValueOnce(null), id: 'g1' }
      const res = makeRes()
      await c.putGuildLinks({ params: { linkID: '1' }, guild, body: {} } as any, res)
      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('updates only the given fields', async () => {
      const guild = { getLink: vi.fn().mockResolvedValueOnce({ id: 1, url: 'old', alias: 'a', active: true }), id: 'g1' }
      prismaMock.gm_server_links.update.mockResolvedValueOnce({ id: 1 })
      const res = makeRes()

      await c.putGuildLinks({ params: { linkID: '1' }, guild, body: { url: 'new', alias: undefined, active: undefined } } as any, res)

      expect(prismaMock.gm_server_links.update).toHaveBeenCalledWith({
        where: { id: 1, guild: 'g1' },
        data: { url: 'new', alias: 'a', active: true },
      })
    })

    it('keeps url when omitted, overwrites alias/active when given', async () => {
      const guild = { getLink: vi.fn().mockResolvedValueOnce({ id: 1, url: 'old', alias: 'a', active: true }), id: 'g1' }
      prismaMock.gm_server_links.update.mockResolvedValueOnce({ id: 1 })
      const res = makeRes()

      await c.putGuildLinks(
        { params: { linkID: '1' }, guild, body: { url: undefined, alias: 'b', active: false } } as any,
        res,
      )

      expect(prismaMock.gm_server_links.update).toHaveBeenCalledWith({
        where: { id: 1, guild: 'g1' },
        data: { url: 'old', alias: 'b', active: false },
      })
    })
  })

  describe('deleteGuildLinks', () => {
    it('returns 404 when the link is not found', async () => {
      const guild = { getLink: vi.fn().mockResolvedValueOnce(null) }
      const res = makeRes()
      await c.deleteGuildLinks({ params: { linkID: '1' }, guild } as any, res)
      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('deletes and returns the link', async () => {
      const link = { id: 1 }
      const guild = { getLink: vi.fn().mockResolvedValueOnce(link), deleteLink: vi.fn().mockResolvedValueOnce(undefined) }
      const res = makeRes()
      await c.deleteGuildLinks({ params: { linkID: '1' }, guild } as any, res)
      expect(guild.deleteLink).toHaveBeenCalledWith('1')
      expect(res.send).toHaveBeenCalledWith(link)
    })
  })

  it('putGuildServer updates only the given fields', async () => {
    prismaMock.gm_server.update.mockResolvedValueOnce({ id: 's1' })
    const server = { id: 's1', name: 'old', image: 'img', ip: '1.1.1.1', port: '27015', isPublic: true, description: 'd' }
    const res = makeRes()

    await c.putGuildServer({ server, body: { name: 'new' } } as any, res)

    expect(prismaMock.gm_server.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { name: 'new', image: 'img', ip: '1.1.1.1', port: '27015', isPublic: true, description: 'd' },
    })
  })

  it('putGuildServer overwrites every field when all are given', async () => {
    prismaMock.gm_server.update.mockResolvedValueOnce({ id: 's1' })
    const server = { id: 's1', name: 'old', image: 'img', ip: '1.1.1.1', port: '27015', isPublic: true, description: 'd' }
    const res = makeRes()

    await c.putGuildServer(
      {
        server,
        body: { image: 'newimg', ip: '2.2.2.2', port: '27016', isPublic: false, description: 'newdesc' },
      } as any,
      res,
    )

    expect(prismaMock.gm_server.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { name: 'old', image: 'newimg', ip: '2.2.2.2', port: '27016', isPublic: false, description: 'newdesc' },
    })
  })

  it('deleteGuildServer deletes and returns the server', async () => {
    const server = { delete: vi.fn().mockResolvedValueOnce(undefined) }
    const res = makeRes()
    await c.deleteGuildServer({ server } as any, res)
    expect(server.delete).toHaveBeenCalled()
    expect(res.send).toHaveBeenCalledWith(server)
  })

  describe('getGuildAdmins', () => {
    it('sends the admins list', async () => {
      const guild = { getAdmins: vi.fn().mockResolvedValueOnce([{ id: 'a1' }]) }
      const res = makeRes()
      await c.getGuildAdmins({ guild } as any, res)
      expect(res.send).toHaveBeenCalledWith([{ id: 'a1' }])
    })

    it('falls back to [] when getAdmins resolves falsy', async () => {
      const guild = { getAdmins: vi.fn().mockResolvedValueOnce(null) }
      const res = makeRes()
      await c.getGuildAdmins({ guild } as any, res)
      expect(res.send).toHaveBeenCalledWith([])
    })
  })

  it('postGuildServerToken regenerates and returns the server', async () => {
    const server = { regenerateToken: vi.fn().mockResolvedValueOnce(undefined) }
    const res = makeRes()
    await c.postGuildServerToken({ server } as any, res)
    expect(server.regenerateToken).toHaveBeenCalled()
    expect(res.send).toHaveBeenCalledWith(server)
  })

  it('getGuildVerificationsRoles sends the verification roles', async () => {
    const guild = { getVerificationRoles: vi.fn().mockResolvedValueOnce([{ id: 1 }]) }
    const res = makeRes()
    await c.getGuildVerificationsRoles({ guild } as any, res)
    expect(res.send).toHaveBeenCalledWith([{ id: 1 }])
  })

  describe('putGuildVerificationsRoles', () => {
    it('returns 404 when not found', async () => {
      const guild = { getVerificationRole: vi.fn().mockResolvedValueOnce(null) }
      const res = makeRes()
      await c.putGuildVerificationsRoles({ params: { roleID: 'r1' }, guild, body: {} } as any, res)
      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('updates only the given fields', async () => {
      const guild = {
        getVerificationRole: vi.fn().mockResolvedValueOnce({ id: 1, isGiveRole: true, enabled: true }),
        id: 'g1',
      }
      prismaMock.gm_guild_verify_role.update.mockResolvedValueOnce({ id: 1 })
      const res = makeRes()

      await c.putGuildVerificationsRoles(
        { params: { roleID: 'r1' }, guild, body: { isGiveRole: false, enabled: undefined } } as any,
        res,
      )

      expect(prismaMock.gm_guild_verify_role.update).toHaveBeenCalledWith({
        where: { id: 1, guildID: 'g1' },
        data: { isGiveRole: false, enabled: true },
      })
    })

    it('keeps isGiveRole when omitted, overwrites enabled when given', async () => {
      const guild = {
        getVerificationRole: vi.fn().mockResolvedValueOnce({ id: 1, isGiveRole: true, enabled: true }),
        id: 'g1',
      }
      prismaMock.gm_guild_verify_role.update.mockResolvedValueOnce({ id: 1 })
      const res = makeRes()

      await c.putGuildVerificationsRoles(
        { params: { roleID: 'r1' }, guild, body: { isGiveRole: undefined, enabled: false } } as any,
        res,
      )

      expect(prismaMock.gm_guild_verify_role.update).toHaveBeenCalledWith({
        where: { id: 1, guildID: 'g1' },
        data: { isGiveRole: true, enabled: false },
      })
    })
  })

  describe('deleteGuildVerificationsRoles', () => {
    it('returns 404 when not found', async () => {
      const guild = { getVerificationRole: vi.fn().mockResolvedValueOnce(null) }
      const res = makeRes()
      await c.deleteGuildVerificationsRoles({ params: { roleID: 'r1' }, guild } as any, res)
      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('deletes and returns the role', async () => {
      const role = { id: 1 }
      const guild = { getVerificationRole: vi.fn().mockResolvedValueOnce(role) }
      const res = makeRes()
      await c.deleteGuildVerificationsRoles({ params: { roleID: 'r1' }, guild } as any, res)
      expect(prismaMock.gm_guild_verify_role.delete).toHaveBeenCalledWith({ where: { id: 1 } })
      expect(res.send).toHaveBeenCalledWith(role)
    })
  })

  describe('createGuildVerificationsRoles', () => {
    function makeReq(overrides: Record<string, any> = {}) {
      return {
        params: { roleID: 'r1' },
        guild: {
          isPremium: vi.fn().mockResolvedValue(false),
          getVerificationRoles: vi.fn().mockResolvedValue([]),
          createVerificationRole: vi.fn().mockResolvedValue({ id: 1 }),
        },
        dscGuild: { roles: [{ id: 'r1' }] },
        ...overrides,
      } as any
    }

    it('returns 403 when the role limit is reached on a non-premium guild', async () => {
      const req = makeReq({
        guild: {
          isPremium: vi.fn().mockResolvedValueOnce(false),
          getVerificationRoles: vi.fn().mockResolvedValueOnce([{ roleID: 'a' }, { roleID: 'b' }]),
        },
      })
      const res = makeRes()
      await c.createGuildVerificationsRoles(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
    })

    it('returns 409 when the role already exists', async () => {
      const req = makeReq({
        guild: {
          isPremium: vi.fn().mockResolvedValueOnce(false),
          getVerificationRoles: vi.fn().mockResolvedValueOnce([{ roleID: 'r1' }]),
        },
      })
      const res = makeRes()
      await c.createGuildVerificationsRoles(req, res)
      expect(res.status).toHaveBeenCalledWith(409)
    })

    it('returns 404 when the role does not exist on the discord guild', async () => {
      const req = makeReq({ dscGuild: { roles: [{ id: 'other' }] } })
      const res = makeRes()
      await c.createGuildVerificationsRoles(req, res)
      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('creates the verification role on success', async () => {
      const req = makeReq()
      const res = makeRes()
      await c.createGuildVerificationsRoles(req, res)
      expect(req.guild.createVerificationRole).toHaveBeenCalledWith('r1')
      expect(res.send).toHaveBeenCalledWith({ id: 1 })
    })
  })

  describe('status buttons', () => {
    it('deleteServerStatus sends the result, falling back to {}', async () => {
      bullmqMocks.enqueueDiscordServerStatusDelete.mockResolvedValueOnce(null)
      const res = makeRes()
      await c.deleteServerStatus({ server: { id: 's1' } } as any, res)
      expect(res.send).toHaveBeenCalledWith({})
    })

    it('postServerStatus returns 400 on missing channelID', async () => {
      badArgumentMock.mockReturnValueOnce(true)
      const res = makeRes()
      await c.postServerStatus({ server: { id: 's1' }, body: {} } as any, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('postServerStatus creates the status channel', async () => {
      bullmqMocks.enqueueDiscordServerStatusCreate.mockResolvedValueOnce({ id: 1 })
      const res = makeRes()
      await c.postServerStatus({ server: { id: 's1' }, body: { channelID: 'ch1' } } as any, res)
      expect(res.send).toHaveBeenCalledWith({ id: 1 })
    })

    it('getServerStatusButtons sends the buttons', async () => {
      const server = { findStatusButtons: vi.fn().mockResolvedValueOnce([{ id: 1 }]) }
      const res = makeRes()
      await c.getServerStatusButtons({ server } as any, res)
      expect(res.send).toHaveBeenCalledWith([{ id: 1 }])
    })

    describe('putServerStatusButtons', () => {
      it('returns 404 when the button is not found', async () => {
        const server = { id: 's1', findStatusButton: vi.fn().mockResolvedValueOnce(null) }
        const res = makeRes()
        await c.putServerStatusButtons({ params: { buttonID: '1' }, server, body: {} } as any, res)
        expect(res.status).toHaveBeenCalledWith(404)
      })

      it('updates the button and refreshes status when enabled', async () => {
        const server = { id: 's1', findStatusButton: vi.fn().mockResolvedValueOnce({ id: 1, name: 'n', emoji: 'e', url: 'u', enable: false }) }
        prismaMock.gm_status_button.update.mockResolvedValueOnce({ id: 1, enable: true })
        const res = makeRes()

        await c.putServerStatusButtons({ params: { buttonID: '1' }, server, body: { enable: true } } as any, res)

        expect(bullmqMocks.enqueueDiscordServerStatusRefresh).toHaveBeenCalledWith('s1')
        expect(res.send).toHaveBeenCalledWith({ id: 1, enable: true })
      })

      it('overwrites name/emoji/url when given, keeping the existing enable value', async () => {
        const server = { id: 's1', findStatusButton: vi.fn().mockResolvedValueOnce({ id: 1, name: 'old', emoji: 'oe', url: 'ou', enable: true }) }
        prismaMock.gm_status_button.update.mockResolvedValueOnce({ id: 1, enable: true })
        const res = makeRes()

        await c.putServerStatusButtons(
          { params: { buttonID: '1' }, server, body: { name: 'new', emoji: 'ne', url: 'nu' } } as any,
          res,
        )

        expect(prismaMock.gm_status_button.update).toHaveBeenCalledWith({
          where: { id: 1, server: 's1' },
          data: { name: 'new', emoji: 'ne', url: 'nu', enable: true },
        })
      })

      it('does not refresh status when the updated button is disabled', async () => {
        const server = { id: 's1', findStatusButton: vi.fn().mockResolvedValueOnce({ id: 1, name: 'n', emoji: 'e', url: 'u', enable: true }) }
        prismaMock.gm_status_button.update.mockResolvedValueOnce({ id: 1, enable: false })
        const res = makeRes()

        await c.putServerStatusButtons({ params: { buttonID: '1' }, server, body: { enable: false } } as any, res)

        expect(bullmqMocks.enqueueDiscordServerStatusRefresh).not.toHaveBeenCalled()
      })
    })

    it('createServerStatusButtons creates and sends the button', async () => {
      const server = { createStatusButton: vi.fn().mockResolvedValueOnce({ id: 1 }) }
      const res = makeRes()
      await c.createServerStatusButtons({ server } as any, res)
      expect(res.send).toHaveBeenCalledWith({ id: 1 })
    })

    describe('deleteServerStatusButtons', () => {
      it('returns 404 when not found', async () => {
        const server = { findStatusButton: vi.fn().mockResolvedValueOnce(null) }
        const res = makeRes()
        await c.deleteServerStatusButtons({ params: { buttonID: '1' }, server } as any, res)
        expect(res.status).toHaveBeenCalledWith(404)
      })

      it('destroys the button and refreshes status when it was enabled', async () => {
        const server = {
          id: 's1',
          findStatusButton: vi.fn().mockResolvedValueOnce({ id: 1, enable: true }),
          destroyStatusButton: vi.fn().mockResolvedValueOnce(undefined),
        }
        const res = makeRes()
        await c.deleteServerStatusButtons({ params: { buttonID: '1' }, server } as any, res)
        expect(server.destroyStatusButton).toHaveBeenCalledWith(1)
        expect(bullmqMocks.enqueueDiscordServerStatusRefresh).toHaveBeenCalledWith('s1')
      })

      it('does not refresh status when the destroyed button was disabled', async () => {
        const server = {
          id: 's1',
          findStatusButton: vi.fn().mockResolvedValueOnce({ id: 1, enable: false }),
          destroyStatusButton: vi.fn().mockResolvedValueOnce(undefined),
        }
        const res = makeRes()
        await c.deleteServerStatusButtons({ params: { buttonID: '1' }, server } as any, res)
        expect(bullmqMocks.enqueueDiscordServerStatusRefresh).not.toHaveBeenCalled()
      })
    })
  })

  describe('screenshots / sync chat / gmod-to-discord filter channels', () => {
    it('findServerScreenshots falls back to {}', async () => {
      const server = { getScreenshotsChannel: vi.fn().mockResolvedValueOnce(null) }
      const res = makeRes()
      await c.findServerScreenshots({ server } as any, res)
      expect(res.send).toHaveBeenCalledWith({})
    })

    it('postServerScreenshots falls back to {}', async () => {
      bullmqMocks.enqueueDiscordServerScreenshotChannelCreate.mockResolvedValueOnce(null)
      const res = makeRes()
      await c.postServerScreenshots({ server: { id: 's1' }, body: { channelID: 'ch1' } } as any, res)
      expect(res.send).toHaveBeenCalledWith({})
    })

    it('deleteServerScreenshots falls back to {}', async () => {
      bullmqMocks.enqueueDiscordServerScreenshotChannelDelete.mockResolvedValueOnce(null)
      const res = makeRes()
      await c.deleteServerScreenshots({ server: { id: 's1' } } as any, res)
      expect(res.send).toHaveBeenCalledWith({})
    })

    it('findServerSyncChat falls back to {}', async () => {
      const server = { getSyncChat: vi.fn().mockResolvedValueOnce(null) }
      const res = makeRes()
      await c.findServerSyncChat({ server } as any, res)
      expect(res.send).toHaveBeenCalledWith({})
    })

    it('postServerSyncChat falls back to {}', async () => {
      bullmqMocks.enqueueDiscordServerSyncChatCreate.mockResolvedValueOnce(null)
      const res = makeRes()
      await c.postServerSyncChat({ server: { id: 's1' }, body: {} } as any, res)
      expect(res.send).toHaveBeenCalledWith({})
    })

    it('deleteServerSyncChat falls back to {}', async () => {
      bullmqMocks.enqueueDiscordServerSyncChatDelete.mockResolvedValueOnce(null)
      const res = makeRes()
      await c.deleteServerSyncChat({ server: { id: 's1' } } as any, res)
      expect(res.send).toHaveBeenCalledWith({})
    })

    it('getGmodToDiscordFilter sends the found filters', async () => {
      prismaMock.gm_server_sync_chat_filter.findMany.mockResolvedValueOnce([{ id: 1 }])
      const res = makeRes()
      await c.getGmodToDiscordFilter({ server: { id: 's1' } } as any, res)
      expect(res.send).toHaveBeenCalledWith([{ id: 1 }])
    })

    it('postGmodToDiscordFilter creates a filter and clears the cache', async () => {
      prismaMock.gm_server_sync_chat_filter.create.mockResolvedValueOnce({ id: 1 })
      const res = makeRes()
      await c.postGmodToDiscordFilter({ server: { id: 's1' } } as any, res)
      expect(redisMock.del).toHaveBeenCalledWith('server:s1:gmodToDiscordFilter')
      expect(res.send).toHaveBeenCalledWith({ id: 1 })
    })

    it('putGmodToDiscordFilter delegates to processPutGmodToDiscordFilter', async () => {
      modelMocks.processPutGmodToDiscordFilter.mockResolvedValueOnce({ status: 200, body: {} })
      const res = makeRes()
      await c.putGmodToDiscordFilter({ params: { filterID: '1' }, server: { id: 's1' }, body: {} } as any, res)
      expect(modelMocks.processPutGmodToDiscordFilter).toHaveBeenCalledWith({ id: 's1' }, '1', {})
    })

    it('deleteGmodToDiscordFilter delegates to processDeleteGmodToDiscordFilter', async () => {
      modelMocks.processDeleteGmodToDiscordFilter.mockResolvedValueOnce({ status: 200, body: {} })
      const res = makeRes()
      await c.deleteGmodToDiscordFilter({ params: { filterID: '1' }, server: { id: 's1' } } as any, res)
      expect(modelMocks.processDeleteGmodToDiscordFilter).toHaveBeenCalledWith({ id: 's1' }, '1')
    })
  })

  it('getServerPlayers delegates with the parsed query', async () => {
    modelMocks.processGetServerPlayers.mockResolvedValueOnce({ status: 200, body: {} })
    const res = makeRes()
    await c.getServerPlayers({ server: { id: 's1' }, query: { limit: '10' } } as any, res)
    expect(modelMocks.processGetServerPlayers).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ limit: '10' }),
    )
  })

  it('putPlayerBypassMaintenance delegates to processPutPlayerBypassMaintenance', async () => {
    modelMocks.processPutPlayerBypassMaintenance.mockResolvedValueOnce({ status: 200, body: {} })
    const res = makeRes()
    await c.putPlayerBypassMaintenance(
      { server: { id: 's1' }, params: { playerID: 'p1' }, body: { bypassMaintenance: true } } as any,
      res,
    )
    expect(modelMocks.processPutPlayerBypassMaintenance).toHaveBeenCalledWith({ id: 's1' }, 'p1', true)
  })

  it('postUserStartVerification delegates to processPostUserStartVerification', async () => {
    modelMocks.processPostUserStartVerification.mockResolvedValueOnce({ status: 200, body: {} })
    await c.postUserStartVerification({ params: { discordID: 'd1' } } as any, makeRes())
    expect(modelMocks.processPostUserStartVerification).toHaveBeenCalledWith('d1')
  })

  it('postAutoRoles delegates to processPostAutoRoles', async () => {
    modelMocks.processPostAutoRoles.mockResolvedValueOnce({ status: 200, body: {} })
    await c.postAutoRoles({ params: { guildID: 'g1', roleID: 'r1' } } as any, makeRes())
    expect(modelMocks.processPostAutoRoles).toHaveBeenCalledWith('g1', 'r1')
  })

  it('deleteAutoRoles delegates to processDeleteAutoRoles', async () => {
    modelMocks.processDeleteAutoRoles.mockResolvedValueOnce({ status: 200, body: {} })
    await c.deleteAutoRoles({ params: { guildID: 'g1', roleID: 'r1' } } as any, makeRes())
    expect(modelMocks.processDeleteAutoRoles).toHaveBeenCalledWith('g1', 'r1')
  })

  it('getAutoRoles delegates to processGetAutoRoles', async () => {
    modelMocks.processGetAutoRoles.mockResolvedValueOnce({ status: 200, body: [] })
    await c.getAutoRoles({ params: { guildID: 'g1' } } as any, makeRes())
    expect(modelMocks.processGetAutoRoles).toHaveBeenCalledWith('g1')
  })

  describe('createVerificationMessage', () => {
    function makeReq(overrides: Record<string, any> = {}) {
      return {
        dscGuild: { id: 'g1', channels: [{ id: 'ch1', sendable: true }] },
        body: { channelID: 'ch1' },
        ...overrides,
      } as any
    }

    it('returns 400 on missing channelID', async () => {
      badArgumentMock.mockReturnValueOnce(true)
      const res = makeRes()
      await c.createVerificationMessage(makeReq(), res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('returns 404 when the channel is not found', async () => {
      const res = makeRes()
      await c.createVerificationMessage(makeReq({ dscGuild: { id: 'g1', channels: [] } }), res)
      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('returns 400 when the channel is not sendable', async () => {
      const res = makeRes()
      await c.createVerificationMessage(
        makeReq({ dscGuild: { id: 'g1', channels: [{ id: 'ch1', sendable: false }] } }),
        res,
      )
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('sends the created verification message on success', async () => {
      bullmqMocks.enqueueDiscordCreateVerificationMessage.mockResolvedValueOnce({ id: 'm1' })
      const res = makeRes()
      await c.createVerificationMessage(makeReq(), res)
      expect(res.send).toHaveBeenCalledWith({ id: 'm1' })
    })

    it('returns 400 with the error message when the enqueue call throws', async () => {
      bullmqMocks.enqueueDiscordCreateVerificationMessage.mockRejectedValueOnce(new Error('discord down'))
      const res = makeRes()
      await c.createVerificationMessage(makeReq(), res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.send).toHaveBeenCalledWith({ error: 'discord down' })
    })
  })

  it('getVerificationCheck sends guild.canCheckVerif()', async () => {
    const guild = { canCheckVerif: vi.fn().mockResolvedValueOnce(true) }
    const res = makeRes()
    await c.getVerificationCheck({ guild } as any, res)
    expect(res.send).toHaveBeenCalledWith(true)
  })

  describe('postVerificationCheck', () => {
    it('returns 403 when a check was already done recently', async () => {
      const guild = { canCheckVerif: vi.fn().mockResolvedValueOnce(false) }
      const res = makeRes()
      await c.postVerificationCheck({ guild } as any, res)
      expect(res.status).toHaveBeenCalledWith(403)
    })

    it('runs the verification check and marks it done', async () => {
      const guild = { id: 'g1', canCheckVerif: vi.fn().mockResolvedValueOnce(true) }
      prismaMock.gm_guild_verification_check.create.mockResolvedValueOnce({ id: 1 })
      const res = makeRes()

      await c.postVerificationCheck({ guild } as any, res)
      await vi.waitFor(() => expect(prismaMock.gm_guild_verification_check.update).toHaveBeenCalled())

      expect(res.send).toHaveBeenCalledWith({ success: true })
      expect(bullmqMocks.enqueueDiscordGuildRunVerificationCheck).toHaveBeenCalledWith('g1')
      expect(prismaMock.gm_guild_verification_check.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { done: true },
      })
    })
  })

  describe('getVerificationMessage', () => {
    it('returns 404 when not found', async () => {
      prismaMock.gm_guild_verify_msg.findFirst.mockResolvedValueOnce(null)
      const res = makeRes()
      await c.getVerificationMessage({ dscGuild: { id: 'g1' } } as any, res)
      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('sends the message when found', async () => {
      prismaMock.gm_guild_verify_msg.findFirst.mockResolvedValueOnce({ id: 1 })
      const res = makeRes()
      await c.getVerificationMessage({ dscGuild: { id: 'g1' } } as any, res)
      expect(res.send).toHaveBeenCalledWith({ id: 1 })
    })
  })

  describe('deleteVerificationMessage', () => {
    it('returns 404 when not found', async () => {
      prismaMock.gm_guild_verify_msg.findFirst.mockResolvedValueOnce(null)
      const res = makeRes()
      await c.deleteVerificationMessage({ dscGuild: { id: 'g1' } } as any, res)
      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('deletes and sends the message', async () => {
      prismaMock.gm_guild_verify_msg.findFirst.mockResolvedValueOnce({ id: 1, channelID: 'ch1', messageID: 'm1' })
      const res = makeRes()
      await c.deleteVerificationMessage({ dscGuild: { id: 'g1' } } as any, res)
      expect(bullmqMocks.enqueueDiscordDeleteVerificationMessage).toHaveBeenCalledWith('g1', 'ch1', 'm1')
      expect(prismaMock.gm_guild_verify_msg.delete).toHaveBeenCalledWith({ where: { guildID: 'g1' } })
    })
  })

  describe('getPublicServers', () => {
    it('builds the public server list, attaching recent status and skipping stale status rows', async () => {
      prismaMock.gm_server.findMany.mockResolvedValueOnce([
        { id: 's1', name: 'Server One' },
        { id: 's2', name: 'Server Two' },
      ])
      prismaMock.gm_server_vote.count.mockResolvedValue(3)
      prismaMock.gm_server_status.findMany.mockResolvedValueOnce([
        { id: 's1', updatedAt: new Date() },
        { id: 's2', updatedAt: new Date(Date.now() - 10 * 60 * 1000) },
      ])
      const res = makeRes()

      await c.getPublicServers({} as any, res)

      const sent = res.send.mock.calls[0][0]
      expect(sent).toHaveLength(2)
      expect(sent[0].status).toBeDefined()
      expect(sent[1].status).toBeUndefined()
    })

    it('ignores a recent status row whose id matches no public server', async () => {
      prismaMock.gm_server.findMany.mockResolvedValueOnce([{ id: 's1', name: 'Server One' }])
      prismaMock.gm_server_vote.count.mockResolvedValue(0)
      prismaMock.gm_server_status.findMany.mockResolvedValueOnce([{ id: 's-not-public', updatedAt: new Date() }])
      const res = makeRes()

      await c.getPublicServers({} as any, res)

      const sent = res.send.mock.calls[0][0]
      expect(sent[0].status).toBeUndefined()
    })
  })

  describe('vote channels', () => {
    it('getVoteChannels falls back to {}', async () => {
      const server = { getVoteChannel: vi.fn().mockResolvedValueOnce(null) }
      const res = makeRes()
      await c.getVoteChannels({ server } as any, res)
      expect(res.send).toHaveBeenCalledWith({})
    })

    it('postVoteChannels returns 400 on missing channelID', async () => {
      badArgumentMock.mockReturnValueOnce(true)
      const res = makeRes()
      await c.postVoteChannels({ server: { id: 's1' }, body: {} } as any, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('postVoteChannels falls back to {}', async () => {
      bullmqMocks.enqueueDiscordServerVoteChannelCreate.mockResolvedValueOnce(null)
      const res = makeRes()
      await c.postVoteChannels({ server: { id: 's1' }, body: { channelID: 'ch1' } } as any, res)
      expect(res.send).toHaveBeenCalledWith({})
    })

    it('deleteVoteChannels falls back to {}', async () => {
      bullmqMocks.enqueueDiscordServerVoteChannelDelete.mockResolvedValueOnce(null)
      const res = makeRes()
      await c.deleteVoteChannels({ server: { id: 's1' } } as any, res)
      expect(res.send).toHaveBeenCalledWith({})
    })
  })

  describe('logs channel', () => {
    it('getLogsChannel falls back to {}', async () => {
      const server = { getLogsChannel: vi.fn().mockResolvedValueOnce(null) }
      const res = makeRes()
      await c.getLogsChannel({ server } as any, res)
      expect(res.send).toHaveBeenCalledWith({})
    })

    it('postLogsChannel returns 400 on missing channelID', async () => {
      badArgumentMock.mockReturnValueOnce(true)
      const res = makeRes()
      await c.postLogsChannel({ server: { id: 's1' }, body: {} } as any, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('postLogsChannel falls back to {}', async () => {
      bullmqMocks.enqueueDiscordServerLogsChannelCreate.mockResolvedValueOnce(null)
      const res = makeRes()
      await c.postLogsChannel({ server: { id: 's1' }, body: { channelID: 'ch1' } } as any, res)
      expect(res.send).toHaveBeenCalledWith({})
    })

    it('deleteLogsChannel falls back to {}', async () => {
      bullmqMocks.enqueueDiscordServerLogsChannelDelete.mockResolvedValueOnce(null)
      const res = makeRes()
      await c.deleteLogsChannel({ server: { id: 's1' } } as any, res)
      expect(res.send).toHaveBeenCalledWith({})
    })
  })

  it('getGuildSettings sends guild.getAllSettings()', async () => {
    const guild = { getAllSettings: vi.fn().mockResolvedValueOnce({ a: 1 }) }
    const res = makeRes()
    await c.getGuildSettings({ guild } as any, res)
    expect(res.send).toHaveBeenCalledWith({ a: 1 })
  })

  describe('getGuildSetting', () => {
    it('sends the setting value', async () => {
      const guild = { getSetting: vi.fn().mockResolvedValueOnce('en') }
      const res = makeRes()
      await c.getGuildSetting({ guild, params: { setting: 'ig_language' } } as any, res)
      expect(res.send).toHaveBeenCalledWith({ value: 'en' })
    })

    it('returns 404 when getSetting throws', async () => {
      const guild = { getSetting: vi.fn().mockRejectedValueOnce(new Error('not found')) }
      const res = makeRes()
      await c.getGuildSetting({ guild, params: { setting: 'unknown' } } as any, res)
      expect(res.status).toHaveBeenCalledWith(404)
    })
  })

  describe('putGuildSetting', () => {
    it('returns 400 when value is missing', async () => {
      badArgumentMock.mockReturnValueOnce(true)
      const res = makeRes()
      await c.putGuildSetting({ guild: {}, params: { setting: 'x' }, body: {} } as any, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('sends the update result on success', async () => {
      const guild = { setSetting: vi.fn().mockResolvedValueOnce({ value: 'y' }) }
      const res = makeRes()
      await c.putGuildSetting({ guild, params: { setting: 'x' }, body: { value: 'y' } } as any, res)
      expect(res.send).toHaveBeenCalledWith({ value: 'y' })
    })

    it('returns 404 when setSetting throws', async () => {
      const guild = { setSetting: vi.fn().mockRejectedValueOnce(new Error('bad')) }
      const res = makeRes()
      await c.putGuildSetting({ guild, params: { setting: 'x' }, body: { value: 'y' } } as any, res)
      expect(res.status).toHaveBeenCalledWith(404)
    })
  })

  it('getServerSettings sends server.getAllSettings()', async () => {
    const server = { getAllSettings: vi.fn().mockResolvedValueOnce({ a: 1 }) }
    const res = makeRes()
    await c.getServerSettings({ server } as any, res)
    expect(res.send).toHaveBeenCalledWith({ a: 1 })
  })

  describe('getServerSetting', () => {
    it('sends the setting value', async () => {
      const server = { getSetting: vi.fn().mockResolvedValueOnce(true) }
      const res = makeRes()
      await c.getServerSetting({ server, params: { setting: 'ig_debug' } } as any, res)
      expect(res.send).toHaveBeenCalledWith({ value: true })
    })

    it('returns 404 when getSetting throws', async () => {
      const server = { getSetting: vi.fn().mockRejectedValueOnce(new Error('not found')) }
      const res = makeRes()
      await c.getServerSetting({ server, params: { setting: 'unknown' } } as any, res)
      expect(res.status).toHaveBeenCalledWith(404)
    })
  })

  describe('putServerSetting', () => {
    it('returns 400 when value is missing', async () => {
      badArgumentMock.mockReturnValueOnce(true)
      const res = makeRes()
      await c.putServerSetting({ server: {}, params: { setting: 'x' }, body: {} } as any, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('returns 404 when setSetting throws', async () => {
      const server = { setSetting: vi.fn().mockRejectedValueOnce(new Error('bad')) }
      const res = makeRes()
      await c.putServerSetting({ server, params: { setting: 'x' }, body: { value: 'y' } } as any, res)
      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('sends the result without a status refresh for a non-status setting', async () => {
      const server = { id: 's1', setSetting: vi.fn().mockResolvedValueOnce({ value: 'y' }) }
      const res = makeRes()
      await c.putServerSetting({ server, params: { setting: 'ig_debug' }, body: { value: 'y' } } as any, res)
      expect(bullmqMocks.enqueueDiscordServerStatusRefresh).not.toHaveBeenCalled()
      expect(res.send).toHaveBeenCalledWith({ value: 'y' })
    })

    it('refreshes status for a status-related setting', async () => {
      const server = { id: 's1', setSetting: vi.fn().mockResolvedValueOnce({ value: true }) }
      bullmqMocks.enqueueDiscordServerStatusRefresh.mockResolvedValueOnce(undefined)
      const res = makeRes()
      await c.putServerSetting(
        { server, params: { setting: 'show_player_list_status' }, body: { value: true } } as any,
        res,
      )
      expect(bullmqMocks.enqueueDiscordServerStatusRefresh).toHaveBeenCalledWith('s1')
      expect(res.send).toHaveBeenCalledWith({ value: true })
    })

    it('returns 502 when the status refresh dispatch fails', async () => {
      const server = { id: 's1', setSetting: vi.fn().mockResolvedValueOnce({ value: true }) }
      bullmqMocks.enqueueDiscordServerStatusRefresh.mockRejectedValueOnce(new Error('queue down'))
      const res = makeRes()
      await c.putServerSetting(
        { server, params: { setting: 'status_player_list_format' }, body: { value: true } } as any,
        res,
      )
      expect(res.status).toHaveBeenCalledWith(502)
    })
  })

  it('getAdminGuilds sends the guild list', async () => {
    prismaMock.gm_guild.findMany.mockResolvedValueOnce([{ id: 'g1' }])
    const res = makeRes()
    await c.getAdminGuilds({} as any, res)
    expect(res.send).toHaveBeenCalledWith([{ id: 'g1' }])
  })

  it('getAdminInformations delegates to processGetAdminInformations', async () => {
    modelMocks.processGetAdminInformations.mockResolvedValueOnce({ status: 200, body: {} })
    await c.getAdminInformations({} as any, makeRes())
    expect(modelMocks.processGetAdminInformations).toHaveBeenCalled()
  })

  describe('server sync roles', () => {
    it('getServerRoles sends the roles', async () => {
      prismaMock.gm_server_sync_roles.findMany.mockResolvedValueOnce([{ id: 1 }])
      const res = makeRes()
      await c.getServerRoles({ params: { serverID: 's1' } } as any, res)
      expect(res.send).toHaveBeenCalledWith([{ id: 1 }])
    })

    it('postServerRoles creates and sends the role', async () => {
      prismaMock.gm_server_sync_roles.create.mockResolvedValueOnce({ id: 1 })
      const res = makeRes()
      await c.postServerRoles({ params: { serverID: 's1', roleID: 'r1' } } as any, res)
      expect(res.send).toHaveBeenCalledWith({ id: 1 })
    })

    it('putServerRoles returns 404 when not found', async () => {
      prismaMock.gm_server_sync_roles.findFirst.mockResolvedValueOnce(null)
      const res = makeRes()
      await c.putServerRoles({ params: { serverID: 's1', roleID: 'r1' }, body: {} } as any, res)
      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('putServerRoles updates only given fields', async () => {
      prismaMock.gm_server_sync_roles.findFirst.mockResolvedValueOnce({ userGroup: 'user', enable: true })
      prismaMock.gm_server_sync_roles.update.mockResolvedValueOnce({ id: 1 })
      const res = makeRes()
      await c.putServerRoles(
        { params: { serverID: 's1', roleID: 'r1' }, body: { userGroup: 'admin', enable: undefined } } as any,
        res,
      )
      expect(prismaMock.gm_server_sync_roles.update).toHaveBeenCalledWith({
        where: { serverID_roleID: { serverID: 's1', roleID: 'r1' } },
        data: { userGroup: 'admin', enable: true },
      })
    })

    it('putServerRoles keeps userGroup when omitted, overwrites enable when given', async () => {
      prismaMock.gm_server_sync_roles.findFirst.mockResolvedValueOnce({ userGroup: 'user', enable: true })
      prismaMock.gm_server_sync_roles.update.mockResolvedValueOnce({ id: 1 })
      const res = makeRes()
      await c.putServerRoles(
        { params: { serverID: 's1', roleID: 'r1' }, body: { userGroup: undefined, enable: false } } as any,
        res,
      )
      expect(prismaMock.gm_server_sync_roles.update).toHaveBeenCalledWith({
        where: { serverID_roleID: { serverID: 's1', roleID: 'r1' } },
        data: { userGroup: 'user', enable: false },
      })
    })

    it('deleteServerRoles returns 404 when not found', async () => {
      prismaMock.gm_server_sync_roles.findFirst.mockResolvedValueOnce(null)
      const res = makeRes()
      await c.deleteServerRoles({ params: { serverID: 's1', roleID: 'r1' } } as any, res)
      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('deleteServerRoles deletes and sends the role', async () => {
      const role = { id: 1 }
      prismaMock.gm_server_sync_roles.findFirst.mockResolvedValueOnce(role)
      const res = makeRes()
      await c.deleteServerRoles({ params: { serverID: 's1', roleID: 'r1' } } as any, res)
      expect(prismaMock.gm_server_sync_roles.delete).toHaveBeenCalledWith({
        where: { serverID_roleID: { serverID: 's1', roleID: 'r1' } },
      })
      expect(res.send).toHaveBeenCalledWith(role)
    })
  })

  describe('server sync team roles', () => {
    it('getServerTeams sends the roles', async () => {
      prismaMock.gm_server_sync_team_roles.findMany.mockResolvedValueOnce([{ id: 1 }])
      const res = makeRes()
      await c.getServerTeams({ params: { serverID: 's1' } } as any, res)
      expect(res.send).toHaveBeenCalledWith([{ id: 1 }])
    })

    it('postServerTeams creates and sends the role', async () => {
      prismaMock.gm_server_sync_team_roles.create.mockResolvedValueOnce({ id: 1 })
      const res = makeRes()
      await c.postServerTeams({ params: { serverID: 's1', roleID: 'r1' } } as any, res)
      expect(res.send).toHaveBeenCalledWith({ id: 1 })
    })

    it('putServerTeams returns 404 when not found', async () => {
      prismaMock.gm_server_sync_team_roles.findFirst.mockResolvedValueOnce(null)
      const res = makeRes()
      await c.putServerTeams({ params: { serverID: 's1', id: '1' }, body: {} } as any, res)
      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('putServerTeams updates only given fields', async () => {
      prismaMock.gm_server_sync_team_roles.findFirst.mockResolvedValueOnce({ teamName: 'Red', enable: true })
      prismaMock.gm_server_sync_team_roles.update.mockResolvedValueOnce({ id: 1 })
      const res = makeRes()
      await c.putServerTeams(
        { params: { serverID: 's1', id: '1' }, body: { teamName: 'Blue', enable: undefined } } as any,
        res,
      )
      expect(prismaMock.gm_server_sync_team_roles.update).toHaveBeenCalledWith({
        where: { serverID: 's1', id: 1 },
        data: { teamName: 'Blue', enable: true },
      })
    })

    it('putServerTeams keeps teamName when omitted, overwrites enable when given', async () => {
      prismaMock.gm_server_sync_team_roles.findFirst.mockResolvedValueOnce({ teamName: 'Red', enable: true })
      prismaMock.gm_server_sync_team_roles.update.mockResolvedValueOnce({ id: 1 })
      const res = makeRes()
      await c.putServerTeams(
        { params: { serverID: 's1', id: '1' }, body: { teamName: undefined, enable: false } } as any,
        res,
      )
      expect(prismaMock.gm_server_sync_team_roles.update).toHaveBeenCalledWith({
        where: { serverID: 's1', id: 1 },
        data: { teamName: 'Red', enable: false },
      })
    })

    it('deleteServerTeams returns 404 when not found', async () => {
      prismaMock.gm_server_sync_team_roles.findFirst.mockResolvedValueOnce(null)
      const res = makeRes()
      await c.deleteServerTeams({ params: { serverID: 's1', id: '1' } } as any, res)
      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('deleteServerTeams deletes and sends the role', async () => {
      const role = { id: 1 }
      prismaMock.gm_server_sync_team_roles.findFirst.mockResolvedValueOnce(role)
      const res = makeRes()
      await c.deleteServerTeams({ params: { serverID: 's1', id: '1' } } as any, res)
      expect(prismaMock.gm_server_sync_team_roles.delete).toHaveBeenCalledWith({
        where: { serverID: 's1', id: 1 },
      })
      expect(res.send).toHaveBeenCalledWith(role)
    })
  })

  it('getGuildBotInstance sends the bot client info', async () => {
    const guild = { getBotClientInfo: vi.fn().mockResolvedValueOnce({ id: 'bot1' }) }
    const res = makeRes()
    await c.getGuildBotInstance({ guild, panelUser: { user: {} } } as any, res)
    expect(res.send).toHaveBeenCalledWith({ id: 'bot1' })
  })

  it('getGuildBotRoleSubordination maps roles by id', async () => {
    const res = makeRes()
    await c.getGuildBotRoleSubordination(
      { dscGuild: { roles: [{ id: 'r1', name: 'Admin', editable: true }] } } as any,
      res,
    )
    expect(res.send).toHaveBeenCalledWith({ r1: { name: 'Admin', editable: true } })
  })

  describe('patchGuildBotInstance', () => {
    it('returns 400 on missing token', async () => {
      badArgumentMock.mockReturnValueOnce(true)
      const res = makeRes()
      await c.patchGuildBotInstance({ guild: {}, body: {} } as any, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('updates the token and sends the bot client info', async () => {
      const guild = {
        updateBotInstanceToken: vi.fn().mockResolvedValueOnce(undefined),
        getBotClientInfo: vi.fn().mockResolvedValueOnce({ id: 'bot1' }),
      }
      const res = makeRes()
      await c.patchGuildBotInstance(
        { guild, panelUser: { user: {} }, body: { token: 'newtok' } } as any,
        res,
      )
      expect(guild.updateBotInstanceToken).toHaveBeenCalledWith('newtok')
      expect(res.send).toHaveBeenCalledWith({ id: 'bot1' })
    })

    it('returns 400 with the error message when updateBotInstanceToken throws', async () => {
      const guild = { updateBotInstanceToken: vi.fn().mockRejectedValueOnce(new Error('bad token')) }
      const res = makeRes()
      await c.patchGuildBotInstance(
        { guild, panelUser: { user: {} }, body: { token: 'newtok' } } as any,
        res,
      )
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.send).toHaveBeenCalledWith({ error: 'bad token' })
    })
  })

  it('postGmodPurchase delegates to processPostGmodPurchase', async () => {
    modelMocks.processPostGmodPurchase.mockResolvedValueOnce({ status: 200, body: {} })
    await c.postGmodPurchase(
      { params: { guildID: 'g1', discordID: 'd1' }, guild: {}, panelUser: {} } as any,
      makeRes(),
    )
    expect(modelMocks.processPostGmodPurchase).toHaveBeenCalledWith('g1', 'd1', {}, {})
  })

  it('deleteGmodPurchase delegates to processDeleteGmodPurchase', async () => {
    modelMocks.processDeleteGmodPurchase.mockResolvedValueOnce({ status: 200, body: {} })
    await c.deleteGmodPurchase({ params: { discordID: 'd1' }, guild: {} } as any, makeRes())
    expect(modelMocks.processDeleteGmodPurchase).toHaveBeenCalledWith('d1', {})
  })

  describe('deleteUserGmodPurchase', () => {
    it('returns 403 when a real guild exists and the user is not admin of it', async () => {
      bullmqMocks.enqueueDiscordGuildSnapshot.mockResolvedValueOnce({ id: 'g1' })
      const panelUser = { isAdminOfGuild: vi.fn().mockResolvedValueOnce(false) }
      const res = makeRes()
      await c.deleteUserGmodPurchase(
        { params: { guildID: 'g1', discordID: 'd1' }, panelUser } as any,
        res,
      )
      expect(res.status).toHaveBeenCalledWith(403)
    })

    it('proceeds when the guild snapshot is falsy (guild no longer exists)', async () => {
      bullmqMocks.enqueueDiscordGuildSnapshot.mockResolvedValueOnce(null)
      modelMocks.processDeleteUserGmodPurchase.mockResolvedValueOnce({ status: 200, body: {} })
      const panelUser = { isAdminOfGuild: vi.fn() }
      const res = makeRes()

      await c.deleteUserGmodPurchase({ params: { guildID: 'g1', discordID: 'd1' }, panelUser } as any, res)

      expect(panelUser.isAdminOfGuild).not.toHaveBeenCalled()
      expect(modelMocks.processDeleteUserGmodPurchase).toHaveBeenCalledWith('d1', 'g1')
    })

    it('delegates when the guild exists and the user is admin of it', async () => {
      bullmqMocks.enqueueDiscordGuildSnapshot.mockResolvedValueOnce({ id: 'g1' })
      modelMocks.processDeleteUserGmodPurchase.mockResolvedValueOnce({ status: 200, body: {} })
      const panelUser = { isAdminOfGuild: vi.fn().mockResolvedValueOnce(true) }
      const res = makeRes()

      await c.deleteUserGmodPurchase({ params: { guildID: 'g1', discordID: 'd1' }, panelUser } as any, res)

      expect(modelMocks.processDeleteUserGmodPurchase).toHaveBeenCalledWith('d1', 'g1')
    })
  })

  describe('putGuildBotInstance', () => {
    it('returns 400 on missing fields', async () => {
      badArgumentMock.mockReturnValueOnce(true)
      const res = makeRes()
      await c.putGuildBotInstance({ guild: {}, body: {} } as any, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('updates the bot instance info and sends the result', async () => {
      const guild = {
        updateBotInstanceInfo: vi.fn().mockResolvedValueOnce(undefined),
        getBotClientInfo: vi.fn().mockResolvedValueOnce({ id: 'bot1' }),
      }
      const res = makeRes()
      await c.putGuildBotInstance(
        {
          guild,
          panelUser: { user: {} },
          body: { username: 'n', avatar: 'a', token: 't', status: 'rotate' },
        } as any,
        res,
      )
      expect(guild.updateBotInstanceInfo).toHaveBeenCalledWith({ username: 'n', avatar: 'a', token: 't', status: 'rotate' })
      expect(res.send).toHaveBeenCalledWith({ id: 'bot1' })
    })
  })

  it('deleteGuildBotInstance delegates to todoControllers', async () => {
    todoControllersMock.mockResolvedValueOnce(undefined)
    const req = {} as any
    const res = makeRes()
    await c.deleteGuildBotInstance(req, res)
    expect(todoControllersMock).toHaveBeenCalledWith(req, res)
  })

  it('getUserGmodStorePurchases delegates to processGetUserGmodStorePurchases', async () => {
    modelMocks.processGetUserGmodStorePurchases.mockResolvedValueOnce({ status: 200, body: {} })
    await c.getUserGmodStorePurchases({ params: { discordID: 'd1' } } as any, makeRes())
    expect(modelMocks.processGetUserGmodStorePurchases).toHaveBeenCalledWith('d1')
  })

  it('getServerPseudo sends the found pseudos', async () => {
    prismaMock.gm_server_pseudo.findMany.mockResolvedValueOnce([{ id: 1 }])
    const res = makeRes()
    await c.getServerPseudo({ server: { id: 's1' } } as any, res)
    expect(res.send).toHaveBeenCalledWith([{ id: 1 }])
  })

  it('postServerPseudo creates and sends the pseudo', async () => {
    prismaMock.gm_server_pseudo.create.mockResolvedValueOnce({ id: 1 })
    const res = makeRes()
    await c.postServerPseudo({ params: { serverID: 's1' } } as any, res)
    expect(res.send).toHaveBeenCalledWith({ id: 1 })
  })

  it('putServerPseudo delegates to processPutServerPseudo', async () => {
    modelMocks.processPutServerPseudo.mockResolvedValueOnce({ status: 200, body: {} })
    await c.putServerPseudo({ params: { serverID: 's1', roleID: 'r1' }, body: {} } as any, makeRes())
    expect(modelMocks.processPutServerPseudo).toHaveBeenCalledWith('s1', 'r1', {})
  })

  it('deleteServerPseudo delegates to processDeleteServerPseudo', async () => {
    modelMocks.processDeleteServerPseudo.mockResolvedValueOnce({ status: 200, body: {} })
    await c.deleteServerPseudo({ params: { serverID: 's1', roleID: 'r1' } } as any, makeRes())
    expect(modelMocks.processDeleteServerPseudo).toHaveBeenCalledWith('s1', 'r1')
  })

  it('getUserNotifications sends the notifications', async () => {
    prismaMock.gm_users_notifications.findMany.mockResolvedValueOnce([{ id: 1 }])
    const res = makeRes()
    await c.getUserNotifications({ params: { discordID: 'd1' } } as any, res)
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }])
  })

  it('patchUserNotifications delegates to processPatchUserNotifications', async () => {
    modelMocks.processPatchUserNotifications.mockResolvedValueOnce({ status: 200, body: {} })
    await c.patchUserNotifications(
      { params: { discordID: 'd1', notificationID: '1' } } as any,
      makeRes(),
    )
    expect(modelMocks.processPatchUserNotifications).toHaveBeenCalledWith('d1', '1')
  })

  it('getUserDataRequest sends the requests', async () => {
    prismaMock.gm_users_data_request.findMany.mockResolvedValueOnce([{ id: 1 }])
    const res = makeRes()
    await c.getUserDataRequest({ params: { discordID: 'd1' } } as any, res)
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }])
  })

  describe('postUserDataRequest', () => {
    it('returns 409 when a recent, still-valid request exists', async () => {
      prismaMock.gm_users_data_request.findFirst.mockResolvedValueOnce({
        expirationDate: new Date(Date.now() + 60_000),
      })
      const res = makeRes()
      await c.postUserDataRequest({ params: { discordID: 'd1' } } as any, res)
      expect(res.status).toHaveBeenCalledWith(409)
    })

    it('returns 404 when the user is not found', async () => {
      prismaMock.gm_users_data_request.findFirst.mockResolvedValueOnce(null)
      getUserFromDiscordIDMock.mockResolvedValueOnce(null)
      const res = makeRes()
      await c.postUserDataRequest({ params: { discordID: 'd1' } } as any, res)
      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('proceeds when the last request has expired', async () => {
      prismaMock.gm_users_data_request.findFirst.mockResolvedValueOnce({
        expirationDate: new Date(Date.now() - 60_000),
      })
      getUserFromDiscordIDMock.mockResolvedValueOnce({ id: 'd1' })
      getUserDataGRPDMock.mockResolvedValueOnce({ data: 'export' })
      const res = makeRes()
      await c.postUserDataRequest({ params: { discordID: 'd1' } } as any, res)
      expect(res.json).toHaveBeenCalledWith({ data: 'export' })
    })

    it('sends the GDPR export on success (no prior request)', async () => {
      prismaMock.gm_users_data_request.findFirst.mockResolvedValueOnce(null)
      getUserFromDiscordIDMock.mockResolvedValueOnce({ id: 'd1' })
      getUserDataGRPDMock.mockResolvedValueOnce({ data: 'export' })
      const res = makeRes()
      await c.postUserDataRequest({ params: { discordID: 'd1' } } as any, res)
      expect(res.json).toHaveBeenCalledWith({ data: 'export' })
    })
  })

  it('getServerReportBugs sends the bug reports', async () => {
    prismaMock.gm_server_report_bugs.findMany.mockResolvedValueOnce([{ id: 1 }])
    const res = makeRes()
    await c.getServerReportBugs({ params: { serverID: 's1' } } as any, res)
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }])
  })

  it('getServerLogs delegates to processGetServerLogs', async () => {
    modelMocks.processGetServerLogs.mockResolvedValueOnce({ status: 200, body: {} })
    await c.getServerLogs({ params: { serverID: 's1' }, query: {} } as any, makeRes())
    expect(modelMocks.processGetServerLogs).toHaveBeenCalledWith('s1', {})
  })

  it('getServerWarns delegates to processGetServerWarns', async () => {
    modelMocks.processGetServerWarns.mockResolvedValueOnce({ status: 200, body: {} })
    await c.getServerWarns({ server: { id: 's1' }, query: {} } as any, makeRes())
    expect(modelMocks.processGetServerWarns).toHaveBeenCalledWith('s1', {})
  })

  it('getScreenshotsList delegates to processGetScreenshotsList', async () => {
    modelMocks.processGetScreenshotsList.mockResolvedValueOnce({ status: 200, body: {} })
    await c.getScreenshotsList({ server: { id: 's1' }, query: {} } as any, makeRes())
    expect(modelMocks.processGetScreenshotsList).toHaveBeenCalledWith('s1', {})
  })

  describe('server logs triggers', () => {
    it('getServerLogsTrigger returns 403 for a non-premium server', async () => {
      const server = { isPremium: vi.fn().mockResolvedValueOnce(false) }
      const res = makeRes()
      await c.getServerLogsTrigger({ server } as any, res)
      expect(res.status).toHaveBeenCalledWith(403)
    })

    it('getServerLogsTrigger sends the triggers for a premium server', async () => {
      const server = { isPremium: vi.fn().mockResolvedValueOnce(true), getLogsTrigger: vi.fn().mockResolvedValueOnce([{ id: 1 }]) }
      const res = makeRes()
      await c.getServerLogsTrigger({ server } as any, res)
      expect(res.send).toHaveBeenCalledWith([{ id: 1 }])
    })

    it('postServerLogsTrigger delegates to processPostServerLogsTrigger', async () => {
      modelMocks.processPostServerLogsTrigger.mockResolvedValueOnce({ status: 200, body: {} })
      await c.postServerLogsTrigger({ server: {}, body: {} } as any, makeRes())
      expect(modelMocks.processPostServerLogsTrigger).toHaveBeenCalled()
    })

    it('putServerLogsTrigger delegates to processPutServerLogsTrigger', async () => {
      modelMocks.processPutServerLogsTrigger.mockResolvedValueOnce({ status: 200, body: {} })
      await c.putServerLogsTrigger({ server: {}, params: { triggerID: '1' }, body: {} } as any, makeRes())
      expect(modelMocks.processPutServerLogsTrigger).toHaveBeenCalledWith({}, '1', {})
    })

    it('deleteServerLogsTrigger delegates to processDeleteServerLogsTrigger', async () => {
      modelMocks.processDeleteServerLogsTrigger.mockResolvedValueOnce({ status: 200, body: {} })
      await c.deleteServerLogsTrigger({ server: {}, params: { triggerID: '1' } } as any, makeRes())
      expect(modelMocks.processDeleteServerLogsTrigger).toHaveBeenCalledWith({}, '1')
    })
  })
})
