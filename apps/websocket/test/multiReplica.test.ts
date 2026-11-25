import { EventEmitter } from 'node:events'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as GatewayModule from '../src/main.js'

const { redis } = await vi.hoisted(async () => {
  const { default: Redis } = await import('ioredis-mock')
  return { redis: new Redis() }
})
const sessions = new Map<string, any>()
const tickets = new Map<string, any>()
const permissions = new Map<string, boolean>()
const deniedServerScopes = new Set<string>()
vi.mock('@gmod/domain-user/dashboardAccess.js', () => ({
  canAccessDashboardGuild: async (panel: { discordID: string }, _guild: string, options: { serverID?: string } = {}) =>
    permissions.get(panel.discordID) === true && !deniedServerScopes.has(`${panel.discordID}:${options.serverID}`),
}))

vi.mock('@gmod/infra-redis', () => ({ default: redis, gracefulShutdownRedis: vi.fn() }))
vi.mock('@gmod/config', () => ({ ConfigServer: { ports: { websocket: 9999 } } }))
vi.mock('@gmod/shared/logger.js', () => ({ gmLog: vi.fn() }))
vi.mock('@gmod/infra-prisma', () => ({ connectPrisma: vi.fn(), gracefulShutdownPrisma: vi.fn() }))
vi.mock('@gmod/infra-bullmq', () => ({ connection: {} }))
vi.mock('@gmod/infra-websocket/queues.js', () => ({
  wsSendToServerQueue: { name: 'wsSendToServer' },
  wsSendToAllClientsOfServerQueue: { name: 'wsSendToAllClientsOfServer' },
}))
vi.mock('@gmod/domain-auth/authSessions.js', () => ({
  AUTH_SESSION_REVOCATION_CHANNEL: 'gmi:auth:session-revoked',
  assertTrustedOrigin: vi.fn(),
  consumeWebSocketTicket: async (ticket: string) => {
    const session = tickets.get(ticket)
    tickets.delete(ticket)
    return session
  },
  validateApplicationSession: async (id: string) => sessions.get(id) || null,
}))
vi.mock('@gmod/domain-access/index.js', () => ({ hasCapability: vi.fn(), resolveGuildAccess: vi.fn() }))
vi.mock('@gmod/domain-server/Server.js', () => ({
  getServerFromID: async () => ({ isValidToken: (token: string) => token === 'addon-token' }),
  getServersFromDiscordGuildID: async () => [{ id: 'addon-server' }],
}))
vi.mock('@gmod/domain-user/PanelUser.js', () => ({
  getPanelUserFromDiscordID: async (discordID: string) => ({ discordID }),
}))
vi.mock('@gmod/domain-user/privacy.js', () => ({
  isErasureBlocked: async () => false,
  PRIVACY_REVOCATION_CHANNEL: 'gmi:privacy:revoked',
}))
vi.mock('@gmod/domain-guild/discordModels.js', () => ({
  getUserGuildsWithPermsForPanel: async (user: { discordID: string }) =>
    permissions.get(user.discordID) ? [{ id: 'guild' }] : [],
}))
vi.mock('@gmod/core/utils/tools.js', () => ({
  lastGmodIntegrationTag: 'v1',
  versionComparator: () => 0,
}))

const servers: FakeWebSocketServer[] = []
class FakeWebSocketServer extends EventEmitter {
  constructor(public opts: any) {
    super()
    servers.push(this)
  }
  close(callback: () => void) {
    callback()
  }
}
vi.mock('ws', () => ({ WebSocketServer: FakeWebSocketServer }))

const workers: FakeWorker[] = []
class FakeWorker {
  close = vi.fn()
  constructor(
    public name: string,
    public processor: (job: any) => Promise<unknown>,
  ) {
    workers.push(this)
  }
}
vi.mock('bullmq', () => ({ Worker: FakeWorker }))

// Model the shared Redis channel independently from each replica's module state.
const subscribers = new Set<Subscriber>()
class Subscriber extends EventEmitter {
  channels = new Set<string>()
  async subscribe(channel: string) {
    this.channels.add(channel)
  }
  async unsubscribe(channel: string) {
    this.channels.delete(channel)
  }
  async quit() {
    subscribers.delete(this)
  }
}

const sockets: any[] = []
function makeSocket() {
  const ws = new EventEmitter() as any
  ws.readyState = 1
  ws.send = vi.fn()
  ws.ping = vi.fn()
  ws.close = vi.fn(() => {
    ws.readyState = 3
    ws.emit('close')
  })
  ws.terminate = ws.close
  sockets.push(ws)
  return ws
}

type Replica = {
  module: typeof GatewayModule
  server: FakeWebSocketServer
  dashboardWorker: FakeWorker
}
const replicas: Replica[] = []
async function bootReplica(): Promise<Replica> {
  vi.resetModules()
  const module = await import('../src/main.js')
  await module.main()
  const replica = {
    module,
    server: servers.at(-1)!,
    dashboardWorker: workers.at(-1)!,
  }
  replicas.push(replica)
  return replica
}

async function connect(replica: Replica, req: any) {
  const verdict = await new Promise<boolean>((resolve) => {
    void replica.server.opts.verifyClient({ req }, (allowed: boolean) => resolve(allowed))
  })
  expect(verdict).toBe(true)
  const ws = makeSocket()
  await replica.server.listeners('connection')[0](ws, req)
  return ws
}

async function connectDashboard(replica: Replica, id: string) {
  const session = {
    id,
    discordID: id,
    expiresAt: new Date(Date.now() + 3_600_000),
  }
  sessions.set(id, session)
  tickets.set(id, session)
  permissions.set(id, true)
  return connect(replica, { headers: {}, url: `/ws?ticket=${id}` })
}

const logJob = { data: { id: 'addon-server', action: 'server_logs', data: { text: 'one log' } } }

describe('independent WebSocket replicas using shared Redis', () => {
  let first: Replica
  let second: Replica
  let publish: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-21T20:00:00Z'))
    await redis.flushall()
    vi.spyOn(redis, 'duplicate').mockImplementation(() => {
      const subscriber = new Subscriber()
      subscribers.add(subscriber)
      return subscriber as any
    })
    publish = vi.spyOn(redis, 'publish').mockImplementation(async (channel: string, payload: string) => {
      const targets = [...subscribers].filter((subscriber) => subscriber.channels.has(channel))
      await Promise.all(
        targets.flatMap((subscriber) => subscriber.listeners('message').map((handle) => handle(channel, payload))),
      )
      return targets.length
    })
    first = await bootReplica()
    second = await bootReplica()
    expect(first.module.main).not.toBe(second.module.main)
    expect(first.server).not.toBe(second.server)
  })

  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.close()
    for (const replica of replicas.splice(0)) {
      process.removeListener('SIGINT', replica.module.gracefulShutdown)
      process.removeListener('SIGTERM', replica.module.gracefulShutdown)
    }
    // Drain the asynchronous lease removal triggered by the socket close events.
    for (let i = 0; i < 10; i++) await Promise.resolve()
    servers.length = 0
    workers.length = 0
    subscribers.clear()
    sessions.clear()
    tickets.clear()
    permissions.clear()
    deniedServerScopes.clear()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  afterAll(() => redis.disconnect())

  it('delivers one consumed dashboard job once per socket on both replicas, including its emitter', async () => {
    const local = await connectDashboard(first, 'local-user')
    const remote = await connectDashboard(second, 'remote-user')
    await first.dashboardWorker.processor(logJob)
    expect(publish).toHaveBeenCalledExactlyOnceWith('ws:send-to-clients:broadcast', JSON.stringify(logJob.data))
    const expected = JSON.stringify({ action: 'server_logs', serverID: 'addon-server', data: { text: 'one log' } })
    expect(local.send).toHaveBeenCalledExactlyOnceWith(expected)
    expect(remote.send).toHaveBeenCalledExactlyOnceWith(expected)
  })

  it('revalidates the remote session before delivery even if its revocation broadcast was missed', async () => {
    const local = await connectDashboard(first, 'local-user')
    const remote = await connectDashboard(second, 'remote-user')
    sessions.delete('remote-user')
    await first.dashboardWorker.processor(logJob)
    expect(local.send).toHaveBeenCalledTimes(1)
    expect(remote.send).not.toHaveBeenCalled()
    expect(remote.close).toHaveBeenCalledWith(1008, 'Session revoked')
  })

  it('rechecks a remote server-rank or purchase revocation without waiting for Discord cache expiry', async () => {
    const local = await connectDashboard(first, 'local-user')
    const remote = await connectDashboard(second, 'remote-user')
    deniedServerScopes.add('remote-user:addon-server')
    await first.dashboardWorker.processor(logJob)
    expect(local.send).toHaveBeenCalledOnce()
    expect(remote.send).not.toHaveBeenCalled()
    expect(permissions.get('remote-user')).toBe(true)
  })

  it('refreshes permissions independently on the receiving replica before revealing a log', async () => {
    const local = await connectDashboard(first, 'local-user')
    const remote = await connectDashboard(second, 'remote-user')
    permissions.set('remote-user', false)
    vi.setSystemTime(Date.now() + 31_000)
    await first.dashboardWorker.processor(logJob)
    expect(local.send).toHaveBeenCalledTimes(1)
    expect(remote.send).not.toHaveBeenCalled()
    expect(remote.close).not.toHaveBeenCalled()
    expect(sessions.has('remote-user')).toBe(true)
  })

  it('reports a remote addon as connected and observes its socket close through the shared lease', async () => {
    const addon = await connect(first, { headers: { id: 'addon-server', token: 'addon-token' }, url: '/ws' })
    const dashboard = await connectDashboard(second, 'remote-user')
    const requestStatus = () =>
      dashboard.listeners('message')[0](JSON.stringify({ action: 'server_status', data: { serverID: 'addon-server' } }))
    await requestStatus()
    expect(JSON.parse(dashboard.send.mock.calls[0][0]).isWebSocketConnected).toBe(true)
    addon.close()
    for (let i = 0; i < 10; i++) await Promise.resolve()
    await requestStatus()
    expect(JSON.parse(dashboard.send.mock.calls[1][0]).isWebSocketConnected).toBe(false)
  })
})
