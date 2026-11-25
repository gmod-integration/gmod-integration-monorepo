import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { redis } = await vi.hoisted(async () => {
  const { default: Redis } = await import('ioredis-mock')
  const redis = new Redis()
  redis.status = 'ready'
  const evaluate = redis.eval.bind(redis)
  // Fengari's conversion in ioredis-mock loses tables built with table.insert.
  // Rebuilding the returned array preserves Lua semantics and exercises the scripts' real logic.
  redis.eval = (script: string, numberOfKeys: number, ...args: Array<string | number>) =>
    evaluate(script.replace(/return output\s*$/, 'return {unpack(output)}'), numberOfKeys, ...args)
  return { redis }
})
vi.mock('../src/index.js', () => ({ default: redis }))
const { recordAddonActivity, readAddonTelemetry } = await import('../src/addonTelemetry.js')
const baseTime = new Date('2026-11-25T12:00:00.000Z')

beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(baseTime)
  redis.status = 'ready'
  await redis.flushall()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})
afterAll(() => redis.disconnect())

describe('addon transport telemetry', () => {
  it('sums authenticated HTTP and WebSocket requests without counting handshake/console activity', async () => {
    await recordAddonActivity('s1', { transport: 'websocket', version: 'v5.2.8', countRequest: false })
    let snapshot = await readAddonTelemetry(['s1'])
    expect(snapshot.available).toBe(true)
    expect(snapshot.items[0]).toMatchObject({ addonVersion: 'v5.2.8', requestsPerMinute: 0, protocol: null })
    expect(snapshot.items[0].lastWebsocketAt).toMatch(/^2026-11-25T12:00:00\./)
    await recordAddonActivity('s1', { transport: 'http', protocol: 'legacy' })
    await recordAddonActivity('s1', { transport: 'http' })
    await recordAddonActivity('s1', { transport: 'websocket', protocol: 'acknowledged' })
    await recordAddonActivity('s1', { transport: 'websocket', countRequest: false })
    snapshot = await readAddonTelemetry(['s1'])
    expect(snapshot.items[0]).toMatchObject({
      addonVersion: 'v5.2.8',
      protocol: 'acknowledged',
      httpRequestsPerMinute: 2,
      websocketRequestsPerMinute: 1,
      requestsPerMinute: 3,
    })
    expect(snapshot.items[0].lastHttpAt).toMatch(/^2026-11-25T12:00:00\./)
    expect(await redis.ttl('addon:telemetry:s1')).toBe(7 * 24 * 60 * 60)
  })

  it('expires buckets after 60 seconds and reuses ring slots across minutes and replicas', async () => {
    await Promise.all(Array.from({ length: 4 }, () => recordAddonActivity('s1', { transport: 'http' })))
    vi.setSystemTime(baseTime.getTime() + 59_000)
    await recordAddonActivity('s1', { transport: 'websocket' })
    expect((await readAddonTelemetry(['s1'])).items[0].requestsPerMinute).toBe(5)
    vi.setSystemTime(baseTime.getTime() + 60_000)
    let snapshot = await readAddonTelemetry(['s1'])
    expect(snapshot.items[0]).toMatchObject({ httpRequestsPerMinute: 0, websocketRequestsPerMinute: 1 })
    await recordAddonActivity('s1', { transport: 'http' })
    expect((await readAddonTelemetry(['s1'])).items[0].requestsPerMinute).toBe(2)
    for (let second = 61; second < 240; second++) {
      vi.setSystemTime(baseTime.getTime() + second * 1000)
      await recordAddonActivity('s1', { transport: second % 2 ? 'http' : 'websocket' })
    }
    snapshot = await readAddonTelemetry(['s1'])
    expect(snapshot.items[0].requestsPerMinute).toBe(60)
    expect(await redis.hlen('addon:telemetry:s1')).toBeLessThanOrEqual(125)
    vi.setSystemTime(baseTime.getTime() + 400_000)
    expect((await readAddonTelemetry(['s1'])).items[0].requestsPerMinute).toBe(0)
  })

  it('retains server order, uses existing metadata as fallback and reports zero for missing metrics', async () => {
    await redis.set('server:old:version', '5.2.7')
    await redis.set('server:old:last_request', '2026-11-24T12:30:00.000Z')
    await recordAddonActivity('new', { transport: 'websocket', version: '5.2.8', protocol: 'acknowledged' })
    const snapshot = await readAddonTelemetry(['old', 'missing', 'new'])
    expect(snapshot.available).toBe(true)
    expect(snapshot.observedAt).toMatch(/^2026-11-25T12:00:00\./)
    expect(snapshot.items[0]).toEqual({
      addonVersion: '5.2.7',
      lastSeenAt: '2026-11-24T12:30:00.000Z',
      lastHttpAt: null,
      lastWebsocketAt: null,
      protocol: null,
      httpRequestsPerMinute: 0,
      websocketRequestsPerMinute: 0,
      requestsPerMinute: 0,
    })
    expect(snapshot.items[1]).toMatchObject({ addonVersion: null, lastSeenAt: null, requestsPerMinute: 0 })
    expect(snapshot.items[2]).toMatchObject({ addonVersion: '5.2.8', protocol: 'acknowledged', requestsPerMinute: 1 })
  })

  it('does not replace a known addon version or protocol with missing or malformed metadata', async () => {
    await recordAddonActivity('s1', { transport: 'http', version: 'v5.2.8', protocol: 'legacy' })
    for (const version of [undefined, ['5.3.0'], 'private invalid data', 'v1.2.3-' + 'x'.repeat(65)])
      await recordAddonActivity('s1', { transport: 'websocket', version, countRequest: false })
    expect((await readAddonTelemetry(['s1'])).items[0]).toMatchObject({ addonVersion: 'v5.2.8', protocol: 'legacy' })
    await redis.hset('addon:telemetry:s1', 'addonVersion', 'bad version', 'lastHttpAt', 'invalid date')
    expect((await readAddonTelemetry(['s1'])).items[0]).toMatchObject({ addonVersion: null, lastHttpAt: null })
  })

  it('reads lists in bounded batches and supports an empty list', async () => {
    const ids = Array.from({ length: 205 }, (_, index) => `server-${index}`)
    const evalSpy = vi.spyOn(redis, 'eval')
    expect((await readAddonTelemetry(ids)).items).toHaveLength(205)
    expect(evalSpy.mock.calls.map((call) => call[1])).toEqual([300, 300, 15])
    expect(await readAddonTelemetry([])).toMatchObject({ available: true, items: [] })
  })

  it('contains Redis errors and distinguishes unavailable metrics from an idle server', async () => {
    vi.spyOn(redis, 'eval').mockRejectedValue(new Error('Redis unavailable'))
    await expect(recordAddonActivity('s1', { transport: 'http' })).resolves.toBeUndefined()
    expect(await readAddonTelemetry(['s1'])).toEqual({
      available: false,
      observedAt: null,
      items: [
        {
          addonVersion: null,
          lastSeenAt: null,
          lastHttpAt: null,
          lastWebsocketAt: null,
          protocol: null,
          httpRequestsPerMinute: null,
          websocketRequestsPerMinute: null,
          requestsPerMinute: null,
        },
      ],
    })
  })

  it('skips the Redis offline queue and invalid server identifiers', async () => {
    const evalSpy = vi.spyOn(redis, 'eval')
    redis.status = 'reconnecting'
    await recordAddonActivity('s1', { transport: 'http' })
    expect((await readAddonTelemetry(['s1'])).available).toBe(false)
    redis.status = 'ready'
    await recordAddonActivity('invalid/id', { transport: 'http' })
    expect((await readAddonTelemetry(['invalid/id'])).available).toBe(false)
    expect(evalSpy).not.toHaveBeenCalled()
  })

  it('bounds queued commands and the time spent awaiting stalled metrics', async () => {
    let finish!: (value: unknown) => void
    const stalled = new Promise((resolve) => (finish = resolve))
    const evalSpy = vi.spyOn(redis, 'eval').mockReturnValue(stalled as ReturnType<typeof redis.eval>)
    const recording = Array.from({ length: 40 }, () => recordAddonActivity('s1', { transport: 'http' }))
    await vi.advanceTimersByTimeAsync(251)
    await Promise.all(recording)
    expect(evalSpy).toHaveBeenCalledTimes(32)
    expect((await readAddonTelemetry(['s1'])).available).toBe(false)
    finish(1)
    await Promise.resolve()
    await Promise.resolve()
  })

  it.each(
    [
      [],
      [0],
      [Date.now(), []],
      [Date.now(), ['', '', '', '', '', -1, 0]],
      [Date.now(), ['', '', '', '', '', Number.MAX_SAFE_INTEGER, 1]],
    ].map((value) => [value]),
  )('contains malformed Redis snapshots: %j', async (value) => {
    vi.spyOn(redis, 'eval').mockResolvedValue(value)
    expect((await readAddonTelemetry(['s1'])).available).toBe(false)
  })
})
