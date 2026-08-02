import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeCollection, makeJob, makeMember, makeRole } from './fixtures.js'

class FakeWorker extends EventEmitter {
  name: string
  processor: (job: any) => any
  opts: any
  constructor(name: string, processor: (job: any) => any, opts: any) {
    super()
    this.name = name
    this.processor = processor
    this.opts = opts
  }
}
vi.mock('bullmq', () => ({ Worker: FakeWorker }))
vi.mock('@gmod/infra-bullmq', () => ({ connection: {} }))

const gmLogMock = vi.fn()
vi.mock('@gmod/core/utils/logger.js', () => ({ gmLog: gmLogMock }))

const prismaMock: any = {
  gm_server_pseudo: { findFirst: vi.fn() },
  gm_server_stat: { findFirst: vi.fn(), update: vi.fn() },
}
vi.mock('@gmod/infra-prisma', () => ({ default: prismaMock }))

const getUserFromSteamID64Mock = vi.fn()
vi.mock('@gmod/domain-user/User.js', () => ({ getUserFromSteamID64: getUserFromSteamID64Mock }))

const getServerFromIDMock = vi.fn()
vi.mock('@gmod/domain-server/Server.js', () => ({ getServerFromID: getServerFromIDMock }))

const redisMock = { set: vi.fn().mockResolvedValue(undefined) }
vi.mock('@gmod/infra-redis', () => ({ default: redisMock }))

const getGuildClientMock = vi.fn()
const getMainClientMock = vi.fn()
const loadGuildBotInstanceMock = vi.fn()
vi.mock('../../../src/discord/index.js', () => ({
  getGuildClient: getGuildClientMock,
  getMainClient: getMainClientMock,
  loadGuildBotInstance: loadGuildBotInstanceMock,
}))

const addAutoRoleToUserMock = vi.fn()
const verifyUserMock = vi.fn()
vi.mock('@gmod/domain-guild/discordModels.js', () => ({
  addAutoRoleToUser: addAutoRoleToUserMock,
  verifyUser: verifyUserMock,
}))

const getVerificationGuildMessageMock = vi.fn()
vi.mock('../../../src/discord/utils/messages.js', () => ({
  getVerificationGuildMessage: getVerificationGuildMessageMock,
}))

vi.mock('@gmod/config', () => ({
  ConfigDiscord: { guildID: 'main-guild', premiumRoleID: 'p1', gmodStorePremiumRoleID: 'g1', discordPremiumRoleID: 'd1', clientID: 'main-client' },
}))

const getDiscordEntitlementsMock = vi.fn()
vi.mock('@gmod/domain-guild/Guild.js', () => ({ getDiscordEntitlements: getDiscordEntitlementsMock }))

const ensureAvatarStoredMock = vi.fn()
const s3SendMock = vi.fn()
vi.mock('@gmod/infra-minio', () => ({ ensureAvatarStored: ensureAvatarStoredMock, s3: { send: s3SendMock } }))
vi.mock('@aws-sdk/client-s3', () => ({ GetObjectCommand: vi.fn().mockImplementation((input) => ({ input })) }))

const {
  discordUpdatePseudoWorker,
  discordUpdateGroupWorker,
  discordUpdateTeamRoleWorker,
} = await import('../../../src/discord/workers/discordQueueWorkers.js')

function pseudoProcessor() {
  return (discordUpdatePseudoWorker as unknown as FakeWorker).processor
}
function groupProcessor() {
  return (discordUpdateGroupWorker as unknown as FakeWorker).processor
}
function teamRoleProcessor() {
  return (discordUpdateTeamRoleWorker as unknown as FakeWorker).processor
}

function resetAllMocks() {
  gmLogMock.mockClear()
  prismaMock.gm_server_pseudo.findFirst.mockReset()
  prismaMock.gm_server_stat.findFirst.mockReset()
  prismaMock.gm_server_stat.update.mockReset().mockResolvedValue(undefined)
  getUserFromSteamID64Mock.mockReset()
  getServerFromIDMock.mockReset()
  redisMock.set.mockReset().mockResolvedValue(undefined)
  getGuildClientMock.mockReset()
  getMainClientMock.mockReset()
  loadGuildBotInstanceMock.mockReset()
  addAutoRoleToUserMock.mockReset()
  verifyUserMock.mockReset()
  getVerificationGuildMessageMock.mockReset()
  getDiscordEntitlementsMock.mockReset()
  ensureAvatarStoredMock.mockReset()
  s3SendMock.mockReset()
}

describe('discordQueueWorkers - discordUpdatePseudoWorker', () => {
  beforeEach(() => resetAllMocks())

  function baseData(overrides: Record<string, any> = {}) {
    return {
      serverID: 's1',
      steamID64: '765',
      playerName: 'PlayerName',
      userGroup: 'user',
      ...overrides,
    }
  }

  function makeServer(overrides: Record<string, any> = {}) {
    return {
      getSetting: vi.fn().mockImplementation(async (key: string) => {
        if (key === 'sync_pseudo_direction') return 'both'
        if (key === 'pseudoFormat') return '{plyName}-{plySteamID64}-{rolePrefix}-{roleName}'
        return undefined
      }),
      getBotInstance: vi.fn(),
      getGuildID: vi.fn().mockReturnValue('guild-1'),
      ...overrides,
    }
  }

  it('returns early when the server is not found', async () => {
    getServerFromIDMock.mockResolvedValueOnce(null)
    await pseudoProcessor()(makeJob('updatePseudo', baseData()))
    expect(getUserFromSteamID64Mock).not.toHaveBeenCalled()
  })

  it('returns early when sync direction is neither both nor gmod-to-discord', async () => {
    getServerFromIDMock.mockResolvedValueOnce(
      makeServer({ getSetting: vi.fn().mockResolvedValueOnce('discord-to-gmod') }),
    )
    await pseudoProcessor()(makeJob('updatePseudo', baseData()))
    expect(getUserFromSteamID64Mock).not.toHaveBeenCalled()
  })

  it('returns early when pseudoFormat is not configured', async () => {
    getServerFromIDMock.mockResolvedValueOnce(
      makeServer({
        getSetting: vi.fn().mockImplementation(async (key: string) => {
          if (key === 'sync_pseudo_direction') return 'gmod-to-discord'
          if (key === 'pseudoFormat') return ''
          return undefined
        }),
      }),
    )
    await pseudoProcessor()(makeJob('updatePseudo', baseData()))
    expect(getUserFromSteamID64Mock).not.toHaveBeenCalled()
  })

  it('returns early when no linked discord user is found', async () => {
    getServerFromIDMock.mockResolvedValueOnce(makeServer())
    prismaMock.gm_server_pseudo.findFirst.mockResolvedValueOnce(null)
    getUserFromSteamID64Mock.mockResolvedValueOnce(null)
    await pseudoProcessor()(makeJob('updatePseudo', baseData()))
    expect(prismaMock.gm_server_pseudo.findFirst).toHaveBeenCalled()
  })

  it('returns early when the linked user has no discord ID', async () => {
    getServerFromIDMock.mockResolvedValueOnce(makeServer())
    prismaMock.gm_server_pseudo.findFirst.mockResolvedValueOnce(null)
    getUserFromSteamID64Mock.mockResolvedValueOnce({ getDiscordID: () => null })
    await pseudoProcessor()(makeJob('updatePseudo', baseData()))
    expect(getUserFromSteamID64Mock).toHaveBeenCalled()
  })

  it('returns early when the bot instance is missing', async () => {
    const server = makeServer({ getBotInstance: vi.fn().mockResolvedValueOnce(null) })
    getServerFromIDMock.mockResolvedValueOnce(server)
    prismaMock.gm_server_pseudo.findFirst.mockResolvedValueOnce(null)
    getUserFromSteamID64Mock.mockResolvedValueOnce({ getDiscordID: () => 'd1' })
    await pseudoProcessor()(makeJob('updatePseudo', baseData()))
    expect(server.getBotInstance).toHaveBeenCalled()
  })

  it('returns early when the bot instance has no user', async () => {
    const server = makeServer({ getBotInstance: vi.fn().mockResolvedValueOnce({ user: null, guilds: { cache: new FakeCollection() } }) })
    getServerFromIDMock.mockResolvedValueOnce(server)
    prismaMock.gm_server_pseudo.findFirst.mockResolvedValueOnce(null)
    getUserFromSteamID64Mock.mockResolvedValueOnce({ getDiscordID: () => 'd1' })
    await pseudoProcessor()(makeJob('updatePseudo', baseData()))
    expect(server.getBotInstance).toHaveBeenCalled()
  })

  it('returns early when the guild is not found on the bot client', async () => {
    const guildsCache = new FakeCollection<string, any>()
    const server = makeServer({
      getBotInstance: vi.fn().mockResolvedValueOnce({ user: { id: 'bot1' }, guilds: { cache: guildsCache } }),
    })
    getServerFromIDMock.mockResolvedValueOnce(server)
    prismaMock.gm_server_pseudo.findFirst.mockResolvedValueOnce(null)
    getUserFromSteamID64Mock.mockResolvedValueOnce({ getDiscordID: () => 'd1' })
    await pseudoProcessor()(makeJob('updatePseudo', baseData()))
    expect(server.getGuildID).toHaveBeenCalled()
  })

  it('returns early when the target user is the guild owner', async () => {
    const guild = { ownerId: 'd1', members: { fetch: vi.fn() } }
    const guildsCache = new FakeCollection<string, any>([['guild-1', guild]])
    const server = makeServer({
      getBotInstance: vi.fn().mockResolvedValueOnce({ user: { id: 'bot1' }, guilds: { cache: guildsCache } }),
    })
    getServerFromIDMock.mockResolvedValueOnce(server)
    prismaMock.gm_server_pseudo.findFirst.mockResolvedValueOnce(null)
    getUserFromSteamID64Mock.mockResolvedValueOnce({ getDiscordID: () => 'd1' })
    await pseudoProcessor()(makeJob('updatePseudo', baseData()))
    expect(guild.members.fetch).not.toHaveBeenCalled()
  })

  it('returns early when the member cannot be fetched', async () => {
    const guild = { ownerId: 'owner', members: { fetch: vi.fn().mockRejectedValueOnce(new Error('nope')) } }
    const guildsCache = new FakeCollection<string, any>([['guild-1', guild]])
    const server = makeServer({
      getBotInstance: vi.fn().mockResolvedValueOnce({ user: { id: 'bot1' }, guilds: { cache: guildsCache } }),
    })
    getServerFromIDMock.mockResolvedValueOnce(server)
    prismaMock.gm_server_pseudo.findFirst.mockResolvedValueOnce(null)
    getUserFromSteamID64Mock.mockResolvedValueOnce({ getDiscordID: () => 'd1' })
    await pseudoProcessor()(makeJob('updatePseudo', baseData()))
    expect(guild.members.fetch).toHaveBeenCalledWith('d1')
  })

  it('returns early when the bot member cannot be fetched', async () => {
    const targetMember = makeMember('d1')
    const fetch = vi.fn().mockResolvedValueOnce(targetMember).mockRejectedValueOnce(new Error('nope'))
    const guild = { ownerId: 'owner', members: { fetch } }
    const guildsCache = new FakeCollection<string, any>([['guild-1', guild]])
    const server = makeServer({
      getBotInstance: vi.fn().mockResolvedValueOnce({ user: { id: 'bot1' }, guilds: { cache: guildsCache } }),
    })
    getServerFromIDMock.mockResolvedValueOnce(server)
    prismaMock.gm_server_pseudo.findFirst.mockResolvedValueOnce(null)
    getUserFromSteamID64Mock.mockResolvedValueOnce({ getDiscordID: () => 'd1' })
    await pseudoProcessor()(makeJob('updatePseudo', baseData()))
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('returns early when the bot lacks ManageNicknames permission', async () => {
    const targetMember = makeMember('d1')
    const botMember = makeMember('bot1', { hasPermission: false })
    const fetch = vi.fn().mockResolvedValueOnce(targetMember).mockResolvedValueOnce(botMember)
    const guild = { ownerId: 'owner', members: { fetch } }
    const guildsCache = new FakeCollection<string, any>([['guild-1', guild]])
    const server = makeServer({
      getBotInstance: vi.fn().mockResolvedValueOnce({ user: { id: 'bot1' }, guilds: { cache: guildsCache } }),
    })
    getServerFromIDMock.mockResolvedValueOnce(server)
    prismaMock.gm_server_pseudo.findFirst.mockResolvedValueOnce(null)
    getUserFromSteamID64Mock.mockResolvedValueOnce({ getDiscordID: () => 'd1' })
    await pseudoProcessor()(makeJob('updatePseudo', baseData()))
    expect(targetMember.setNickname).not.toHaveBeenCalled()
  })

  it('returns early when the bot role is not higher than the member role', async () => {
    const targetMember = makeMember('d1')
    const botHighest = makeRole('bot-highest', { comparePositionTo: vi.fn().mockReturnValue(0) })
    const botMember = makeMember('bot1', { hasPermission: true, highest: botHighest })
    const fetch = vi.fn().mockResolvedValueOnce(targetMember).mockResolvedValueOnce(botMember)
    const guild = { ownerId: 'owner', members: { fetch } }
    const guildsCache = new FakeCollection<string, any>([['guild-1', guild]])
    const server = makeServer({
      getBotInstance: vi.fn().mockResolvedValueOnce({ user: { id: 'bot1' }, guilds: { cache: guildsCache } }),
    })
    getServerFromIDMock.mockResolvedValueOnce(server)
    prismaMock.gm_server_pseudo.findFirst.mockResolvedValueOnce(null)
    getUserFromSteamID64Mock.mockResolvedValueOnce({ getDiscordID: () => 'd1' })
    await pseudoProcessor()(makeJob('updatePseudo', baseData()))
    expect(botHighest.comparePositionTo).toHaveBeenCalled()
    expect(targetMember.setNickname).not.toHaveBeenCalled()
  })

  it('sets the nickname and caches the result on the happy path (with rolesFormat + forceName)', async () => {
    const targetMember = makeMember('d1')
    const botHighest = makeRole('bot-highest', { comparePositionTo: vi.fn().mockReturnValue(1) })
    const botMember = makeMember('bot1', { hasPermission: true, highest: botHighest })
    const fetch = vi.fn().mockResolvedValueOnce(targetMember).mockResolvedValueOnce(botMember)
    const guild = { ownerId: 'owner', members: { fetch } }
    const guildsCache = new FakeCollection<string, any>([['guild-1', guild]])
    const server = makeServer({
      getBotInstance: vi.fn().mockResolvedValueOnce({ user: { id: 'bot1' }, guilds: { cache: guildsCache } }),
    })
    getServerFromIDMock.mockResolvedValueOnce(server)
    prismaMock.gm_server_pseudo.findFirst.mockResolvedValueOnce({ prefix: '[VIP] ', name: 'VIP' })
    getUserFromSteamID64Mock.mockResolvedValueOnce({ getDiscordID: () => 'd1' })

    await pseudoProcessor()(makeJob('updatePseudo', baseData({ forceName: 'Forced' })))

    expect(targetMember.setNickname).toHaveBeenCalledWith('Forced-765-[VIP] -VIP')
    expect(redisMock.set).toHaveBeenCalledWith(
      'sync-pseudo:gmod:server:s1:user:765',
      'Forced-765-[VIP] -VIP',
      'EX',
      120,
    )
  })

  it('rethrows and logs when an unexpected error occurs', async () => {
    getServerFromIDMock.mockRejectedValueOnce(new Error('db down'))
    await expect(pseudoProcessor()(makeJob('updatePseudo', baseData()))).rejects.toThrow('db down')
    expect(gmLogMock).toHaveBeenCalledWith('bullmq-worker', expect.stringContaining('[updatePseudo] Error'))
  })
})

describe('discordQueueWorkers - discordUpdateGroupWorker', () => {
  beforeEach(() => resetAllMocks())

  function baseData(overrides: Record<string, any> = {}) {
    return { serverID: 's1', steamID64: '765', userGroup: 'admin', ...overrides }
  }

  function makeServer(overrides: Record<string, any> = {}) {
    return {
      getSyncRoles: vi.fn().mockResolvedValue([]),
      getBotInstance: vi.fn(),
      getGuildID: vi.fn().mockReturnValue('guild-1'),
      ...overrides,
    }
  }

  it('returns early when the server is not found', async () => {
    getServerFromIDMock.mockResolvedValueOnce(null)
    await groupProcessor()(makeJob('updateGroup', baseData()))
    expect(prismaMock.gm_server_stat.findFirst).not.toHaveBeenCalled()
  })

  it('updates the DB row when a matching player stat exists', async () => {
    getServerFromIDMock.mockResolvedValueOnce(makeServer())
    prismaMock.gm_server_stat.findFirst.mockResolvedValueOnce({ steam_id: '765', server_id: 's1' })
    await groupProcessor()(makeJob('updateGroup', baseData()))
    expect(prismaMock.gm_server_stat.update).toHaveBeenCalled()
  })

  it('skips the DB update when no matching player stat exists', async () => {
    getServerFromIDMock.mockResolvedValueOnce(makeServer())
    prismaMock.gm_server_stat.findFirst.mockResolvedValueOnce(null)
    await groupProcessor()(makeJob('updateGroup', baseData()))
    expect(prismaMock.gm_server_stat.update).not.toHaveBeenCalled()
  })

  it('skips role sync entirely when there are no sync roles configured', async () => {
    getServerFromIDMock.mockResolvedValueOnce(makeServer({ getSyncRoles: vi.fn().mockResolvedValue([]) }))
    prismaMock.gm_server_stat.findFirst.mockResolvedValueOnce(null)
    await groupProcessor()(makeJob('updateGroup', baseData()))
    expect(getUserFromSteamID64Mock).not.toHaveBeenCalled()
  })

  it('skips role sync when the user has no linked discord account', async () => {
    getServerFromIDMock.mockResolvedValueOnce(
      makeServer({ getSyncRoles: vi.fn().mockResolvedValue([{ roleID: 'r1', userGroup: 'admin', enable: true }]) }),
    )
    prismaMock.gm_server_stat.findFirst.mockResolvedValueOnce(null)
    getUserFromSteamID64Mock.mockResolvedValueOnce(null)
    await groupProcessor()(makeJob('updateGroup', baseData()))
  })

  it('skips role sync when the bot instance is missing', async () => {
    const server = makeServer({
      getSyncRoles: vi.fn().mockResolvedValue([{ roleID: 'r1', userGroup: 'admin', enable: true }]),
      getBotInstance: vi.fn().mockResolvedValueOnce(null),
    })
    getServerFromIDMock.mockResolvedValueOnce(server)
    prismaMock.gm_server_stat.findFirst.mockResolvedValueOnce(null)
    getUserFromSteamID64Mock.mockResolvedValueOnce({ getDiscordID: () => 'd1' })
    await groupProcessor()(makeJob('updateGroup', baseData()))
  })

  it('skips role sync when the guild is not present on the bot client', async () => {
    const server = makeServer({
      getSyncRoles: vi.fn().mockResolvedValue([{ roleID: 'r1', userGroup: 'admin', enable: true }]),
      getBotInstance: vi.fn().mockResolvedValueOnce({ user: { id: 'bot1' }, guilds: { cache: new FakeCollection() } }),
    })
    getServerFromIDMock.mockResolvedValueOnce(server)
    prismaMock.gm_server_stat.findFirst.mockResolvedValueOnce(null)
    getUserFromSteamID64Mock.mockResolvedValueOnce({ getDiscordID: () => 'd1' })
    await groupProcessor()(makeJob('updateGroup', baseData()))
  })

  it('skips role sync when the member cannot be fetched', async () => {
    const guild = { members: { fetch: vi.fn().mockRejectedValueOnce(new Error('nope')) } }
    const server = makeServer({
      getSyncRoles: vi.fn().mockResolvedValue([{ roleID: 'r1', userGroup: 'admin', enable: true }]),
      getBotInstance: vi.fn().mockResolvedValueOnce({
        user: { id: 'bot1' },
        guilds: { cache: new FakeCollection([['guild-1', guild]]) },
      }),
    })
    getServerFromIDMock.mockResolvedValueOnce(server)
    prismaMock.gm_server_stat.findFirst.mockResolvedValueOnce(null)
    getUserFromSteamID64Mock.mockResolvedValueOnce({ getDiscordID: () => 'd1' })
    await groupProcessor()(makeJob('updateGroup', baseData()))
  })

  it('skips role add/remove when the bot member cannot be fetched', async () => {
    const targetMember = makeMember('d1')
    const fetch = vi.fn().mockResolvedValueOnce(targetMember).mockRejectedValueOnce(new Error('nope'))
    const guild = { members: { fetch } }
    const server = makeServer({
      getSyncRoles: vi.fn().mockResolvedValue([{ roleID: 'r1', userGroup: 'admin', enable: true }]),
      getBotInstance: vi.fn().mockResolvedValueOnce({
        user: { id: 'bot1' },
        guilds: { cache: new FakeCollection([['guild-1', guild]]) },
      }),
    })
    getServerFromIDMock.mockResolvedValueOnce(server)
    prismaMock.gm_server_stat.findFirst.mockResolvedValueOnce(null)
    getUserFromSteamID64Mock.mockResolvedValueOnce({ getDiscordID: () => 'd1' })
    await groupProcessor()(makeJob('updateGroup', baseData()))
    expect(targetMember.roles.remove).not.toHaveBeenCalled()
  })

  it('removes stale sync roles and adds newly-applicable ones (full happy path)', async () => {
    const staleRole = makeRole('stale-role')
    const targetRolesCache = new FakeCollection<string, any>([['stale-role', staleRole]])
    const targetMember = makeMember('d1', { rolesCache: targetRolesCache })
    const botHighest = makeRole('bot-highest', { comparePositionTo: vi.fn().mockReturnValue(1) })
    const botMember = makeMember('bot1', { highest: botHighest })
    const fetch = vi.fn().mockResolvedValueOnce(targetMember).mockResolvedValueOnce(botMember)
    const newRole = makeRole('new-role')
    const guildRolesCache = new FakeCollection<string, any>([['new-role', newRole]])
    const guild = { members: { fetch }, roles: { cache: guildRolesCache } }
    const syncRoles = [
      { roleID: 'stale-role', userGroup: 'other-group', enable: true },
      { roleID: 'new-role', userGroup: 'admin', enable: true },
    ]
    const server = makeServer({
      getSyncRoles: vi.fn().mockResolvedValue(syncRoles),
      getBotInstance: vi.fn().mockResolvedValueOnce({
        user: { id: 'bot1' },
        guilds: { cache: new FakeCollection([['guild-1', guild]]) },
      }),
    })
    getServerFromIDMock.mockResolvedValueOnce(server)
    prismaMock.gm_server_stat.findFirst.mockResolvedValueOnce(null)
    getUserFromSteamID64Mock.mockResolvedValueOnce({ getDiscordID: () => 'd1' })

    await groupProcessor()(makeJob('updateGroup', baseData()))

    expect(targetMember.roles.remove).toHaveBeenCalledWith(['stale-role'])
    expect(targetMember.roles.add).toHaveBeenCalledWith('new-role')
  })

  it('does not remove roles when there are no current sync roles on the member, and skips roles the bot cannot assign', async () => {
    const targetMember = makeMember('d1')
    const botHighest = makeRole('bot-highest', { comparePositionTo: vi.fn().mockReturnValue(0) })
    const botMember = makeMember('bot1', { highest: botHighest })
    const fetch = vi.fn().mockResolvedValueOnce(targetMember).mockResolvedValueOnce(botMember)
    const newRole = makeRole('new-role')
    const guildRolesCache = new FakeCollection<string, any>([['new-role', newRole]])
    const guild = { members: { fetch }, roles: { cache: guildRolesCache } }
    const syncRoles = [{ roleID: 'new-role', userGroup: 'admin', enable: true }]
    const server = makeServer({
      getSyncRoles: vi.fn().mockResolvedValue(syncRoles),
      getBotInstance: vi.fn().mockResolvedValueOnce({
        user: { id: 'bot1' },
        guilds: { cache: new FakeCollection([['guild-1', guild]]) },
      }),
    })
    getServerFromIDMock.mockResolvedValueOnce(server)
    prismaMock.gm_server_stat.findFirst.mockResolvedValueOnce(null)
    getUserFromSteamID64Mock.mockResolvedValueOnce({ getDiscordID: () => 'd1' })

    await groupProcessor()(makeJob('updateGroup', baseData()))

    expect(targetMember.roles.remove).not.toHaveBeenCalled()
    expect(targetMember.roles.add).not.toHaveBeenCalled()
  })

  it('rethrows and logs when an unexpected error occurs', async () => {
    getServerFromIDMock.mockRejectedValueOnce(new Error('db down'))
    await expect(groupProcessor()(makeJob('updateGroup', baseData()))).rejects.toThrow('db down')
    expect(gmLogMock).toHaveBeenCalledWith('bullmq-worker', expect.stringContaining('[updateGroup] Error'))
  })
})

describe('discordQueueWorkers - discordUpdateTeamRoleWorker', () => {
  beforeEach(() => resetAllMocks())

  function baseData(overrides: Record<string, any> = {}) {
    return { serverID: 's1', steamID64: '765', teamName: 'red', ...overrides }
  }

  function makeServer(overrides: Record<string, any> = {}) {
    return {
      getBotInstance: vi.fn(),
      getDiscordGuild: vi.fn(),
      getSyncTeamRoles: vi.fn().mockResolvedValue([]),
      getGuildID: vi.fn().mockReturnValue('guild-1'),
      ...overrides,
    }
  }

  it('returns early when the server is not found', async () => {
    getServerFromIDMock.mockResolvedValueOnce(null)
    await teamRoleProcessor()(makeJob('updateTeamRole', baseData()))
    expect(getUserFromSteamID64Mock).not.toHaveBeenCalled()
  })

  it('returns early when the user is not found', async () => {
    getServerFromIDMock.mockResolvedValueOnce(makeServer())
    getUserFromSteamID64Mock.mockResolvedValueOnce(null)
    await teamRoleProcessor()(makeJob('updateTeamRole', baseData()))
  })

  it('returns early when the bot instance is missing', async () => {
    const server = makeServer({ getBotInstance: vi.fn().mockResolvedValueOnce(null) })
    getServerFromIDMock.mockResolvedValueOnce(server)
    getUserFromSteamID64Mock.mockResolvedValueOnce({ getDiscordID: () => 'd1' })
    await teamRoleProcessor()(makeJob('updateTeamRole', baseData()))
  })

  it('returns early when the discord guild cannot be resolved', async () => {
    const server = makeServer({
      getBotInstance: vi.fn().mockResolvedValueOnce({ user: { id: 'bot1' } }),
      getDiscordGuild: vi.fn().mockResolvedValueOnce(null),
    })
    getServerFromIDMock.mockResolvedValueOnce(server)
    getUserFromSteamID64Mock.mockResolvedValueOnce({ getDiscordID: () => 'd1' })
    await teamRoleProcessor()(makeJob('updateTeamRole', baseData()))
  })

  it('returns early when the member cannot be fetched', async () => {
    const guild = { members: { fetch: vi.fn().mockRejectedValueOnce(new Error('nope')), cache: new FakeCollection() } }
    const server = makeServer({
      getBotInstance: vi.fn().mockResolvedValueOnce({ user: { id: 'bot1' } }),
      getDiscordGuild: vi.fn().mockResolvedValueOnce(guild),
    })
    getServerFromIDMock.mockResolvedValueOnce(server)
    getUserFromSteamID64Mock.mockResolvedValueOnce({ getDiscordID: () => 'd1' })
    await teamRoleProcessor()(makeJob('updateTeamRole', baseData()))
  })

  it('returns early when there are no team roles configured', async () => {
    const targetMember = makeMember('d1')
    const guild = { members: { fetch: vi.fn().mockResolvedValueOnce(targetMember), cache: new FakeCollection() } }
    const server = makeServer({
      getBotInstance: vi.fn().mockResolvedValueOnce({ user: { id: 'bot1' } }),
      getDiscordGuild: vi.fn().mockResolvedValueOnce(guild),
      getSyncTeamRoles: vi.fn().mockResolvedValueOnce([]),
    })
    getServerFromIDMock.mockResolvedValueOnce(server)
    getUserFromSteamID64Mock.mockResolvedValueOnce({ getDiscordID: () => 'd1' })
    await teamRoleProcessor()(makeJob('updateTeamRole', baseData()))
  })

  it('returns early when the bot member is not found in the guild cache', async () => {
    const targetMember = makeMember('d1')
    const guild = {
      members: { fetch: vi.fn().mockResolvedValueOnce(targetMember), cache: new FakeCollection() },
    }
    const server = makeServer({
      getBotInstance: vi.fn().mockResolvedValueOnce({ user: { id: 'bot1' } }),
      getDiscordGuild: vi.fn().mockResolvedValueOnce(guild),
      getSyncTeamRoles: vi.fn().mockResolvedValueOnce([{ roleID: 'r1', teamName: 'red', enable: true }]),
    })
    getServerFromIDMock.mockResolvedValueOnce(server)
    getUserFromSteamID64Mock.mockResolvedValueOnce({ getDiscordID: () => 'd1' })
    await teamRoleProcessor()(makeJob('updateTeamRole', baseData()))
  })

  it('returns early when the bot member has no highest role', async () => {
    const targetMember = makeMember('d1')
    const botMember = { id: 'bot1', roles: { highest: null } }
    const guildMembersCache = new FakeCollection<string, any>([['bot1', botMember]])
    const guild = {
      members: { fetch: vi.fn().mockResolvedValueOnce(targetMember), cache: guildMembersCache },
    }
    const server = makeServer({
      getBotInstance: vi.fn().mockResolvedValueOnce({ user: { id: 'bot1' } }),
      getDiscordGuild: vi.fn().mockResolvedValueOnce(guild),
      getSyncTeamRoles: vi.fn().mockResolvedValueOnce([{ roleID: 'r1', teamName: 'red', enable: true }]),
    })
    getServerFromIDMock.mockResolvedValueOnce(server)
    getUserFromSteamID64Mock.mockResolvedValueOnce({ getDiscordID: () => 'd1' })
    await teamRoleProcessor()(makeJob('updateTeamRole', baseData()))
  })

  it('removes stale team roles and adds new assignable ones, skipping already-assigned and non-assignable roles', async () => {
    const staleRole = makeRole('stale-role')
    const alreadyHasRole = makeRole('already-has')
    const targetRolesCache = new FakeCollection<string, any>([
      ['stale-role', staleRole],
      ['already-has', alreadyHasRole],
    ])
    const targetMember = makeMember('d1', { rolesCache: targetRolesCache })
    const botHighest = makeRole('bot-highest', {
      comparePositionTo: vi.fn().mockImplementation((role: any) => (role.id === 'unassignable' ? -1 : 1)),
    })
    const botMember = { id: 'bot1', roles: { highest: botHighest } }
    const guildMembersCache = new FakeCollection<string, any>([['bot1', botMember]])
    const assignableRole = makeRole('already-has')
    const newAssignableRole = makeRole('new-assignable')
    const unassignableRole = makeRole('unassignable')
    const guildRolesCache = new FakeCollection<string, any>([
      ['already-has', assignableRole],
      ['new-assignable', newAssignableRole],
      ['unassignable', unassignableRole],
    ])
    const guild = {
      members: { fetch: vi.fn().mockResolvedValueOnce(targetMember), cache: guildMembersCache },
      roles: { cache: guildRolesCache },
    }
    const syncRoles = [
      { roleID: 'stale-role', teamName: 'blue', enable: true },
      { roleID: 'already-has', teamName: 'red', enable: true },
      { roleID: 'new-assignable', teamName: 'red', enable: true },
      { roleID: 'unassignable', teamName: 'red', enable: true },
    ]
    const server = makeServer({
      getBotInstance: vi.fn().mockResolvedValueOnce({ user: { id: 'bot1' } }),
      getDiscordGuild: vi.fn().mockResolvedValueOnce(guild),
      getSyncTeamRoles: vi.fn().mockResolvedValueOnce(syncRoles),
    })
    getServerFromIDMock.mockResolvedValueOnce(server)
    getUserFromSteamID64Mock.mockResolvedValueOnce({ getDiscordID: () => 'd1' })

    await teamRoleProcessor()(makeJob('updateTeamRole', baseData()))

    expect(targetMember.roles.remove).toHaveBeenCalledWith(['stale-role'])
    expect(targetMember.roles.add).toHaveBeenCalledWith('new-assignable')
    expect(targetMember.roles.add).not.toHaveBeenCalledWith('already-has')
    expect(targetMember.roles.add).not.toHaveBeenCalledWith('unassignable')
  })

  it('skips role removal entirely when the member has no stale team roles to remove', async () => {
    const alreadyHasRole = makeRole('already-has')
    const targetRolesCache = new FakeCollection<string, any>([['already-has', alreadyHasRole]])
    const targetMember = makeMember('d1', { rolesCache: targetRolesCache })
    const botHighest = makeRole('bot-highest', { comparePositionTo: vi.fn().mockReturnValue(1) })
    const botMember = { id: 'bot1', roles: { highest: botHighest } }
    const guildMembersCache = new FakeCollection<string, any>([['bot1', botMember]])
    const assignableRole = makeRole('already-has')
    const guildRolesCache = new FakeCollection<string, any>([['already-has', assignableRole]])
    const guild = {
      members: { fetch: vi.fn().mockResolvedValueOnce(targetMember), cache: guildMembersCache },
      roles: { cache: guildRolesCache },
    }
    const server = makeServer({
      getBotInstance: vi.fn().mockResolvedValueOnce({ user: { id: 'bot1' } }),
      getDiscordGuild: vi.fn().mockResolvedValueOnce(guild),
      getSyncTeamRoles: vi.fn().mockResolvedValueOnce([{ roleID: 'already-has', teamName: 'red', enable: true }]),
    })
    getServerFromIDMock.mockResolvedValueOnce(server)
    getUserFromSteamID64Mock.mockResolvedValueOnce({ getDiscordID: () => 'd1' })

    await teamRoleProcessor()(makeJob('updateTeamRole', baseData()))

    expect(targetMember.roles.remove).not.toHaveBeenCalled()
    expect(targetMember.roles.add).not.toHaveBeenCalledWith('already-has')
  })

  it('rethrows and logs when an unexpected error occurs', async () => {
    getServerFromIDMock.mockRejectedValueOnce(new Error('db down'))
    await expect(teamRoleProcessor()(makeJob('updateTeamRole', baseData()))).rejects.toThrow('db down')
    expect(gmLogMock).toHaveBeenCalledWith('bullmq-worker', expect.stringContaining('[updateTeamRole] Error'))
  })
})
