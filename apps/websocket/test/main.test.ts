import { EventEmitter } from 'node:events'

const accessMock = vi.hoisted(() => vi.fn())
vi.mock('@gmod/domain-access/index.js', async () => {
  const policy = await import('@gmod/schema/server/AccessPolicySchema.js')
  return { ...policy, resolveGuildAccess: accessMock }
})

const isErasureBlockedMock = vi.fn().mockResolvedValue(false)
vi.mock('@gmod/domain-user/privacy.js', () => ({
  isErasureBlocked: isErasureBlockedMock,
  assertPersonalDataAllowed: async (discordID?: string, steamID64?: string) => {
    if (await isErasureBlockedMock(discordID, steamID64)) throw new Error('Personal data collection is disabled')
  },
  PRIVACY_REVOCATION_CHANNEL: 'gmi:privacy:revoked',
}))
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@gmod/core/models/gmod/addonTransport.js', async () => {
  const schema = await import('../../../packages/schema/src/gmod/AddonTransportSchema.js')
  return {
    ...schema,
    handleAddonRequest: async (server: any, request: any) => {
      if (request.endpoint.endsWith('/config')) await server.saveIGSettings(request.body)
      return { status: 200, body: { success: true } }
    },
  }
})

const gmLogMock = vi.fn()
vi.mock('@gmod/shared/logger.js', () => ({ gmLog: gmLogMock }))

vi.mock('@gmod/config', () => ({ ConfigServer: { ports: { websocket: 9999 }, websiteUrl: 'http://localhost:3000' } }))

const consumeTicketMock = vi.fn()
const validateSessionMock = vi.fn()
vi.mock('@gmod/domain-auth/authSessions.js', () => ({
  AUTH_SESSION_REVOCATION_CHANNEL: 'gmi:auth:session-revoked',
  assertTrustedOrigin: (req: any) => {
    if (req.headers.origin && req.headers.origin !== 'http://localhost:3000') throw new Error('Foreign origin')
  },
  consumeWebSocketTicket: consumeTicketMock,
  validateApplicationSession: validateSessionMock,
}))
const sessions = new Map<string, any>()
const tickets = new Map<string, any>()
const openedSockets: any[] = []
const session = (id: string, discordID = 'd1') => ({
  id,
  discordID,
  tokenHash: 'hash-' + id,
  createdAt: new Date(),
  lastSeenAt: new Date(),
  expiresAt: new Date(Date.now() + 60_000),
  absoluteExpiresAt: new Date(Date.now() + 120_000),
})

const getServerFromIDMock = vi.fn()
const getServersFromDiscordGuildIDMock = vi.fn()
vi.mock('@gmod/domain-server/Server.js', () => ({
  getServerFromID: getServerFromIDMock,
  getServersFromDiscordGuildID: getServersFromDiscordGuildIDMock,
}))

const getPanelUserFromDiscordIDMock = vi.fn()
vi.mock('@gmod/domain-user/PanelUser.js', () => ({ getPanelUserFromDiscordID: getPanelUserFromDiscordIDMock }))

const getUserGuildsWithPermsForPanelMock = vi.fn()
vi.mock('@gmod/domain-guild/discordModels.js', () => ({
  getUserGuildsWithPermsForPanel: getUserGuildsWithPermsForPanelMock,
}))

const connectPrismaMock = vi.fn().mockResolvedValue(undefined)
const gracefulShutdownPrismaMock = vi.fn().mockResolvedValue(undefined)
vi.mock('@gmod/infra-prisma', () => ({
  connectPrisma: connectPrismaMock,
  gracefulShutdownPrisma: gracefulShutdownPrismaMock,
}))

const subscriberHandlers: Record<string, (...args: any[]) => any> = {}
const presences: any[] = []
function makePresence(serverID: string, connectionID: string) {
  const presence = {
    serverID,
    connectionID,
    closed: false,
    refresh: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(async () => {
      presence.closed = true
    }),
  }
  presences.push(presence)
  return presence
}
const createServerPresenceMock = vi.fn(makePresence)
const isServerPresentMock = vi.fn(async (serverID: string) =>
  presences.some((presence) => presence.serverID === serverID && !presence.closed),
)
vi.mock('../src/serverPresence.js', () => ({
  createServerPresence: createServerPresenceMock,
  isServerPresent: isServerPresentMock,
}))
const redisSubscriberMock = {
  on: vi.fn((event: string, cb: any) => {
    subscriberHandlers[event] = cb
  }),
  subscribe: vi.fn().mockResolvedValue(undefined),
  unsubscribe: vi.fn().mockResolvedValue(undefined),
  quit: vi.fn().mockResolvedValue(undefined),
}
const redisMock: any = {
  mget: vi.fn().mockResolvedValue([null, null]),
  get: vi.fn(),
  set: vi.fn().mockResolvedValue(undefined),
  del: vi.fn().mockResolvedValue(undefined),
  incr: vi.fn().mockResolvedValue(undefined),
  expire: vi.fn().mockResolvedValue(undefined),
  publish: vi.fn(async (channel: string, payload: string) => {
    if (channel === 'ws:send-to-clients:broadcast') await subscriberHandlers.message(channel, payload)
  }),
  duplicate: vi.fn(() => redisSubscriberMock),
}
const gracefulShutdownRedisMock = vi.fn().mockResolvedValue(undefined)
vi.mock('@gmod/infra-redis', () => ({ default: redisMock, gracefulShutdownRedis: gracefulShutdownRedisMock }))

const versionComparatorMock = vi.fn().mockReturnValue(0)
vi.mock('@gmod/core/utils/tools.js', () => ({
  lastGmodIntegrationTag: 'v1.2.3',
  versionComparator: versionComparatorMock,
}))

vi.mock('@gmod/infra-bullmq', () => ({ connection: {} }))
const acceptAddonCommandResultMock = vi.fn().mockResolvedValue(undefined)
vi.mock('@gmod/infra-websocket/addonCommands.js', () => ({ acceptAddonCommandResult: acceptAddonCommandResultMock }))

const consoleQueueAddMock = vi.fn().mockResolvedValue(undefined)
vi.mock('@gmod/infra-websocket/queues.js', () => ({
  wsSendToServerQueue: { name: 'wsSendToServer' },
  wsSendToAllClientsOfServerQueue: { name: 'wsSendToAllClientsOfServer', add: consoleQueueAddMock },
}))

let capturedWss: FakeWebSocketServer | undefined
function registerWss(instance: FakeWebSocketServer) {
  capturedWss = instance
}
class FakeWebSocketServer extends EventEmitter {
  opts: any
  constructor(opts: any) {
    super()
    this.opts = opts
    registerWss(this)
  }
  close(cb?: () => void) {
    cb?.()
  }
}
vi.mock('ws', () => ({ WebSocketServer: FakeWebSocketServer }))

const capturedWorkers: Record<string, FakeWorker> = {}
class FakeWorker extends EventEmitter {
  name: string
  processor: (job: any) => any
  close = vi.fn().mockResolvedValue(undefined)
  constructor(name: string, processor: (job: any) => any, _opts: any) {
    super()
    this.name = name
    this.processor = processor
    capturedWorkers[name] = this
  }
}
vi.mock('bullmq', () => ({ Worker: FakeWorker }))

function makeFakeWs() {
  const ws = new EventEmitter() as any
  ws.send = vi.fn()
  ws.close = vi.fn()
  ws.ping = vi.fn()
  ws.readyState = 1
  ws.terminate = vi.fn(() => ws.emit('close'))
  openedSockets.push(ws)
  return ws
}

const { main, gracefulShutdown } = await import('../src/main.js')

describe('apps/websocket main()', () => {
  beforeAll(async () => {
    await main()
  })

  it('connects prisma, boots the ws server + subscriber + workers, and logs the listening port', () => {
    expect(connectPrismaMock).toHaveBeenCalled()
    expect(redisMock.duplicate).toHaveBeenCalled()
    expect(redisSubscriberMock.subscribe).toHaveBeenCalledWith('ws:send-to-server:broadcast')
    expect(redisSubscriberMock.subscribe).toHaveBeenCalledWith('ws:send-to-clients:broadcast')
    expect(capturedWss?.opts.port).toBe(9999)
    expect(capturedWorkers['wsSendToServer']).toBeDefined()
    expect(capturedWorkers['wsSendToAllClientsOfServer']).toBeDefined()
    expect(gmLogMock).toHaveBeenCalledWith('websocket', expect.stringContaining('Listening on port'))
  })

  beforeEach(() => {
    redisMock.mget.mockReset().mockResolvedValue([null, null])
    getServerFromIDMock.mockReset()
    consumeTicketMock.mockReset().mockImplementation(async (ticket) => {
      const found = tickets.get(ticket) || null
      tickets.delete(ticket)
      return found
    })
    validateSessionMock.mockReset().mockImplementation(async (id) => sessions.get(id) || null)
    getPanelUserFromDiscordIDMock
      .mockReset()
      .mockImplementation(async (discordID, _token, authSession) => ({ discordID, authSession }))
    getUserGuildsWithPermsForPanelMock.mockReset().mockResolvedValue([{ id: 'g1' }])
    getServersFromDiscordGuildIDMock.mockReset().mockResolvedValue([{ id: 'srv-status' }, { id: 'srv-bulk' }])
    isErasureBlockedMock.mockReset().mockResolvedValue(false)
    createServerPresenceMock.mockReset().mockImplementation(makePresence)
    isServerPresentMock
      .mockReset()
      .mockImplementation(async (serverID) =>
        presences.some((presence) => presence.serverID === serverID && !presence.closed),
      )
  })
  afterEach(async () => {
    for (const socket of openedSockets.splice(0)) socket.emit('close')
    await Promise.resolve()
    presences.length = 0
    sessions.clear()
    tickets.clear()
    vi.useRealTimers()
  })
  async function verify(req: any) {
    return new Promise<any[]>((resolve) => {
      capturedWss!.opts.verifyClient({ req }, (...args: any[]) => resolve(args))
    })
  }
  async function connectClient(id: string, discordID = 'd1', overrides: Record<string, unknown> = {}) {
    const authSession = { ...session(id, discordID), ...overrides }
    sessions.set(id, authSession)
    tickets.set('ticket-' + id + '-' + openedSockets.length, authSession)
    const req = {
      headers: { origin: 'http://localhost:3000' },
      url: '/ws?ticket=ticket-' + id + '-' + openedSockets.length,
    }
    expect(await verify(req)).toEqual([true])
    const ws = makeFakeWs()
    capturedWss!.emit('connection', ws, req)
    await new Promise((resolve) => setTimeout(resolve, 0))
    return ws
  }
  async function connectServer(id: string, ws = makeFakeWs(), headers = {}) {
    const req = { headers: { id, token: 'tok', ...headers }, url: '/' }
    getServerFromIDMock.mockResolvedValueOnce({ isValidToken: () => true })
    expect(await verify(req)).toEqual([true])
    capturedWss!.emit('connection', ws, req)
    return ws
  }

  async function simulateDashboardDelivery(packet: { id: string; action: string; data: unknown }) {
    const channel = 'ws:send-to-clients:broadcast'
    const publishedBefore = redisMock.publish.mock.calls.length
    const previousPublish = redisMock.publish.getMockImplementation()
    try {
      // Exercise the real worker in both local-delivery and Redis-fanout implementations.
      // Bridge publications explicitly below instead of depending on a particular fake Redis transport.
      redisMock.publish.mockImplementation((publishedChannel: string, payload: string) =>
        publishedChannel === channel ? Promise.resolve(1) : previousPublish?.(publishedChannel, payload),
      )
      await capturedWorkers.wsSendToAllClientsOfServer.processor({ data: packet })
    } finally {
      redisMock.publish.mockImplementation(previousPublish)
    }
    for (const [publishedChannel, payload] of redisMock.publish.mock.calls.slice(publishedBefore)) {
      if (publishedChannel === channel) await subscriberHandlers.message(publishedChannel, payload)
    }
  }

  describe('verifyClient', () => {
    it('authorizes a GMod server with valid existing headers', async () => {
      getServerFromIDMock.mockResolvedValueOnce({ isValidToken: () => true })
      expect(await verify({ headers: { id: 's1', token: 'tok' }, url: '/' })).toEqual([true])
    })
    it.each([null, { isValidToken: () => false }])('rejects missing or invalid server credentials', async (server) => {
      getServerFromIDMock.mockResolvedValueOnce(server)
      expect(await verify({ headers: { id: 's1', token: 'bad' }, url: '/' })).toEqual([false, 401, 'Unauthorized'])
    })
    it.each([{ id: 'target' }, { token: 'fake' }, { id: ['target'], token: 'fake' }])(
      'does not fall back to a dashboard ticket for incomplete or malformed addon headers %j',
      async (headers) => {
        tickets.set('valid-owner-ticket', session('owner'))
        expect(await verify({ headers, url: '/ws?ticket=valid-owner-ticket' })).toEqual([false, 401, 'Unauthorized'])
        expect(consumeTicketMock).not.toHaveBeenCalled()
      },
    )
    it('rejects forged addon credentials even with a valid dashboard ticket and cannot evict or configure the server', async () => {
      const original = await connectServer('forged-target')
      const saveIGSettings = vi.fn()
      getServerFromIDMock.mockResolvedValueOnce({ isValidToken: () => false, saveIGSettings })
      tickets.set('valid-owner-ticket', session('owner'))
      const req = {
        headers: { id: 'forged-target', token: 'fake' },
        url: '/ws?ticket=valid-owner-ticket',
      }
      expect(await verify(req)).toEqual([false, 401, 'Unauthorized'])
      expect(consumeTicketMock).not.toHaveBeenCalled()

      const forged = makeFakeWs()
      capturedWss!.emit('connection', forged, req)
      forged.emit('message', JSON.stringify({ action: 'save_config', config: { tampered: true } }))
      expect(forged.close).toHaveBeenCalledWith(1008, 'Session required')
      expect(saveIGSettings).not.toHaveBeenCalled()
      expect(original.close).not.toHaveBeenCalled()
      await capturedWorkers.wsSendToServer.processor({
        data: { id: 'forged-target', data: { stillOriginal: true } },
      })
      expect(original.send).toHaveBeenCalledWith(JSON.stringify({ stillOriginal: true }))
      expect(forged.send).not.toHaveBeenCalled()
    })
    it('returns a temporary failure when addon authentication storage is unavailable', async () => {
      getServerFromIDMock.mockRejectedValueOnce(new Error('Database unavailable'))
      expect(await verify({ headers: { id: 'server', token: 'token' }, url: '/' })).toEqual([
        false,
        503,
        'Server authentication unavailable',
      ])
    })
    it('consumes a short ticket once and rejects replay', async () => {
      const auth = session('ticket-session')
      tickets.set('one-time', auth)
      expect(await verify({ headers: { origin: 'http://localhost:3000' }, url: '/ws?ticket=one-time' })).toEqual([true])
      expect(await verify({ headers: { origin: 'http://localhost:3000' }, url: '/ws?ticket=one-time' })).toEqual([
        false,
        401,
        'Unauthorized',
      ])
    })
    it('rejects old durable Bearer URLs', async () => {
      expect(await verify({ headers: {}, url: '/ws?discordID=d1&token=durable-secret' })).toEqual([
        false,
        401,
        'Unauthorized',
      ])
      expect(consumeTicketMock).not.toHaveBeenCalled()
    })
    it('rejects a cross-origin browser before consuming its ticket', async () => {
      expect(await verify({ headers: { origin: 'https://attacker.test' }, url: '/ws?ticket=valid' })).toEqual([
        false,
        403,
        'Forbidden',
      ])
      expect(consumeTicketMock).not.toHaveBeenCalled()
    })
    it('returns a temporary handshake failure if session storage is unavailable', async () => {
      consumeTicketMock.mockRejectedValueOnce(new Error('Redis down'))
      expect(await verify({ headers: {}, url: '/ws?ticket=valid' })).toEqual([false, 503, 'Session unavailable'])
    })
    it('rejects an absent ticket', async () => {
      expect(await verify({ headers: {}, url: '/ws' })).toEqual([false, 401, 'Unauthorized'])
      expect(await verify({ headers: {} })).toEqual([false, 401, 'Unauthorized'])
    })
  })

  describe('connection handler - server sockets', () => {
    it('registers a server connection and replaces an existing one with the same id', async () => {
      const ws1 = makeFakeWs()
      await connectServer('srv-a', ws1)
      expect(gmLogMock).toHaveBeenCalledWith('websocket', expect.stringContaining('Server connected: srv-a'))

      const ws2 = makeFakeWs()
      await connectServer('srv-a', ws2)
      expect(ws1.close).toHaveBeenCalled()
      expect(presences[0].close).toHaveBeenCalled()
      expect(presences[1].close).not.toHaveBeenCalled()
    })

    it('swallows an error thrown while closing the replaced socket', async () => {
      const ws1 = makeFakeWs()
      ws1.close = vi.fn(() => {
        throw new Error('close boom')
      })
      await connectServer('srv-b', ws1)
      const ws2 = makeFakeWs()
      await expect(connectServer('srv-b', ws2)).resolves.toBe(ws2)
    })

    it('removes the server from the tracked list on close', async () => {
      const ws = makeFakeWs()
      await connectServer('srv-c', ws)
      ws.emit('close')
      expect(gmLogMock).toHaveBeenCalledWith('websocket', expect.stringContaining('Server disconnected: srv-c'))
    })

    it('closes malformed addon JSON without logging its payload', async () => {
      const ws = makeFakeWs()
      await connectServer('srv-d', ws)
      ws.emit('message', '{not json')
      expect(ws.close).toHaveBeenCalledWith(1007, 'Invalid addon JSON')
    })

    it('ignores a message with no action', async () => {
      const ws = makeFakeWs()
      await connectServer('srv-e', ws)
      ws.emit('message', JSON.stringify({}))
    })

    it('ignores an unknown action', async () => {
      const ws = makeFakeWs()
      await connectServer('srv-f', ws)
      ws.emit('message', JSON.stringify({ action: 'not-a-real-action' }))
    })

    it('save_config does nothing when the server cannot be resolved', async () => {
      const ws = makeFakeWs()
      await connectServer('srv-g', ws)
      await vi.waitFor(() =>
        expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ action: 'addon.ready', protocol: 1 })),
      )
      getServerFromIDMock.mockResolvedValueOnce(null)
      await ws.listeners('message')[0](JSON.stringify({ action: 'save_config', config: {} }))
      expect(ws.close).toHaveBeenCalledWith(1008, 'Server credentials revoked')
    })

    it('save_config saves the settings when the server resolves', async () => {
      const saveIGSettings = vi.fn().mockResolvedValue(undefined)
      const ws = makeFakeWs()
      await connectServer('srv-h', ws)
      await vi.waitFor(() =>
        expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ action: 'addon.ready', protocol: 1 })),
      )
      getServerFromIDMock.mockResolvedValueOnce({ saveIGSettings, getID: () => 'srv-h', isValidToken: () => true })
      await ws.listeners('message')[0](JSON.stringify({ action: 'save_config', config: { foo: 'bar' } }))
      expect(ws.close.mock.calls).toEqual([])
      expect(getServerFromIDMock).toHaveBeenCalledTimes(2)
      expect(ws.send.mock.calls.map(([payload]: [string]) => JSON.parse(payload)).at(-1)).toMatchObject({ status: 200 })
      expect(saveIGSettings).toHaveBeenCalledWith({ foo: 'bar' })
    })

    it('closes a server whose initial presence registration fails', async () => {
      createServerPresenceMock.mockImplementationOnce((id, connectionID) => {
        const presence = makePresence(id, connectionID)
        presence.refresh.mockRejectedValueOnce(new Error('Redis unavailable'))
        return presence
      })
      const ws = await connectServer('presence-registration-error')
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(ws.close).toHaveBeenCalledWith(1013, 'Presence unavailable')
      expect(presences[0].close).toHaveBeenCalled()
      expect(ws.listenerCount('pong')).toBe(1)
    })

    it('does not start a heartbeat if the server closes during presence registration', async () => {
      let finish!: () => void
      createServerPresenceMock.mockImplementationOnce((id, connectionID) => {
        const presence = makePresence(id, connectionID)
        presence.refresh.mockImplementationOnce(
          () =>
            new Promise<void>((resolve) => {
              finish = resolve
            }),
        )
        return presence
      })
      const ws = await connectServer('presence-close-during-registration')
      ws.emit('close')
      finish()
      await Promise.resolve()
      expect(presences[0].close).toHaveBeenCalled()
      expect(ws.listenerCount('pong')).toBe(0)
    })

    it('logs a presence cleanup failure while keeping other connections available', async () => {
      const ws = await connectServer('presence-cleanup-error')
      presences[0].close.mockRejectedValueOnce(new Error('Redis unavailable'))
      ws.emit('close')
      await Promise.resolve()
      expect(gmLogMock).toHaveBeenCalledWith('websocket', 'Server presence cleanup temporarily unavailable', true)
    })
  })

  describe('connection heartbeat', () => {
    it('does not install a heartbeat when the readiness write closes the addon transport', async () => {
      vi.useFakeTimers()
      const ws = makeFakeWs()
      ws.send.mockImplementationOnce(() => ws.emit('close'))
      await connectServer('closed-during-ready', ws)
      await vi.advanceTimersByTimeAsync(60_000)
      expect(ws.ping).not.toHaveBeenCalled()
      expect(ws.listenerCount('pong')).toBe(0)
      expect(presences[0].closed).toBe(true)
    })
    it('pings, accepts pong and clears its timer when closed', async () => {
      vi.useFakeTimers()
      const ws = makeFakeWs()
      await connectServer('heartbeat-server', ws)
      vi.advanceTimersByTime(30_000)
      expect(ws.ping).toHaveBeenCalledTimes(1)
      ws.emit('pong')
      expect(presences[0].refresh).toHaveBeenCalledTimes(2)
      vi.advanceTimersByTime(30_000)
      expect(ws.ping).toHaveBeenCalledTimes(2)
      ws.emit('close')
      vi.advanceTimersByTime(60_000)
      expect(ws.ping).toHaveBeenCalledTimes(2)
    })
    it('terminates a connection that stops responding', async () => {
      vi.useFakeTimers()
      const ws = makeFakeWs()
      await connectServer('dead-heartbeat', ws)
      vi.advanceTimersByTime(60_000)
      expect(ws.terminate).toHaveBeenCalledTimes(1)
    })
    it('ignores a non-open transport until its close event cleans up the heartbeat', async () => {
      vi.useFakeTimers()
      const ws = await connectServer('already-closing')
      ws.readyState = 2
      vi.advanceTimersByTime(60_000)
      expect(ws.ping).not.toHaveBeenCalled()
      expect(ws.terminate).not.toHaveBeenCalled()
    })
    it('falls back to close when a dead transport has no terminate method', async () => {
      vi.useFakeTimers()
      const ws = await connectServer('heartbeat-fallback')
      delete ws.terminate
      vi.advanceTimersByTime(60_000)
      expect(ws.close).toHaveBeenCalledWith(1001, 'Heartbeat timeout')
    })
    it('stops heartbeat polling and closes a transport if ping fails', async () => {
      vi.useFakeTimers()
      const ws = await connectServer('heartbeat-error')
      ws.ping.mockImplementation(() => {
        throw new Error('Transport failed')
      })
      vi.advanceTimersByTime(90_000)
      expect(ws.ping).toHaveBeenCalledTimes(1)
      expect(ws.close).toHaveBeenCalled()
    })
    it('closes a server when its presence can no longer be renewed', async () => {
      const ws = await connectServer('presence-renewal-error')
      presences[0].refresh.mockRejectedValueOnce(new Error('Redis unavailable'))
      ws.emit('pong')
      await Promise.resolve()
      expect(ws.close).toHaveBeenCalledWith(1013, 'Presence unavailable')
      expect(gmLogMock).toHaveBeenCalledWith('websocket', 'Server presence renewal temporarily unavailable', true)
    })
  })

  describe('session-bound client sockets', () => {
    it.each([
      ['oversized text', Buffer.alloc(16385), false],
      ['binary frame', Buffer.from('{}'), true],
    ])('closes %s before resolving any status metadata', async (_label, frame, binary) => {
      const ws = await connectClient('bounded-client-frame')
      isServerPresentMock.mockClear()
      ws.emit('message', frame, binary)
      await Promise.resolve()
      expect(ws.close).toHaveBeenCalledWith(1008, 'Message budget exceeded')
      expect(isServerPresentMock).not.toHaveBeenCalled()
    })

    it('suppresses a status response when its socket is revoked during the final permission revision read', async () => {
      const ws = await connectClient('revoked-during-final-permission-read')
      redisMock.mget.mockResolvedValueOnce([null, null]).mockImplementationOnce(async () => {
        await subscriberHandlers.message(
          'gmi:auth:session-revoked',
          JSON.stringify({ sessionID: 'revoked-during-final-permission-read' }),
        )
        return [null, null]
      })
      ws.emit('message', JSON.stringify({ action: 'server_status', data: { serverID: 'srv-status' } }))
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(ws.send).not.toHaveBeenCalled()
      expect(ws.close).toHaveBeenCalledExactlyOnceWith(1008, 'Session revoked')
    })
    it('never registers a socket closed while its user was still resolving', async () => {
      gmLogMock.mockClear()
      let resolveUser!: (value: any) => void
      getPanelUserFromDiscordIDMock.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveUser = resolve
        }),
      )
      const ws = await connectClient('closed-during-user')
      ws.emit('close')
      resolveUser({ discordID: 'd1' })
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(getUserGuildsWithPermsForPanelMock).not.toHaveBeenCalled()
      expect(ws.listenerCount('message')).toBe(0)
      expect(gmLogMock).not.toHaveBeenCalledWith('websocket', 'Client connected: d1')
    })
    it('never resurrects a socket closed during its initial permission lookup', async () => {
      gmLogMock.mockClear()
      let resolvePermissions!: (value: any) => void
      getUserGuildsWithPermsForPanelMock.mockReturnValueOnce(
        new Promise((resolve) => {
          resolvePermissions = resolve
        }),
      )
      const ws = await connectClient('closed-during-permissions')
      ws.emit('close')
      resolvePermissions([{ id: 'g1' }])
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(ws.listenerCount('message')).toBe(0)
      expect(gmLogMock).not.toHaveBeenCalledWith('websocket', 'Client connected: d1')
      await simulateDashboardDelivery({ id: 'srv-bulk', action: 'server_logs', data: {} })
      expect(ws.send).not.toHaveBeenCalled()
    })
    it('applies session revocation while initial permissions are pending', async () => {
      gmLogMock.mockClear()
      let resolvePermissions!: (value: any) => void
      getUserGuildsWithPermsForPanelMock.mockReturnValueOnce(
        new Promise((resolve) => {
          resolvePermissions = resolve
        }),
      )
      const ws = await connectClient('revoked-during-permissions')
      await subscriberHandlers.message(
        'gmi:auth:session-revoked',
        JSON.stringify({ sessionID: 'revoked-during-permissions' }),
      )
      resolvePermissions([{ id: 'g1' }])
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(ws.close).toHaveBeenCalledExactlyOnceWith(1008, 'Session revoked')
      expect(ws.listenerCount('message')).toBe(0)
      expect(gmLogMock).not.toHaveBeenCalledWith('websocket', 'Client connected: d1')
    })
    it('invalidates local permissions immediately on a member-role notification', async () => {
      const ws = await connectClient('member-role-revoked')
      getUserGuildsWithPermsForPanelMock.mockResolvedValueOnce([])
      await subscriberHandlers.message(
        'gmi:discord:guild-permissions-invalidated',
        JSON.stringify({ discordID: 'd1', guildID: 'g1', revision: 'changed' }),
      )
      await simulateDashboardDelivery({ id: 'srv-bulk', action: 'server_logs', data: {} })
      expect(ws.send).not.toHaveBeenCalled()
      expect(getUserGuildsWithPermsForPanelMock).toHaveBeenCalledTimes(2)
    })
    it('leaves another account snapshot cached after a targeted invalidation', async () => {
      const ws = await connectClient('unaffected-user', 'other')
      await subscriberHandlers.message(
        'gmi:discord:guild-permissions-invalidated',
        JSON.stringify({ discordID: 'd1', guildID: 'g1', revision: 'changed' }),
      )
      await simulateDashboardDelivery({ id: 'srv-bulk', action: 'server_logs', data: {} })
      expect(ws.send).toHaveBeenCalled()
      expect(getUserGuildsWithPermsForPanelMock).toHaveBeenCalledTimes(1)
    })
    it('refreshes a newly granted guild role even when that guild was absent from the previous admin snapshot', async () => {
      getUserGuildsWithPermsForPanelMock.mockResolvedValueOnce([])
      const ws = await connectClient('newly-granted-community-admin')
      getUserGuildsWithPermsForPanelMock.mockResolvedValueOnce([{ id: 'g1' }])
      await subscriberHandlers.message(
        'gmi:discord:guild-permissions-invalidated',
        JSON.stringify({ guildID: 'g1', revision: 'admin-role-enabled' }),
      )
      await simulateDashboardDelivery({ id: 'srv-bulk', action: 'server_logs', data: {} })
      expect(ws.send).toHaveBeenCalled()
      expect(getUserGuildsWithPermsForPanelMock).toHaveBeenCalledTimes(2)
    })
    it('rechecks durable revisions before delivery even if the pubsub invalidation was missed', async () => {
      const ws = await connectClient('missed-permission-revocation')
      redisMock.mget.mockResolvedValue(['role-permission-changed', null])
      getUserGuildsWithPermsForPanelMock.mockResolvedValueOnce([])
      await simulateDashboardDelivery({ id: 'srv-bulk', action: 'server_logs', data: {} })
      expect(ws.send).not.toHaveBeenCalled()
      expect(getUserGuildsWithPermsForPanelMock).toHaveBeenCalledTimes(2)
    })
    it('does not install a permission result invalidated while its request was in flight', async () => {
      const ws = await connectClient('invalidated-during-permissions')
      let resolvePermissions!: (value: any) => void
      getUserGuildsWithPermsForPanelMock.mockReturnValueOnce(
        new Promise((resolve) => {
          resolvePermissions = resolve
        }),
      )
      await subscriberHandlers.message(
        'gmi:discord:guild-permissions-invalidated',
        JSON.stringify({ guildID: 'g1', revision: 'first' }),
      )
      const delivery = simulateDashboardDelivery({ id: 'srv-bulk', action: 'server_logs', data: {} })
      await new Promise((resolve) => setTimeout(resolve, 0))
      await subscriberHandlers.message(
        'gmi:discord:guild-permissions-invalidated',
        JSON.stringify({ guildID: 'g1', revision: 'second' }),
      )
      resolvePermissions([{ id: 'g1' }])
      await delivery
      expect(ws.send).not.toHaveBeenCalled()
    })
    it('rejects a resolved session whose user disappeared before connection', async () => {
      getPanelUserFromDiscordIDMock.mockResolvedValueOnce(null)
      const ws = await connectClient('missing-profile')
      expect(ws.close).toHaveBeenCalledWith(1008, 'Session revoked')
    })
    it('closes temporarily if resolving the user fails after ticket consumption', async () => {
      getPanelUserFromDiscordIDMock.mockRejectedValueOnce(new Error('Database unavailable'))
      const ws = await connectClient('profile-outage')
      expect(ws.close).toHaveBeenCalledWith(1013, 'Session temporarily unavailable')
    })
    it('closes temporarily if initial permissions cannot be resolved', async () => {
      getUserGuildsWithPermsForPanelMock.mockRejectedValueOnce(new Error('Discord unavailable'))
      const ws = await connectClient('initial-permission-outage')
      expect(ws.close).toHaveBeenCalledWith(1013, 'Permissions unavailable')
    })
    it('does not close a transport a second time if it closed during initial permission lookup', async () => {
      getUserGuildsWithPermsForPanelMock.mockImplementationOnce(async () => {
        openedSockets.at(-1).readyState = 3
        throw new Error('Discord unavailable')
      })
      const ws = await connectClient('closed-during-permissions')
      expect(ws.close).not.toHaveBeenCalled()
    })
    it('does not give server access for a guild with no configured servers', async () => {
      getServersFromDiscordGuildIDMock.mockResolvedValueOnce(null)
      const ws = await connectClient('no-servers')
      await capturedWorkers.wsSendToAllClientsOfServer.processor({
        data: { id: 'srv-bulk', action: 'server_logs', data: {} },
      })
      expect(ws.send).not.toHaveBeenCalled()
    })
    it('does not accept a connection that bypassed ticket validation', () => {
      const ws = makeFakeWs()
      capturedWss!.emit('connection', ws, { headers: {}, url: '/ws?ticket=not-verified' })
      expect(ws.close).toHaveBeenCalledWith(1008, 'Session required')
    })
    it('uses the exact session authenticated during the handshake', async () => {
      await connectClient('session-A')
      expect(getPanelUserFromDiscordIDMock).toHaveBeenCalledWith(
        'd1',
        undefined,
        expect.objectContaining({ id: 'session-A' }),
      )
    })
    it('keeps another tab subscribed when the older tab closes', async () => {
      const old = await connectClient('old-tab')
      const current = await connectClient('new-tab')
      old.emit('close')
      await capturedWorkers.wsSendToAllClientsOfServer.processor({
        data: { id: 'srv-bulk', action: 'server_logs', data: { live: true } },
      })
      expect(current.send).toHaveBeenCalledWith(expect.stringContaining('"live":true'))
      expect(old.send).not.toHaveBeenCalled()
      expect(current.close).not.toHaveBeenCalled()
      old.emit('message', JSON.stringify({ action: 'server_status', data: { serverID: 'srv-status' } }))
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(old.send).not.toHaveBeenCalled()
    })
    it('delivers independently to two tabs of the same session', async () => {
      const first = await connectClient('same-session')
      const second = await connectClient('same-session')
      await capturedWorkers.wsSendToAllClientsOfServer.processor({
        data: { id: 'srv-bulk', action: 'server_logs', data: {} },
      })
      expect(first.send).toHaveBeenCalled()
      expect(second.send).toHaveBeenCalled()
    })
    it('closes only revoked sessions and their delegated children', async () => {
      const first = await connectClient('a')
      const delegated = await connectClient('delegated', 'target', { actorSessionID: 'a', actorDiscordID: 'd1' })
      const other = await connectClient('b')
      await subscriberHandlers.message('gmi:auth:session-revoked', JSON.stringify({ sessionID: 'a', discordID: 'd1' }))
      expect(first.close).toHaveBeenCalledWith(1008, 'Session revoked')
      expect(delegated.close).toHaveBeenCalledWith(1008, 'Session revoked')
      expect(other.close).not.toHaveBeenCalled()
    })
    it('stops delivering once the session becomes revoked or expired, even after a missed broadcast', async () => {
      const ws = await connectClient('expired')
      sessions.delete('expired')
      await capturedWorkers.wsSendToAllClientsOfServer.processor({
        data: { id: 'srv-bulk', action: 'server_logs', data: {} },
      })
      expect(ws.close).toHaveBeenCalledWith(1008, 'Session revoked')
      expect(ws.send).not.toHaveBeenCalled()
    })
    it('ignores messages from a transport that is no longer open', async () => {
      const ws = await connectClient('closing-client')
      ws.readyState = 2
      ws.emit('message', JSON.stringify({ action: 'server_status', data: { serverID: 'srv-status' } }))
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(ws.send).not.toHaveBeenCalled()
    })
    it('closes before processing a message when its session has been revoked', async () => {
      const ws = await connectClient('revoked-before-message')
      sessions.delete('revoked-before-message')
      ws.emit('message', JSON.stringify({ action: 'server_status', data: { serverID: 'srv-status' } }))
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(ws.close).toHaveBeenCalledWith(1008, 'Session revoked')
      expect(ws.send).not.toHaveBeenCalled()
    })
    it('does not expose status of a server outside current permissions', async () => {
      const ws = await connectClient('status-forbidden')
      redisMock.get.mockClear()
      ws.emit('message', JSON.stringify({ action: 'server_status', data: { serverID: 'unrelated-server' } }))
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(redisMock.get).not.toHaveBeenCalled()
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"error":"forbidden"'))
    })
    it('replies only to the requesting authorized socket', async () => {
      await connectServer('srv-status')
      const first = await connectClient('status-one')
      const second = await connectClient('status-two')
      redisMock.get.mockResolvedValueOnce('1.0.0').mockResolvedValueOnce(String(Date.now()))
      first.emit('message', JSON.stringify({ action: 'server_status', data: { serverID: 'srv-status' } }))
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(first.send).toHaveBeenCalledWith(expect.stringContaining('"action":"server_status"'))
      expect(second.send).not.toHaveBeenCalled()
      expect(JSON.parse(first.send.mock.calls[0][0]).isWebSocketConnected).toBe(true)
    })
    it('reports a missing version and request time without leaking another server status', async () => {
      const ws = await connectClient('status-no-history')
      redisMock.get.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
      ws.emit('message', JSON.stringify({ action: 'server_status', data: { serverID: 'srv-status' } }))
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(JSON.parse(ws.send.mock.calls[0][0])).toMatchObject({
        serverID: 'srv-status',
        version: null,
        versionComparator: 1,
        isWebSocketConnected: false,
      })
    })
    it('reports an addon connected to another replica without requiring a local socket', async () => {
      const ws = await connectClient('status-remote-addon')
      isServerPresentMock.mockResolvedValueOnce(true)
      ws.emit('message', JSON.stringify({ action: 'server_status', data: { serverID: 'srv-status' } }))
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(isServerPresentMock).toHaveBeenCalledWith('srv-status')
      expect(JSON.parse(ws.send.mock.calls[0][0]).isWebSocketConnected).toBe(true)
    })
    it('revalidates the session again after reading status and suppresses a response revoked in flight', async () => {
      const ws = await connectClient('revoked-during-status')
      redisMock.get
        .mockImplementationOnce(async () => {
          sessions.delete('revoked-during-status')
          return null
        })
        .mockResolvedValueOnce(null)
      ws.emit('message', JSON.stringify({ action: 'server_status', data: { serverID: 'srv-status' } }))
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(ws.send).not.toHaveBeenCalled()
      expect(ws.close).toHaveBeenCalledWith(1008, 'Session revoked')
    })
    it('logs a session-storage outage during live delivery without sending cached data', async () => {
      const ws = await connectClient('delivery-session-outage')
      validateSessionMock.mockRejectedValueOnce(new Error('Database unavailable'))
      await capturedWorkers.wsSendToAllClientsOfServer.processor({
        data: { id: 'srv-bulk', action: 'server_logs', data: {} },
      })
      expect(ws.send).not.toHaveBeenCalled()
      expect(gmLogMock).toHaveBeenCalledWith('websocket', 'Client delivery temporarily unavailable', true)
    })
    it('rechecks permissions before delivery after the freshness bound', async () => {
      const ws = await connectClient('permission-revoked')
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31_000)
      try {
        getUserGuildsWithPermsForPanelMock.mockResolvedValueOnce([])
        await capturedWorkers.wsSendToAllClientsOfServer.processor({
          data: { id: 'srv-bulk', action: 'server_logs', data: {} },
        })
        expect(ws.send).not.toHaveBeenCalled()
        await capturedWorkers.wsSendToAllClientsOfServer.processor({
          data: { id: 'srv-bulk', action: 'server_logs', data: {} },
        })
        expect(getUserGuildsWithPermsForPanelMock).toHaveBeenCalledTimes(2)
      } finally {
        vi.restoreAllMocks()
      }
    })
    it('suppresses delivery instead of preserving stale permissions during a provider outage', async () => {
      const ws = await connectClient('permission-outage')
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31_000)
      try {
        getUserGuildsWithPermsForPanelMock.mockRejectedValueOnce(new Error('Discord unavailable'))
        await capturedWorkers.wsSendToAllClientsOfServer.processor({
          data: { id: 'srv-bulk', action: 'server_logs', data: {} },
        })
        expect(ws.send).not.toHaveBeenCalled()
        await capturedWorkers.wsSendToAllClientsOfServer.processor({
          data: { id: 'srv-bulk', action: 'server_logs', data: {} },
        })
        expect(getUserGuildsWithPermsForPanelMock).toHaveBeenCalledTimes(2)
      } finally {
        vi.restoreAllMocks()
      }
    })
    it('does not answer status if a permission refresh fails after the freshness deadline', async () => {
      const ws = await connectClient('status-permission-outage')
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31_000)
      try {
        getUserGuildsWithPermsForPanelMock.mockRejectedValueOnce(new Error('Discord unavailable'))
        ws.emit('message', JSON.stringify({ action: 'server_status', data: { serverID: 'srv-status' } }))
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(ws.send).not.toHaveBeenCalled()
      } finally {
        vi.restoreAllMocks()
      }
    })
    it('closes an expired session on its scheduled check even without new messages', async () => {
      const ws = await connectClient('timer-expiry', 'd1', { expiresAt: new Date(Date.now() + 50) })
      sessions.delete('timer-expiry')
      await new Promise((resolve) => setTimeout(resolve, 80))
      expect(ws.close).toHaveBeenCalledWith(1008, 'Session revoked')
      expect(ws.send).not.toHaveBeenCalled()
    })
    it('reschedules checks when HTTP activity extends a still-valid session', async () => {
      const ws = await connectClient('timer-extended', 'd1', { expiresAt: new Date(Date.now() + 20) })
      sessions.set('timer-extended', session('timer-extended'))
      await new Promise((resolve) => setTimeout(resolve, 45))
      expect(validateSessionMock).toHaveBeenCalledWith('timer-extended')
      expect(ws.close).not.toHaveBeenCalled()
    })
    it('closes with a temporary failure if a scheduled session check cannot reach storage', async () => {
      const ws = await connectClient('timer-storage-outage', 'd1', { expiresAt: new Date(Date.now() + 20) })
      validateSessionMock.mockRejectedValueOnce(new Error('Storage unavailable'))
      await new Promise((resolve) => setTimeout(resolve, 45))
      expect(ws.close).toHaveBeenCalledWith(1013, 'Session unavailable')
    })
    it('requires Discord reauthorization without describing it as a revoked local session', async () => {
      getUserGuildsWithPermsForPanelMock.mockRejectedValueOnce(
        Object.assign(new Error('Reconnect Discord'), { code: 'discord_reauth_required' }),
      )
      const ws = await connectClient('reconnect-discord')
      expect(ws.close).toHaveBeenCalledWith(4003, 'Discord authorization required')
      expect(ws.close).not.toHaveBeenCalledWith(1008, expect.any(String))
    })
    it('handles malformed client messages safely', async () => {
      const ws = await connectClient('malformed')
      ws.emit('message', '{not json')
      expect(gmLogMock).toHaveBeenCalledWith('websocket', 'Error processing client message', true)
    })
    it('ignores actionless messages, unknown actions and malformed server IDs', async () => {
      const ws = await connectClient('invalid-actions')
      for (const value of [null, {}, 'string', { action: 'unknown' }, { action: 'server_status', data: {} }])
        ws.emit('message', JSON.stringify(value))
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(ws.send).not.toHaveBeenCalled()
      expect(ws.close).not.toHaveBeenCalled()
    })
  })

  describe('wsSendToServer queue worker', () => {
    it('delivers allowed effective synchronization to its authenticated addon', async () => {
      const ws = await connectServer('sync-allowed')
      getServerFromIDMock.mockResolvedValueOnce({ getEffectiveSetting: async () => 'both' })
      expect(
        await capturedWorkers.wsSendToServer.processor({
          data: { id: 'sync-allowed', data: { method: 'wsSyncName', name: 'Allowed' } },
        }),
      ).toBe(true)
      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ method: 'wsSyncName', name: 'Allowed' }))
    })
    it('resolves locally when the target server is connected', async () => {
      const ws = makeFakeWs()
      await connectServer('srv-local', ws)
      const result = await capturedWorkers['wsSendToServer'].processor({
        data: { id: 'srv-local', data: { hello: 'world' } },
      })
      expect(result).toBe(true)
      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ hello: 'world' }))
    })

    it('keeps privileged payloads out of dispatch logs', async () => {
      const ws = await connectServer('private-command')
      gmLogMock.mockClear()
      const data = { method: 'wsServerRunLua', data: 'private-console-payload' }
      expect(await capturedWorkers.wsSendToServer.processor({ data: { id: 'private-command', data } })).toBe(true)
      expect(ws.send).toHaveBeenCalledWith(JSON.stringify(data))
      expect(JSON.stringify(gmLogMock.mock.calls)).not.toContain('private-console-payload')
      expect(gmLogMock).toHaveBeenCalledWith(
        'websocket',
        JSON.stringify({ action: 'command_dispatched', serverID: 'private-command', method: 'wsServerRunLua' }),
      )
    })

    it.each([
      [{ method: 'wsSyncName' }, 'gmod-to-discord'],
      [{ method: 'wsPlayerSay' }, 'gmodToDiscord'],
      [{ method: 'wsPlayerUpdateGroup', add: true }, 'gmod-to-discord'],
    ])(
      'does not dispatch or broadcast paid synchronization after effective access expires: %j',
      async (data, direction) => {
        getServerFromIDMock.mockResolvedValueOnce({ getEffectiveSetting: vi.fn().mockResolvedValue(direction) })
        redisMock.publish.mockClear()
        const result = await capturedWorkers.wsSendToServer.processor({ data: { id: 'expired', data } })
        expect(result).toBe(false)
        expect(redisMock.publish).not.toHaveBeenCalled()
      },
    )

    it.each(['wsRcon', 'wsAuthorizedRcon'])(
      'does not execute %s queued before the paid capability expired',
      async (method) => {
        getServerFromIDMock.mockResolvedValueOnce({ getGuildID: () => 'community' })
        accessMock.mockResolvedValueOnce({
          guildID: 'community',
          premium: false,
          customBot: false,
          state: 'ready',
          sources: [],
          revision: 'expired',
          validUntil: '2030-01-01T00:00:00.000Z',
        })
        redisMock.publish.mockClear()
        const result = await capturedWorkers.wsSendToServer.processor({
          data: { id: 'expired', data: { method, command: 'status' } },
        })
        expect(result).toBe(false)
        expect(redisMock.publish).not.toHaveBeenCalled()
      },
    )

    it('still allows role removal commands used for cleanup after expiry', async () => {
      redisMock.get.mockResolvedValueOnce('1')
      const data = { method: 'wsPlayerUpdateGroup', add: false }
      const result = await capturedWorkers.wsSendToServer.processor({ data: { id: 'cleanup', data } })
      expect(result).toBe(true)
    })

    it('broadcasts and resolves true when a remote replica acks in time', async () => {
      redisMock.get.mockResolvedValueOnce('1')
      const resultPromise = capturedWorkers['wsSendToServer'].processor({
        data: { id: 'srv-remote-ack', data: { x: 1 } },
      })
      await expect(resultPromise).resolves.toBe(true)
      expect(redisMock.publish).toHaveBeenCalled()
      expect(redisMock.del).toHaveBeenCalled()
    })

    it('broadcasts and resolves false when no remote replica acks before the deadline', async () => {
      redisMock.get.mockResolvedValue(undefined)
      const result = await capturedWorkers['wsSendToServer'].processor({
        data: { id: 'srv-remote-timeout', data: { x: 1 } },
      })
      expect(result).toBe(false)
    }, 2000)
  })

  describe('privacy revocation and delivery', () => {
    it('closes subject sessions and actor delegations on erasure broadcast while preserving unrelated tabs', async () => {
      const first = await connectClient('privacy-one', 'privacy-user')
      const second = await connectClient('privacy-two', 'privacy-user')
      const delegated = await connectClient('privacy-delegated', 'delegation-target', {
        actorDiscordID: 'privacy-user',
        actorSessionID: 'privacy-one',
      })
      const unrelated = await connectClient('privacy-unrelated', 'unrelated-user')
      await subscriberHandlers.message('gmi:privacy:revoked', JSON.stringify({ discordID: 'privacy-user' }))
      expect(first.close).toHaveBeenCalledWith(1008, 'Session revoked')
      expect(second.close).toHaveBeenCalledWith(1008, 'Session revoked')
      expect(delegated.close).toHaveBeenCalledWith(1008, 'Session revoked')
      expect(unrelated.close).not.toHaveBeenCalled()
    })
    it('checks the durable erasure marker before delivery', async () => {
      const ws = await connectClient('erased')
      isErasureBlockedMock.mockResolvedValue(true)
      await capturedWorkers.wsSendToAllClientsOfServer.processor({
        data: { id: 'srv-bulk', action: 'server_logs', data: {} },
      })
      expect(ws.close).toHaveBeenCalledWith(1008, 'Session revoked')
      expect(ws.send).not.toHaveBeenCalled()
    })
  })

  describe('authenticated addon command acknowledgements', () => {
    it.each(['v1.2.3', 'v1.2.3-beta.1', ['v1.2.3'], 'private invalid version', '1.2.3-' + 'x'.repeat(64)])(
      'records only a bounded semantic addon version from request headers: %j',
      async (version) => {
        const id = 'version-activity'
        const ws = await connectServer(id, makeFakeWs(), { 'gmod-integrations-version': version })
        getServerFromIDMock.mockResolvedValueOnce({ getID: () => id, isValidToken: () => true })
        redisMock.set.mockClear()
        await ws.listeners('message')[0](
          Buffer.from(
            JSON.stringify({ action: 'addon.request', id: 'activity', method: 'GET', endpoint: `/servers/${id}` }),
          ),
          false,
        )
        expect(redisMock.set).toHaveBeenCalledWith(`server:${id}:last_request`, expect.any(String))
        if (typeof version === 'string' && version.length <= 64 && version.startsWith('v1.2.3'))
          expect(redisMock.set).toHaveBeenCalledWith(`server:${id}:version`, version)
        else expect(redisMock.set.mock.calls.some(([key]: [string]) => key === `server:${id}:version`)).toBe(false)
      },
    )
    it.each(['allowed', 'missing-server', 'expired-capability'] as const)(
      'rechecks console access before broadcasting addon output: %s',
      async (access) => {
        const id = 'console-output'
        const ws = await connectServer(id)
        const server = { getID: () => id, getGuildID: () => 'g1', isValidToken: () => true }
        getServerFromIDMock
          .mockResolvedValueOnce(server)
          .mockResolvedValueOnce(access === 'missing-server' ? undefined : server)
        accessMock.mockResolvedValueOnce({
          guildID: 'g1',
          premium: access === 'allowed',
          customBot: false,
          state: 'ready',
          sources: [],
          revision: 'console',
          validUntil: '2030-01-01T00:00:00.000Z',
        })
        consoleQueueAddMock.mockClear()
        await ws.listeners('message')[0](
          Buffer.from(JSON.stringify({ action: 'console_live_exporter', data: { data: 'private console output' } })),
          false,
        )
        if (access === 'allowed')
          expect(consoleQueueAddMock).toHaveBeenCalledExactlyOnceWith('wsSendToAllClientsOfServer', {
            id,
            action: 'console_live_exporter',
            data: { data: 'private console output' },
          })
        else expect(consoleQueueAddMock).not.toHaveBeenCalled()
        expect(JSON.stringify(gmLogMock.mock.calls)).not.toContain('private console output')
        accessMock.mockReset()
      },
    )
    it('routes an execution acknowledgement with the authenticated server identity', async () => {
      const ws = await connectServer('rcon-command-result')
      getServerFromIDMock.mockResolvedValueOnce({ isValidToken: () => true, getID: () => 'rcon-command-result' })
      const packet = {
        action: 'addon.command-result',
        id: '123e4567-e89b-42d3-a456-426614174000',
        method: 'wsAuthorizedRcon',
        ok: true,
        code: 'executed',
      }
      ws.emit('message', Buffer.from(JSON.stringify(packet)), false)
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(acceptAddonCommandResultMock).toHaveBeenCalledWith('rcon-command-result', packet)
    })
  })

  describe('subscriber handlers', () => {
    it('delivers a dashboard broadcast once through the same subscriber as remote replicas', async () => {
      const ws = await connectClient('dashboard-broadcast')
      const data = { id: 'srv-bulk', action: 'server_logs', data: { live: true } }
      await capturedWorkers.wsSendToAllClientsOfServer.processor({ data })
      expect(redisMock.publish).toHaveBeenCalledWith('ws:send-to-clients:broadcast', JSON.stringify(data))
      expect(ws.send).toHaveBeenCalledTimes(1)
    })
    it.each([null, {}, { id: 1 }, { id: '' }, { id: 'srv-bulk', action: 1 }, { id: 'srv-bulk', action: '' }])(
      'ignores an invalid dashboard broadcast %j',
      async (value) => {
        const ws = await connectClient('invalid-dashboard-broadcast')
        await subscriberHandlers.message('ws:send-to-clients:broadcast', JSON.stringify(value))
        expect(ws.send).not.toHaveBeenCalled()
      },
    )
    it('logs malformed dashboard broadcasts without disrupting the subscriber', async () => {
      await subscriberHandlers.message('ws:send-to-clients:broadcast', '{bad json')
      expect(gmLogMock).toHaveBeenCalledWith('websocket', 'Invalid dashboard broadcast message', true)
    })
    it.each([
      ['gmi:auth:session-revoked', 'sessionID', 'Invalid session revocation message'],
      ['gmi:privacy:revoked', 'discordID', 'Invalid privacy revocation message'],
    ])('ignores malformed identifiers and logs corrupt payloads on %s', async (channel, key, message) => {
      const ws = await connectClient('safe-from-malformed-revocation')
      await subscriberHandlers.message(channel, JSON.stringify({ [key]: 123 }))
      expect(ws.close).not.toHaveBeenCalled()
      await subscriberHandlers.message(channel, '{malformed')
      expect(gmLogMock).toHaveBeenCalledWith('websocket', message, true)
      expect(ws.close).not.toHaveBeenCalled()
    })
    it('rejects a remote synchronization dispatch when effective access no longer allows it', async () => {
      const ws = await connectServer('remote-restricted')
      getServerFromIDMock.mockResolvedValueOnce({ getEffectiveSetting: async () => 'gmod-to-discord' })
      await subscriberHandlers.message(
        'ws:send-to-server:broadcast',
        JSON.stringify({
          id: 'remote-restricted',
          requestId: 'not-acked',
          data: { method: 'wsSyncName' },
        }),
      )
      expect(ws.send.mock.calls.map(([payload]: [string]) => JSON.parse(payload))).toEqual([
        { action: 'addon.ready', protocol: 1 },
      ])
      expect(redisMock.incr).not.toHaveBeenCalledWith('ws:send-to-server:ack:not-acked')
    })
    it('logs subscriber errors', () => {
      subscriberHandlers['error'](new Error('sub boom'))
      expect(gmLogMock).toHaveBeenCalledWith('websocket', expect.stringContaining('Subscriber error'), true)
    })

    it('ignores messages on a different channel', async () => {
      await subscriberHandlers['message']('some-other-channel', JSON.stringify({ id: 'x', requestId: 'r' }))
    })

    it('logs and continues on malformed broadcast payloads', async () => {
      await subscriberHandlers['message']('ws:send-to-server:broadcast', '{not json')
      expect(gmLogMock).toHaveBeenCalledWith(
        'websocket',
        expect.stringContaining('Failed to process remote ws dispatch payload'),
        true,
      )
    })

    it('ignores a payload missing serverID or requestId', async () => {
      await subscriberHandlers['message']('ws:send-to-server:broadcast', JSON.stringify({ id: '', requestId: '' }))
    })

    it('does nothing when the target server is not connected locally', async () => {
      await subscriberHandlers['message'](
        'ws:send-to-server:broadcast',
        JSON.stringify({ id: 'srv-not-connected', data: {}, requestId: 'r1' }),
      )
      expect(redisMock.incr).not.toHaveBeenCalledWith('ws:send-to-server:ack:r1')
    })

    it('acks once the payload is delivered to a locally-connected server', async () => {
      const ws = makeFakeWs()
      await connectServer('srv-broadcast', ws)
      await subscriberHandlers['message'](
        'ws:send-to-server:broadcast',
        JSON.stringify({ id: 'srv-broadcast', data: { a: 1 }, requestId: 'r2' }),
      )
      expect(redisMock.incr).toHaveBeenCalledWith('ws:send-to-server:ack:r2')
      expect(redisMock.expire).toHaveBeenCalledWith('ws:send-to-server:ack:r2', 5)
    })
  })

  describe('dashboard authorization races and backpressure', () => {
    it.each(
      (['status', 'broadcast'] as const).flatMap((delivery) =>
        Array.from({ length: 32 }, (_, turn) => [delivery, turn] as const),
      ),
    )('never delivers after close during a %s request at asynchronous turn %i', async (delivery, turn) => {
      const ws = await connectClient('closing-delivery')
      const pending =
        delivery === 'status'
          ? ws.listeners('message')[0](JSON.stringify({ action: 'server_status', data: { serverID: 'srv-status' } }))
          : simulateDashboardDelivery({ id: 'srv-bulk', action: 'server_logs', data: {} })
      // Explore close interleavings across the session, revision and permission promises through
      // the public message/delivery callbacks, without reaching into the client's private state.
      for (let index = 0; index < turn; index++) await Promise.resolve()
      const deliveredBeforeClose = ws.send.mock.calls.length
      ws.emit('close')
      await pending
      expect(ws.send).toHaveBeenCalledTimes(deliveredBeforeClose)
    })

    it.each(['revision', 'invalidation', 'close'] as const)(
      'refuses a permission snapshot changed during the final revision read: %s',
      async (change) => {
        const ws = await connectClient('final-read-race')
        await subscriberHandlers.message(
          'gmi:discord:guild-permissions-invalidated',
          JSON.stringify({ guildID: 'g1', revision: 'refresh' }),
        )
        redisMock.mget.mockResolvedValueOnce([null, null]).mockImplementationOnce(async () => {
          if (change === 'invalidation')
            await subscriberHandlers.message(
              'gmi:discord:guild-permissions-invalidated',
              JSON.stringify({ guildID: 'g1', revision: 'changed-again' }),
            )
          if (change === 'close') ws.emit('close')
          return change === 'revision' ? ['changed-durably', null] : [null, null]
        })
        await ws.listeners('message')[0](JSON.stringify({ action: 'server_status', data: { serverID: 'srv-status' } }))
        expect(ws.send).not.toHaveBeenCalled()
        expect(getUserGuildsWithPermsForPanelMock).toHaveBeenCalledTimes(2)
      },
    )

    it('suppresses delivery after a socket closes during session validation', async () => {
      const ws = await connectClient('closed-while-validating')
      validateSessionMock.mockImplementationOnce(async (id) => {
        ws.emit('close')
        return sessions.get(id)
      })
      await ws.listeners('message')[0](JSON.stringify({ action: 'server_status', data: { serverID: 'srv-status' } }))
      expect(ws.send).not.toHaveBeenCalled()
      expect(isServerPresentMock).not.toHaveBeenCalledWith('srv-status')
    })

    it('does not register message processing when a session is revoked during initial permission lookup', async () => {
      getUserGuildsWithPermsForPanelMock.mockImplementationOnce(async () => {
        sessions.delete('revoked-before-listener')
        return [{ id: 'g1' }]
      })
      const ws = await connectClient('revoked-before-listener')
      expect(ws.close).toHaveBeenCalledWith(1008, 'Session revoked')
      expect(ws.listenerCount('message')).toBe(0)
    })

    it('drops excess concurrent status requests and releases the budget after both requests finish', async () => {
      const ws = await connectClient('slow-status-validation')
      const resolveSessions: ((value: unknown) => void)[] = []
      validateSessionMock.mockClear().mockImplementation(() => new Promise((resolve) => resolveSessions.push(resolve)))
      const handle = ws.listeners('message')[0]
      const packet = JSON.stringify({ action: 'server_status', data: { serverID: 'srv-status' } })
      const first = handle(packet)
      const second = handle(packet)
      await handle(packet)
      expect(resolveSessions).toHaveLength(2)
      expect(ws.close).not.toHaveBeenCalled()
      validateSessionMock.mockImplementation(async (id) => sessions.get(id) || null)
      resolveSessions.forEach((resolve) => resolve(sessions.get('slow-status-validation')))
      await Promise.all([first, second])
      expect(ws.send).toHaveBeenCalledTimes(2)
      await handle(packet)
      expect(ws.send).toHaveBeenCalledTimes(3)
    })

    it('ignores a session revocation message without a string session identifier', async () => {
      const ws = await connectClient('valid-revocation-target')
      await subscriberHandlers.message('gmi:auth:session-revoked', JSON.stringify({ sessionID: 42 }))
      expect(ws.close).not.toHaveBeenCalled()
      await ws.listeners('message')[0](JSON.stringify({ action: 'server_status', data: { serverID: 'srv-status' } }))
      expect(ws.send).toHaveBeenCalledOnce()
    })

    it.each(['not json', '{}', '{"guildID":"g1","revision":""}'])(
      'ignores malformed permission invalidation without discarding a valid snapshot: %s',
      async (payload) => {
        const ws = await connectClient('valid-permissions')
        await subscriberHandlers.message('gmi:discord:guild-permissions-invalidated', payload)
        await ws.listeners('message')[0](JSON.stringify({ action: 'server_status', data: { serverID: 'srv-status' } }))
        expect(ws.send).toHaveBeenCalledOnce()
        expect(getUserGuildsWithPermsForPanelMock).toHaveBeenCalledOnce()
      },
    )
  })

  describe('gracefulShutdown', () => {
    it('tears down workers/subscriber/wss/redis/prisma and exits, then is a no-op on re-entry', async () => {
      const browser = await connectClient('shutdown-session')
      const addon = await connectServer('shutdown-addon')
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
      // Reject once each to exercise the `.catch(() => {})` swallow after unsubscribe/quit.
      redisSubscriberMock.unsubscribe.mockRejectedValueOnce(new Error('unsubscribe boom'))
      redisSubscriberMock.quit.mockRejectedValueOnce(new Error('quit boom'))
      try {
        let finishPresenceCleanup!: () => void
        presences[0].close.mockImplementationOnce(
          () =>
            new Promise<void>((resolve) => {
              finishPresenceCleanup = () => {
                presences[0].closed = true
                resolve()
              }
            }),
        )
        const shutdown = gracefulShutdown()
        await Promise.resolve()
        expect(gracefulShutdownRedisMock).not.toHaveBeenCalled()
        finishPresenceCleanup()
        await shutdown
        expect(capturedWorkers['wsSendToServer'].close).toHaveBeenCalled()
        expect(capturedWorkers['wsSendToAllClientsOfServer'].close).toHaveBeenCalled()
        expect(redisSubscriberMock.unsubscribe).toHaveBeenCalled()
        expect(redisSubscriberMock.quit).toHaveBeenCalled()
        expect(gracefulShutdownRedisMock).toHaveBeenCalled()
        expect(gracefulShutdownPrismaMock).toHaveBeenCalled()
        expect(exitSpy).toHaveBeenCalledWith(0)
        expect(browser.close).toHaveBeenCalledWith(1001, 'Service restarting')
        expect(addon.close).toHaveBeenCalledWith(1001, 'Service restarting')
        expect(presences[0].close).toHaveBeenCalled()
        expect(presences[0].closed).toBe(true)
        expect(presences[0].close.mock.invocationCallOrder[0]).toBeLessThan(
          gracefulShutdownRedisMock.mock.invocationCallOrder[0],
        )

        const late = await connectServer('late-during-shutdown')
        expect(late.close).toHaveBeenCalledWith(1001, 'Service restarting')

        capturedWorkers['wsSendToServer'].close.mockClear()
        await gracefulShutdown()
        expect(capturedWorkers['wsSendToServer'].close).not.toHaveBeenCalled()
      } finally {
        exitSpy.mockRestore()
      }
    })
  })

  afterAll(() => {
    for (const event of ['SIGINT', 'SIGTERM']) {
      const listeners = process.listeners(event as any)
      for (const l of listeners) {
        if ((l as any).name === 'gracefulShutdown') process.removeListener(event as any, l as any)
      }
    }
  })
})
