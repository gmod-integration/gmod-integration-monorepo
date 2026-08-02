import { beforeEach, describe, expect, it, vi } from 'vitest'

const existsSyncMock = vi.fn()
const readFileSyncMock = vi.fn()
vi.mock('fs', () => ({ existsSync: existsSyncMock, readFileSync: readFileSyncMock }))

const redisMock = { get: vi.fn(), set: vi.fn(), del: vi.fn() }
vi.mock('@gmod/infra-redis', () => ({ default: redisMock }))

const gmLogMock = vi.fn()
vi.mock('../../src/utils/logger.js', () => ({ gmLog: gmLogMock }))

const { getTranslate } = await import('../../src/utils/localizations.js')

describe('getTranslate (core)', () => {
  beforeEach(() => {
    existsSyncMock.mockReset()
    readFileSyncMock.mockReset()
    redisMock.get.mockReset()
    redisMock.set.mockReset()
    gmLogMock.mockClear()
  })

  it('returns the cached translation from redis, substituting options', async () => {
    redisMock.get.mockResolvedValueOnce('Hello {1}')
    await expect(getTranslate('greet', 'en', ['Bob'])).resolves.toBe('Hello Bob')
    expect(readFileSyncMock).not.toHaveBeenCalled()
  })

  it('defaults to "en" when no language is given', async () => {
    redisMock.get.mockResolvedValueOnce(null)
    existsSyncMock.mockReturnValueOnce(true)
    readFileSyncMock.mockReturnValueOnce(JSON.stringify({ hello: 'Hello' }))
    await expect(getTranslate('hello')).resolves.toBe('Hello')
    expect(redisMock.get).toHaveBeenCalledWith('language:en:hello')
  })

  it('reads from disk, caches, and returns the translation when found', async () => {
    redisMock.get.mockResolvedValueOnce(null)
    existsSyncMock.mockReturnValueOnce(true)
    readFileSyncMock.mockReturnValueOnce(JSON.stringify({ hello: 'Bonjour' }))

    await expect(getTranslate('hello', 'fr')).resolves.toBe('Bonjour')
    expect(redisMock.set).toHaveBeenCalledWith('language:fr:hello', 'Bonjour', 'EX', 60 * 60 * 24)
  })

  it('falls back to en.json when the language file does not exist', async () => {
    redisMock.get.mockResolvedValueOnce(null)
    existsSyncMock.mockReturnValueOnce(false)
    readFileSyncMock.mockReturnValueOnce(JSON.stringify({ hello: 'Hello' }))

    await expect(getTranslate('hello', 'zz')).resolves.toBe('Hello')
    expect(readFileSyncMock).toHaveBeenCalledWith(expect.stringContaining('en.json'), 'utf8')
  })

  it('falls back to getDefaultTrad when the key is missing from the requested language', async () => {
    redisMock.get.mockResolvedValueOnce(null)
    existsSyncMock.mockReturnValueOnce(true)
    readFileSyncMock.mockReturnValueOnce(JSON.stringify({ other: 'x' })).mockReturnValueOnce(
      JSON.stringify({ hello: 'Hello (default)' }),
    )

    await expect(getTranslate('hello', 'fr')).resolves.toBe('Hello (default)')
  })

  it('logs via gmLog and falls back to getDefaultTrad when reading the requested language throws', async () => {
    redisMock.get.mockResolvedValueOnce(null)
    existsSyncMock.mockReturnValueOnce(true)
    readFileSyncMock
      .mockImplementationOnce(() => {
        throw new Error('read error')
      })
      .mockReturnValueOnce(JSON.stringify({ hello: 'Hello (default)' }))

    await expect(getTranslate('hello', 'fr')).resolves.toBe('Hello (default)')
    expect(gmLogMock).toHaveBeenCalledWith('localization', expect.stringContaining('read error'))
  })

  describe('getDefaultTrad fallback (via a key missing everywhere)', () => {
    it('logs and falls back to "key - options" when options are given', async () => {
      redisMock.get.mockResolvedValueOnce(null)
      existsSyncMock.mockReturnValueOnce(true)
      readFileSyncMock.mockReturnValue(JSON.stringify({}))
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await expect(getTranslate('missing', 'fr', ['a', 'b'])).resolves.toBe('missing - a, b')
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('with the options a, b'))
    })

    it('logs and falls back to the bare key when no options are given', async () => {
      redisMock.get.mockResolvedValueOnce(null)
      existsSyncMock.mockReturnValueOnce(true)
      readFileSyncMock.mockReturnValue(JSON.stringify({}))
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await expect(getTranslate('missing', 'fr')).resolves.toBe('missing')
      expect(errorSpy).toHaveBeenCalledWith('Missing key missing in default language')
    })

    it('falls back to "key - options" when the default-language read itself throws', async () => {
      redisMock.get.mockResolvedValueOnce(null)
      existsSyncMock.mockReturnValueOnce(true)
      readFileSyncMock
        .mockReturnValueOnce(JSON.stringify({}))
        .mockImplementationOnce(() => {
          throw new Error('default read error')
        })
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await expect(getTranslate('missing', 'fr', ['a'])).resolves.toBe('missing - a')
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Error in getDefaultTrad'))
    })

    it('falls back to the bare key when the default-language read throws and no options are given', async () => {
      redisMock.get.mockResolvedValueOnce(null)
      existsSyncMock.mockReturnValueOnce(true)
      readFileSyncMock
        .mockReturnValueOnce(JSON.stringify({}))
        .mockImplementationOnce(() => {
          throw new Error('default read error')
        })
      vi.spyOn(console, 'error').mockImplementation(() => {})

      await expect(getTranslate('missing', 'fr')).resolves.toBe('missing')
    })
  })
})
