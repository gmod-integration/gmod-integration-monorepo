import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { redis } = await vi.hoisted(async () => {
  const { default: Redis } = await import('ioredis-mock')
  const redis = new Redis()
  redis.status = 'ready'
  const evaluate = redis.eval.bind(redis)
  // The mock mixes rounded Date seconds with process.hrtime microseconds. Supply a
  // consistent Redis clock while exercising the real lease and compensation scripts.
  redis.eval = (script: string, count: number, ...args: Array<string | number>) => {
    const now = Date.now()
    const clock = `{ '${Math.floor(now / 1000)}', '${(now % 1000) * 1000}' }`
    return evaluate(script.replaceAll("redis.call('TIME')", clock), count, ...args)
  }
  return { redis }
})
vi.mock('../src/index.js', () => ({ default: redis }))
const {
  renewConsoleViewer,
  removeConsoleViewer,
  readConsoleViewers,
  CONSOLE_VIEWER_TTL_MS,
  CONSOLE_STREAM_CHANGED_CHANNEL,
} = await import('../src/consoleViewers.js')
const time = new Date('2026-11-25T12:00:00Z').getTime()

beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(time)
  redis.status = 'ready'
  await redis.flushall()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})
afterAll(() => redis.disconnect())

describe('console viewer leases across gateways', () => {
  it('keeps other tabs and servers active when a viewer leaves', async () => {
    expect(await readConsoleViewers('s1')).toEqual({ enabled: false, expiresAt: 0 })
    await renewConsoleViewer('s1', 'socket-a')
    await renewConsoleViewer('s1', 'socket-b')
    await renewConsoleViewer('s2', 'socket-c')
    expect(await readConsoleViewers('s1')).toEqual({ enabled: true, expiresAt: time + CONSOLE_VIEWER_TTL_MS })
    await removeConsoleViewer('s1', 'socket-a')
    expect((await readConsoleViewers('s1')).enabled).toBe(true)
    await removeConsoleViewer('s1', 'socket-b')
    expect((await readConsoleViewers('s1')).enabled).toBe(false)
    expect((await readConsoleViewers('s2')).enabled).toBe(true)
  })

  it('expires abandoned pages without extending their leases when read', async () => {
    await renewConsoleViewer('s1', 'crashed-tab')
    expect(await redis.pttl('ws:console-viewers:s1')).toBe(CONSOLE_VIEWER_TTL_MS)
    vi.setSystemTime(time + 29_000)
    expect((await readConsoleViewers('s1')).enabled).toBe(true)
    expect(await redis.pttl('ws:console-viewers:s1')).toBe(1_000)
    vi.setSystemTime(time + 30_000)
    expect(await readConsoleViewers('s1')).toEqual({ enabled: false, expiresAt: 0 })
  })

  it('renews only the live viewer, prunes expired entries and keeps storage expiring', async () => {
    await renewConsoleViewer('s1', 'expired')
    vi.setSystemTime(time + 20_000)
    await renewConsoleViewer('s1', 'live')
    vi.setSystemTime(time + 31_000)
    await renewConsoleViewer('s1', 'live')
    expect(await redis.zrange('ws:console-viewers:s1', 0, -1)).toEqual(['live'])
    expect(await readConsoleViewers('s1')).toEqual({ enabled: true, expiresAt: time + 61_000 })
    expect(await redis.pttl('ws:console-viewers:s1')).toBe(CONSOLE_VIEWER_TTL_MS)
  })

  it('notifies addon owners after a viewer arrives and leaves', async () => {
    const subscriber = redis.duplicate()
    const listener = vi.fn()
    try {
      await subscriber.subscribe(CONSOLE_STREAM_CHANGED_CHANNEL)
      subscriber.on('message', listener)
      await renewConsoleViewer('s1', 'tab')
      await removeConsoleViewer('s1', 'tab')
      await vi.advanceTimersByTimeAsync(1)
      expect(listener.mock.calls).toEqual([
        [CONSOLE_STREAM_CHANGED_CHANNEL, 's1'],
        [CONSOLE_STREAM_CHANGED_CHANNEL, 's1'],
      ])
    } finally {
      subscriber.disconnect()
    }
  })

  it('rejects offline storage and invalid scopes without queuing an activation', async () => {
    const evaluate = vi.spyOn(redis, 'eval')
    redis.status = 'reconnecting'
    await expect(renewConsoleViewer('s1', 'tab')).rejects.toThrow('unavailable')
    await expect(readConsoleViewers('s1')).rejects.toThrow('unavailable')
    redis.status = 'ready'
    await expect(renewConsoleViewer('bad/server', 'tab')).rejects.toThrow('scope')
    await expect(removeConsoleViewer('s1', '')).rejects.toThrow('scope')
    expect(evaluate).not.toHaveBeenCalled()
  })

  it('bounds waiting and outstanding work when a ready Redis connection stalls', async () => {
    let release!: (value: unknown) => void
    const gate = new Promise((resolve) => {
      release = resolve
    })
    const evaluate = vi.spyOn(redis, 'eval').mockReturnValue(gate as ReturnType<typeof redis.eval>)
    const requests = Array.from({ length: 40 }, () => renewConsoleViewer('s1', 'tab').catch(() => 'unavailable'))
    await vi.advanceTimersByTimeAsync(501)
    expect(await Promise.all(requests)).toEqual(Array(40).fill('unavailable'))
    expect(evaluate).toHaveBeenCalledTimes(32)
    release(1)
    await Promise.resolve()
    await Promise.resolve()
  })

  it('refuses a delayed activation after its invocation deadline even if Redis executes it later', async () => {
    const evaluate = redis.eval.bind(redis)
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    vi.spyOn(redis, 'eval').mockImplementationOnce(async (...args: Parameters<typeof redis.eval>) => {
      await gate
      return evaluate(...args)
    })
    const request = renewConsoleViewer('s1', 'closed-page').catch(() => 'expired')
    await vi.advanceTimersByTimeAsync(501)
    expect(await request).toBe('expired')
    vi.setSystemTime(time + 20_000)
    release()
    await vi.advanceTimersByTimeAsync(0)
    expect(await readConsoleViewers('s1')).toEqual({ enabled: false, expiresAt: 0 })
  })

  it.each([false, true])('cleans late renewal replies without removing a newer lease: renewed=%s', async (renewed) => {
    const evaluate = redis.eval.bind(redis)
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    vi.spyOn(redis, 'eval').mockImplementationOnce(async (...args: Parameters<typeof redis.eval>) => {
      const result = await evaluate(...args)
      await gate
      return result
    })
    const request = renewConsoleViewer('s1', 'same-page').catch(() => 'expired')
    await vi.advanceTimersByTimeAsync(501)
    expect(await request).toBe('expired')
    if (renewed) {
      vi.setSystemTime(time + 1_000)
      await renewConsoleViewer('s1', 'same-page')
    }
    release()
    await vi.advanceTimersByTimeAsync(0)
    expect(await readConsoleViewers('s1')).toEqual({
      enabled: renewed,
      expiresAt: renewed ? time + 31_000 : 0,
    })
  })

  it.each(
    [null, [], [time, -1], [time, time - 1], [time, time + 30_001], [time, 1.5], [0, 0]].map((result) => [result]),
  )('fails closed on malformed viewer storage: %j', async (result) => {
    vi.spyOn(redis, 'eval').mockResolvedValueOnce(result)
    await expect(readConsoleViewers('s1')).rejects.toThrow('snapshot')
  })

  it.each([0, 1.5])('rejects a renewal without a valid positive lease: %s', async (result) => {
    vi.spyOn(redis, 'eval').mockResolvedValueOnce(result)
    await expect(renewConsoleViewer('s1', 'tab')).rejects.toThrow('renewal expired')
    expect(await redis.keys('ws:console-viewers:*')).toEqual([])
  })

  it('contains a failed late compensation and lets the original lease expire', async () => {
    const evaluate = redis.eval.bind(redis)
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const spy = vi.spyOn(redis, 'eval').mockImplementationOnce(async (...args: Parameters<typeof redis.eval>) => {
      const result = await evaluate(...args)
      await gate
      return result
    })
    const request = renewConsoleViewer('s1', 'closed-tab').catch(() => 'unavailable')
    await vi.advanceTimersByTimeAsync(501)
    expect(await request).toBe('unavailable')
    spy.mockRejectedValueOnce(new Error('Compensation storage unavailable'))
    release()
    await vi.advanceTimersByTimeAsync(0)
    expect(spy).toHaveBeenCalledTimes(2)
    expect(await redis.pttl('ws:console-viewers:s1')).toBe(CONSOLE_VIEWER_TTL_MS - 501)
    vi.setSystemTime(time + CONSOLE_VIEWER_TTL_MS)
    expect(await readConsoleViewers('s1')).toEqual({ enabled: false, expiresAt: 0 })
  })
})
