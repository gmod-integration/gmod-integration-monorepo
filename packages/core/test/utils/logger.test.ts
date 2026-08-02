import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let configServerMock: { dev: boolean }
vi.mock('@gmod/config', () => ({
  get ConfigServer() {
    return configServerMock
  },
  ConfigDiscord: { embedColor: '#ffffff', barerTokenRelay: 'relay-token' },
}))

class FakePlayerGmod {
  steamID64: string
  name: string
  team?: { name: string }
  constructor(obj: any) {
    if (!obj || !obj.steamID64) throw new Error('invalid player data')
    this.steamID64 = obj.steamID64
    this.name = obj.name
    this.team = obj.team
  }
  async getLogFormat(_lang: string) {
    return `logformat-${this.steamID64}`
  }
}
vi.mock('../../src/classes/v3/PlayerGmod.js', () => ({ PlayerGmod: FakePlayerGmod }))

const getRandomDiscordRelayMock = vi.fn(() => 'https://relay.example')
const ipGetIPMock = vi.fn((ip: string) => ip.split(':')[0])
vi.mock('../../src/utils/tools.js', () => ({
  getRandomDiscordRelay: getRandomDiscordRelayMock,
  ipGetIP: ipGetIPMock,
}))

const getTranslateMock = vi.fn(async (key: string) => key)
vi.mock('../../src/utils/localizations.js', () => ({ getTranslate: getTranslateMock }))

const addLogMock = vi.fn()
vi.mock('../../src/database/gm_server_logs.js', () => ({ addLog: addLogMock }))

const redisMock = { get: vi.fn(), set: vi.fn(), del: vi.fn() }
vi.mock('@gmod/infra-redis', () => ({ default: redisMock }))

const wsAddMock = vi.fn()
vi.mock('@gmod/infra-websocket/queues.js', () => ({
  wsSendToAllClientsOfServerQueue: { add: wsAddMock },
}))

const resolveGuildPreferredLocaleMock = vi.fn(async () => 'en')
vi.mock('../../src/utils/guildLocaleCache.js', () => ({
  resolveGuildPreferredLocale: resolveGuildPreferredLocaleMock,
}))

const enqueueDiscordGuildSendLogMessageMock = vi.fn()
vi.mock('@gmod/infra-bullmq/discordQueueAdapters.js', () => ({
  enqueueDiscordGuildSendLogMessage: enqueueDiscordGuildSendLogMessageMock,
}))

configServerMock = { dev: false }

const { gmLog, logServer } = await import('../../src/utils/logger.js')

function resetAllMocks() {
  getRandomDiscordRelayMock.mockClear()
  ipGetIPMock.mockClear()
  getTranslateMock.mockClear()
  addLogMock.mockReset()
  redisMock.get.mockReset()
  redisMock.set.mockReset()
  redisMock.del.mockReset()
  wsAddMock.mockReset()
  resolveGuildPreferredLocaleMock.mockReset().mockResolvedValue('en')
  enqueueDiscordGuildSendLogMessageMock.mockReset()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
}

function makeServer(overrides: Record<string, any> = {}) {
  return {
    id: 's1',
    getID: () => 's1',
    getGuildID: () => 'g1',
    getName: () => 'My Server',
    getCachedLogsChannel: vi.fn().mockResolvedValue(null),
    getSetting: vi.fn().mockResolvedValue(false),
    getLogsTriggerFromRedis: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as any
}

// Let any fire-and-forget promise chains inside logServer (handleLogsTrigger is called without
// being awaited) settle before assertions run.
async function flushMicrotasks() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('logger', () => {
  beforeEach(() => {
    resetAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('gmLog', () => {
    it('logs when debug is false', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      gmLog('status', 'hello')
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[STATUS] hello'))
    })

    it('logs when debug is true and dev mode is on', () => {
      configServerMock.dev = true
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      gmLog('status', 'debug message', true)
      expect(logSpy).toHaveBeenCalled()
      configServerMock.dev = false
    })

    it('skips logging when debug is true and dev mode is off', () => {
      configServerMock.dev = false
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      gmLog('status', 'debug message', true)
      expect(logSpy).not.toHaveBeenCalled()
    })
  })

  describe('logServer', () => {
    it('defaults data to {} when omitted', async () => {
      const server = makeServer()
      await logServer(server, 'server_start')
      expect(addLogMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'server_start' }))
    })

    it('swallows an invalid data.player and continues without parsing it', async () => {
      const server = makeServer()
      await logServer(server, 'unknown_type', { player: {} })
      expect(addLogMock).toHaveBeenCalled()
    })

    it('collects every distinct SteamID64 referenced anywhere in the payload', async () => {
      const server = makeServer()
      await logServer(server, 'unknown_type', {
        a: '76561198219049673',
        b: '76561198219049673',
        c: '76561198000000001',
      })
      expect(addLogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          playerInvolvedSteamID64: ['76561198219049673', '76561198000000001'],
        }),
      )
    })

    it('pushes a wsSendToAllClientsOfServer update after saving the log', async () => {
      const server = makeServer()
      await logServer(server, 'server_start')
      expect(wsAddMock).toHaveBeenCalledWith(
        'wsSendToAllClientsOfServer',
        expect.objectContaining({ id: 's1', action: 'server_logs' }),
      )
    })

    describe('per-type dscList construction', () => {
      it('player_connect: builds the name/ip lines and masks the IP when log_hide_ip is on', async () => {
        const server = makeServer({ getSetting: vi.fn().mockResolvedValue(true) })
        await logServer(server, 'player_connect', {
          steamID64: '765',
          name: 'Bob',
          address: '1.2.3.4:27015',
        })
        expect(ipGetIPMock).toHaveBeenCalledWith('1.2.3.4:27015')
        expect(addLogMock).toHaveBeenCalled()
      })

      it('player_connect: defaults name/address when missing', async () => {
        const server = makeServer()
        await logServer(server, 'player_connect', { steamID64: '765' })
        expect(ipGetIPMock).toHaveBeenCalledWith('Unknown')
      })

      it('player_disconnect: reads fields from data.player', async () => {
        const server = makeServer()
        await logServer(server, 'player_disconnect', {
          player: { steamID64: '765', name: 'Bob', connectTime: 120 },
        })
        expect(addLogMock).toHaveBeenCalled()
      })

      it('player_say: builds from getLogFormat plus text/teamOnly, defaulting both', async () => {
        const server = makeServer()
        await logServer(server, 'player_say', { player: { steamID64: '765', name: 'Bob' } })
        expect(addLogMock).toHaveBeenCalled()
      })

      it('player_say: uses the given text/teamOnly when provided', async () => {
        const server = makeServer()
        await logServer(server, 'player_say', {
          player: { steamID64: '765', name: 'Bob' },
          text: 'hello',
          teamOnly: true,
        })
        expect(addLogMock).toHaveBeenCalled()
      })

      it('player_spawn: builds from getLogFormat', async () => {
        const server = makeServer()
        await logServer(server, 'player_spawn', { player: { steamID64: '765', name: 'Bob' } })
        expect(addLogMock).toHaveBeenCalled()
      })

      it('player_change_name: defaults oldName/newName when missing', async () => {
        const server = makeServer()
        await logServer(server, 'player_change_name', { player: { steamID64: '765', name: 'Bob' } })
        expect(addLogMock).toHaveBeenCalled()
      })

      it('player_change_name: uses the given oldName/newName', async () => {
        const server = makeServer()
        await logServer(server, 'player_change_name', {
          player: { steamID64: '765', name: 'Bob' },
          oldName: 'Old',
          newName: 'New',
        })
        expect(addLogMock).toHaveBeenCalled()
      })

      it('player_change_group: defaults oldGroup/newGroup when missing', async () => {
        const server = makeServer()
        await logServer(server, 'player_change_group', { steamID64: '765', player: { steamID64: '765', name: 'Bob' } })
        expect(addLogMock).toHaveBeenCalled()
      })

      it('player_change_team: reads team names, defaulting when absent', async () => {
        const server = makeServer()
        await logServer(server, 'player_change_team', {
          steamID64: '765',
          player: { steamID64: '765', name: 'Bob' },
          oldTeam: { name: 'Red' },
          newTeam: { name: 'Blue' },
        })
        expect(addLogMock).toHaveBeenCalled()
      })

      it('player_change_team: defaults team names when absent', async () => {
        const server = makeServer()
        await logServer(server, 'player_change_team', {
          steamID64: '765',
          player: { steamID64: '765', name: 'Bob' },
        })
        expect(addLogMock).toHaveBeenCalled()
      })

      it('player_spawn_object: uses model translation when object === "object"', async () => {
        const server = makeServer()
        await logServer(server, 'player_spawn_object', {
          player: { steamID64: '765', name: 'Bob' },
          object: 'object',
          model: 'models/foo.mdl',
        })
        expect(addLogMock).toHaveBeenCalled()
      })

      it('player_spawn_object: uses entity.class when object is not "object"', async () => {
        const server = makeServer()
        await logServer(server, 'player_spawn_object', {
          player: { steamID64: '765', name: 'Bob' },
          object: 'entity',
          entity: { class: 'spawned_money' },
        })
        expect(addLogMock).toHaveBeenCalled()
      })

      it('player_spawn_object: defaults model/object/entity when missing', async () => {
        const server = makeServer()
        await logServer(server, 'player_spawn_object', { player: { steamID64: '765', name: 'Bob' } })
        expect(addLogMock).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ model: 'Unknown', object: 'Unknown', entity: 'Unknown' }),
          }),
        )
      })

      it('player_warned: builds admin + player + reason, defaulting reason', async () => {
        const server = makeServer()
        await logServer(server, 'player_warned', {
          admin: { steamID64: '111', name: 'Admin' },
          player: { steamID64: '765', name: 'Bob' },
        })
        expect(addLogMock).toHaveBeenCalled()
      })

      it('player_give: reads swep info, defaulting when swep is absent', async () => {
        const server = makeServer()
        await logServer(server, 'player_give', { player: { steamID64: '765', name: 'Bob' } })
        expect(addLogMock).toHaveBeenCalled()
      })

      it('player_give: reads the given swep name/class', async () => {
        const server = makeServer()
        await logServer(server, 'player_give', {
          player: { steamID64: '765', name: 'Bob' },
          swep: { PrintName: 'Pistol', ClassName: 'weapon_pistol' },
        })
        expect(addLogMock).toHaveBeenCalled()
      })

      it('server_start / server_stop: no extra fields are added', async () => {
        const server = makeServer()
        await logServer(server, 'server_stop')
        expect(addLogMock).toHaveBeenCalledWith(expect.objectContaining({ data: {} }))
      })

      it('player_death: parses a valid attacker', async () => {
        const server = makeServer()
        await logServer(server, 'player_death', {
          attacker: { steamID64: '111', name: 'Killer' },
          player: { steamID64: '765', name: 'Bob' },
        })
        expect(addLogMock).toHaveBeenCalled()
      })

      it('player_death: falls back to the raw attacker/entity class when attacker parsing throws', async () => {
        const server = makeServer()
        await logServer(server, 'player_death', {
          attacker: { class: 'trigger_hurt' },
          player: { steamID64: '765', name: 'Bob' },
        })
        expect(addLogMock).toHaveBeenCalled()
      })

      it('player_hurt: parses a valid attacker and victim', async () => {
        const server = makeServer()
        await logServer(server, 'player_hurt', {
          attacker: { steamID64: '111', name: 'Attacker' },
          victim: { steamID64: '765', name: 'Bob' },
        })
        expect(addLogMock).toHaveBeenCalled()
      })

      it('player_hurt: falls back to the raw attacker/entity class when attacker parsing throws, defaulting health/damage', async () => {
        const server = makeServer()
        await logServer(server, 'player_hurt', {
          attacker: { class: 'trigger_hurt' },
          victim: { steamID64: '765', name: 'Bob' },
        })
        expect(addLogMock).toHaveBeenCalled()
      })

      it('player_initial_spawn: reads player fields', async () => {
        const server = makeServer()
        await logServer(server, 'player_initial_spawn', { player: { steamID64: '765', name: 'Bob' } })
        expect(addLogMock).toHaveBeenCalled()
      })

      it('dark_rp_drop_money: reads amount (defaulted) and player/entity', async () => {
        const server = makeServer()
        await logServer(server, 'dark_rp_drop_money', { player: { steamID64: '765', name: 'Bob' } })
        expect(addLogMock).toHaveBeenCalled()
      })

      it('dark_rp_picked_up_money: reads the given amount', async () => {
        const server = makeServer()
        await logServer(server, 'dark_rp_picked_up_money', {
          player: { steamID64: '765', name: 'Bob' },
          amount: 500,
        })
        expect(addLogMock).toHaveBeenCalled()
      })

      it('dark_rp_picked_up_money: defaults amount to 0 when missing', async () => {
        const server = makeServer()
        await logServer(server, 'dark_rp_picked_up_money', { player: { steamID64: '765', name: 'Bob' } })
        expect(addLogMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amount: 0 }) }))
      })

      it('dark_rp_picked_up_cheque: reads writer and target players', async () => {
        const server = makeServer()
        await logServer(server, 'dark_rp_picked_up_cheque', {
          playerChequeWriter: { steamID64: '111', name: 'Writer' },
          playerChequeTarget: { steamID64: '765', name: 'Target' },
        })
        expect(addLogMock).toHaveBeenCalled()
      })

      it('ch_atm_send_money: reads sender/receiver', async () => {
        const server = makeServer()
        await logServer(server, 'ch_atm_send_money', {
          player: { steamID64: '765', name: 'Bob' },
          receiver: { steamID64: '111', name: 'Receiver' },
        })
        expect(addLogMock).toHaveBeenCalled()
      })

      it('ch_atm_receive_money: reads amount and reason', async () => {
        const server = makeServer()
        await logServer(server, 'ch_atm_receive_money', {
          player: { steamID64: '765', name: 'Bob' },
          reason: 'salary',
        })
        expect(addLogMock).toHaveBeenCalled()
      })

      it('ch_atm_take_money: reads amount and reason', async () => {
        const server = makeServer()
        await logServer(server, 'ch_atm_take_money', {
          player: { steamID64: '765', name: 'Bob' },
          reason: 'fine',
        })
        expect(addLogMock).toHaveBeenCalled()
      })

      it('ch_atm_withdraw_money: reads amount', async () => {
        const server = makeServer()
        await logServer(server, 'ch_atm_withdraw_money', { player: { steamID64: '765', name: 'Bob' } })
        expect(addLogMock).toHaveBeenCalled()
      })

      it('ch_atm_deposit_money: reads amount', async () => {
        const server = makeServer()
        await logServer(server, 'ch_atm_deposit_money', { player: { steamID64: '765', name: 'Bob' } })
        expect(addLogMock).toHaveBeenCalled()
      })

      describe('default/else branch (unrecognized type)', () => {
        it('includes every optional field when present, moving data.player to dataToSave.ply', async () => {
          const server = makeServer()
          await logServer(server, 'totally_custom_type', {
            steamID64: '765',
            name: 'Bob',
            team: { name: 'Red' },
            player: { steamID64: '765', name: 'Bob', team: { name: 'Red' } },
            ip: '1.2.3.4',
          })
          expect(addLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
              data: expect.objectContaining({
                steamID64: '765',
                name: 'Bob',
                team: { name: 'Red' },
                ip: '1.2.3.4',
                ply: expect.objectContaining({ steamID64: '765' }),
              }),
            }),
          )
        })

        it('omits every optional field when absent', async () => {
          const server = makeServer()
          await logServer(server, 'totally_custom_type', {})
          expect(addLogMock).toHaveBeenCalledWith(expect.objectContaining({ data: {} }))
        })
      })
    })

    describe('relay webhook delivery', () => {
      it('does nothing extra when there is no logs channel configured', async () => {
        const server = makeServer({ getCachedLogsChannel: vi.fn().mockResolvedValue(null) })
        await logServer(server, 'server_start')
        expect(globalThis.fetch).not.toHaveBeenCalled()
      })

      it('sends the embed via the relay and includes the file when log_include_file is on', async () => {
        const server = makeServer({
          getCachedLogsChannel: vi.fn().mockResolvedValue({ webhookID: 'wh1', webhookToken: 'tok' }),
          getSetting: vi.fn().mockResolvedValue(true),
        })
        const fetchMock = vi.fn().mockResolvedValue({ ok: true })
        vi.stubGlobal('fetch', fetchMock)

        const result = await logServer(server, 'player_connect', {
          steamID64: '765',
          name: 'Bob',
          address: '1.2.3.4',
        })

        expect(fetchMock).toHaveBeenCalledWith(
          'https://relay.example',
          expect.objectContaining({ method: 'POST' }),
        )
        const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body)
        expect(body.data.filesToAdd).toHaveLength(1)
        expect(result).toBeUndefined()
      })

      it('does not include the file when log_include_file is off', async () => {
        const server = makeServer({
          getCachedLogsChannel: vi.fn().mockResolvedValue({ webhookID: 'wh1', webhookToken: 'tok' }),
          getSetting: vi.fn().mockResolvedValue(false),
        })
        const fetchMock = vi.fn().mockResolvedValue({ ok: true })
        vi.stubGlobal('fetch', fetchMock)

        await logServer(server, 'server_start')

        const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body)
        expect(body.data.filesToAdd).toHaveLength(0)
      })

      it('returns a skip result when the relay responds not-ok', async () => {
        const server = makeServer({
          getCachedLogsChannel: vi.fn().mockResolvedValue({ webhookID: 'wh1', webhookToken: 'tok' }),
        })
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))

        const result = await logServer(server, 'server_start')

        expect(result).toEqual({ skip: true, message: 'Webhook not found' })
      })

      it('masks data.address before building the export file when log_hide_ip is on', async () => {
        const server = makeServer({
          getCachedLogsChannel: vi.fn().mockResolvedValue({ webhookID: 'wh1', webhookToken: 'tok' }),
          getSetting: vi.fn().mockResolvedValue(true),
        })
        const fetchMock = vi.fn().mockResolvedValue({ ok: true })
        vi.stubGlobal('fetch', fetchMock)

        await logServer(server, 'player_connect', { steamID64: '765', name: 'Bob', address: '1.2.3.4' })

        const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body)
        expect(body.data.filesToAdd[0].content).toContain('xx.xx.xx.xx')
      })

      it('does not mask data.address when there is no address on the payload', async () => {
        const server = makeServer({
          getCachedLogsChannel: vi.fn().mockResolvedValue({ webhookID: 'wh1', webhookToken: 'tok' }),
        })
        const fetchMock = vi.fn().mockResolvedValue({ ok: true })
        vi.stubGlobal('fetch', fetchMock)

        await logServer(server, 'server_start')

        expect(fetchMock).toHaveBeenCalled()
      })

      it('uses the fallback embed color when the type has no dedicated color', async () => {
        const server = makeServer({
          getCachedLogsChannel: vi.fn().mockResolvedValue({ webhookID: 'wh1', webhookToken: 'tok' }),
        })
        const fetchMock = vi.fn().mockResolvedValue({ ok: true })
        vi.stubGlobal('fetch', fetchMock)

        await logServer(server, 'totally_custom_type', {})

        expect(fetchMock).toHaveBeenCalled()
      })

      it('sets a null description when dscList is empty', async () => {
        const server = makeServer({
          getCachedLogsChannel: vi.fn().mockResolvedValue({ webhookID: 'wh1', webhookToken: 'tok' }),
        })
        const fetchMock = vi.fn().mockResolvedValue({ ok: true })
        vi.stubGlobal('fetch', fetchMock)

        await logServer(server, 'server_start')

        expect(fetchMock).toHaveBeenCalled()
      })
    })

    describe('handleLogsTrigger (fire-and-forget side effect of logServer)', () => {
      it('does nothing when the server has no active triggers for this type', async () => {
        const server = makeServer({ getLogsTriggerFromRedis: vi.fn().mockResolvedValue([]) })
        await logServer(server, 'dark_rp_drop_money', { player: { steamID64: '765', name: 'Bob' }, amount: 100 })
        await flushMicrotasks()
        expect(enqueueDiscordGuildSendLogMessageMock).not.toHaveBeenCalled()
      })

      it('does nothing when the type has no available triggers array', async () => {
        const server = makeServer({ getLogsTriggerFromRedis: vi.fn().mockResolvedValue(null) })
        await logServer(server, 'dark_rp_drop_money', { player: { steamID64: '765', name: 'Bob' }, amount: 100 })
        await flushMicrotasks()
        expect(enqueueDiscordGuildSendLogMessageMock).not.toHaveBeenCalled()
      })

      it('sends a templated message when a numeric-compare trigger matches (greaterThan)', async () => {
        const server = makeServer({
          getLogsTriggerFromRedis: vi.fn().mockResolvedValue(['dark_rp_drop_money']),
        })
        redisMock.get.mockResolvedValueOnce(
          JSON.stringify([
            {
              compare: 'amount',
              operator: 'greaterThan',
              value: '50',
              action: 'sendMessageInChannel',
              channelID: 'ch1',
              message: 'Dropped {{data.amount}} by {{data.player.name}}',
            },
          ]),
        )
        enqueueDiscordGuildSendLogMessageMock.mockReturnValue(Promise.resolve())

        await logServer(server, 'dark_rp_drop_money', { player: { steamID64: '765', name: 'Bob' }, amount: 100 })
        await flushMicrotasks()

        expect(enqueueDiscordGuildSendLogMessageMock).toHaveBeenCalledWith(
          expect.objectContaining({
            guildID: 'g1',
            channelID: 'ch1',
            description: 'Dropped 100 by Bob',
          }),
          5000,
        )
      })

      it('skips a trigger when the compared field is not configured for this type', async () => {
        const server = makeServer({
          getLogsTriggerFromRedis: vi.fn().mockResolvedValue(['dark_rp_drop_money']),
        })
        redisMock.get.mockResolvedValueOnce(
          JSON.stringify([{ compare: 'not_a_real_field', operator: 'equal', value: 'x' }]),
        )

        await logServer(server, 'dark_rp_drop_money', { player: { steamID64: '765', name: 'Bob' }, amount: 100 })
        await flushMicrotasks()

        expect(enqueueDiscordGuildSendLogMessageMock).not.toHaveBeenCalled()
      })

      it('skips a null/falsy trigger entry in the list', async () => {
        const server = makeServer({
          getLogsTriggerFromRedis: vi.fn().mockResolvedValue(['dark_rp_drop_money']),
        })
        redisMock.get.mockResolvedValueOnce(JSON.stringify([null]))

        await logServer(server, 'dark_rp_drop_money', { player: { steamID64: '765', name: 'Bob' }, amount: 100 })
        await flushMicrotasks()

        expect(enqueueDiscordGuildSendLogMessageMock).not.toHaveBeenCalled()
      })

      it('skips a trigger for a type with no compare config at all', async () => {
        const server = makeServer({
          getLogsTriggerFromRedis: vi.fn().mockResolvedValue(['server_start']),
        })
        redisMock.get.mockResolvedValueOnce(JSON.stringify([{ compare: 'x', operator: 'equal', value: 'y' }]))

        await logServer(server, 'server_start', {})
        await flushMicrotasks()

        expect(enqueueDiscordGuildSendLogMessageMock).not.toHaveBeenCalled()
      })

      it('defaults to an empty trigger list in redis when nothing is cached', async () => {
        const server = makeServer({
          getLogsTriggerFromRedis: vi.fn().mockResolvedValue(['dark_rp_drop_money']),
        })
        redisMock.get.mockResolvedValueOnce(null)

        await logServer(server, 'dark_rp_drop_money', { player: { steamID64: '765', name: 'Bob' }, amount: 100 })
        await flushMicrotasks()

        expect(enqueueDiscordGuildSendLogMessageMock).not.toHaveBeenCalled()
      })

      it('skips (via the "equal" operator mismatch) when the compared field is missing on the payload', async () => {
        // data.amount is missing here, so newValue = parseFloat(undefined) = NaN - not
        // literally `undefined` (that's only possible through the string branch documented at
        // the source, which is unreachable with today's all-numeric trigger config) - but it
        // still correctly fails to match and no message is sent.
        const server = makeServer({
          getLogsTriggerFromRedis: vi.fn().mockResolvedValue(['dark_rp_drop_money']),
        })
        redisMock.get.mockResolvedValueOnce(
          JSON.stringify([{ compare: 'amount', operator: 'equal', value: '50' }]),
        )

        await logServer(server, 'dark_rp_drop_money', { player: { steamID64: '765', name: 'Bob' } })
        await flushMicrotasks()

        expect(enqueueDiscordGuildSendLogMessageMock).not.toHaveBeenCalled()
      })

      const operatorCases: Array<{ operator: string; matchingAmount: number; nonMatchingAmount: number }> = [
        { operator: 'greaterThan', matchingAmount: 100, nonMatchingAmount: 10 },
        { operator: 'lessThan', matchingAmount: 10, nonMatchingAmount: 100 },
        { operator: 'equal', matchingAmount: 50, nonMatchingAmount: 51 },
        { operator: 'notEqual', matchingAmount: 51, nonMatchingAmount: 50 },
      ]

      for (const { operator, matchingAmount, nonMatchingAmount } of operatorCases) {
        it(`matches and skips correctly for the "${operator}" operator`, async () => {
          const server = makeServer({
            getLogsTriggerFromRedis: vi.fn().mockResolvedValue(['dark_rp_drop_money']),
          })
          redisMock.get.mockResolvedValueOnce(
            JSON.stringify([
              { compare: 'amount', operator, value: '50', action: 'sendMessageInChannel', channelID: 'ch1', message: 'hit' },
            ]),
          )
          await logServer(server, 'dark_rp_drop_money', {
            player: { steamID64: '765', name: 'Bob' },
            amount: nonMatchingAmount,
          })
          await flushMicrotasks()
          expect(enqueueDiscordGuildSendLogMessageMock).not.toHaveBeenCalled()

          enqueueDiscordGuildSendLogMessageMock.mockClear()
          redisMock.get.mockResolvedValueOnce(
            JSON.stringify([
              { compare: 'amount', operator, value: '50', action: 'sendMessageInChannel', channelID: 'ch1', message: 'hit' },
            ]),
          )
          await logServer(server, 'dark_rp_drop_money', {
            player: { steamID64: '765', name: 'Bob' },
            amount: matchingAmount,
          })
          await flushMicrotasks()
          expect(enqueueDiscordGuildSendLogMessageMock).toHaveBeenCalled()
        })
      }

      // The string operators (contain/notContain/startWith/endWith) are matched against
      // `log_trigger_compare`-configured fields, and every field currently configured there is
      // `type: 'number'` - so newValue/compareValue are always numbers for any real trigger
      // today, and calling e.g. `.includes()` on them throws. That throw propagates out of
      // handleLogsTrigger and is swallowed by the `.catch(() => {})` logServer attaches to it
      // (fire-and-forget), so no message is ever sent - documented at the source line too.
      it('never sends a message for the contain/notContain/startWith/endWith operators, since every configured compare field is numeric', async () => {
        const server = makeServer({
          getLogsTriggerFromRedis: vi.fn().mockResolvedValue(['ch_atm_receive_money']),
        })
        redisMock.get.mockResolvedValueOnce(
          JSON.stringify([
            { compare: 'amount', operator: 'contain', value: '5', action: 'sendMessageInChannel', channelID: 'ch1', message: 'hit' },
          ]),
        )

        await logServer(server, 'ch_atm_receive_money', { player: { steamID64: '765', name: 'Bob' }, amount: 50 })
        await flushMicrotasks()

        expect(enqueueDiscordGuildSendLogMessageMock).not.toHaveBeenCalled()
      })

      it('ignores an action other than sendMessageInChannel', async () => {
        const server = makeServer({
          getLogsTriggerFromRedis: vi.fn().mockResolvedValue(['dark_rp_drop_money']),
        })
        redisMock.get.mockResolvedValueOnce(
          JSON.stringify([{ compare: 'amount', operator: 'equal', value: '100', action: 'somethingElse' }]),
        )

        await logServer(server, 'dark_rp_drop_money', { player: { steamID64: '765', name: 'Bob' }, amount: 100 })
        await flushMicrotasks()

        expect(enqueueDiscordGuildSendLogMessageMock).not.toHaveBeenCalled()
      })

      it('substitutes a nested {{data.path.to.value}} placeholder', async () => {
        const server = makeServer({
          getLogsTriggerFromRedis: vi.fn().mockResolvedValue(['dark_rp_drop_money']),
        })
        redisMock.get.mockResolvedValueOnce(
          JSON.stringify([
            {
              compare: 'amount',
              operator: 'equal',
              value: '100',
              action: 'sendMessageInChannel',
              channelID: 'ch1',
              message: 'By {{data.player.name}}',
            },
          ]),
        )

        await logServer(server, 'dark_rp_drop_money', { player: { steamID64: '765', name: 'Bob' }, amount: 100 })
        await flushMicrotasks()

        expect(enqueueDiscordGuildSendLogMessageMock).toHaveBeenCalledWith(
          expect.objectContaining({ description: 'By Bob' }),
          5000,
        )
      })

      it('replaces the placeholder with "undefined" when the nested path does not exist', async () => {
        const server = makeServer({
          getLogsTriggerFromRedis: vi.fn().mockResolvedValue(['dark_rp_drop_money']),
        })
        redisMock.get.mockResolvedValueOnce(
          JSON.stringify([
            {
              compare: 'amount',
              operator: 'equal',
              value: '100',
              action: 'sendMessageInChannel',
              channelID: 'ch1',
              message: 'Field: {{data.player.missingField}}',
            },
          ]),
        )

        await logServer(server, 'dark_rp_drop_money', { player: { steamID64: '765', name: 'Bob' }, amount: 100 })
        await flushMicrotasks()

        expect(enqueueDiscordGuildSendLogMessageMock).toHaveBeenCalledWith(
          expect.objectContaining({ description: 'Field: undefined' }),
          5000,
        )
      })

      it('leaves the message unchanged when there is no {{data...}} placeholder', async () => {
        const server = makeServer({
          getLogsTriggerFromRedis: vi.fn().mockResolvedValue(['dark_rp_drop_money']),
        })
        redisMock.get.mockResolvedValueOnce(
          JSON.stringify([
            {
              compare: 'amount',
              operator: 'equal',
              value: '100',
              action: 'sendMessageInChannel',
              channelID: 'ch1',
              message: 'Plain message',
            },
          ]),
        )

        await logServer(server, 'dark_rp_drop_money', { player: { steamID64: '765', name: 'Bob' }, amount: 100 })
        await flushMicrotasks()

        expect(enqueueDiscordGuildSendLogMessageMock).toHaveBeenCalledWith(
          expect.objectContaining({ description: 'Plain message' }),
          5000,
        )
      })

      it('swallows a bullmq enqueue failure', async () => {
        const server = makeServer({
          getLogsTriggerFromRedis: vi.fn().mockResolvedValue(['dark_rp_drop_money']),
        })
        redisMock.get.mockResolvedValueOnce(
          JSON.stringify([
            {
              compare: 'amount',
              operator: 'equal',
              value: '100',
              action: 'sendMessageInChannel',
              channelID: 'ch1',
              message: 'hit',
            },
          ]),
        )
        enqueueDiscordGuildSendLogMessageMock.mockReturnValue(Promise.reject(new Error('queue down')))

        await logServer(server, 'dark_rp_drop_money', { player: { steamID64: '765', name: 'Bob' }, amount: 100 })
        await flushMicrotasks()

        expect(enqueueDiscordGuildSendLogMessageMock).toHaveBeenCalled()
      })

      it('uses the dedicated embed color for the type when sending the trigger message', async () => {
        const server = makeServer({
          getLogsTriggerFromRedis: vi.fn().mockResolvedValue(['dark_rp_drop_money']),
        })
        redisMock.get.mockResolvedValueOnce(
          JSON.stringify([
            {
              compare: 'amount',
              operator: 'equal',
              value: '100',
              action: 'sendMessageInChannel',
              channelID: 'ch1',
              message: 'hit',
            },
          ]),
        )

        await logServer(server, 'dark_rp_drop_money', { player: { steamID64: '765', name: 'Bob' }, amount: 100 })
        await flushMicrotasks()

        expect(enqueueDiscordGuildSendLogMessageMock).toHaveBeenCalledWith(
          expect.objectContaining({ color: '#c7c751' }),
          5000,
        )
      })
    })
  })
})
