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
const redis = { get: vi.fn(), set: vi.fn(), del: vi.fn() }
vi.mock('@gmod/infra-redis', () => ({ default: redis }))
const { enqueueDiscordGuildPublicInvite, BullMQReplyTimeoutError } = await import('../src/discordQueueAdapters.js')

describe('public community invitation adapter', () => {
  beforeEach(() => {
    for (const queue of queues.values()) queue.add.mockReset().mockResolvedValue({ id: 'job' })
    redis.get.mockReset().mockResolvedValue(null)
    redis.set.mockReset().mockResolvedValue('OK')
    redis.del.mockReset().mockResolvedValue(1)
  })
  afterEach(() => vi.useRealTimers())

  it('returns validated cached invitations and cached unavailable communities without queue work', async () => {
    redis.get.mockResolvedValueOnce(JSON.stringify('https://discord.gg/cached'))
    expect(await enqueueDiscordGuildPublicInvite('cached')).toBe('https://discord.gg/cached')
    redis.get.mockResolvedValueOnce('null')
    expect(await enqueueDiscordGuildPublicInvite('none')).toBeNull()
    expect(queues.get('discord-guildOps')!.add).not.toHaveBeenCalled()
  })

  it('validates malformed or unsafe cache entries before returning a worker invitation', async () => {
    for (const [index, cached] of ['not-json', JSON.stringify('https://evil.example/invite')].entries()) {
      redis.get
        .mockResolvedValueOnce(cached)
        .mockResolvedValueOnce(JSON.stringify({ correlationId: 'reply', inviteUrl: 'https://discord.gg/valid' }))
      expect(await enqueueDiscordGuildPublicInvite(`invalid-${index}`)).toBe('https://discord.gg/valid')
    }
    expect(redis.set).toHaveBeenCalledWith(
      'discord:publicInvite:invalid-0',
      JSON.stringify('https://discord.gg/valid'),
      'EX',
      3600,
    )
    expect(queues.get('discord-guildOps')!.add).toHaveBeenCalledWith(
      'guildPublicInvite',
      expect.objectContaining({ guildID: 'invalid-0', correlationId: expect.any(String), timestamp: expect.any(Date) }),
      expect.objectContaining({ attempts: 1 }),
    )
  })

  it('briefly caches a worker response with no invitation', async () => {
    redis.get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(JSON.stringify({ correlationId: 'reply', inviteUrl: null }))
    expect(await enqueueDiscordGuildPublicInvite('no-permission')).toBeNull()
    expect(redis.set).toHaveBeenCalledWith('discord:publicInvite:no-permission', 'null', 'EX', 60)
  })

  it('shares an in-flight community invitation request across simultaneous server listings', async () => {
    redis.get.mockImplementation(async (key: string) =>
      key.startsWith('discord:publicInvite:')
        ? null
        : JSON.stringify({ correlationId: 'reply', inviteUrl: 'https://discord.gg/shared' }),
    )
    const results = await Promise.all([
      enqueueDiscordGuildPublicInvite('shared'),
      enqueueDiscordGuildPublicInvite('shared'),
    ])
    expect(results).toEqual(['https://discord.gg/shared', 'https://discord.gg/shared'])
    expect(queues.get('discord-guildOps')!.add).toHaveBeenCalledTimes(1)
  })

  it('does not cache queue failures or poison the next attempt', async () => {
    queues.get('discord-guildOps')!.add.mockRejectedValueOnce(new Error('queue unavailable'))
    await expect(enqueueDiscordGuildPublicInvite('retry')).rejects.toThrow('queue unavailable')
    expect(redis.set).not.toHaveBeenCalled()
    redis.get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(JSON.stringify({ correlationId: 'reply', inviteUrl: 'https://discord.gg/retried' }))
    expect(await enqueueDiscordGuildPublicInvite('retry')).toBe('https://discord.gg/retried')
  })

  it('does not cache reply timeouts or malformed worker links', async () => {
    vi.useFakeTimers()
    const request = enqueueDiscordGuildPublicInvite('timeout', 100)
    const rejected = expect(request).rejects.toBeInstanceOf(BullMQReplyTimeoutError)
    await vi.advanceTimersByTimeAsync(101)
    await rejected
    expect(redis.set).not.toHaveBeenCalled()
    vi.useRealTimers()
    redis.get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(JSON.stringify({ correlationId: 'reply', inviteUrl: 'javascript:alert(1)' }))
    await expect(enqueueDiscordGuildPublicInvite('unsafe')).rejects.toThrow()
    expect(redis.set).not.toHaveBeenCalled()
  })
})
