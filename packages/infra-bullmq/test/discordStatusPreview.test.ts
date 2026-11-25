import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const add = vi.fn()
vi.mock('bullmq', () => ({
  Queue: class {
    add = add
  },
}))
const redis = { get: vi.fn(), del: vi.fn().mockResolvedValue(1) }
vi.mock('@gmod/infra-redis', () => ({ default: redis }))
const { enqueueDiscordServerStatusPreview, BullMQReplyTimeoutError } = await import('../src/discordQueueAdapters.js')
const preview = {
  bot: { name: 'Bot', avatarUrl: null },
  online: false,
  embeds: [{ title: 'Status', color: 0x393a41, fields: [], timestamp: '2026-11-20T12:00:00.000Z', imageUrl: null }],
  buttonRows: [],
}

describe('read-only status preview adapter', () => {
  beforeEach(() => {
    add.mockReset().mockResolvedValue({ id: 'job' })
    redis.get.mockReset().mockResolvedValue(null)
  })
  afterEach(() => vi.useRealTimers())
  it('validates the draft and returns the exact worker payload', async () => {
    redis.get.mockResolvedValueOnce(JSON.stringify({ correlationId: 'reply', preview }))
    expect(
      await enqueueDiscordServerStatusPreview('s1', { locale: 'en', settings: { show_player_list_status: true } }),
    ).toEqual(preview)
    expect(add).toHaveBeenCalledWith(
      'serverStatusPreview',
      expect.objectContaining({ serverID: 's1', draft: { locale: 'en', settings: { show_player_list_status: true } } }),
      expect.objectContaining({ attempts: 1, removeOnComplete: true }),
    )
    await expect(enqueueDiscordServerStatusPreview('s1', { settings: { unexpected: true } } as any)).rejects.toThrow()
    expect(add).toHaveBeenCalledTimes(1)
  })
  it('reports renderer errors and unavailable or invalid responses instead of accepting a fake preview', async () => {
    redis.get.mockResolvedValueOnce(JSON.stringify({ correlationId: 'reply', preview: null, error: 'Invalid button' }))
    await expect(enqueueDiscordServerStatusPreview('s1', { settings: {} })).rejects.toThrow('Invalid button')
    redis.get.mockResolvedValueOnce(JSON.stringify({ correlationId: 'reply', preview: null }))
    await expect(enqueueDiscordServerStatusPreview('s1', { settings: {} })).rejects.toThrow(
      'Status preview is unavailable',
    )
    redis.get.mockResolvedValueOnce(JSON.stringify({ correlationId: 'reply', preview: {} }))
    await expect(enqueueDiscordServerStatusPreview('s1', { settings: {} })).rejects.toThrow()
  })
  it('does not retry expired draft jobs when the worker times out', async () => {
    vi.useFakeTimers()
    const request = enqueueDiscordServerStatusPreview('s1', { settings: {} }, 100)
    const rejected = expect(request).rejects.toBeInstanceOf(BullMQReplyTimeoutError)
    await vi.advanceTimersByTimeAsync(101)
    await rejected
    expect(add).toHaveBeenCalledTimes(1)
  })
})
