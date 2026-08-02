import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../src/utils/logger.js', () => ({
  LogLevel: { MINIMAL: 'minimal', NORMAL: 'normal', VERBOSE: 'verbose', ALL: 'all', CUSTOM: 'custom' },
}))

const getTranslateMock = vi.fn(async (key: string) => key)
vi.mock('../../../src/utils/localizations.js', () => ({ getTranslate: getTranslateMock }))

const secToTimeMock = vi.fn((sec: number) => `${sec}s`)
vi.mock('../../../src/utils/discordFormat.js', () => ({ secToTime: secToTimeMock }))

const getUserFromDiscordIDMock = vi.fn()
const getUserFromSteamID64Mock = vi.fn()
vi.mock('@gmod/domain-user/User.js', () => ({
  getUserFromDiscordID: getUserFromDiscordIDMock,
  getUserFromSteamID64: getUserFromSteamID64Mock,
}))

const getServerFromIDMock = vi.fn()
vi.mock('@gmod/domain-server/Server.js', () => ({ getServerFromID: getServerFromIDMock }))

const redisMock = { get: vi.fn(), set: vi.fn(), del: vi.fn() }
vi.mock('@gmod/infra-redis', () => ({ default: redisMock }))

const wsAddMock = vi.fn()
vi.mock('@gmod/infra-websocket/queues.js', () => ({ wsSendToServerQueue: { add: wsAddMock } }))

const enqueueDiscordGuildRemoveSyncRolesMock = vi.fn()
const enqueueDiscordGuildSyncBanMock = vi.fn()
const enqueueUpdateDiscordTeamRoleMock = vi.fn()
const enqueueUpdatePlayerUserGroupMock = vi.fn()
vi.mock('@gmod/infra-bullmq/discordQueueAdapters.js', () => ({
  enqueueDiscordGuildRemoveSyncRoles: enqueueDiscordGuildRemoveSyncRolesMock,
  enqueueDiscordGuildSyncBan: enqueueDiscordGuildSyncBanMock,
  enqueueUpdateDiscordTeamRole: enqueueUpdateDiscordTeamRoleMock,
  enqueueUpdatePlayerUserGroup: enqueueUpdatePlayerUserGroupMock,
}))

const prismaMock: any = {
  gm_server_stat_team_time: { create: vi.fn() },
  gm_server_stat: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn(), findMany: vi.fn() },
  gm_server_stat_session: { create: vi.fn() },
  gm_guild_verify_role: { findMany: vi.fn() },
  gm_guild_member: { findMany: vi.fn() },
}
vi.mock('@gmod/infra-prisma', () => ({ default: prismaMock }))

const { PlayerGmod, updateDiscordTeamRole, updatePlayerUserGroup, removeDiscordSync, removeServerSync, changeLinkCheckDiscordBan } =
  await import('../../../src/classes/v3/PlayerGmod.js')

function resetAllMocks() {
  getTranslateMock.mockClear()
  secToTimeMock.mockClear()
  getUserFromDiscordIDMock.mockReset()
  getUserFromSteamID64Mock.mockReset()
  getServerFromIDMock.mockReset()
  redisMock.get.mockReset()
  redisMock.set.mockReset()
  redisMock.del.mockReset()
  wsAddMock.mockReset()
  enqueueDiscordGuildRemoveSyncRolesMock.mockReset()
  enqueueDiscordGuildSyncBanMock.mockReset()
  enqueueUpdateDiscordTeamRoleMock.mockReset()
  enqueueUpdatePlayerUserGroupMock.mockReset()
  for (const table of Object.values(prismaMock)) {
    for (const fn of Object.values(table as Record<string, any>)) {
      ;(fn as ReturnType<typeof vi.fn>).mockReset()
    }
  }
}

function makePlayer(overrides: Record<string, any> = {}) {
  return new PlayerGmod({
    steamID: 'STEAM_0:1:1',
    steamID64: '765',
    connectTime: 100,
    kills: 5,
    customValues: {},
    deaths: 2,
    team: { id: 1, name: 'Red' },
    name: 'Player1',
    userGroup: 'user',
    position: { x: 1, y: 2, z: 3 },
    angle: { p: 0, y: 0, r: 0 },
    fps: 60,
    ping: 20,
    adjustedTime: 90,
    branch: 'stable',
    timeLastTeamChange: 50,
    ...overrides,
  } as any)
}

describe('PlayerGmod', () => {
  beforeEach(() => {
    resetAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('constructor', () => {
    it('parses a fully-populated player', () => {
      const player = makePlayer()
      expect(player.steamID64).toBe('765')
      expect(player.team.getName()).toBe('Red')
    })

    it('defaults falsy optional numeric/string fields', () => {
      const player = makePlayer({ fps: 0, ping: 0, adjustedTime: 0, branch: null, timeLastTeamChange: 0 })
      expect(player.fps).toBe(0)
      expect(player.ping).toBe(0)
      expect(player.adjustedTime).toBe(0)
      expect(player.branch).toBe('unknown')
      expect(player.timeLastTeamChange).toBe(0)
    })

    it('throws when a required field is missing', () => {
      const { name: _name, ...rest } = {
        steamID: 'STEAM_0:1:1',
        steamID64: '765',
        connectTime: 100,
        kills: 5,
        customValues: {},
        deaths: 2,
        team: { id: 1, name: 'Red' },
        userGroup: 'user',
        position: { x: 1, y: 2, z: 3 },
        angle: { p: 0, y: 0, r: 0 },
      }
      expect(() => new PlayerGmod(rest as any)).toThrow('Missing key: name')
    })
  })

  describe('getStringFromString', () => {
    it('substitutes every supported placeholder', () => {
      const player = makePlayer()
      const result = player.getStringFromString(
        '{name} {steamID64} {team} {userGroup} {connectTime} {timeLastTeamChange} {kills} {deaths} {position} {angle} {fps} {ping} {adjustedTime} {branch}',
      )
      expect(result).toContain('Player1')
      expect(result).toContain('765')
      expect(result).toContain('Red')
      expect(result).toContain('user')
      expect(result).toContain('5')
      expect(result).toContain('2')
      expect(result).toContain('60')
      expect(result).toContain('20')
      expect(result).toContain('90')
      expect(result).toContain('stable')
      expect(secToTimeMock).toHaveBeenCalledWith(100)
      expect(secToTimeMock).toHaveBeenCalledWith(50)
    })
  })

  describe('getDiscordID', () => {
    it('returns the linked discord ID when the user exists', async () => {
      getUserFromSteamID64Mock.mockResolvedValueOnce({ getDiscordID: () => 'd1' })
      await expect(makePlayer().getDiscordID()).resolves.toBe('d1')
    })

    it('returns null when there is no linked user', async () => {
      getUserFromSteamID64Mock.mockResolvedValueOnce(null)
      await expect(makePlayer().getDiscordID()).resolves.toBeNull()
    })
  })

  describe('getLogFormat', () => {
    it('builds the minimal log (default level)', async () => {
      const result = await makePlayer().getLogFormat()
      expect(result).toContain('765')
      expect(result).toContain('Player1')
      expect(result).not.toContain('Red')
    })

    it('builds the normal log including the team name', async () => {
      const result = await makePlayer().getLogFormat('en', 'normal' as any)
      expect(result).toContain('Red')
    })

    it('builds a custom log from the given field list', async () => {
      const result = await makePlayer().getLogFormat('en', 'custom' as any, ['name', 'kills'])
      expect(result).toContain('Player1')
      expect(result).toContain('5')
    })

    it('returns an empty string for an unrecognized level', async () => {
      const result = await makePlayer().getLogFormat('en', 'unrecognized' as any)
      expect(result).toBe('')
    })
  })

  describe('saveTeamTime', () => {
    it('does nothing when timeLastTeamChange is falsy', async () => {
      const player = makePlayer({ timeLastTeamChange: 0 })
      await player.saveTeamTime('s1')
      expect(prismaMock.gm_server_stat_team_time.create).not.toHaveBeenCalled()
    })

    it('persists the team-time row', async () => {
      prismaMock.gm_server_stat_team_time.create.mockResolvedValueOnce({})
      await makePlayer().saveTeamTime('s1')
      expect(prismaMock.gm_server_stat_team_time.create).toHaveBeenCalledWith({
        data: { serverID: 's1', steamID64: '765', team: 'Red', teamID: 1, time: 50 },
      })
    })

    it('rethrows and logs on failure', async () => {
      prismaMock.gm_server_stat_team_time.create.mockRejectedValueOnce(new Error('db down'))
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      await expect(makePlayer().saveTeamTime('s1')).rejects.toThrow('db down')
      expect(errorSpy).toHaveBeenCalled()
    })
  })

  describe('saveServerStat', () => {
    it('updates the existing stat row, accumulating totals', async () => {
      prismaMock.gm_server_stat.findFirst.mockResolvedValueOnce({ total_time: 10, total_kill: 1, total_death: 1 })
      await makePlayer().saveServerStat('s1')
      expect(prismaMock.gm_server_stat.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ total_time: 110, total_kill: 6, total_death: 3 }),
        }),
      )
    })

    it('creates a new stat row when none exists', async () => {
      prismaMock.gm_server_stat.findFirst.mockResolvedValueOnce(null)
      await makePlayer().saveServerStat('s1')
      expect(prismaMock.gm_server_stat.create).toHaveBeenCalled()
    })

    it('rethrows and logs on failure', async () => {
      prismaMock.gm_server_stat.findFirst.mockRejectedValueOnce(new Error('db down'))
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      await expect(makePlayer().saveServerStat('s1')).rejects.toThrow('db down')
      expect(errorSpy).toHaveBeenCalled()
    })
  })

  describe('saveServerStatSession', () => {
    it('persists a session row', async () => {
      prismaMock.gm_server_stat_session.create.mockResolvedValueOnce({})
      await makePlayer().saveServerStatSession('s1')
      expect(prismaMock.gm_server_stat_session.create).toHaveBeenCalledWith({
        data: { serverID: 's1', steamID64: '765', time: 100, deaths: 2, kills: 5, customValues: '{}' },
      })
    })
  })

  describe('updateDiscordTeamRole', () => {
    it('delegates to the bullmq adapter', async () => {
      const server = { getID: () => 's1' } as any
      await updateDiscordTeamRole(server, '765', 'Red')
      expect(enqueueUpdateDiscordTeamRoleMock).toHaveBeenCalledWith({ serverID: 's1', steamID64: '765', teamName: 'Red' })
    })
  })

  describe('updatePlayerUserGroup', () => {
    it('does nothing when the player stat row does not exist', async () => {
      prismaMock.gm_server_stat.findFirst.mockResolvedValueOnce(null)
      const server = { getID: () => 's1' } as any
      await updatePlayerUserGroup(server, '765', 'admin')
      expect(prismaMock.gm_server_stat.update).not.toHaveBeenCalled()
      expect(enqueueUpdatePlayerUserGroupMock).not.toHaveBeenCalled()
    })

    it('updates the rank and pushes the bullmq update when the row exists', async () => {
      prismaMock.gm_server_stat.findFirst.mockResolvedValueOnce({ steam_id: '765' })
      const server = { getID: () => 's1' } as any
      await updatePlayerUserGroup(server, '765', 'admin')
      expect(prismaMock.gm_server_stat.update).toHaveBeenCalled()
      expect(enqueueUpdatePlayerUserGroupMock).toHaveBeenCalledWith({ serverID: 's1', steamID64: '765', userGroup: 'admin' })
    })

    it('rethrows and logs on failure', async () => {
      prismaMock.gm_server_stat.findFirst.mockRejectedValueOnce(new Error('db down'))
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const server = { getID: () => 's1' } as any
      await expect(updatePlayerUserGroup(server, '765', 'admin')).rejects.toThrow('db down')
      expect(errorSpy).toHaveBeenCalled()
    })
  })

  describe('removeDiscordSync', () => {
    it('returns early when there is no linked user', async () => {
      getUserFromDiscordIDMock.mockResolvedValueOnce(null)
      await removeDiscordSync('d1')
      expect(prismaMock.gm_server_stat.findMany).not.toHaveBeenCalled()
    })

    it('returns early when the linked user has no steamID64', async () => {
      getUserFromDiscordIDMock.mockResolvedValueOnce({ steamID64: null })
      await removeDiscordSync('d1')
      expect(prismaMock.gm_server_stat.findMany).not.toHaveBeenCalled()
    })

    it('skips a server stat row whose server no longer exists', async () => {
      getUserFromDiscordIDMock.mockResolvedValueOnce({ steamID64: '765' })
      prismaMock.gm_server_stat.findMany.mockResolvedValueOnce([{ server_id: 's1' }])
      getServerFromIDMock.mockResolvedValueOnce(null)

      await removeDiscordSync('d1')

      expect(enqueueDiscordGuildRemoveSyncRolesMock).not.toHaveBeenCalled()
    })

    it('dedupes guilds and enqueues a role-removal per unique guild', async () => {
      getUserFromDiscordIDMock.mockResolvedValueOnce({ steamID64: '765' })
      prismaMock.gm_server_stat.findMany.mockResolvedValueOnce([{ server_id: 's1' }, { server_id: 's2' }])
      const serverOne = {
        getGuildID: () => 'g1',
        getSyncTeamRoles: vi.fn().mockResolvedValueOnce([{ roleID: 'r1' }]),
        getSyncRoles: vi.fn().mockResolvedValueOnce([{ roleID: 'r2' }]),
      }
      const serverTwo = { getGuildID: () => 'g1' } // same guild as serverOne -> should be skipped
      getServerFromIDMock.mockResolvedValueOnce(serverOne).mockResolvedValueOnce(serverTwo)
      prismaMock.gm_guild_verify_role.findMany.mockResolvedValueOnce([{ roleID: 'r3' }])

      await removeDiscordSync('d1')

      expect(enqueueDiscordGuildRemoveSyncRolesMock).toHaveBeenCalledTimes(1)
      expect(enqueueDiscordGuildRemoveSyncRolesMock).toHaveBeenCalledWith('g1', 'd1', ['r1', 'r2', 'r3'])
    })

    it('swallows errors', async () => {
      getUserFromDiscordIDMock.mockRejectedValueOnce(new Error('db down'))
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      await expect(removeDiscordSync('d1')).resolves.toBeUndefined()
      expect(errorSpy).toHaveBeenCalled()
    })
  })

  describe('removeServerSync', () => {
    it('skips a server stat row whose server no longer exists', async () => {
      prismaMock.gm_server_stat.findMany.mockResolvedValueOnce([{ server_id: 's1', rank: 'admin' }])
      getServerFromIDMock.mockResolvedValueOnce(null)

      await removeServerSync('765')

      expect(prismaMock.gm_server_stat.update).not.toHaveBeenCalled()
    })

    it('resets the rank and pushes a wsPlayerUpdateGroup removal for each stat row', async () => {
      prismaMock.gm_server_stat.findMany.mockResolvedValueOnce([{ server_id: 's1', rank: 'admin' }])
      const server = { getID: () => 's1' }
      getServerFromIDMock.mockResolvedValueOnce(server)

      await removeServerSync('765')

      expect(prismaMock.gm_server_stat.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { rank: 'user' } }),
      )
      expect(wsAddMock).toHaveBeenCalledWith(
        'wsSendToServer',
        expect.objectContaining({ data: expect.objectContaining({ method: 'wsPlayerUpdateGroup', add: false }) }),
      )
    })

    it('swallows errors', async () => {
      prismaMock.gm_server_stat.findMany.mockRejectedValueOnce(new Error('db down'))
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      await expect(removeServerSync('765')).resolves.toBeUndefined()
      expect(errorSpy).toHaveBeenCalled()
    })
  })

  describe('changeLinkCheckDiscordBan', () => {
    it('enqueues a sync-ban check for every affected guild', async () => {
      prismaMock.gm_guild_member.findMany.mockResolvedValueOnce([{ guild_id: 'g1' }, { guild_id: 'g2' }])

      await changeLinkCheckDiscordBan(['old1'], 'new1')

      expect(enqueueDiscordGuildSyncBanMock).toHaveBeenCalledTimes(2)
      expect(enqueueDiscordGuildSyncBanMock).toHaveBeenCalledWith('g1', ['old1'], 'new1')
      expect(enqueueDiscordGuildSyncBanMock).toHaveBeenCalledWith('g2', ['old1'], 'new1')
    })

    it('swallows errors', async () => {
      prismaMock.gm_guild_member.findMany.mockRejectedValueOnce(new Error('db down'))
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      await expect(changeLinkCheckDiscordBan(['old1'], 'new1')).resolves.toBeUndefined()
      expect(errorSpy).toHaveBeenCalled()
    })
  })
})
