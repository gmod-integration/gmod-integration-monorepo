import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { redis } = await vi.hoisted(async () => {
  const { default: Redis } = await import('ioredis-mock')
  return { redis: new Redis() }
})
vi.mock('@gmod/infra-redis', () => ({ default: redis }))

const { createServerPresence, isServerPresent, SERVER_PRESENCE_TTL_MS } = await import('../src/serverPresence.js')

describe('cross-replica addon presence leases', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-21T20:00:00Z'))
    await redis.flushall()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  afterAll(() => redis.disconnect())

  it('aggregates distinct connections and removes only the closed socket', async () => {
    const older = createServerPresence('server', 'older-replica-socket')
    const newer = createServerPresence('server', 'newer-replica-socket')
    const otherServer = createServerPresence('other-server', 'other-socket')
    expect(await isServerPresent('server')).toBe(false)
    await older.refresh()
    await newer.refresh()
    await otherServer.refresh()
    expect(await isServerPresent('server')).toBe(true)
    await older.close()
    expect(await isServerPresent('server')).toBe(true)
    await newer.close()
    expect(await isServerPresent('server')).toBe(false)
    expect(await isServerPresent('other-server')).toBe(true)
    await otherServer.close()
  })

  it('expires crashed connections and keeps the shared key TTL bounded', async () => {
    const lease = createServerPresence('crashed-server', 'socket')
    await lease.refresh()
    expect(await redis.pttl('ws:server-presence:crashed-server')).toBe(SERVER_PRESENCE_TTL_MS)
    vi.setSystemTime(Date.now() + SERVER_PRESENCE_TTL_MS)
    expect(await isServerPresent('crashed-server')).toBe(false)
  })

  it('renews the live connection while pruning an older expired member', async () => {
    const crashed = createServerPresence('server', 'crashed')
    const live = createServerPresence('server', 'live')
    await crashed.refresh()
    await live.refresh()
    vi.setSystemTime(Date.now() + 60_000)
    await live.refresh()
    vi.setSystemTime(Date.now() + 30_000)
    expect(await isServerPresent('server')).toBe(true)
    expect(await redis.zrange('ws:server-presence:server', 0, -1)).toEqual(['live'])
    vi.setSystemTime(Date.now() + 59_000)
    expect(await isServerPresent('server')).toBe(true)
    vi.setSystemTime(Date.now() + 1_000)
    expect(await isServerPresent('server')).toBe(false)
  })

  it('waits for in-flight writes, skips queued renewals and never resurrects a closed socket', async () => {
    const originalEval = redis.eval.bind(redis)
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const evalSpy = vi.spyOn(redis, 'eval').mockImplementationOnce(async (...args: any[]) => {
      await gate
      return originalEval(...args)
    })
    const older = createServerPresence('server', 'older')
    const firstRefresh = older.refresh()
    await Promise.resolve()
    expect(evalSpy).toHaveBeenCalledTimes(1)
    const queuedRefresh = older.refresh()
    const close = older.close()
    expect(older.close()).toBe(close)
    await older.refresh()
    expect(evalSpy).toHaveBeenCalledTimes(1)
    const newer = createServerPresence('server', 'newer')
    await newer.refresh()
    release()
    await Promise.all([firstRefresh, queuedRefresh, close])
    expect(await redis.zrange('ws:server-presence:server', 0, -1)).toEqual(['newer'])
    expect(await isServerPresent('server')).toBe(true)
    await newer.close()
    expect(await isServerPresent('server')).toBe(false)
  })

  it('allows close after a failed renewal and reports a failed cleanup to its caller', async () => {
    const lease = createServerPresence('server', 'socket')
    await lease.refresh()
    vi.spyOn(redis, 'eval').mockRejectedValueOnce(new Error('Redis unavailable'))
    await expect(lease.refresh()).rejects.toThrow('Redis unavailable')
    const zrem = vi.spyOn(redis, 'zrem').mockRejectedValueOnce(new Error('Cleanup unavailable'))
    const close = lease.close()
    await expect(close).rejects.toThrow('Cleanup unavailable')
    expect(lease.close()).toBe(close)
    await lease.refresh()
    expect(zrem).toHaveBeenCalledTimes(1)
    vi.setSystemTime(Date.now() + SERVER_PRESENCE_TTL_MS)
    expect(await isServerPresent('server')).toBe(false)
  })
})
