import { describe, expect, it, vi } from 'vitest'
import { createConsoleChunkQueue, createConsoleStreams } from '../src/consoleStreams.js'

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
  const isLive = vi.fn((client: Client) => client.live)
  const serverOnline = vi.fn(async () => true)
  const replica = () => {
    const manager = createConsoleStreams<Client>({
      isLive,
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
    isLive,
    serverOnline,
    notify,
    advance: (ms: number) => (time += ms),
  }
}

describe('ephemeral console subscriptions', () => {
  it('recovers its per-client queue when liveness checking fails between enqueue and execution', async () => {
    const f = fixture()
    const manager = f.replica()
    const client = f.client()
    f.isLive.mockReturnValueOnce(true).mockImplementationOnce(() => {
      throw new Error('transport unavailable')
    })
    await expect(manager.subscribe(client, 'server')).rejects.toThrow('transport unavailable')
    await manager.subscribe(client, 'server')
    expect(f.leases.get('server')?.size).toBe(1)
    expect(client.send).toHaveBeenLastCalledWith({ action: 'console_subscription', serverID: 'server', enabled: true })
  })
  it('continues its bounded delivery queue after one recipient fails', async () => {
    const queue = createConsoleChunkQueue()
    const deliver = vi.fn().mockRejectedValueOnce(new Error('closed recipient')).mockResolvedValue(undefined)
    await queue('first', deliver)
    await queue('second', deliver)
    expect(deliver).toHaveBeenCalledTimes(2)
  })

  it('ignores closed viewers and pending subscriptions cancelled before their authorization starts', async () => {
    const f = fixture()
    const manager = f.replica()
    const absent = f.client()
    absent.live = false
    await manager.subscribe(absent, 'server')
    await manager.removeClient(absent)
    const client = f.client()
    const pending = manager.subscribe(client, 'server')
    const closing = manager.removeClient(client)
    await manager.subscribe(client, 'other')
    await Promise.all([pending, closing])
    expect(f.authorize).not.toHaveBeenCalled()
    expect(f.renew).not.toHaveBeenCalled()
  })

  it('does not renew a socket that closes while its permissions or server status are being checked', async () => {
    for (const stage of ['permissions', 'online'] as const) {
      const f = fixture()
      const manager = f.replica()
      const client = f.client()
      if (stage === 'permissions') f.authorize.mockImplementationOnce(async () => ((client.live = false), true))
      else f.serverOnline.mockImplementationOnce(async () => ((client.live = false), true))
      await manager.subscribe(client, 'server')
      expect(f.renew).not.toHaveBeenCalled()
      expect(client.send).not.toHaveBeenCalled()
    }
  })

  it.each(['forbidden', 'server_offline', 'unavailable'] as const)(
    'removes an existing viewer when a replacement subscription becomes %s',
    async (error) => {
      const f = fixture()
      const manager = f.replica()
      const client = f.client()
      await manager.subscribe(client, 'server')
      if (error === 'forbidden') client.allowed = false
      if (error === 'server_offline') f.serverOnline.mockResolvedValueOnce(false)
      if (error === 'unavailable') f.authorize.mockRejectedValueOnce(new Error('permissions unavailable'))
      await manager.subscribe(client, 'other')
      expect(f.leases.get('server')?.size).toBe(0)
      expect(client.send).toHaveBeenLastCalledWith({
        action: 'console_subscription',
        serverID: 'other',
        enabled: false,
        error,
      })
    },
  )

  it('cleans a renewed lease even when the socket closes and both removal attempts fail', async () => {
    const f = fixture()
    const manager = f.replica()
    const client = f.client()
    f.renew.mockImplementationOnce(async () => {
      client.live = false
    })
    f.remove.mockRejectedValue(new Error('Redis unavailable'))
    await expect(manager.subscribe(client, 'server')).resolves.toBeUndefined()
    expect(f.remove).toHaveBeenCalledTimes(2)
    expect(client.send).not.toHaveBeenCalled()
  })

  it('does not let closed recipient errors prevent lease cleanup or addon shutdown', async () => {
    const f = fixture()
    const manager = f.replica()
    const { addon } = f.owner(manager)
    await manager.changed('server')
    const client = f.client()
    client.send.mockImplementation(() => {
      throw new Error('socket closed')
    })
    addon.send.mockImplementation(() => {
      throw new Error('addon closed')
    })
    await manager.subscribe(client, 'server')
    expect(manager.canForward('server')).toBe(false)
    f.remove.mockRejectedValueOnce(new Error('Redis unavailable'))
    await expect(manager.unsubscribe(client, 'server')).resolves.toBeUndefined()
    await manager.shutdown()
    await manager.maintain()
    await manager.changed('server')
  })

  it('ignores queued output after unsubscribe and closes expired or disconnected viewers before delivery', async () => {
    for (const reason of ['expired', 'disconnected', 'unsubscribe'] as const) {
      const f = fixture()
      const manager = f.replica()
      const client = f.client()
      await manager.subscribe(client, 'server')
      client.send.mockClear()
      if (reason === 'expired') f.advance(30_001)
      if (reason === 'disconnected') client.live = false
      const pending = manager.deliver('server', 'must remain private')
      if (reason === 'unsubscribe') await manager.unsubscribe(client, 'server')
      await pending
      expect(client.send.mock.calls.flat().some((packet) => packet.action === 'console_live_exporter')).toBe(false)
      expect(f.leases.get('server')?.size).toBe(0)
    }
  })

  it('does not send to a socket that closes during delivery authorization', async () => {
    const f = fixture()
    const manager = f.replica()
    const client = f.client()
    await manager.subscribe(client, 'server')
    client.send.mockClear()
    f.authorize.mockImplementationOnce(async () => ((client.live = false), true))
    await manager.deliver('server', 'private output')
    expect(client.send).not.toHaveBeenCalled()
  })

  it.each(['deliver', 'maintain'] as const)(
    'fails closed after a current %s permission lookup fails',
    async (operation) => {
      const f = fixture()
      const manager = f.replica()
      const client = f.client()
      await manager.subscribe(client, 'server')
      f.authorize.mockRejectedValueOnce(new Error('permission store unavailable'))
      if (operation === 'deliver') await manager.deliver('server', 'private output')
      else await manager.maintain()
      expect(client.send).toHaveBeenLastCalledWith({
        action: 'console_subscription',
        serverID: 'server',
        enabled: false,
        error: 'unavailable',
      })
      expect(f.leases.get('server')?.size).toBe(0)
    },
  )

  it('shares one maintenance sweep while a permission lookup is pending', async () => {
    const f = fixture()
    const manager = f.replica()
    const client = f.client()
    await manager.subscribe(client, 'server')
    let resume!: (allowed: boolean) => void
    f.authorize.mockImplementationOnce(() => new Promise((resolve) => (resume = resolve)))
    const first = manager.maintain()
    expect(manager.maintain()).toBe(first)
    resume(true)
    await first
  })

  it.each(['forbidden', 'server_offline'] as const)(
    'does not acknowledge a stale %s replacement after a newer subscription was queued during cleanup',
    async (reason) => {
      const f = fixture()
      const manager = f.replica()
      const client = f.client()
      await manager.subscribe(client, 'server')
      let replacement!: Promise<void>
      const remove = f.remove.getMockImplementation()!
      f.remove.mockImplementationOnce(async (...args) => {
        replacement = manager.subscribe(client, 'fresh')
        await remove(...args)
      })
      if (reason === 'forbidden') f.authorize.mockResolvedValueOnce(false)
      else f.serverOnline.mockResolvedValueOnce(false)
      client.send.mockClear()
      await manager.subscribe(client, 'stale')
      await replacement
      expect(client.send).toHaveBeenCalledExactlyOnceWith({
        action: 'console_subscription',
        serverID: 'fresh',
        enabled: true,
      })
      expect(f.leases.get('fresh')?.size).toBe(1)
    },
  )

  it('fences a replacement while its previous viewer is being removed', async () => {
    const f = fixture()
    const manager = f.replica()
    const client = f.client()
    await manager.subscribe(client, 'server')
    let resume!: () => void
    let started!: () => void
    const beginning = new Promise<void>((resolve) => (started = resolve))
    f.remove.mockImplementationOnce(async () => {
      started()
      await new Promise<void>((resolve) => (resume = resolve))
    })
    const opening = manager.subscribe(client, 'other')
    await beginning
    const closing = manager.unsubscribe(client, 'other')
    resume()
    await Promise.all([opening, closing])
    expect(f.renew).toHaveBeenCalledOnce()
    expect(f.leases.get('other')).toBeUndefined()
  })

  it('rechecks an owner update received between a completed lease read and its pending cleanup', async () => {
    const f = fixture()
    const manager = f.replica()
    const { addon } = f.owner(manager)
    await manager.changed('server')
    addon.send.mockImplementationOnce(() => {
      queueMicrotask(() => {
        void manager.changed('server')
      })
    })
    f.read.mockClear()
    await manager.subscribe(f.client(), 'server')
    await manager.changed('server')
    expect(f.read.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(manager.canForward('server')).toBe(true)
  })

  it.each(['shutdown', 'replacement'] as const)(
    'does not reschedule dirty updates for an owner after %s',
    async (operation) => {
      const f = fixture()
      const manager = f.replica()
      f.owner(manager)
      await manager.changed('server')
      let resume!: (lease: { enabled: boolean; expiresAt: number }) => void
      f.read.mockImplementationOnce(() => new Promise((resolve) => (resume = resolve)))
      const pending = manager.changed('server')
      void manager.changed('server')
      if (operation === 'shutdown') await manager.shutdown()
      else f.owner(manager)
      resume({ enabled: false, expiresAt: 0 })
      await pending
      expect(manager.canForward('server')).toBe(false)
    },
  )

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
