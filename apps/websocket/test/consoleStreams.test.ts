import { describe, expect, it, vi } from 'vitest'
import { createConsoleStreams } from '../src/consoleStreams.js'

function fixture() {
  let time = new Date('2026-11-25T12:00:00Z').getTime()
  type Client = { live: boolean; allowed: boolean; send: ReturnType<typeof vi.fn> }
  const leases = new Map<string, Map<string, number>>()
  const managers: ReturnType<typeof createConsoleStreams<Client>>[] = []
  const notify = async (serverID: string) => {
    await Promise.all(managers.map((manager) => manager.changed(serverID)))
  }
  const renew = vi.fn(async (serverID: string, viewerID: string) => {
    let viewers = leases.get(serverID)
    if (!viewers) leases.set(serverID, (viewers = new Map()))
    viewers.set(viewerID, time + 30_000)
    await notify(serverID)
  })
  const remove = vi.fn(async (serverID: string, viewerID: string) => {
    leases.get(serverID)?.delete(viewerID)
    await notify(serverID)
  })
  const read = vi.fn(async (serverID: string) => {
    const expiresAt = Math.max(0, ...[...(leases.get(serverID)?.values() ?? [])].filter((expiry) => expiry > time))
    return { enabled: expiresAt > time, expiresAt }
  })
  const authorize = vi.fn(async (client: Client) => client.live && client.allowed)
  const serverOnline = vi.fn(async () => true)
  const replica = () => {
    const manager = createConsoleStreams<Client>({
      isLive: (client) => client.live,
      authorize,
      serverOnline,
      send: (client, packet) => client.send(packet),
      renewViewer: renew,
      removeViewer: remove,
      readViewers: read,
      now: () => time,
    })
    managers.push(manager)
    return manager
  }
  const client = (): Client => ({ live: true, allowed: true, send: vi.fn() })
  const owner = (manager: ReturnType<typeof replica>, serverID = 'server') => {
    const addon = { isLive: vi.fn(() => true), authorize: vi.fn(async () => true), send: vi.fn() }
    const stop = manager.attachServer(serverID, addon)
    return { addon, stop }
  }
  return {
    replica,
    owner,
    client,
    leases,
    renew,
    remove,
    read,
    authorize,
    serverOnline,
    notify,
    advance: (ms: number) => (time += ms),
  }
}

describe('ephemeral console subscriptions', () => {
  it('joins tabs across replicas and stops only after the last viewer leaves', async () => {
    const f = fixture()
    const first = f.replica()
    const second = f.replica()
    const { addon } = f.owner(first)
    await first.changed('server')
    expect(addon.send).toHaveBeenCalledExactlyOnceWith({ method: 'wsConsoleStream', enabled: false, expiresAt: 0 })
    const local = f.client()
    const remote = f.client()
    const otherDashboard = f.client()
    await first.subscribe(local, 'server')
    await second.subscribe(remote, 'server')
    expect(f.leases.get('server')?.size).toBe(2)
    expect(new Set(f.renew.mock.calls.map(([, viewerID]) => viewerID)).size).toBe(2)
    expect(addon.send).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: true }))
    expect(first.canForward('server')).toBe(true)
    local.send.mockClear()
    remote.send.mockClear()
    await Promise.all([first.deliver('server', 'private text'), second.deliver('server', 'private text')])
    expect(local.send).toHaveBeenCalledExactlyOnceWith({
      action: 'console_live_exporter',
      serverID: 'server',
      data: { data: 'private text' },
    })
    expect(remote.send).toHaveBeenCalledOnce()
    expect(otherDashboard.send).not.toHaveBeenCalled()
    await first.removeClient(local)
    expect(first.canForward('server')).toBe(true)
    expect(f.leases.get('server')?.size).toBe(1)
    await second.unsubscribe(remote, 'server')
    expect(f.leases.get('server')?.size).toBe(0)
    expect(addon.send).toHaveBeenLastCalledWith({ method: 'wsConsoleStream', enabled: false, expiresAt: 0 })
  })

  it('expires a page that stops renewing without extending it during maintenance', async () => {
    const f = fixture()
    const manager = f.replica()
    const { addon } = f.owner(manager)
    const client = f.client()
    await manager.subscribe(client, 'server')
    f.advance(25_000)
    await manager.maintain()
    expect(f.renew).toHaveBeenCalledOnce()
    expect(manager.canForward('server')).toBe(true)
    f.advance(5_001)
    await manager.maintain()
    expect(manager.canForward('server')).toBe(false)
    expect(addon.send).toHaveBeenLastCalledWith({ method: 'wsConsoleStream', enabled: false, expiresAt: 0 })
    client.send.mockClear()
    await manager.deliver('server', 'after page expiry')
    expect(client.send).not.toHaveBeenCalled()
  })

  it('renews the same socket lease and replaces the server scope without keeping two viewers', async () => {
    const f = fixture()
    const manager = f.replica()
    const client = f.client()
    await manager.subscribe(client, 'server')
    f.advance(10_000)
    await manager.subscribe(client, 'server')
    expect(f.leases.get('server')?.size).toBe(1)
    expect(f.renew.mock.calls[0][1]).toBe(f.renew.mock.calls[1][1])
    await manager.subscribe(client, 'other')
    expect(f.leases.get('server')?.size).toBe(0)
    expect(f.leases.get('other')?.size).toBe(1)
    await manager.unsubscribe(client, 'server')
    await manager.deliver('other', 'new server only')
    expect(client.send).toHaveBeenLastCalledWith(expect.objectContaining({ serverID: 'other' }))
  })

  it.each(['forbidden', 'server_offline', 'unavailable'] as const)('rejects a subscription when %s', async (error) => {
    const f = fixture()
    const manager = f.replica()
    const client = f.client()
    if (error === 'forbidden') client.allowed = false
    if (error === 'server_offline') f.serverOnline.mockResolvedValueOnce(false)
    if (error === 'unavailable') f.renew.mockRejectedValueOnce(new Error('Redis unavailable'))
    await manager.subscribe(client, 'server')
    expect(client.send).toHaveBeenLastCalledWith({
      action: 'console_subscription',
      serverID: 'server',
      enabled: false,
      error,
    })
    expect(f.leases.get('server')?.size ?? 0).toBe(0)
  })

  it('reauthorizes before delivery and maintenance, removing revoked subscriptions', async () => {
    const f = fixture()
    const manager = f.replica()
    const { addon } = f.owner(manager)
    const client = f.client()
    await manager.subscribe(client, 'server')
    client.allowed = false
    client.send.mockClear()
    await manager.deliver('server', 'must remain private')
    expect(client.send).toHaveBeenCalledExactlyOnceWith({
      action: 'console_subscription',
      serverID: 'server',
      enabled: false,
      error: 'forbidden',
    })
    expect(f.leases.get('server')?.size).toBe(0)
    expect(addon.send).toHaveBeenLastCalledWith({ method: 'wsConsoleStream', enabled: false, expiresAt: 0 })
    client.allowed = true
    await manager.subscribe(client, 'server')
    client.allowed = false
    await manager.maintain()
    expect(f.leases.get('server')?.size).toBe(0)
  })

  it.each(['unsubscribe', 'removeClient', 'invalidateClient'] as const)(
    'fences an in-flight renewal on %s',
    async (operation) => {
      const f = fixture()
      const manager = f.replica()
      const client = f.client()
      let resume!: () => void
      let started!: () => void
      const beginning = new Promise<void>((resolve) => (started = resolve))
      const originalRenew = f.renew.getMockImplementation()!
      f.renew.mockImplementationOnce(async (...args) => {
        started()
        await new Promise<void>((resolve) => (resume = resolve))
        await originalRenew(...args)
      })
      const subscribing = manager.subscribe(client, 'server')
      await beginning
      const closing = operation === 'unsubscribe' ? manager.unsubscribe(client, 'server') : manager[operation](client)
      resume()
      await Promise.all([subscribing, closing])
      expect(f.leases.get('server')?.size).toBe(0)
      expect(client.send.mock.calls.flat().some((packet) => packet.enabled === true)).toBe(false)
      await manager.deliver('server', 'closed page')
      expect(client.send.mock.calls.flat().some((packet) => packet.action === 'console_live_exporter')).toBe(false)
    },
  )

  it('fails closed on Redis failure or expired capability and recovers from a missed notification', async () => {
    const f = fixture()
    const manager = f.replica()
    const { addon } = f.owner(manager)
    await manager.subscribe(f.client(), 'server')
    f.read.mockRejectedValueOnce(new Error('Redis unavailable'))
    await manager.changed('server')
    expect(manager.canForward('server')).toBe(false)
    await manager.maintain()
    expect(manager.canForward('server')).toBe(true)
    addon.authorize.mockResolvedValue(false)
    await manager.maintain()
    expect(manager.canForward('server')).toBe(false)
  })

  it('does not apply a delayed lease read to a replaced addon socket', async () => {
    const f = fixture()
    const manager = f.replica()
    const first = f.owner(manager)
    await manager.changed('server')
    let resume!: (value: { enabled: boolean; expiresAt: number }) => void
    f.read.mockImplementationOnce(() => new Promise((resolve) => (resume = resolve)))
    const pending = manager.changed('server')
    const second = f.owner(manager)
    first.stop()
    resume({ enabled: true, expiresAt: Date.now() + 30_000 })
    await pending
    await manager.changed('server')
    expect(first.addon.send.mock.calls.flat().some((packet) => packet.enabled)).toBe(false)
    expect(second.addon.send).toHaveBeenCalledWith({ method: 'wsConsoleStream', enabled: false, expiresAt: 0 })
  })

  it('disables owners and removes all viewers on shutdown without re-enabling after pending reads', async () => {
    const f = fixture()
    const manager = f.replica()
    const { addon } = f.owner(manager)
    const client = f.client()
    await manager.subscribe(client, 'server')
    await manager.shutdown()
    expect(f.leases.get('server')?.size).toBe(0)
    expect(addon.send).toHaveBeenLastCalledWith({ method: 'wsConsoleStream', enabled: false, expiresAt: 0 })
    await manager.subscribe(client, 'server')
    await manager.deliver('server', 'after shutdown')
    expect(f.renew).toHaveBeenCalledOnce()
  })

  it('rejects malformed output and never delivers another server’s stream', async () => {
    const f = fixture()
    const manager = f.replica()
    const client = f.client()
    await manager.subscribe(client, 'server')
    client.send.mockClear()
    await manager.deliver('other', 'wrong scope')
    await manager.deliver('server', 'x'.repeat(32_769))
    await manager.deliver('server', {})
    expect(client.send).not.toHaveBeenCalled()
  })

  it('keeps viewer delivery in order across asynchronous permission checks', async () => {
    const f = fixture()
    const manager = f.replica()
    const client = f.client()
    await manager.subscribe(client, 'server')
    client.send.mockClear()
    let resume!: (allowed: boolean) => void
    let started!: () => void
    const beginning = new Promise<void>((resolve) => (started = resolve))
    f.authorize.mockImplementationOnce(() => {
      started()
      return new Promise((resolve) => (resume = resolve))
    })
    const first = manager.deliver('server', 'first')
    await beginning
    const second = manager.deliver('server', 'second')
    resume(true)
    await Promise.all([first, second])
    expect(client.send.mock.calls.map(([packet]) => packet.data.data)).toEqual(['first', 'second'])
  })

  it.each(['deliver-denial', 'deliver-failure', 'maintain-denial', 'maintain-failure'] as const)(
    'does not remove a newer server subscription after a stale %s',
    async (operation) => {
      const f = fixture()
      const manager = f.replica()
      const client = f.client()
      await manager.subscribe(client, 'server')
      let resume!: () => void
      let started!: () => void
      const beginning = new Promise<void>((resolve) => (started = resolve))
      f.authorize.mockImplementationOnce(() => {
        started()
        return new Promise(
          (resolve, reject) =>
            (resume = () => (operation.endsWith('failure') ? reject(new Error('old lookup failed')) : resolve(false))),
        )
      })
      const pending = operation.startsWith('deliver') ? manager.deliver('server', 'old scope') : manager.maintain()
      await beginning
      await manager.subscribe(client, 'new-server')
      client.send.mockClear()
      resume()
      await pending
      expect(f.leases.get('new-server')?.size).toBe(1)
      expect(client.send).not.toHaveBeenCalled()
      await manager.deliver('new-server', 'new scope')
      expect(client.send).toHaveBeenLastCalledWith(expect.objectContaining({ serverID: 'new-server' }))
    },
  )

  it('does not deliver when the viewer lease expires during a permission lookup', async () => {
    const f = fixture()
    const manager = f.replica()
    const client = f.client()
    await manager.subscribe(client, 'server')
    client.send.mockClear()
    f.authorize.mockImplementationOnce(async () => {
      f.advance(30_001)
      return true
    })
    await manager.deliver('server', 'after expiry')
    expect(client.send.mock.calls.flat().some((packet) => packet.action === 'console_live_exporter')).toBe(false)
    expect(f.leases.get('server')?.size).toBe(0)
  })
})
