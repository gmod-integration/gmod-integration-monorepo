import { beforeEach, describe, expect, it, vi } from 'vitest'

const redisMock = { get: vi.fn(), set: vi.fn(), del: vi.fn() }
vi.mock('@gmod/infra-redis', () => ({ default: redisMock }))

const enqueueDiscordGuildSnapshotMock = vi.fn()
const isBullMQReplyTimeoutErrorMock = vi.fn()
vi.mock('@gmod/infra-bullmq/discordQueueAdapters.js', () => ({
  enqueueDiscordGuildSnapshot: enqueueDiscordGuildSnapshotMock,
  isBullMQReplyTimeoutError: isBullMQReplyTimeoutErrorMock,
}))

const {
  getCachedGuildPreferredLocale,
  setCachedGuildPreferredLocale,
  deleteCachedGuildPreferredLocale,
  resolveGuildPreferredLocale,
} = await import('../../src/utils/guildLocaleCache.js')

describe('guildLocaleCache', () => {
  beforeEach(() => {
    redisMock.get.mockReset()
    redisMock.set.mockReset()
    redisMock.del.mockReset()
    enqueueDiscordGuildSnapshotMock.mockReset()
    isBullMQReplyTimeoutErrorMock.mockReset()
  })

  describe('getCachedGuildPreferredLocale', () => {
    it('returns null when nothing is cached', async () => {
      redisMock.get.mockResolvedValueOnce(null)
      await expect(getCachedGuildPreferredLocale('g1')).resolves.toBeNull()
    })

    it('normalizes the cached locale to its 2-letter form', async () => {
      redisMock.get.mockResolvedValueOnce('en-US')
      await expect(getCachedGuildPreferredLocale('g1')).resolves.toBe('en')
    })
  })

  describe('setCachedGuildPreferredLocale', () => {
    it('normalizes and caches the locale with the default TTL', async () => {
      await setCachedGuildPreferredLocale('g1', 'fr-FR')
      expect(redisMock.set).toHaveBeenCalledWith(
        'discord:guild:g1:preferredLocale',
        'fr',
        'EX',
        60 * 60 * 24 * 30,
      )
    })

    it('accepts a custom TTL', async () => {
      await setCachedGuildPreferredLocale('g1', 'fr-FR', 60)
      expect(redisMock.set).toHaveBeenCalledWith('discord:guild:g1:preferredLocale', 'fr', 'EX', 60)
    })

    it('normalizes an empty preferredLocale to "en"', async () => {
      await setCachedGuildPreferredLocale('g1', '')
      expect(redisMock.set).toHaveBeenCalledWith('discord:guild:g1:preferredLocale', 'en', 'EX', 60 * 60 * 24 * 30)
    })
  })

  describe('deleteCachedGuildPreferredLocale', () => {
    it('deletes the cache key', async () => {
      await deleteCachedGuildPreferredLocale('g1')
      expect(redisMock.del).toHaveBeenCalledWith('discord:guild:g1:preferredLocale')
    })
  })

  describe('resolveGuildPreferredLocale', () => {
    it('returns the cached locale without hitting bullmq', async () => {
      redisMock.get.mockResolvedValueOnce('fr')
      await expect(resolveGuildPreferredLocale('g1')).resolves.toBe('fr')
      expect(enqueueDiscordGuildSnapshotMock).not.toHaveBeenCalled()
    })

    it('resolves, caches, and returns the locale from a fresh snapshot', async () => {
      redisMock.get.mockResolvedValueOnce(null)
      enqueueDiscordGuildSnapshotMock.mockResolvedValueOnce({ preferredLocale: 'de-DE' })

      await expect(resolveGuildPreferredLocale('g1')).resolves.toBe('de')

      expect(redisMock.set).toHaveBeenCalledWith('discord:guild:g1:preferredLocale', 'de', 'EX', 60 * 60 * 24 * 30)
    })

    it('falls back to "en" (short TTL) when the snapshot has no preferredLocale', async () => {
      redisMock.get.mockResolvedValueOnce(null)
      enqueueDiscordGuildSnapshotMock.mockResolvedValueOnce({})

      await expect(resolveGuildPreferredLocale('g1')).resolves.toBe('en')
      expect(redisMock.set).toHaveBeenCalledWith('discord:guild:g1:preferredLocale', 'en', 'EX', 60)
    })

    it('falls back to "en" silently on a BullMQ reply timeout', async () => {
      redisMock.get.mockResolvedValueOnce(null)
      enqueueDiscordGuildSnapshotMock.mockRejectedValueOnce(new Error('timeout'))
      isBullMQReplyTimeoutErrorMock.mockReturnValueOnce(true)
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await expect(resolveGuildPreferredLocale('g1')).resolves.toBe('en')
      expect(errorSpy).not.toHaveBeenCalled()
    })

    it('falls back to "en" and logs on an unrecognized error', async () => {
      redisMock.get.mockResolvedValueOnce(null)
      enqueueDiscordGuildSnapshotMock.mockRejectedValueOnce(new Error('boom'))
      isBullMQReplyTimeoutErrorMock.mockReturnValueOnce(false)
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await expect(resolveGuildPreferredLocale('g1')).resolves.toBe('en')
      expect(errorSpy).toHaveBeenCalled()
    })
  })
})
