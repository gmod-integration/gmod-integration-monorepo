import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const queues = new Map<string, { add: ReturnType<typeof vi.fn> }>()
vi.mock('bullmq', () => ({
  Queue: class {
    add = vi.fn().mockResolvedValue({ id: 'job' })
    constructor(name: string) {
      queues.set(name, this)
    }
  },
}))
const redis = { get: vi.fn(), del: vi.fn() }
vi.mock('@gmod/infra-redis', () => ({ default: redis }))
const { enqueueDiscordServerErrorsChannelValidate, enqueueDiscordServerLuaError, BullMQReplyTimeoutError } =
  await import('../src/discordQueueAdapters.js')
const channelID = '111111111111111111'
const report = { error: 'boom', stack: 'line1', realm: 'server' as const, count: 1, uptime: 12 }
const notification = { serverID: 'server:with:colons', errorID: '0123456789abcdef01234567', report }
beforeEach(() => {
  redis.get.mockReset().mockResolvedValue(null)
  redis.del.mockReset()
  for (const queue of queues.values()) queue.add.mockReset().mockResolvedValue({ id: 'job' })
})
afterEach(() => vi.useRealTimers())
describe('Lua error Discord adapters', () => {
  it('freshly validates each destination and returns only safe result metadata', async () => {
    redis.get.mockResolvedValueOnce(JSON.stringify({ correlationId: 'reply', valid: true }))
    expect(await enqueueDiscordServerErrorsChannelValidate('server', channelID)).toEqual({ valid: true })
    redis.get.mockResolvedValueOnce(
      JSON.stringify({ correlationId: 'reply', valid: false, reason: 'missing_permissions' }),
    )
    expect(await enqueueDiscordServerErrorsChannelValidate('server', channelID)).toEqual({
      valid: false,
      reason: 'missing_permissions',
    })
    expect(queues.get('discord-guildOps')!.add).toHaveBeenCalledWith(
      'serverErrorsChannelValidate',
      expect.objectContaining({ serverID: 'server', channelID }),
      expect.objectContaining({ attempts: 1 }),
    )
    expect(queues.get('discord-guildOps')!.add).toHaveBeenCalledTimes(2)
  })
  it('rejects invalid destinations, unsafe provider replies and unavailable workers', async () => {
    await expect(enqueueDiscordServerErrorsChannelValidate('server', 'bad')).rejects.toThrow()
    expect(queues.get('discord-guildOps')!.add).not.toHaveBeenCalled()
    redis.get.mockResolvedValueOnce(JSON.stringify({ correlationId: 'reply', valid: false, reason: 'private secret' }))
    await expect(enqueueDiscordServerErrorsChannelValidate('server', channelID)).rejects.toThrow()
    vi.useFakeTimers()
    const assertion = expect(
      enqueueDiscordServerErrorsChannelValidate('server', channelID, 100),
    ).rejects.toBeInstanceOf(BullMQReplyTimeoutError)
    await vi.advanceTimersByTimeAsync(101)
    await assertion
  })
  it('queues once per saved report identity, without retries or trusting extra fields', async () => {
    await enqueueDiscordServerLuaError(notification)
    const first = queues.get('discord-guildOps')!.add.mock.calls[0]
    await enqueueDiscordServerLuaError({
      ...notification,
      report: {
        ...report,
        error: 'x'.repeat(10000),
        stack: 'y'.repeat(20000),
        name: 'n'.repeat(500),
        steamID64: '76561198000000001',
        workshopID: '123',
        channelID: 'foreign',
      },
    } as any)
    const second = queues.get('discord-guildOps')!.add.mock.calls[1]
    expect(first[0]).toBe('serverLuaError')
    expect(first[2]).toMatchObject({ attempts: 1, removeOnComplete: true, removeOnFail: true })
    expect(first[2].jobId).toMatch(/^lua-error-[a-f\d]{64}$/)
    expect(first[2].jobId).toBe(second[2].jobId)
    expect(second[1].report).toEqual({
      ...report,
      error: 'x'.repeat(2048),
      stack: 'y'.repeat(8192),
      name: 'n'.repeat(128),
      steamID64: '76561198000000001',
      workshopID: '123',
    })
    await enqueueDiscordServerLuaError({ ...notification, serverID: 'other' })
    expect(queues.get('discord-guildOps')!.add.mock.calls[2][2].jobId).not.toBe(first[2].jobId)
    expect(redis.get).not.toHaveBeenCalled()
  })
  it('rejects malformed saved identities before queueing', async () => {
    await expect(enqueueDiscordServerLuaError({ ...notification, errorID: 'bad' })).rejects.toThrow()
    expect(queues.get('discord-guildOps')!.add).not.toHaveBeenCalled()
  })
})
