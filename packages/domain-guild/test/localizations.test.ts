import { beforeEach, describe, expect, it, vi } from 'vitest'

const existsSyncMock = vi.fn()
const readFileSyncMock = vi.fn()
vi.mock('node:fs', () => ({
  existsSync: existsSyncMock,
  readFileSync: readFileSyncMock,
}))

const { getTranslate } = await import('../src/localizations.js')

describe('getTranslate', () => {
  beforeEach(() => {
    existsSyncMock.mockReset()
    readFileSyncMock.mockReset()
  })

  it('returns the translated string for the requested language when the key exists', () => {
    existsSyncMock.mockReturnValueOnce(true)
    readFileSyncMock.mockReturnValueOnce(JSON.stringify({ hello: 'Bonjour' }))

    return expect(getTranslate('hello', 'fr')).resolves.toBe('Bonjour')
  })

  it('defaults to "en" when no language is given', async () => {
    readFileSyncMock.mockReturnValueOnce(JSON.stringify({ hello: 'Hello' }))

    await expect(getTranslate('hello')).resolves.toBe('Hello')
    expect(readFileSyncMock).toHaveBeenCalledWith(expect.stringContaining('en.json'), 'utf8')
  })

  it('only uses the first two characters of the language code', async () => {
    existsSyncMock.mockReturnValueOnce(true)
    readFileSyncMock.mockReturnValueOnce(JSON.stringify({ hello: 'Hallo' }))

    await expect(getTranslate('hello', 'de-DE')).resolves.toBe('Hallo')
    expect(readFileSyncMock).toHaveBeenCalledWith(expect.stringContaining('de.json'), 'utf8')
  })

  it('falls back to en.json when the language file does not exist', async () => {
    existsSyncMock.mockReturnValueOnce(false)
    readFileSyncMock.mockReturnValueOnce(JSON.stringify({ hello: 'Hello' }))

    await expect(getTranslate('hello', 'zz')).resolves.toBe('Hello')
    expect(readFileSyncMock).toHaveBeenCalledWith(expect.stringContaining('en.json'), 'utf8')
  })

  it('substitutes {1}, {2}, ... placeholders from options', async () => {
    existsSyncMock.mockReturnValueOnce(true)
    readFileSyncMock.mockReturnValueOnce(JSON.stringify({ greet: 'Hello {1}, you have {2} messages' }))

    await expect(getTranslate('greet', 'en', ['Bob', '3'])).resolves.toBe('Hello Bob, you have 3 messages')
  })

  it('falls back to the default (en) translation when the key is missing from the requested language', async () => {
    existsSyncMock.mockReturnValueOnce(true)
    readFileSyncMock.mockReturnValueOnce(JSON.stringify({ other_key: 'x' }))
    readFileSyncMock.mockReturnValueOnce(JSON.stringify({ hello: 'Hello (default)' }))

    await expect(getTranslate('hello', 'fr')).resolves.toBe('Hello (default)')
  })

  it('falls back to "key - options" when the key is missing everywhere', async () => {
    existsSyncMock.mockReturnValueOnce(true)
    readFileSyncMock.mockReturnValueOnce(JSON.stringify({}))
    readFileSyncMock.mockReturnValueOnce(JSON.stringify({}))

    await expect(getTranslate('missing_key', 'fr', ['a', 'b'])).resolves.toBe('missing_key - a, b')
  })

  it('falls back to the bare key when missing everywhere and no options are given', async () => {
    existsSyncMock.mockReturnValueOnce(true)
    readFileSyncMock.mockReturnValueOnce(JSON.stringify({}))
    readFileSyncMock.mockReturnValueOnce(JSON.stringify({}))

    await expect(getTranslate('missing_key', 'fr')).resolves.toBe('missing_key')
  })

  it('falls back to the default translation when reading the requested language file throws', async () => {
    existsSyncMock.mockReturnValueOnce(true)
    readFileSyncMock.mockImplementationOnce(() => {
      throw new Error('read error')
    })
    readFileSyncMock.mockReturnValueOnce(JSON.stringify({ hello: 'Hello (default)' }))

    await expect(getTranslate('hello', 'fr')).resolves.toBe('Hello (default)')
  })

  it('falls back to "key" when both the requested and default translation reads throw', async () => {
    existsSyncMock.mockReturnValueOnce(true)
    readFileSyncMock.mockImplementationOnce(() => {
      throw new Error('read error')
    })
    readFileSyncMock.mockImplementationOnce(() => {
      throw new Error('read error again')
    })

    await expect(getTranslate('hello', 'fr')).resolves.toBe('hello')
  })

  it('falls back to "key - options" when both reads throw and options are given', async () => {
    existsSyncMock.mockReturnValueOnce(true)
    readFileSyncMock.mockImplementationOnce(() => {
      throw new Error('read error')
    })
    readFileSyncMock.mockImplementationOnce(() => {
      throw new Error('read error again')
    })

    await expect(getTranslate('hello', 'fr', ['a'])).resolves.toBe('hello - a')
  })
})
