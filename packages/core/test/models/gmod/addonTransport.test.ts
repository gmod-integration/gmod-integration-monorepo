import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Server } from '@gmod/domain-server/Server.js'
import type { AddonRequest } from '@gmod/schema/gmod/AddonTransportSchema.js'
import { AccessDeniedError } from '@gmod/domain-access/index.js'

const mocks = vi.hoisted(() => ({
  log: vi.fn(),
  user: vi.fn(),
  rate: vi.fn(),
  errors: vi.fn(),
  screenshot: vi.fn(),
  bug: vi.fn(),
  config: vi.fn(),
  status: vi.fn(),
  warns: vi.fn(),
  drop: vi.fn(),
  pickup: vi.fn(),
  cheque: vi.fn(),
  take: vi.fn(),
  receive: vi.fn(),
  send: vi.fn(),
  withdraw: vi.fn(),
  deposit: vi.fn(),
  say: vi.fn(),
  name: vi.fn(),
  group: vi.fn(),
  team: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  warn: vi.fn(),
}))
vi.mock('@gmod/domain-user/User.js', () => ({ getUserFromSteamID64: mocks.user }))
vi.mock('@gmod/infra-redis', () => ({ default: { eval: mocks.rate } }))
vi.mock('../../../src/utils/logger.js', () => ({ logServer: mocks.log }))
vi.mock('../../../src/utils/tools.js', () => ({ lastGmodIntegrationTag: '6.0.0' }))
vi.mock('../../../src/models/gmod/gmodErrorsModels.js', () => ({ reportGmodErrorPayloadSafe: mocks.errors }))
vi.mock('../../../src/models/v3/clientsModels.js', () => ({
  uploadScreenshotPayload: mocks.screenshot,
  reportBugPayload: mocks.bug,
}))
vi.mock('../../../src/models/v3/serversControllerModels.js', () => ({
  processPostIGSettings: mocks.config,
  processPostStatus: mocks.status,
  processServerImportWarns: mocks.warns,
  processDarkRPDropMoney: mocks.drop,
  processDarkRPPickedUpMoney: mocks.pickup,
  processDarkRPPickedUpCheque: mocks.cheque,
  processCHATMTakeMoney: mocks.take,
  processCHATMReceiveMoney: mocks.receive,
  processCHATMSendMoney: mocks.send,
  processCHATMWithdrawMoney: mocks.withdraw,
  processCHATMDepositMoney: mocks.deposit,
}))
vi.mock('../../../src/models/v6/dashboardSettings.js', () => ({ saveServerDashboardSettings: mocks.config }))
vi.mock('../../../src/models/v3/serversPlayersControllerModels.js', () => ({
  processPlayerSay: mocks.say,
  processPlayerChangeName: mocks.name,
  processPlayerChangeGroup: mocks.group,
  processPlayerChangeTeam: mocks.team,
  processPlayerConnect: mocks.connect,
  processPlayerDisconnect: mocks.disconnect,
  processPlayerWarn: mocks.warn,
}))

const { handleAddonRequest } = await import('../../../src/models/gmod/addonTransport.js')
const id = '76561198012345678',
  otherID = '76561198012345679'
const good = { status: 200, body: { success: true } }
const actor = (steamID64 = id) => ({
  steamID64,
  steamID: 'STEAM_0:0:1',
  name: 'Player',
  userGroup: 'user',
  kills: 0,
  deaths: 0,
  connectTime: 1,
  customValues: {},
  team: { id: 1, name: 'Citizen' },
  position: { x: 0, y: 0, z: 0 },
  angle: { p: 0, y: 0, r: 0 },
})
const status = () => ({
  players: 0,
  playersList: [],
  maxPlayers: 32,
  map: 'gm_construct',
  hostname: 'Example',
  gameMode: 'sandbox',
  port: 27015,
  ip: '127.0.0.1:27015',
  uptime: 0,
})
const image = () => ({
  player: actor(),
  screenshot: 'YWJjZA==',
  captureData: { w: 1920, h: 1080, x: 0, y: 0, quality: 95, format: 'jpeg' },
  size: '1KB',
})
const error = () => ({ error: 'failure', stack: [{ file: 'test.lua', line: 1 }], realm: 'server', uptime: 1, count: 1 })
const server = () =>
  ({
    getID: () => 's1',
    name: 'Example server',
    guild: 'g1',
    token: 'never-return-this',
    getAllIGSettings: vi.fn().mockResolvedValue({ ig_debug: false }),
    getPlayerStats: vi.fn().mockResolvedValue({ connectTime: 42 }),
  }) as unknown as Server
const request = (endpoint: string, body?: unknown, method: 'GET' | 'POST' = 'POST') =>
  ({
    action: 'addon.request',
    id: 'req-1',
    method,
    endpoint,
    ...(body !== undefined ? { body } : {}),
  }) satisfies AddonRequest

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset().mockResolvedValue(good)
  mocks.rate.mockResolvedValue(1)
  mocks.user.mockResolvedValue(null)
  mocks.screenshot.mockResolvedValue({ success: true })
  mocks.bug.mockResolvedValue({ id: 1 })
})

describe('authenticated addon dispatcher', () => {
  it('returns a safe server description and the latest release without server credentials', async () => {
    const result = await handleAddonRequest(server(), request('/servers/s1', undefined, 'GET'))
    expect(result).toEqual({
      status: 200,
      body: { id: 's1', name: 'Example server', guild: 'g1', latestVersion: '6.0.0' },
    })
    expect(JSON.stringify(result)).not.toContain('never-return-this')
  })

  it('returns the settings map expected by the addon and persists configuration using the existing model', async () => {
    const target = server()
    expect(await handleAddonRequest(target, request('/servers/s1/config', undefined, 'GET'))).toEqual({
      status: 200,
      body: { ig_debug: false },
    })
    await handleAddonRequest(target, request('/servers/s1/config', { debug: true }))
    expect(mocks.config).toHaveBeenCalledWith(target, { ig_debug: true })
  })

  it('validates every configuration key and value before an atomic persistence call', async () => {
    for (const body of [
      { debug: true, token: 'secret' },
      { debug: true, maintenance: 'false' },
      { id: 's2' },
      { debug: true, arbitrary: 1 },
    ]) {
      expect((await handleAddonRequest(server(), request('/servers/s1/config', body))).status).toBe(400)
    }
    expect(mocks.config).not.toHaveBeenCalled()
    expect(
      (
        await handleAddonRequest(
          server(),
          request('/servers/s1/config', { debug: true, adminRank: { superadmin: true } }),
        )
      ).status,
    ).toBe(200)
    expect(mocks.config).toHaveBeenCalledWith(expect.anything(), { ig_debug: true, ig_adminRank: { superadmin: true } })
  })

  it('distinguishes unavailable entitlements from forbidden configuration changes', async () => {
    mocks.config.mockRejectedValueOnce(new AccessDeniedError('status.chart', 'upgrade_required'))
    expect((await handleAddonRequest(server(), request('/servers/s1/config', { syncBan: true }))).status).toBe(403)
    mocks.config.mockRejectedValueOnce(new AccessDeniedError('status.chart', 'entitlement_unknown'))
    expect((await handleAddonRequest(server(), request('/servers/s1/config', { syncBan: true }))).status).toBe(503)
  })

  it('limits user lookup to linked identifiers and preserves a missing user', async () => {
    expect((await handleAddonRequest(server(), request(`/users?steamID64=${id}`, undefined, 'GET'))).status).toBe(404)
    mocks.user.mockResolvedValue({ discordID: '123456789012345678', steamID64: id, rank: 'developer' })
    expect(await handleAddonRequest(server(), request(`/users?steamID64=${id}`, undefined, 'GET'))).toEqual({
      status: 200,
      body: { discordID: '123456789012345678', steamID64: id },
    })
  })

  it('reads player stats only through the authenticated server', async () => {
    const target = server()
    await handleAddonRequest(target, request(`/servers/s1/players/${id}`, undefined, 'GET'))
    expect(target.getPlayerStats).toHaveBeenCalledWith(id)
    expect((await handleAddonRequest(target, request(`/servers/s2/players/${id}`, undefined, 'GET'))).status).toBe(403)
    expect(target.getPlayerStats).toHaveBeenCalledTimes(1)
  })

  it.each(['/servers/s2/config', `/clients/${id}/servers/s2/screenshots`])(
    'rejects cross-server access: %s',
    async (endpoint) => {
      expect((await handleAddonRequest(server(), request(endpoint, image()))).status).toBe(403)
      expect(mocks.config).not.toHaveBeenCalled()
      expect(mocks.screenshot).not.toHaveBeenCalled()
      expect(mocks.log).not.toHaveBeenCalled()
    },
  )

  it.each([
    '/servers/s1/execute',
    `/servers/s1/players/${id}/constructor`,
    `/servers/s1/players/${id}/toString`,
    `/servers/s1/players/${id}/__proto__`,
    `/servers/s1/players/${id}/execute`,
    '/users?discordID=1',
    '/admin',
    '/servers/s1/public-token',
  ])('rejects endpoints outside the allowlist: %s', async (endpoint) => {
    const method = endpoint.endsWith('public-token') ? 'GET' : 'POST'
    expect(
      (await handleAddonRequest(server(), request(endpoint, method === 'POST' ? {} : undefined, method))).status,
    ).toBe(404)
    expect(mocks.log).not.toHaveBeenCalled()
  })

  it('rejects malformed envelopes before dispatch', async () => {
    expect(
      (
        await handleAddonRequest(server(), {
          ...request('/servers/s1/config', {}),
          method: 'DELETE',
        } as unknown as AddonRequest)
      ).status,
    ).toBe(400)
    expect(mocks.config).not.toHaveBeenCalled()
  })

  it('records start, periodic status and stop through existing business models, including zero players', async () => {
    const target = server()
    await handleAddonRequest(target, request('/servers/s1/start', status()))
    expect(mocks.status).toHaveBeenCalledWith(target, status())
    expect(mocks.log).toHaveBeenCalledWith(target, 'server_start')
    await handleAddonRequest(target, request('/servers/s1/status', status()))
    await handleAddonRequest(target, request('/servers/s1/stop'))
    expect(mocks.log).toHaveBeenCalledWith(target, 'server_stop')
  })

  it('does not log a successful start when status validation or persistence rejects it', async () => {
    expect(
      (await handleAddonRequest(server(), request('/servers/s1/start', { ...status(), players: -1 }))).status,
    ).toBe(400)
    expect(mocks.status).not.toHaveBeenCalled()
    mocks.status.mockResolvedValue({ status: 400, body: { error: 'invalid' } })
    expect((await handleAddonRequest(server(), request('/servers/s1/start', status()))).status).toBe(400)
    expect(mocks.log).not.toHaveBeenCalled()
  })

  it('normalizes only empty Lua array tables and retains bot status snapshots', async () => {
    const target = server()
    expect(
      (await handleAddonRequest(target, request('/servers/s1/status', { ...status(), playersList: {} }))).status,
    ).toBe(200)
    expect(mocks.status).toHaveBeenLastCalledWith(target, expect.objectContaining({ playersList: [] }))
    expect(
      (
        await handleAddonRequest(
          target,
          request('/servers/s1/status', { ...status(), players: 1, playersList: [actor('0')] }),
        )
      ).status,
    ).toBe(200)
    expect((await handleAddonRequest(target, request('/servers/s1/logs', {}))).status).toBe(200)
    expect((await handleAddonRequest(target, request('/servers/s1/warns', { warns: {} }))).status).toBe(200)
    expect(mocks.warns).toHaveBeenLastCalledWith(target, [])
    expect(
      (
        await handleAddonRequest(
          target,
          request('/servers/s1/status', { ...status(), playersList: { arbitrary: true } }),
        )
      ).status,
    ).toBe(400)
  })

  it.each([
    'ready',
    'spawn',
    'death',
    'initial-spawn',
    'give',
    'spawn/prop',
    'spawn/sent',
    'spawn/npc',
    'spawn/vehicle',
    'spawn/effect',
    'spawn/ragdoll',
    'spawn/swep',
  ])('accepts bounded player telemetry: %s', async (event) => {
    expect(
      (await handleAddonRequest(server(), request(`/servers/s1/players/${id}/${event}`, { player: actor() }))).status,
    ).toBe(200)
    expect(mocks.log).toHaveBeenCalledTimes(1)
  })

  it('validates victim identity for damage events and rejects actor spoofing', async () => {
    expect(
      (
        await handleAddonRequest(
          server(),
          request(`/servers/s1/players/${id}/hurt`, { victim: actor(), attacker: actor(otherID) }),
        )
      ).status,
    ).toBe(200)
    mocks.log.mockClear()
    expect(
      (await handleAddonRequest(server(), request(`/servers/s1/players/${id}/spawn`, { player: actor(otherID) })))
        .status,
    ).toBe(400)
    expect(mocks.log).not.toHaveBeenCalled()
  })

  it('retains the chat, nickname, group, team and connection side effects', async () => {
    const target = server()
    const cases = [
      ['say', { player: actor(), text: 'hello', teamOnly: false }, mocks.say],
      ['name', { player: actor(), oldName: 'Old', newName: 'New' }, mocks.name],
      ['group', { oldGroup: 'user', newGroup: 'admin' }, mocks.group],
      ['team', { player: actor(), oldTeam: { name: 'Citizen' }, newTeam: { name: 'Police' } }, mocks.team],
      ['connect', { name: 'Player', address: '127.0.0.1:27015', networkid: 'STEAM_0:0:1' }, mocks.connect],
      ['disconnect', { player: actor() }, mocks.disconnect],
    ] as const
    for (const [event, body, mock] of cases) {
      expect((await handleAddonRequest(target, request(`/servers/s1/players/${id}/${event}`, body))).status).toBe(200)
      expect(mock).toHaveBeenCalledTimes(1)
    }
    expect(mocks.log).toHaveBeenCalledTimes(cases.length)
  })

  it.each(['ban', 'bans', 'kick'])(
    'accepts moderation ingestion without opening a remote command path: %s',
    async (event) => {
      expect(
        (await handleAddonRequest(server(), request(`/servers/s1/players/${id}/${event}`, { reason: 'Reason' })))
          .status,
      ).toBe(200)
      expect(mocks.log).toHaveBeenCalledWith(
        expect.anything(),
        event === 'kick' ? 'player_kick' : 'player_ban',
        expect.objectContaining({ steamID64: id }),
      )
    },
  )

  it('preserves online and offline warning ingestion and import', async () => {
    const target = server()
    await handleAddonRequest(
      target,
      request(`/servers/s1/players/${id}/warns`, {
        player: actor(),
        admin: actor(otherID),
        reason: 'Reason',
        date: 1_800_000_000,
      }),
    )
    expect(mocks.warn).toHaveBeenCalledTimes(1)
    await handleAddonRequest(
      target,
      request(`/servers/s1/players/${id}/warns`, { adminSteamID64: otherID, reason: 'Reason', date: 1_800_000_000 }),
    )
    expect(mocks.warns).toHaveBeenCalledWith(target, [
      { playerSteamID64: id, adminSteamID64: otherID, reason: 'Reason', date: 1_800_000_000 },
    ])
    await handleAddonRequest(target, request('/servers/s1/warns', { warns: [] }))
    expect(mocks.warns).toHaveBeenLastCalledWith(target, [])
  })

  it.each([
    ['dark-rp/drop-money', 'drop'],
    ['dark-rp/picked-up-money', 'pickup'],
    ['dark-rp/picked-up-cheque', 'cheque'],
    ['ch-atm/take-money', 'take'],
    ['ch-atm/receive-money', 'receive'],
    ['ch-atm/send-money', 'send'],
    ['ch-atm/withdraw-money', 'withdraw'],
    ['ch-atm/deposit-money', 'deposit'],
  ] as const)('retains economy integration processing: %s', async (event, key) => {
    const body = {
      player: actor(),
      playerChequeWriter: actor(otherID),
      playerChequeTarget: actor(),
      receiver: actor(otherID),
      amount: 100,
      entity: {},
      reason: 'Reason',
    }
    expect((await handleAddonRequest(server(), request(`/servers/s1/players/${id}/${event}`, body))).status).toBe(200)
    expect(mocks[key]).toHaveBeenCalledTimes(1)
  })

  it('validates all log batch entries and scope before any side effect', async () => {
    const valid = { endpoint: `/servers/s1/players/${id}/spawn`, data: { player: actor() } }
    const target = server()
    expect(
      (
        await handleAddonRequest(
          target,
          request('/servers/s1/logs', [valid, { ...valid, endpoint: `/servers/s2/players/${id}/spawn` }]),
        )
      ).status,
    ).toBe(400)
    expect(mocks.log).not.toHaveBeenCalled()
    expect((await handleAddonRequest(target, request('/servers/s1/logs', Array(101).fill(valid)))).status).toBe(400)
    expect((await handleAddonRequest(target, request('/servers/s1/logs', [valid]))).status).toBe(200)
    expect(mocks.log).toHaveBeenCalledOnce()
  })

  it('forbids privileged/non-batchable operations inside telemetry batches', async () => {
    const entry = { endpoint: '/servers/s1/config', data: { debug: true } }
    expect((await handleAddonRequest(server(), request('/servers/s1/logs', [entry]))).status).toBe(400)
    expect(mocks.config).not.toHaveBeenCalled()
  })

  it('accepts client screenshot delivery under the server socket with exact actor binding', async () => {
    const target = server(),
      body = image()
    expect((await handleAddonRequest(target, request(`/clients/${id}/servers/s1/screenshots`, body))).status).toBe(200)
    expect(mocks.screenshot).toHaveBeenCalledWith(target, body)
    expect(mocks.rate).toHaveBeenCalledWith(
      expect.any(String),
      3,
      `client_request_count_1s_${id}`,
      `client_request_count_60s_${id}`,
      `client_request_block_${id}`,
    )
    expect((await handleAddonRequest(target, request(`/clients/${otherID}/servers/s1/screenshots`, body))).status).toBe(
      403,
    )
    expect(mocks.screenshot).toHaveBeenCalledOnce()
  })

  it('preserves per-player rate limits and retry after a block', async () => {
    mocks.rate.mockResolvedValueOnce(0).mockResolvedValueOnce(1)
    const item = request(`/clients/${id}/servers/s1/screenshots`, image())
    expect((await handleAddonRequest(server(), item)).status).toBe(429)
    expect(mocks.screenshot).not.toHaveBeenCalled()
    expect((await handleAddonRequest(server(), item)).status).toBe(200)
  })

  it('rejects malformed or oversized screenshots and invalid capture data before upload', async () => {
    for (const body of [
      {},
      { ...image(), screenshot: 'not-base64!' },
      { ...image(), captureData: { ...image().captureData, w: 100_000 } },
    ]) {
      expect((await handleAddonRequest(server(), request(`/clients/${id}/servers/s1/screenshots`, body))).status).toBe(
        400,
      )
    }
    expect(mocks.screenshot).not.toHaveBeenCalled()
    expect(mocks.rate).not.toHaveBeenCalled()
  })

  it('reuses bug processing with optional screenshot and its business error result', async () => {
    const body = {
      player: actor(),
      description: 'Description',
      importance: 'low',
      steps: 'Steps',
      expected: 'Expected',
      actual: 'Actual',
      screenshot: {},
    }
    expect((await handleAddonRequest(server(), request(`/clients/${id}/servers/s1/bugs`, body))).status).toBe(200)
    mocks.bug.mockResolvedValueOnce({ error: 'storage_failed' })
    expect((await handleAddonRequest(server(), request(`/clients/${id}/servers/s1/bugs`, body))).status).toBe(400)
  })

  it.each([null, 'malformed capture', { screenshot: 'incomplete capture' }])(
    'preserves a report with an invalid optional attachment and returns its bounded partial success',
    async (screenshot) => {
      const body = {
        player: actor(),
        description: 'Description',
        importance: 'low',
        steps: 'Steps',
        expected: 'Expected',
        actual: 'Actual',
        screenshot,
      }
      const acknowledgement = { success: true, saved: true, attachment: 'failed' }
      mocks.bug.mockResolvedValueOnce(acknowledgement)
      expect(await handleAddonRequest(server(), request(`/clients/${id}/servers/s1/bugs`, body))).toEqual({
        status: 200,
        body: acknowledgement,
      })
      expect(mocks.bug).toHaveBeenCalledExactlyOnceWith(expect.anything(), expect.objectContaining({ screenshot }))
    },
  )

  it('does not report acceptance when privacy controls refused the bug report', async () => {
    mocks.bug.mockResolvedValueOnce({ skip: true, message: 'Personal data collection is disabled' })
    expect(
      await handleAddonRequest(
        server(),
        request(`/clients/${id}/servers/s1/bugs`, {
          player: actor(),
          description: 'Description',
          importance: 'low',
          steps: 'Steps',
          expected: 'Expected',
          actual: 'Actual',
        }),
      ),
    ).toEqual({ status: 403, body: { error: 'personal_data_collection_disabled' } })
  })

  it('binds client and server Lua errors to their authenticated realm and server scope', async () => {
    const target = server()
    await handleAddonRequest(target, request('/servers/s1/errors', error()))
    expect(mocks.errors).toHaveBeenCalledWith(error(), { serverID: 's1', steamID64: '' })
    const body = { ...error(), realm: 'client', identifier: id }
    await handleAddonRequest(target, request(`/clients/${id}/servers/s1/errors`, body))
    expect(mocks.errors).toHaveBeenLastCalledWith(body, { serverID: 's1', steamID64: id })
    expect(
      (await handleAddonRequest(target, request(`/clients/${id}/servers/s1/errors`, { ...body, identifier: otherID })))
        .status,
    ).toBe(403)
    expect((await handleAddonRequest(target, request('/servers/s1/errors', body))).status).toBe(400)
  })

  it('normalizes empty Lua error stacks and numeric workshop IDs before the existing error model', async () => {
    const body = { ...error(), stack: {}, id: 12345 }
    expect((await handleAddonRequest(server(), request('/servers/s1/errors', body))).status).toBe(200)
    expect(mocks.errors).toHaveBeenCalledWith({ ...body, stack: [], id: '12345' }, { serverID: 's1', steamID64: '' })
  })
})
