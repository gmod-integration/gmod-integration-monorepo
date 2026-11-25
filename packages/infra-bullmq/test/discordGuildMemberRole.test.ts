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
const { enqueueDiscordGuildMemberRole, BullMQReplyTimeoutError } = await import('../src/discordQueueAdapters.js')
const guildID = '111111111111111111',
  discordID = '222222222222222222',
  roleID = '333333333333333333'
beforeEach(() => {
  redis.get.mockReset().mockResolvedValue(null)
  redis.del.mockReset()
  for (const queue of queues.values()) queue.add.mockReset().mockResolvedValue({ id: 'job' })
})
afterEach(() => vi.useRealTimers())
describe('Discord member role adapter', () => {
  it('queues every lookup without a grant cache and strips reply correlation metadata', async () => {
    for (const hasRole of [true, false]) {
      redis.get.mockResolvedValueOnce(
        JSON.stringify({ correlationId: 'reply', available: true, hasRole, roleExists: true }),
      )
      expect(await enqueueDiscordGuildMemberRole(guildID, discordID, roleID)).toEqual({
        available: true,
        hasRole,
        roleExists: true,
      })
    }
    expect(queues.get('discord-guildOps')!.add).toHaveBeenCalledTimes(2)
    expect(queues.get('discord-guildOps')!.add).toHaveBeenCalledWith(
      'guildMemberRole',
      expect.objectContaining({ guildID, discordID, roleID }),
      expect.objectContaining({ attempts: 1 }),
    )
  })
  it('preserves explicit provider unavailability', async () => {
    redis.get.mockResolvedValueOnce(
      JSON.stringify({ correlationId: 'reply', available: false, hasRole: false, roleExists: false }),
    )
    expect(await enqueueDiscordGuildMemberRole(guildID, discordID, roleID)).toEqual({
      available: false,
      hasRole: false,
      roleExists: false,
    })
  })
  it('rejects invalid role identifiers before submitting work and contradictory grants in replies', async () => {
    await expect(enqueueDiscordGuildMemberRole(guildID, discordID, '')).rejects.toThrow()
    expect(queues.get('discord-guildOps')!.add).not.toHaveBeenCalled()
    redis.get.mockResolvedValueOnce(
      JSON.stringify({ correlationId: 'reply', available: false, hasRole: true, roleExists: true }),
    )
    await expect(enqueueDiscordGuildMemberRole(guildID, discordID, roleID)).rejects.toThrow()
  })
  it('rejects a timeout without returning a stale positive answer', async () => {
    vi.useFakeTimers()
    const lookup = enqueueDiscordGuildMemberRole(guildID, discordID, roleID, 100)
    const assertion = expect(lookup).rejects.toBeInstanceOf(BullMQReplyTimeoutError)
    await vi.advanceTimersByTimeAsync(101)
    await assertion
  })
})
