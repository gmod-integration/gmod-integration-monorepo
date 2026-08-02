import { beforeEach, describe, expect, it, vi } from 'vitest'

const logServerMock = vi.fn()
vi.mock('@gmod/core/utils/logger.js', () => ({ logServer: logServerMock }))

const modelMocks = {
  processPlayerChangeGroup: vi.fn(),
  processPlayerChangeName: vi.fn(),
  processPlayerChangeTeam: vi.fn(),
  processPlayerConnect: vi.fn(),
  processPlayerDisconnect: vi.fn(),
  processPlayerSay: vi.fn(),
  processPlayerWarn: vi.fn(),
}
vi.mock('@gmod/core/models/v3/serversPlayersControllerModels.js', () => modelMocks)

const {
  getPlayer,
  playerSpawn,
  playerReady,
  playerSay,
  playerChangeName,
  playerChangeGroup,
  playerChangeTeam,
  playerConnect,
  playerDisconnect,
  playerDeath,
  playerHurt,
  playerGive,
  playerInitialSpawn,
  playerSpawnObject,
  playerWarn,
  playerBan,
} = await import('../../../src/controllers/v3/serversPlayersController.js')

function makeRes() {
  const res: any = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  res.send = vi.fn().mockReturnValue(res)
  return res
}

describe('serversPlayersController', () => {
  beforeEach(() => {
    logServerMock.mockReset()
    for (const fn of Object.values(modelMocks)) fn.mockReset()
  })

  describe('getPlayer', () => {
    it('sends the found player stats', async () => {
      const server = { getPlayerStats: vi.fn().mockResolvedValueOnce({ id: 1 }) }
      const res = makeRes()
      await getPlayer({ params: { steamID64: '765' }, server } as any, res)
      expect(server.getPlayerStats).toHaveBeenCalledWith('765')
      expect(res.send).toHaveBeenCalledWith({ id: 1 })
    })

    it('sends an empty object when no stats are found', async () => {
      const server = { getPlayerStats: vi.fn().mockResolvedValueOnce(null) }
      const res = makeRes()
      await getPlayer({ params: { steamID64: '765' }, server } as any, res)
      expect(res.send).toHaveBeenCalledWith({})
    })

    it('extracts the first element of an array-valued steamID64 param', async () => {
      const server = { getPlayerStats: vi.fn().mockResolvedValueOnce({ id: 1 }) }
      await getPlayer({ params: { steamID64: ['765', '111'] }, server } as any, makeRes())
      expect(server.getPlayerStats).toHaveBeenCalledWith('765')
    })
  })

  const simpleLogCases: Array<{ name: string; controller: (req: any, res: any) => Promise<any>; type: string }> = [
    { name: 'playerSpawn', controller: playerSpawn, type: 'player_spawn' },
    { name: 'playerReady', controller: playerReady, type: 'player_ready' },
    { name: 'playerDeath', controller: playerDeath, type: 'player_death' },
    { name: 'playerHurt', controller: playerHurt, type: 'player_hurt' },
    { name: 'playerGive', controller: playerGive, type: 'player_give' },
    { name: 'playerInitialSpawn', controller: playerInitialSpawn, type: 'player_initial_spawn' },
  ]

  for (const { name, controller, type } of simpleLogCases) {
    it(`${name} logs ${type} and responds success`, async () => {
      const server = {}
      const res = makeRes()
      await controller({ server, body: { a: 1 }, params: {} } as any, res)
      expect(logServerMock).toHaveBeenCalledWith(server, type, { a: 1 })
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith({ success: true })
    })
  }

  it('playerSpawnObject logs with the object param merged into the body', async () => {
    const server = {}
    const res = makeRes()
    await playerSpawnObject({ server, body: { a: 1 }, params: { object: 'prop_physics' } } as any, res)
    expect(logServerMock).toHaveBeenCalledWith(server, 'player_spawn_object', { object: 'prop_physics', a: 1 })
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('playerSay logs then delegates to processPlayerSay', async () => {
    modelMocks.processPlayerSay.mockResolvedValueOnce({ status: 200, body: { success: true } })
    const server = {}
    const res = makeRes()

    await playerSay({ server, params: { steamID64: '765' }, body: { text: 'hi' } } as any, res)

    expect(logServerMock).toHaveBeenCalledWith(server, 'player_say', { text: 'hi' })
    expect(modelMocks.processPlayerSay).toHaveBeenCalledWith(server, '765', { text: 'hi' })
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('playerChangeName logs then delegates to processPlayerChangeName', async () => {
    modelMocks.processPlayerChangeName.mockResolvedValueOnce({ status: 200, body: { success: true } })
    const server = {}
    const res = makeRes()

    await playerChangeName({ server, body: { newName: 'Bob' }, params: {} } as any, res)

    expect(modelMocks.processPlayerChangeName).toHaveBeenCalledWith(server, { newName: 'Bob' })
  })

  it('playerChangeGroup logs with steamID64 merged, then delegates', async () => {
    modelMocks.processPlayerChangeGroup.mockResolvedValueOnce({ status: 200, body: { success: true } })
    const server = {}
    const res = makeRes()

    await playerChangeGroup({ server, params: { steamID64: '765' }, body: { newGroup: 'admin' } } as any, res)

    expect(logServerMock).toHaveBeenCalledWith(server, 'player_change_group', { steamID64: '765', newGroup: 'admin' })
    expect(modelMocks.processPlayerChangeGroup).toHaveBeenCalledWith(server, '765', { newGroup: 'admin' })
  })

  it('playerChangeTeam logs with steamID64 merged, then delegates', async () => {
    modelMocks.processPlayerChangeTeam.mockResolvedValueOnce({ status: 200, body: { success: true } })
    const server = {}
    const res = makeRes()

    await playerChangeTeam({ server, params: { steamID64: '765' }, body: { newTeam: {} } } as any, res)

    expect(modelMocks.processPlayerChangeTeam).toHaveBeenCalledWith(server, '765', { newTeam: {} })
  })

  it('playerConnect logs with steamID64 merged, then delegates', async () => {
    modelMocks.processPlayerConnect.mockResolvedValueOnce({ status: 200, body: { success: true } })
    const server = {}
    const res = makeRes()

    await playerConnect({ server, params: { steamID64: '765' }, body: { name: 'Bob' } } as any, res)

    expect(modelMocks.processPlayerConnect).toHaveBeenCalledWith(server, '765', { name: 'Bob' })
  })

  it('playerDisconnect logs then delegates to processPlayerDisconnect', async () => {
    modelMocks.processPlayerDisconnect.mockResolvedValueOnce({ status: 200, body: { success: true } })
    const server = {}
    const res = makeRes()

    await playerDisconnect({ server, body: {}, params: {} } as any, res)

    expect(modelMocks.processPlayerDisconnect).toHaveBeenCalledWith(server, {})
  })

  it('playerWarn logs then delegates to processPlayerWarn', async () => {
    modelMocks.processPlayerWarn.mockResolvedValueOnce({ status: 200, body: { id: 1 } })
    const server = {}
    const res = makeRes()

    await playerWarn({ server, params: { steamID64: '765' }, body: { reason: 'cheat' } } as any, res)

    expect(modelMocks.processPlayerWarn).toHaveBeenCalledWith(server, '765', { reason: 'cheat' })
  })

  it('playerBan responds 400 not_implemented', async () => {
    const res = makeRes()
    await playerBan({} as any, res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'not_implemented' })
  })
})
