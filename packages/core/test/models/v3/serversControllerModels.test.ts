import { beforeEach, describe, expect, it, vi } from 'vitest'

const badArgumentMock = vi.fn()
vi.mock('../../../src/utils/tools.js', () => ({ badArgument: badArgumentMock }))

const logServerMock = vi.fn()
vi.mock('../../../src/utils/logger.js', () => ({ logServer: logServerMock }))

const enqueueDiscordServerStatusRefreshAsyncMock = vi.fn()
vi.mock('@gmod/infra-bullmq/discordQueueAdapters.js', () => ({
  enqueueDiscordServerStatusRefreshAsync: enqueueDiscordServerStatusRefreshAsyncMock,
}))

const prismaMock: any = {
  gm_server_status: { findFirst: vi.fn() },
  gm_server_warn: { findFirst: vi.fn(), create: vi.fn() },
}
vi.mock('@gmod/infra-prisma', () => ({ default: prismaMock }))

const {
  processPostIGSettings,
  processPostStatus,
  processServerImportWarns,
  processDarkRPDropMoney,
  processDarkRPPickedUpMoney,
  processDarkRPPickedUpCheque,
  processCHATMTakeMoney,
  processCHATMReceiveMoney,
  processCHATMSendMoney,
  processCHATMWithdrawMoney,
  processCHATMDepositMoney,
  processMultiLog,
} = await import('../../../src/models/v3/serversControllerModels.js')

function resetAllMocks() {
  badArgumentMock.mockReset().mockReturnValue(false)
  logServerMock.mockReset()
  enqueueDiscordServerStatusRefreshAsyncMock.mockReset().mockResolvedValue(undefined)
  for (const table of Object.values(prismaMock)) {
    for (const fn of Object.values(table as Record<string, any>)) {
      ;(fn as ReturnType<typeof vi.fn>).mockReset()
    }
  }
}

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

// team: {} has no defaults in Team's constructor, so isValid() (and therefore
// PlayerGmod.isValid()) is guaranteed false without the constructor itself throwing.
function invalidPlayerPayload() {
  return { ...validPlayerPayload(), team: {} }
}

function makeServer(overrides: Record<string, any> = {}) {
  return {
    getID: () => 's1',
    saveIGSettings: vi.fn().mockResolvedValue(undefined),
    saveStatus: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as any
}

describe('serversControllerModels', () => {
  beforeEach(() => {
    resetAllMocks()
  })

  describe('processPostIGSettings', () => {
    it('returns 400 when settings is missing', async () => {
      const result = await processPostIGSettings(makeServer(), undefined)
      expect(result.status).toBe(400)
    })

    it('returns 400 when settings is not an object', async () => {
      const result = await processPostIGSettings(makeServer(), 'not-an-object')
      expect(result.status).toBe(400)
    })

    it('saves the settings and returns 200', async () => {
      const server = makeServer()
      const result = await processPostIGSettings(server, { debug: true })
      expect(server.saveIGSettings).toHaveBeenCalledWith({ debug: true })
      expect(result).toEqual({ status: 200, body: { success: true } })
    })
  })

  describe('processPostStatus', () => {
    const validBody = {
      players: 5,
      playersList: [{ name: 'Bob' }],
      maxPlayers: 10,
      map: 'gm_construct',
      hostname: 'My Server',
      gameMode: 'sandbox',
      port: '27015',
      ip: '1.2.3.4',
      uptime: 1000,
    }

    it('returns 400 when required fields are missing', async () => {
      badArgumentMock.mockReturnValueOnce(true)
      const result = await processPostStatus(makeServer(), {})
      expect(result.status).toBe(400)
    })

    it('saves the status and enqueues a Discord refresh when player count is non-zero', async () => {
      prismaMock.gm_server_status.findFirst.mockResolvedValueOnce(null)
      const server = makeServer()

      const result = await processPostStatus(server, validBody)

      expect(server.saveStatus).toHaveBeenCalledWith('1.2.3.4', '27015', 'My Server', 'gm_construct', 'sandbox', 5, 10, 1000, [
        { name: 'Bob' },
      ])
      expect(enqueueDiscordServerStatusRefreshAsyncMock).toHaveBeenCalledWith('s1')
      expect(result).toEqual({ status: 200, body: { success: true } })
    })

    it('defaults playersList to [] when missing', async () => {
      prismaMock.gm_server_status.findFirst.mockResolvedValueOnce(null)
      const server = makeServer()
      const { playersList: _playersList, ...bodyWithoutList } = validBody

      await processPostStatus(server, bodyWithoutList)

      expect(server.saveStatus).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        [],
      )
    })

    it('skips the Discord refresh when zero players persisted recently (within 5 minutes)', async () => {
      prismaMock.gm_server_status.findFirst.mockResolvedValueOnce({
        players: 0,
        updatedAt: new Date(),
      })
      const server = makeServer()

      await processPostStatus(server, { ...validBody, players: 0 })

      expect(enqueueDiscordServerStatusRefreshAsyncMock).not.toHaveBeenCalled()
    })

    it('still refreshes when zero players but the previous zero-status is stale (over 5 minutes old)', async () => {
      prismaMock.gm_server_status.findFirst.mockResolvedValueOnce({
        players: 0,
        updatedAt: new Date(Date.now() - 10 * 60 * 1000),
      })
      const server = makeServer()

      await processPostStatus(server, { ...validBody, players: 0 })

      expect(enqueueDiscordServerStatusRefreshAsyncMock).toHaveBeenCalled()
    })

    it('still refreshes when zero players but there was no previous status row', async () => {
      prismaMock.gm_server_status.findFirst.mockResolvedValueOnce(null)
      const server = makeServer()

      await processPostStatus(server, { ...validBody, players: 0 })

      expect(enqueueDiscordServerStatusRefreshAsyncMock).toHaveBeenCalled()
    })

    it('still refreshes when previous status had non-zero players', async () => {
      prismaMock.gm_server_status.findFirst.mockResolvedValueOnce({
        players: 5,
        updatedAt: new Date(Date.now() - 10 * 60 * 1000),
      })
      const server = makeServer()

      await processPostStatus(server, { ...validBody, players: 0 })

      expect(enqueueDiscordServerStatusRefreshAsyncMock).toHaveBeenCalled()
    })

    it('logs and swallows a failure enqueueing the Discord refresh', async () => {
      prismaMock.gm_server_status.findFirst.mockResolvedValueOnce(null)
      enqueueDiscordServerStatusRefreshAsyncMock.mockRejectedValueOnce(new Error('queue down'))
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const server = makeServer()

      const result = await processPostStatus(server, validBody)
      await vi.waitFor(() => expect(errorSpy).toHaveBeenCalled())

      expect(result).toEqual({ status: 200, body: { success: true } })
    })
  })

  describe('processServerImportWarns', () => {
    it('returns 400 when warns is missing', async () => {
      const result = await processServerImportWarns(makeServer(), undefined)
      expect(result.status).toBe(400)
    })

    it('skips a warn entry missing adminSteamID64/playerSteamID64/date', async () => {
      const result = await processServerImportWarns(makeServer(), [{ adminSteamID64: 'a1' }])
      expect(prismaMock.gm_server_warn.create).not.toHaveBeenCalled()
      expect(result).toEqual({ status: 200, body: { success: true } })
    })

    it('skips a warn entry with an unparseable date', async () => {
      await processServerImportWarns(makeServer(), [
        { adminSteamID64: 'a1', playerSteamID64: 'p1', date: {} },
      ])
      expect(prismaMock.gm_server_warn.create).not.toHaveBeenCalled()
    })

    it('accepts a numeric-string epoch-seconds date', async () => {
      prismaMock.gm_server_warn.findFirst.mockResolvedValueOnce(null)
      await processServerImportWarns(makeServer(), [
        { adminSteamID64: 'a1', playerSteamID64: 'p1', date: '1700000000', reason: 'cheat' },
      ])
      expect(prismaMock.gm_server_warn.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ reason: 'cheat' }) }),
      )
    })

    it('accepts a numeric epoch-seconds date and defaults the reason', async () => {
      prismaMock.gm_server_warn.findFirst.mockResolvedValueOnce(null)
      await processServerImportWarns(makeServer(), [
        { adminSteamID64: 'a1', playerSteamID64: 'p1', date: 1700000000 },
      ])
      expect(prismaMock.gm_server_warn.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ reason: 'No reason provided' }) }),
      )
    })

    it('skips a warn that already exists', async () => {
      prismaMock.gm_server_warn.findFirst.mockResolvedValueOnce({ id: 1 })
      await processServerImportWarns(makeServer(), [
        { adminSteamID64: 'a1', playerSteamID64: 'p1', date: 1700000000 },
      ])
      expect(prismaMock.gm_server_warn.create).not.toHaveBeenCalled()
    })

    it('processes multiple warns in one call', async () => {
      prismaMock.gm_server_warn.findFirst.mockResolvedValue(null)
      await processServerImportWarns(makeServer(), [
        { adminSteamID64: 'a1', playerSteamID64: 'p1', date: 1700000000 },
        { adminSteamID64: 'a2', playerSteamID64: 'p2', date: 1700000001 },
      ])
      expect(prismaMock.gm_server_warn.create).toHaveBeenCalledTimes(2)
    })
  })

  describe('player-log endpoints (dark_rp / ch_atm)', () => {
    it('processDarkRPDropMoney: returns 400 on missing arguments', async () => {
      badArgumentMock.mockReturnValueOnce(true)
      const result = await processDarkRPDropMoney(makeServer(), {})
      expect(result.status).toBe(400)
    })

    it('processDarkRPDropMoney: returns player_bad_format for an invalid player', async () => {
      const result = await processDarkRPDropMoney(makeServer(), {
        player: invalidPlayerPayload(),
        amount: 100,
        entity: 'money_entity',
      })
      expect(result.status).toBe(400)
      expect((result.body as any).error).toBe('player_bad_format')
    })

    it('processDarkRPDropMoney: logs the event, rounding the amount', async () => {
      const result = await processDarkRPDropMoney(makeServer(), {
        player: validPlayerPayload(),
        amount: 100.6,
        entity: 'money_entity',
      })
      expect(logServerMock).toHaveBeenCalledWith(
        expect.anything(),
        'dark_rp_drop_money',
        expect.objectContaining({ amount: 101 }),
      )
      expect(result).toEqual({ status: 200, body: { success: true } })
    })

    it('processDarkRPPickedUpMoney: logs the event', async () => {
      await processDarkRPPickedUpMoney(makeServer(), {
        player: validPlayerPayload(),
        amount: 50,
        entity: 'money_entity',
      })
      expect(logServerMock).toHaveBeenCalledWith(expect.anything(), 'dark_rp_picked_up_money', expect.anything())
    })

    it('processDarkRPPickedUpMoney: returns 400 for missing arguments', async () => {
      badArgumentMock.mockReturnValueOnce(true)
      const result = await processDarkRPPickedUpMoney(makeServer(), {})
      expect(result.status).toBe(400)
    })

    it('processDarkRPPickedUpMoney: returns player_bad_format for an invalid player', async () => {
      const result = await processDarkRPPickedUpMoney(makeServer(), {
        player: invalidPlayerPayload(),
        amount: 50,
        entity: 'e',
      })
      expect(result.status).toBe(400)
    })

    it('processDarkRPPickedUpCheque: returns 400 for missing arguments', async () => {
      badArgumentMock.mockReturnValueOnce(true)
      const result = await processDarkRPPickedUpCheque(makeServer(), {})
      expect(result.status).toBe(400)
    })

    it('processDarkRPPickedUpCheque: returns player_bad_format when the writer is invalid', async () => {
      const result = await processDarkRPPickedUpCheque(makeServer(), {
        playerChequeWriter: invalidPlayerPayload(),
        playerChequeTarget: validPlayerPayload(),
        amount: 10,
        entity: 'e',
      })
      expect(result.status).toBe(400)
    })

    it('processDarkRPPickedUpCheque: returns player_bad_format when the target is invalid', async () => {
      const result = await processDarkRPPickedUpCheque(makeServer(), {
        playerChequeWriter: validPlayerPayload(),
        playerChequeTarget: invalidPlayerPayload(),
        amount: 10,
        entity: 'e',
      })
      expect(result.status).toBe(400)
    })

    it('processDarkRPPickedUpCheque: logs the event when both players are valid', async () => {
      const result = await processDarkRPPickedUpCheque(makeServer(), {
        playerChequeWriter: validPlayerPayload({ steamID64: '111' }),
        playerChequeTarget: validPlayerPayload({ steamID64: '222' }),
        amount: 10,
        entity: 'e',
      })
      expect(logServerMock).toHaveBeenCalledWith(expect.anything(), 'dark_rp_picked_up_cheque', expect.anything())
      expect(result).toEqual({ status: 200, body: { success: true } })
    })

    it('processCHATMTakeMoney: returns 400 for missing arguments', async () => {
      badArgumentMock.mockReturnValueOnce(true)
      const result = await processCHATMTakeMoney(makeServer(), {})
      expect(result.status).toBe(400)
    })

    it('processCHATMTakeMoney: returns player_bad_format for an invalid player', async () => {
      const result = await processCHATMTakeMoney(makeServer(), {
        player: invalidPlayerPayload(),
        amount: 10,
        reason: 'r',
      })
      expect(result.status).toBe(400)
    })

    it('processCHATMTakeMoney: logs the event', async () => {
      await processCHATMTakeMoney(makeServer(), { player: validPlayerPayload(), amount: 10, reason: 'r' })
      expect(logServerMock).toHaveBeenCalledWith(expect.anything(), 'ch_atm_take_money', expect.anything())
    })

    it('processCHATMReceiveMoney: returns 400 for missing arguments', async () => {
      badArgumentMock.mockReturnValueOnce(true)
      const result = await processCHATMReceiveMoney(makeServer(), {})
      expect(result.status).toBe(400)
    })

    it('processCHATMReceiveMoney: returns player_bad_format for an invalid player', async () => {
      const result = await processCHATMReceiveMoney(makeServer(), {
        player: invalidPlayerPayload(),
        amount: 10,
        reason: 'r',
      })
      expect(result.status).toBe(400)
    })

    it('processCHATMReceiveMoney: logs the event', async () => {
      await processCHATMReceiveMoney(makeServer(), { player: validPlayerPayload(), amount: 10, reason: 'r' })
      expect(logServerMock).toHaveBeenCalledWith(expect.anything(), 'ch_atm_receive_money', expect.anything())
    })

    it('processCHATMSendMoney: returns 400 for missing arguments', async () => {
      badArgumentMock.mockReturnValueOnce(true)
      const result = await processCHATMSendMoney(makeServer(), {})
      expect(result.status).toBe(400)
    })

    it('processCHATMSendMoney: returns player_bad_format when the sender is invalid', async () => {
      const result = await processCHATMSendMoney(makeServer(), {
        player: invalidPlayerPayload(),
        receiver: validPlayerPayload({ steamID64: '222' }),
        amount: 10,
      })
      expect(result.status).toBe(400)
    })

    it('processCHATMSendMoney: returns player_bad_format when the receiver is invalid', async () => {
      const result = await processCHATMSendMoney(makeServer(), {
        player: validPlayerPayload(),
        receiver: invalidPlayerPayload(),
        amount: 10,
      })
      expect(result.status).toBe(400)
    })

    it('processCHATMSendMoney: logs the event when both players are valid', async () => {
      await processCHATMSendMoney(makeServer(), {
        player: validPlayerPayload({ steamID64: '111' }),
        receiver: validPlayerPayload({ steamID64: '222' }),
        amount: 10,
      })
      expect(logServerMock).toHaveBeenCalledWith(expect.anything(), 'ch_atm_send_money', expect.anything())
    })

    it('processCHATMWithdrawMoney: returns 400 for missing arguments', async () => {
      badArgumentMock.mockReturnValueOnce(true)
      const result = await processCHATMWithdrawMoney(makeServer(), {})
      expect(result.status).toBe(400)
    })

    it('processCHATMWithdrawMoney: returns player_bad_format for an invalid player', async () => {
      const result = await processCHATMWithdrawMoney(makeServer(), { player: invalidPlayerPayload(), amount: 10 })
      expect(result.status).toBe(400)
    })

    it('processCHATMWithdrawMoney: logs the event', async () => {
      await processCHATMWithdrawMoney(makeServer(), { player: validPlayerPayload(), amount: 10 })
      expect(logServerMock).toHaveBeenCalledWith(expect.anything(), 'ch_atm_withdraw_money', expect.anything())
    })

    it('processCHATMDepositMoney: returns 400 for missing arguments', async () => {
      badArgumentMock.mockReturnValueOnce(true)
      const result = await processCHATMDepositMoney(makeServer(), {})
      expect(result.status).toBe(400)
    })

    it('processCHATMDepositMoney: returns player_bad_format for an invalid player', async () => {
      const result = await processCHATMDepositMoney(makeServer(), { player: invalidPlayerPayload(), amount: 10 })
      expect(result.status).toBe(400)
    })

    it('processCHATMDepositMoney: logs the event', async () => {
      await processCHATMDepositMoney(makeServer(), { player: validPlayerPayload(), amount: 10 })
      expect(logServerMock).toHaveBeenCalledWith(expect.anything(), 'ch_atm_deposit_money', expect.anything())
    })
  })

  describe('processMultiLog', () => {
    it('skips a log entry missing endpoint or data', async () => {
      await processMultiLog(makeServer(), [{ endpoint: '', data: {} }, { endpoint: '/x', data: null }])
      expect(logServerMock).not.toHaveBeenCalled()
    })

    it('logs directly for an endpoint mapped to a log type', async () => {
      await processMultiLog(makeServer(), [
        { endpoint: '/servers/s1/players/765/ready', data: { steamID64: '765' } },
      ])
      expect(logServerMock).toHaveBeenCalledWith(expect.anything(), 'player_ready', { steamID64: '765' })
    })

    it('injects the object name from the endpoint for player_spawn_object', async () => {
      await processMultiLog(makeServer(), [
        { endpoint: '/servers/s1/players/765/spawn/prop_physics', data: { steamID64: '765' } },
      ])
      expect(logServerMock).toHaveBeenCalledWith(
        expect.anything(),
        'player_spawn_object',
        expect.objectContaining({ object: 'prop_physics' }),
      )
    })

    it('delegates to the mapped action handler for a dark_rp/ch_atm endpoint', async () => {
      await processMultiLog(makeServer(), [
        {
          endpoint: '/servers/s1/players/765/dark-rp/drop-money',
          data: { player: validPlayerPayload(), amount: 10, entity: 'e' },
        },
      ])
      expect(logServerMock).toHaveBeenCalledWith(expect.anything(), 'dark_rp_drop_money', expect.anything())
    })

    it('swallows an error thrown by the delegated action handler', async () => {
      // badArgument([undefined, ...]) is mocked false here so the handler proceeds past its
      // own missing-arguments check straight into `new PlayerGmod(undefined, false)`, which
      // throws (a wholly-missing player object still crashes on its first field access even
      // with throwMissing=false) - this is what actually exercises the `.catch(() => {})` below.
      await expect(
        processMultiLog(makeServer(), [
          { endpoint: '/servers/s1/players/765/dark-rp/drop-money', data: { amount: 10, entity: 'e' } },
        ]),
      ).resolves.toEqual({ status: 200, body: { success: true } })
    })

    it('skips an endpoint that matches neither map', async () => {
      await processMultiLog(makeServer(), [{ endpoint: '/servers/s1/unknown', data: { a: 1 } }])
      expect(logServerMock).not.toHaveBeenCalled()
    })

    it('processes multiple log entries in one call', async () => {
      await processMultiLog(makeServer(), [
        { endpoint: '/servers/s1/players/765/ready', data: { a: 1 } },
        { endpoint: '/servers/s1/players/765/spawn', data: { a: 2 } },
      ])
      expect(logServerMock).toHaveBeenCalledTimes(2)
    })
  })
})
