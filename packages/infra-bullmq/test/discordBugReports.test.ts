import { beforeEach, describe, expect, it, vi } from 'vitest'
const queues = new Map<string, { add: ReturnType<typeof vi.fn> }>()
vi.mock('bullmq', () => ({
  Queue: class {
    add = vi.fn().mockResolvedValue({ id: 'job' })
    constructor(name: string) {
      queues.set(name, this)
    }
  },
}))
vi.mock('@gmod/infra-redis', () => ({ default: { get: vi.fn(), del: vi.fn() } }))
const { enqueueDiscordServerBugReport } = await import('../src/discordQueueAdapters.js')
beforeEach(() => {
  for (const queue of queues.values()) queue.add.mockReset().mockResolvedValue({ id: 'job' })
})
describe('bug report Discord adapter', () => {
  it('queues only persisted identities with safe deterministic in-flight deduplication and no uncertain-send retry', async () => {
    await enqueueDiscordServerBugReport('server:with:colons', 42)
    await enqueueDiscordServerBugReport('server:with:colons', 42)
    await enqueueDiscordServerBugReport('other-server', 42)
    await enqueueDiscordServerBugReport('server:with:colons', 43)
    const calls = queues.get('discord-guildOps')!.add.mock.calls
    expect(calls[0][0]).toBe('serverBugReport')
    expect(calls[0][1]).toEqual({ serverID: 'server:with:colons', reportID: 42 })
    expect(calls[0][2]).toMatchObject({ attempts: 1, removeOnComplete: true, removeOnFail: true })
    expect(calls[0][2].jobId).toMatch(/^bug-report-[a-f\d]{64}$/)
    expect(calls[1][2].jobId).toBe(calls[0][2].jobId)
    expect(calls[2][2].jobId).not.toBe(calls[0][2].jobId)
    expect(calls[3][2].jobId).not.toBe(calls[0][2].jobId)
  })
  it('rejects malformed persisted identities before queueing and reports queue failure to its caller', async () => {
    await expect(enqueueDiscordServerBugReport('server', 0)).rejects.toThrow()
    expect(queues.get('discord-guildOps')!.add).not.toHaveBeenCalled()
    queues.get('discord-guildOps')!.add.mockRejectedValueOnce(new Error('Queue unavailable'))
    await expect(enqueueDiscordServerBugReport('server', 42)).rejects.toThrow('Queue unavailable')
  })
})
