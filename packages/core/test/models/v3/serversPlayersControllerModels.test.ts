import { beforeEach, describe, expect, it, vi } from 'vitest'

const badArgumentMock = vi.fn()
const ipGetIPMock = vi.fn((ip: string) => ip.split(':')[0])
vi.mock('../../../src/utils/tools.js', () => ({ badArgument: badArgumentMock, ipGetIP: ipGetIPMock }))

const sendPlayerSayMock = vi.fn()
const saveConnectionGlobalInfoMock = vi.fn()
const saveConnectionSteamInfoMock = vi.fn()
vi.mock('../../../src/models/v3/serversPlayersModels.js', () => ({
  sendPlayerSay: sendPlayerSayMock,
  saveConnectionGlobalInfo: saveConnectionGlobalInfoMock,
  saveConnectionSteamInfo: saveConnectionSteamInfoMock,
}))

const enqueueUpdateGuildUserPseudoMock = vi.fn()
const enqueueUpdatePlayerUserGroupMock = vi.fn()
const enqueueUpdateDiscordTeamRoleMock = vi.fn()
vi.mock('@gmod/infra-bullmq/discordQueueAdapters.js', () => ({
  enqueueUpdateGuildUserPseudo: enqueueUpdateGuildUserPseudoMock,
  enqueueUpdatePlayerUserGroup: enqueueUpdatePlayerUserGroupMock,
  enqueueUpdateDiscordTeamRole: enqueueUpdateDiscordTeamRoleMock,
}))

// processPlayerDisconnect/processPlayerChangeTeam call the REAL PlayerGmod class (not mocked, so
// its own dead-code fixes and validation logic stay exercised), whose saveServerStat/
// saveServerStatSession/saveTeamTime methods reach into these extra prisma tables too.
const prismaMock: any = {
  gm_server_warn: { create: vi.fn() },
  gm_server_stat: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  gm_server_stat_session: { create: vi.fn() },
  gm_server_stat_team_time: { create: vi.fn() },
}
vi.mock('@gmod/infra-prisma', () => ({ default: prismaMock }))

const {
  processPlayerSay,
  processPlayerChangeName,
  processPlayerChangeGroup,
  processPlayerChangeTeam,
  processPlayerConnect,
  processPlayerDisconnect,
  processPlayerWarn,
} = await import('../../../src/models/v3/serversPlayersControllerModels.js')

function validPlayerPayload(overrides: Record<string, any> = {}) {
  return {
    steamID: 'STEAM_0:1:1',
    steamID64: '765',
    connectTime: 100,
    kills: 0,
    customValues: {},
    deaths: 0,
    team: { id: 1, name: 'Red' },
    name: 'Bob',
    userGroup: 'user',
    position: { x: 0, y: 0, z: 0 },
    angle: { p: 0, y: 0, r: 0 },
    ...overrides,
  }
}

// Present-but-incomplete: `team: {}` has no defaults in Team's constructor (unlike
// Position/Angle, which default missing numbers to 0), so team.isValid() - and therefore
// PlayerGmod.isValid() - is guaranteed false, without the constructor itself throwing.
function invalidPlayerPayload() {
  return { ...validPlayerPayload(), team: {} }
}

function makeServer(overrides: Record<string, any> = {}) {
  return {
    getID: () => 's1',
    saveUserConnectionInfo: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as any
}

describe('serversPlayersControllerModels', () => {
  beforeEach(() => {
    badArgumentMock.mockReset().mockReturnValue(false)
    ipGetIPMock.mockClear()
    sendPlayerSayMock.mockReset()
    saveConnectionGlobalInfoMock.mockReset()
    saveConnectionSteamInfoMock.mockReset()
    enqueueUpdateGuildUserPseudoMock.mockReset()
    enqueueUpdatePlayerUserGroupMock.mockReset()
    enqueueUpdateDiscordTeamRoleMock.mockReset()
    for (const table of Object.values(prismaMock)) {
      for (const fn of Object.values(table as Record<string, any>)) {
        ;(fn as ReturnType<typeof vi.fn>).mockReset()
      }
    }
  })

  describe('processPlayerSay', () => {
    it('returns 400 with missing_arguments when required fields are absent', async () => {
      badArgumentMock.mockReturnValueOnce(true)
      const result = await processPlayerSay(makeServer(), '765', {})
      expect(result.status).toBe(400)
      expect((result.body as any).error).toBe('missing_arguments')
    })

    it('returns 400 with player_bad_format when the player payload is invalid', async () => {
      const result = await processPlayerSay(makeServer(), '765', {
        player: invalidPlayerPayload(),
        text: 'hi',
        teamOnly: false,
      })
      expect(result.status).toBe(400)
      expect((result.body as any).error).toBe('player_bad_format')
    })

    it('sends the message and returns 200 on success', async () => {
      const result = await processPlayerSay(makeServer(), '765', {
        player: validPlayerPayload(),
        text: 'hi',
        teamOnly: false,
      })
      expect(sendPlayerSayMock).toHaveBeenCalled()
      expect(result).toEqual({ status: 200, body: { success: true } })
    })
  })

  describe('processPlayerChangeName', () => {
    it('returns 400 when required fields are absent', async () => {
      badArgumentMock.mockReturnValueOnce(true)
      const result = await processPlayerChangeName(makeServer(), {})
      expect(result.status).toBe(400)
    })

    it('returns 400 when the player payload is invalid', async () => {
      const result = await processPlayerChangeName(makeServer(), {
        player: invalidPlayerPayload(),
        oldName: 'Old',
        newName: 'New',
      })
      expect(result.status).toBe(400)
      expect((result.body as any).error).toBe('player_bad_format')
    })

    it('enqueues the pseudo update and returns 200', async () => {
      const result = await processPlayerChangeName(makeServer(), {
        player: validPlayerPayload(),
        oldName: 'Old',
        newName: 'New',
      })
      expect(enqueueUpdateGuildUserPseudoMock).toHaveBeenCalledWith(
        expect.objectContaining({ serverID: 's1', forceName: 'New' }),
      )
      expect(result).toEqual({ status: 200, body: { success: true } })
    })
  })

  describe('processPlayerChangeGroup', () => {
    it('returns 400 when required fields are absent', async () => {
      badArgumentMock.mockReturnValueOnce(true)
      const result = await processPlayerChangeGroup(makeServer(), '765', {})
      expect(result.status).toBe(400)
    })

    it('enqueues the group update and returns 200', async () => {
      const result = await processPlayerChangeGroup(makeServer(), '765', { oldGroup: 'user', newGroup: 'admin' })
      expect(enqueueUpdatePlayerUserGroupMock).toHaveBeenCalledWith({
        serverID: 's1',
        steamID64: '765',
        userGroup: 'admin',
      })
      expect(result).toEqual({ status: 200, body: { success: true } })
    })

    it('extracts steamID64 from an array-valued route param', async () => {
      await processPlayerChangeGroup(makeServer(), ['765'], { oldGroup: 'user', newGroup: 'admin' })
      expect(enqueueUpdatePlayerUserGroupMock).toHaveBeenCalledWith(
        expect.objectContaining({ steamID64: '765' }),
      )
    })

    it('defaults steamID64 to an empty string for an unrecognized param type', async () => {
      await processPlayerChangeGroup(makeServer(), 12345, { oldGroup: 'user', newGroup: 'admin' })
      expect(enqueueUpdatePlayerUserGroupMock).toHaveBeenCalledWith(
        expect.objectContaining({ steamID64: '' }),
      )
    })
  })

  describe('processPlayerChangeTeam', () => {
    it('returns 400 when required fields are absent', async () => {
      badArgumentMock.mockReturnValueOnce(true)
      const result = await processPlayerChangeTeam(makeServer(), '765', {})
      expect(result.status).toBe(400)
    })

    it('saves team time for a valid player and enqueues the team role update', async () => {
      const result = await processPlayerChangeTeam(makeServer(), '765', {
        oldTeam: { name: 'Red' },
        newTeam: { name: 'Blue' },
        player: validPlayerPayload(),
      })
      expect(enqueueUpdateDiscordTeamRoleMock).toHaveBeenCalledWith({
        serverID: 's1',
        steamID64: '765',
        teamName: 'Blue',
      })
      expect(result).toEqual({ status: 200, body: { success: true } })
    })

    it('skips saving team time when the player payload is invalid, still enqueues the role update', async () => {
      const result = await processPlayerChangeTeam(makeServer(), '765', {
        oldTeam: { name: 'Red' },
        newTeam: { name: 'Blue' },
        player: invalidPlayerPayload(),
      })
      expect(enqueueUpdateDiscordTeamRoleMock).toHaveBeenCalled()
      expect(result).toEqual({ status: 200, body: { success: true } })
    })

    it('defaults teamName to null when newTeam has no name', async () => {
      await processPlayerChangeTeam(makeServer(), '765', {
        oldTeam: { name: 'Red' },
        newTeam: {},
        player: validPlayerPayload(),
      })
      expect(enqueueUpdateDiscordTeamRoleMock).toHaveBeenCalledWith(
        expect.objectContaining({ teamName: null }),
      )
    })
  })

  describe('processPlayerConnect', () => {
    it('returns 400 when required fields are absent', async () => {
      badArgumentMock.mockReturnValueOnce(true)
      const result = await processPlayerConnect(makeServer(), '765', {})
      expect(result.status).toBe(400)
    })

    it('saves connection info and returns 200', async () => {
      const server = makeServer()
      const result = await processPlayerConnect(server, '765', {
        address: '1.2.3.4:27015',
        name: 'Bob',
        networkid: 'STEAM_0:1:1',
      })

      expect(ipGetIPMock).toHaveBeenCalledWith('1.2.3.4:27015')
      expect(saveConnectionGlobalInfoMock).toHaveBeenCalledWith('765', 'STEAM_0:1:1', '1.2.3.4', 'Bob')
      expect(saveConnectionSteamInfoMock).toHaveBeenCalledWith('765', 'Bob', '1.2.3.4')
      expect(server.saveUserConnectionInfo).toHaveBeenCalledWith('765', 'Bob')
      expect(result).toEqual({ status: 200, body: { success: true } })
    })
  })

  describe('processPlayerDisconnect', () => {
    it('returns 400 when required fields are absent', async () => {
      badArgumentMock.mockReturnValueOnce(true)
      const result = await processPlayerDisconnect(makeServer(), {})
      expect(result.status).toBe(400)
    })

    it('returns 400 when the player payload is invalid', async () => {
      const result = await processPlayerDisconnect(makeServer(), { player: invalidPlayerPayload() })
      expect(result.status).toBe(400)
      expect((result.body as any).error).toBe('player_bad_format')
    })

    it('persists stats and enqueues the relevant updates, returning 200', async () => {
      prismaMock.gm_server_stat.findFirst.mockResolvedValueOnce(null)
      prismaMock.gm_server_stat.create.mockResolvedValueOnce({})
      prismaMock.gm_server_stat_session.create.mockResolvedValueOnce({})

      const result = await processPlayerDisconnect(makeServer(), { player: validPlayerPayload() })
      expect(enqueueUpdatePlayerUserGroupMock).toHaveBeenCalled()
      expect(enqueueUpdateGuildUserPseudoMock).toHaveBeenCalled()
      expect(enqueueUpdateDiscordTeamRoleMock).toHaveBeenCalledWith(expect.objectContaining({ teamName: null }))
      expect(result).toEqual({ status: 200, body: { success: true } })
    })
  })

  describe('processPlayerWarn', () => {
    it('returns 400 when neither admin nor adminSteamID64 is given', async () => {
      const result = await processPlayerWarn(makeServer(), '765', {
        player: validPlayerPayload(),
        date: '1700000000',
      })
      expect(result.status).toBe(400)
    })

    it('throws for an unparseable date format', async () => {
      await expect(
        processPlayerWarn(makeServer(), '765', {
          admin: validPlayerPayload({ steamID64: '111' }),
          player: validPlayerPayload(),
          date: {},
        }),
      ).rejects.toThrow('Invalid date format')
    })

    it('accepts a numeric-string epoch-seconds date', async () => {
      prismaMock.gm_server_warn.create.mockResolvedValueOnce({ id: 1 })
      const result = await processPlayerWarn(makeServer(), '765', {
        admin: validPlayerPayload({ steamID64: '111' }),
        player: validPlayerPayload(),
        reason: 'cheating',
        date: '1700000000',
      })
      expect(result).toEqual({ status: 200, body: { id: 1 } })
      expect(prismaMock.gm_server_warn.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userSteamID64: '765', adminSteamID64: '111' }) }),
      )
    })

    it('accepts a numeric epoch-seconds date', async () => {
      prismaMock.gm_server_warn.create.mockResolvedValueOnce({ id: 1 })
      const result = await processPlayerWarn(makeServer(), '765', {
        admin: validPlayerPayload({ steamID64: '111' }),
        player: validPlayerPayload(),
        reason: 'cheating',
        date: 1700000000,
      })
      expect(result).toEqual({ status: 200, body: { id: 1 } })
    })

    it('falls back to adminSteamID64/steamID64 params when using the adminSteamID64-only path', async () => {
      prismaMock.gm_server_warn.create.mockResolvedValueOnce({ id: 1 })
      await processPlayerWarn(makeServer(), '765', {
        adminSteamID64: '111',
        admin: validPlayerPayload({ steamID64: '' }),
        player: validPlayerPayload({ steamID64: '' }),
        reason: 'cheating',
        date: 1700000000,
      })
      expect(prismaMock.gm_server_warn.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userSteamID64: '765', adminSteamID64: '111' }) }),
      )
    })
  })
})
