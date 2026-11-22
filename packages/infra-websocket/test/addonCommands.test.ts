import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { redis } = await vi.hoisted(async () => {
  const { default: Redis } = await import('ioredis-mock')
  return { redis: new Redis() }
})
vi.mock('@gmod/infra-redis', () => ({ default: redis }))
const dispatch = vi.fn()
vi.mock('../src/queues.js', () => ({ enqueueWSSendToServerAndWait: dispatch }))
const { enqueueAddonRconAndWait, acceptAddonCommandResult } = await import('../src/addonCommands.js')
const input = { serverID: 'server-1', steamID: '76561198000000001', command: 'status' }
const success = (id: string) => ({
  action: 'addon.command-result',
  method: 'wsAuthorizedRcon',
  id,
  ok: true,
  code: 'executed',
})

beforeEach(async () => {
  vi.useFakeTimers()
  await redis.flushall()
  dispatch.mockReset()
})
afterEach(() => vi.useRealTimers())
afterAll(() => redis.disconnect())

async function start() {
  dispatch.mockResolvedValueOnce(true)
  const waiting = enqueueAddonRconAndWait(input, 100)
  await vi.advanceTimersByTimeAsync(0)
  const packet = dispatch.mock.calls[0][0].data
  return { waiting, packet }
}

describe('authenticated addon execution acknowledgement', () => {
  it('does not mistake successful socket delivery for successful console execution', async () => {
    const { waiting, packet } = await start()
    expect(packet).toMatchObject({ method: 'wsAuthorizedRcon', steamID: input.steamID, command: 'status' })
    await vi.advanceTimersByTimeAsync(101)
    expect(await waiting).toBe(false)
    expect(await redis.keys('ws:addon-command:*')).toEqual([])
    expect(dispatch).toHaveBeenCalledOnce()
  })

  it('accepts a matching addon result and cleans its pending state', async () => {
    const { waiting, packet } = await start()
    await acceptAddonCommandResult(input.serverID, success(packet.requestID))
    await vi.advanceTimersByTimeAsync(50)
    expect(await waiting).toBe(true)
    expect(await redis.keys('ws:addon-command:*')).toEqual([])
  })

  it('rejects another authenticated server and unknown request IDs', async () => {
    const { waiting, packet } = await start()
    await acceptAddonCommandResult('foreign-server', success(packet.requestID))
    await acceptAddonCommandResult(input.serverID, success('5a918b48-ff6f-4ed4-b2b9-f4b722840f04'))
    expect(await redis.keys('ws:addon-command:*:result')).toEqual([])
    await vi.advanceTimersByTimeAsync(101)
    expect(await waiting).toBe(false)
  })

  it.each([
    { ok: true, code: 'permission_denied' },
    { ok: false, code: 'executed' },
    { method: 'wsRunLua' },
    { secret: 'unexpected' },
  ])('rejects malformed or contradictory acknowledgements %j', async (changes) => {
    const { waiting, packet } = await start()
    await acceptAddonCommandResult(input.serverID, { ...success(packet.requestID), ...changes })
    await vi.advanceTimersByTimeAsync(101)
    expect(await waiting).toBe(false)
  })

  it('preserves the first terminal result and never upgrades a denial to success', async () => {
    const { waiting, packet } = await start()
    await acceptAddonCommandResult(input.serverID, {
      ...success(packet.requestID),
      ok: false,
      code: 'permission_denied',
    })
    await acceptAddonCommandResult(input.serverID, success(packet.requestID))
    await vi.advanceTimersByTimeAsync(50)
    expect(await waiting).toBe(false)
  })

  it('ignores expired results without recreating completion state', async () => {
    const { waiting, packet } = await start()
    await vi.advanceTimersByTimeAsync(101)
    expect(await waiting).toBe(false)
    await acceptAddonCommandResult(input.serverID, success(packet.requestID))
    expect(await redis.keys('ws:addon-command:*')).toEqual([])
  })

  it('does not dispatch malformed remote input', async () => {
    await expect(enqueueAddonRconAndWait({ ...input, command: 'status\nquit' })).rejects.toThrow()
    expect(dispatch).not.toHaveBeenCalled()
    expect(await redis.keys('ws:addon-command:*')).toEqual([])
  })

  it('returns false for an undelivered command and cleans up a queue failure', async () => {
    dispatch.mockResolvedValueOnce(false)
    expect(await enqueueAddonRconAndWait(input)).toBe(false)
    dispatch.mockRejectedValueOnce(new Error('queue unavailable'))
    await expect(enqueueAddonRconAndWait(input)).rejects.toThrow('queue unavailable')
    expect(await redis.keys('ws:addon-command:*')).toEqual([])
  })
})
