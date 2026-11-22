import type * as NodeFS from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const readAllowlist = vi.hoisted(() => vi.fn())
vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof NodeFS>()),
  readFileSync: readAllowlist,
}))

beforeEach(() => {
  vi.resetModules()
  readAllowlist.mockReset()
})

describe('developer allowlist startup validation', () => {
  it.each([
    null,
    {},
    '333650866747867137',
    [333],
    ['developer'],
    ['333650866747867137 '],
    ['1'.repeat(16)],
    ['1'.repeat(21)],
  ])('refuses an invalid allowlist before exposing privileges: %j', async (value) => {
    readAllowlist.mockReturnValueOnce(JSON.stringify(value))
    await expect(import('../src/developers.js')).rejects.toThrow('Invalid root developer allowlist')
  })

  it('does not fall back to another privilege source when the file is unreadable or invalid JSON', async () => {
    readAllowlist.mockImplementationOnce(() => {
      throw new Error('Allowlist unreadable')
    })
    await expect(import('../src/developers.js')).rejects.toThrow('Allowlist unreadable')
    vi.resetModules()
    readAllowlist.mockReturnValueOnce('invalid JSON')
    await expect(import('../src/developers.js')).rejects.toBeInstanceOf(SyntaxError)
  })

  it('deduplicates valid exact identities and keeps the resulting authority immutable', async () => {
    readAllowlist.mockReturnValueOnce(JSON.stringify(['333650866747867137', '333650866747867137']))
    const developers = await import('../src/developers.js')
    expect(developers.developerDiscordIDs).toEqual(['333650866747867137'])
    expect(Object.isFrozen(developers.developerDiscordIDs)).toBe(true)
    expect(developers.isDeveloper('333650866747867137')).toBe(true)
    expect(developers.isDeveloper('333650866747867138')).toBe(false)
  })
})
