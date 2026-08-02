import { EventEmitter } from 'node:events'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const gmLogMock = vi.fn()
vi.mock('@gmod/core/utils/logger.js', () => ({ gmLog: gmLogMock }))

vi.mock('@gmod/config', () => ({ ConfigServer: { ports: { websocket: 9999 } } }))

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
const redisSubscriberMock = {
  on: vi.fn((event: string, cb: any) => {
    subscriberHandlers[event] = cb
  }),
  subscribe: vi.fn().mockResolvedValue(undefined),
  unsubscribe: vi.fn().mockResolvedValue(undefined),
  quit: vi.fn().mockResolvedValue(undefined),
}
const redisMock: any = {
  get: vi.fn(),
  set: vi.fn().mockResolvedValue(undefined),
  del: vi.fn().mockResolvedValue(undefined),
  incr: vi.fn().mockResolvedValue(undefined),
  expire: vi.fn().mockResolvedValue(undefined),
  publish: vi.fn().mockResolvedValue(undefined),
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
vi.mock('@gmod/infra-websocket/queues.js', () => ({
  wsSendToServerQueue: { name: 'wsSendToServer' },
  wsSendToAllClientsOfServerQueue: { name: 'wsSendToAllClientsOfServer' },
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
    expect(capturedWss?.opts.port).toBe(9999)
    expect(capturedWorkers['wsSendToServer']).toBeDefined()
    expect(capturedWorkers['wsSendToAllClientsOfServer']).toBeDefined()
    expect(gmLogMock).toHaveBeenCalledWith('websocket', expect.stringContaining('Listening on port'))
  })

  describe('verifyClient', () => {
    function verify(info: any) {
      return new Promise((resolve) => {
        capturedWss!.opts.verifyClient(info, (...args: any[]) => resolve(args))
      })
    }

    it('authorizes a server with a valid id+token', async () => {
      getServerFromIDMock.mockResolvedValueOnce({ isValidToken: () => true })
      const result = await verify({ req: { headers: { id: 's1', token: 'tok' }, url: '/' } })
      expect(result).toEqual([true])
    })

    it('falls through to unauthorized when the server id does not resolve', async () => {
      getServerFromIDMock.mockResolvedValueOnce(null)
      const result = await verify({ req: { headers: { id: 's1', token: 'tok' }, url: '/' } })
      expect(result).toEqual([false, 401, 'Unauthorized'])
    })

    it('falls through to unauthorized when the server token is invalid', async () => {
      getServerFromIDMock.mockResolvedValueOnce({ isValidToken: () => false })
      const result = await verify({ req: { headers: { id: 's1', token: 'bad' }, url: '/' } })
      expect(result).toEqual([false, 401, 'Unauthorized'])
    })

    it('authorizes a panel client via discordID+token in the URL', async () => {
      getPanelUserFromDiscordIDMock.mockResolvedValueOnce({ authAllowed: async () => true })
      const result = await verify({ req: { headers: {}, url: '/ws?discordID=d1/token=tok' } })
      expect(result).toEqual([true])
    })

    it('falls through to unauthorized when the panel user is not found', async () => {
      getPanelUserFromDiscordIDMock.mockResolvedValueOnce(null)
      const result = await verify({ req: { headers: {}, url: '/ws?discordID=d1/token=tok' } })
      expect(result).toEqual([false, 401, 'Unauthorized'])
    })

    it('falls through to unauthorized when authAllowed rejects the token', async () => {
      getPanelUserFromDiscordIDMock.mockResolvedValueOnce({ authAllowed: async () => false })
      const result = await verify({ req: { headers: {}, url: '/ws?discordID=d1/token=bad' } })
      expect(result).toEqual([false, 401, 'Unauthorized'])
    })

    it('rejects when neither server headers nor a client URL are present', async () => {
      const result = await verify({ req: { headers: {}, url: '/ws' } })
      expect(result).toEqual([false, 401, 'Unauthorized'])
    })

    it('rejects when the url mentions discordID/token but one resolves empty', async () => {
      const result = await verify({ req: { headers: {}, url: '/ws?discordID=/token=tok' } })
      expect(result).toEqual([false, 401, 'Unauthorized'])
      expect(getPanelUserFromDiscordIDMock).not.toHaveBeenCalledWith('')
    })
  })

  describe('connection handler - server sockets', () => {
    it('registers a server connection and replaces an existing one with the same id', () => {
      const ws1 = makeFakeWs()
      capturedWss!.emit('connection', ws1, { headers: { id: 'srv-a', token: 'tok' }, url: '/' })
      expect(gmLogMock).toHaveBeenCalledWith('websocket', expect.stringContaining('Server connected: srv-a'))

      const ws2 = makeFakeWs()
      capturedWss!.emit('connection', ws2, { headers: { id: 'srv-a', token: 'tok' }, url: '/' })
      expect(ws1.close).toHaveBeenCalled()
    })

    it('swallows an error thrown while closing the replaced socket', () => {
      const ws1 = makeFakeWs()
      ws1.close = vi.fn(() => {
        throw new Error('close boom')
      })
      capturedWss!.emit('connection', ws1, { headers: { id: 'srv-b', token: 'tok' }, url: '/' })
      const ws2 = makeFakeWs()
      expect(() =>
        capturedWss!.emit('connection', ws2, { headers: { id: 'srv-b', token: 'tok' }, url: '/' }),
      ).not.toThrow()
    })

    it('removes the server from the tracked list on close', () => {
      const ws = makeFakeWs()
      capturedWss!.emit('connection', ws, { headers: { id: 'srv-c', token: 'tok' }, url: '/' })
      ws.emit('close')
      expect(gmLogMock).toHaveBeenCalledWith('websocket', expect.stringContaining('Server disconnected: srv-c'))
    })

    it('logs and continues on malformed JSON messages', () => {
      const ws = makeFakeWs()
      capturedWss!.emit('connection', ws, { headers: { id: 'srv-d', token: 'tok' }, url: '/' })
      ws.emit('message', '{not json')
      expect(gmLogMock).toHaveBeenCalledWith('websocket', expect.stringContaining('Error parsing message from server'))
    })

    it('ignores a message with no action', () => {
      const ws = makeFakeWs()
      capturedWss!.emit('connection', ws, { headers: { id: 'srv-e', token: 'tok' }, url: '/' })
      ws.emit('message', JSON.stringify({}))
    })

    it('ignores an unknown action', () => {
      const ws = makeFakeWs()
      capturedWss!.emit('connection', ws, { headers: { id: 'srv-f', token: 'tok' }, url: '/' })
      ws.emit('message', JSON.stringify({ action: 'not-a-real-action' }))
    })

    it('save_config does nothing when the server cannot be resolved', async () => {
      getServerFromIDMock.mockResolvedValueOnce(null)
      const ws = makeFakeWs()
      capturedWss!.emit('connection', ws, { headers: { id: 'srv-g', token: 'tok' }, url: '/' })
      ws.emit('message', JSON.stringify({ action: 'save_config', config: {} }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    it('save_config saves the settings when the server resolves', async () => {
      const saveIGSettings = vi.fn().mockResolvedValue(undefined)
      getServerFromIDMock.mockResolvedValueOnce({ saveIGSettings })
      const ws = makeFakeWs()
      capturedWss!.emit('connection', ws, { headers: { id: 'srv-h', token: 'tok' }, url: '/' })
      ws.emit('message', JSON.stringify({ action: 'save_config', config: { foo: 'bar' } }))
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(saveIGSettings).toHaveBeenCalledWith({ foo: 'bar' })
    })
  })

  describe('connection handler - ping interval', () => {
    it('pings the socket on the interval tick', () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
      try {
        const ws = makeFakeWs()
        capturedWss!.emit('connection', ws, { headers: {}, url: '/' })
        vi.advanceTimersByTime(1000)
        expect(ws.ping).toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('connection handler - client sockets', () => {
    it('does nothing when the url has neither discordID nor token', () => {
      const ws = makeFakeWs()
      expect(() => capturedWss!.emit('connection', ws, { headers: {}, url: '/' })).not.toThrow()
    })

    it('does nothing when the url mentions discordID/token but one resolves empty', () => {
      const ws = makeFakeWs()
      expect(() =>
        capturedWss!.emit('connection', ws, { headers: {}, url: '/ws?discordID=/token=tok' }),
      ).not.toThrow()
      expect(getPanelUserFromDiscordIDMock).not.toHaveBeenCalledWith('')
    })

    it('closes the socket when the panel user cannot be resolved', async () => {
      getPanelUserFromDiscordIDMock.mockResolvedValueOnce(null)
      const ws = makeFakeWs()
      capturedWss!.emit('connection', ws, { headers: {}, url: '/ws?discordID=d-a/token=tok' })
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(ws.close).toHaveBeenCalled()
    })

    it('registers a client connection, replacing an existing one for the same discordID', async () => {
      getPanelUserFromDiscordIDMock.mockReset().mockResolvedValue({ discordID: 'd-b' })
      getUserGuildsWithPermsForPanelMock.mockReset().mockResolvedValue([{ id: 'g1' }])
      getServersFromDiscordGuildIDMock.mockReset().mockResolvedValueOnce([{ id: 'srv-x' }])

      const ws1 = makeFakeWs()
      capturedWss!.emit('connection', ws1, { headers: {}, url: '/ws?discordID=d-b/token=tok' })
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(gmLogMock).toHaveBeenCalledWith('websocket', expect.stringContaining('Client connected: d-b'))

      getServersFromDiscordGuildIDMock.mockResolvedValueOnce(null)
      const ws2 = makeFakeWs()
      capturedWss!.emit('connection', ws2, { headers: {}, url: '/ws?discordID=d-b/token=tok' })
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    it('removes the client from the tracked list on close', async () => {
      getPanelUserFromDiscordIDMock.mockResolvedValueOnce({ discordID: 'd-c' })
      getUserGuildsWithPermsForPanelMock.mockResolvedValueOnce([])
      const ws = makeFakeWs()
      capturedWss!.emit('connection', ws, { headers: {}, url: '/ws?discordID=d-c/token=tok' })
      await new Promise((resolve) => setTimeout(resolve, 0))
      ws.emit('close')
      expect(gmLogMock).toHaveBeenCalledWith('websocket', expect.stringContaining('Client disconnected: d-c'))
    })

    it('logs and continues on malformed JSON client messages', async () => {
      getPanelUserFromDiscordIDMock.mockResolvedValueOnce({ discordID: 'd-d' })
      getUserGuildsWithPermsForPanelMock.mockResolvedValueOnce([])
      const ws = makeFakeWs()
      capturedWss!.emit('connection', ws, { headers: {}, url: '/ws?discordID=d-d/token=tok' })
      await new Promise((resolve) => setTimeout(resolve, 0))
      ws.emit('message', '{not json')
      expect(gmLogMock).toHaveBeenCalledWith('websocket', expect.stringContaining('Error parsing message from client'))
    })

    it('ignores a client message with no action', async () => {
      getPanelUserFromDiscordIDMock.mockResolvedValueOnce({ discordID: 'd-e' })
      getUserGuildsWithPermsForPanelMock.mockResolvedValueOnce([])
      const ws = makeFakeWs()
      capturedWss!.emit('connection', ws, { headers: {}, url: '/ws?discordID=d-e/token=tok' })
      await new Promise((resolve) => setTimeout(resolve, 0))
      ws.emit('message', JSON.stringify({}))
    })

    it('ignores an unknown client action', async () => {
      getPanelUserFromDiscordIDMock.mockResolvedValueOnce({ discordID: 'd-f' })
      getUserGuildsWithPermsForPanelMock.mockResolvedValueOnce([])
      const ws = makeFakeWs()
      capturedWss!.emit('connection', ws, { headers: {}, url: '/ws?discordID=d-f/token=tok' })
      await new Promise((resolve) => setTimeout(resolve, 0))
      ws.emit('message', JSON.stringify({ action: 'not-a-real-action' }))
    })

    it('server_status replies with version/connection info, covering the present-value branches', async () => {
      getPanelUserFromDiscordIDMock.mockResolvedValueOnce({ discordID: 'd-g' })
      getUserGuildsWithPermsForPanelMock.mockResolvedValueOnce([])
      const ws = makeFakeWs()
      capturedWss!.emit('connection', ws, { headers: {}, url: '/ws?discordID=d-g/token=tok' })
      await new Promise((resolve) => setTimeout(resolve, 0))

      // Also register a matching server socket so isWebSocketConnected is true.
      const serverWs = makeFakeWs()
      capturedWss!.emit('connection', serverWs, { headers: { id: 'srv-status', token: 'tok' }, url: '/' })

      redisMock.get.mockResolvedValueOnce('1.0.0').mockResolvedValueOnce(String(Date.now()))
      ws.emit('message', JSON.stringify({ action: 'server_status', data: { serverID: 'srv-status' } }))
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(versionComparatorMock).toHaveBeenCalledWith('v1.2.3', '1.0.0')
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"action":"server_status"'))
    })

    it('wsSendToClient no-ops if the client was removed from tracking between message and reply', async () => {
      getPanelUserFromDiscordIDMock.mockResolvedValueOnce({ discordID: 'd-race' })
      getUserGuildsWithPermsForPanelMock.mockResolvedValueOnce([])
      const ws = makeFakeWs()
      capturedWss!.emit('connection', ws, { headers: {}, url: '/ws?discordID=d-race/token=tok' })
      await new Promise((resolve) => setTimeout(resolve, 0))

      // Simulate the socket closing (removing it from the tracked client list) just before a
      // message that was already in flight on the same socket gets handled.
      ws.emit('close')
      redisMock.get.mockResolvedValue(null)
      expect(() =>
        ws.emit('message', JSON.stringify({ action: 'server_status', data: { serverID: 'srv-race' } })),
      ).not.toThrow()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    it('server_status falls back to defaults when redis has no stored version/last-request', async () => {
      getPanelUserFromDiscordIDMock.mockResolvedValueOnce({ discordID: 'd-h' })
      getUserGuildsWithPermsForPanelMock.mockResolvedValueOnce([])
      const ws = makeFakeWs()
      capturedWss!.emit('connection', ws, { headers: {}, url: '/ws?discordID=d-h/token=tok' })
      await new Promise((resolve) => setTimeout(resolve, 0))

      redisMock.get.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
      ws.emit('message', JSON.stringify({ action: 'server_status', data: { serverID: 'srv-unknown' } }))
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(ws.send).toHaveBeenCalled()
    })
  })

  describe('wsSendToServer queue worker', () => {
    it('resolves locally when the target server is connected', async () => {
      const ws = makeFakeWs()
      capturedWss!.emit('connection', ws, { headers: { id: 'srv-local', token: 'tok' }, url: '/' })
      const result = await capturedWorkers['wsSendToServer'].processor({
        data: { id: 'srv-local', data: { hello: 'world' } },
      })
      expect(result).toBe(true)
      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ hello: 'world' }))
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

  describe('wsSendToAllClientsOfServer queue worker', () => {
    it('sends to every client tracking the given server', async () => {
      getPanelUserFromDiscordIDMock.mockReset().mockResolvedValueOnce({ discordID: 'd-bulk' })
      getUserGuildsWithPermsForPanelMock.mockReset().mockResolvedValueOnce([{ id: 'g1' }])
      getServersFromDiscordGuildIDMock.mockReset().mockResolvedValueOnce([{ id: 'srv-bulk' }])
      const ws = makeFakeWs()
      capturedWss!.emit('connection', ws, { headers: {}, url: '/ws?discordID=d-bulk/token=tok' })
      await new Promise((resolve) => setTimeout(resolve, 0))

      await capturedWorkers['wsSendToAllClientsOfServer'].processor({
        data: { id: 'srv-bulk', action: 'server_status', data: { ok: true } },
      })
      expect(ws.send).toHaveBeenCalled()
    })
  })

  describe('subscriber handlers', () => {
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
      capturedWss!.emit('connection', ws, { headers: { id: 'srv-broadcast', token: 'tok' }, url: '/' })
      await subscriberHandlers['message'](
        'ws:send-to-server:broadcast',
        JSON.stringify({ id: 'srv-broadcast', data: { a: 1 }, requestId: 'r2' }),
      )
      expect(redisMock.incr).toHaveBeenCalledWith('ws:send-to-server:ack:r2')
      expect(redisMock.expire).toHaveBeenCalledWith('ws:send-to-server:ack:r2', 5)
    })
  })

  describe('gracefulShutdown', () => {
    it('tears down workers/subscriber/wss/redis/prisma and exits, then is a no-op on re-entry', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
      // Reject once each to exercise the `.catch(() => {})` swallow after unsubscribe/quit.
      redisSubscriberMock.unsubscribe.mockRejectedValueOnce(new Error('unsubscribe boom'))
      redisSubscriberMock.quit.mockRejectedValueOnce(new Error('quit boom'))
      try {
        await gracefulShutdown()
        expect(capturedWorkers['wsSendToServer'].close).toHaveBeenCalled()
        expect(capturedWorkers['wsSendToAllClientsOfServer'].close).toHaveBeenCalled()
        expect(redisSubscriberMock.unsubscribe).toHaveBeenCalled()
        expect(redisSubscriberMock.quit).toHaveBeenCalled()
        expect(gracefulShutdownRedisMock).toHaveBeenCalled()
        expect(gracefulShutdownPrismaMock).toHaveBeenCalled()
        expect(exitSpy).toHaveBeenCalledWith(0)

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
