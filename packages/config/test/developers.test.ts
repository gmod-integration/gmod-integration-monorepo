import { describe, expect, it } from 'vitest'
import { developerDiscordIDs, getPlatformRank, isDeveloper } from '../src/developers.js'

describe('root developer authority', () => {
  it('contains only the project owner and is immutable', () => {
    expect(developerDiscordIDs).toEqual(['333650866747867137'])
    expect(Object.isFrozen(developerDiscordIDs)).toBe(true)
    expect(isDeveloper('333650866747867137')).toBe(true)
    expect(getPlatformRank('333650866747867137')).toBe('developer')
  })
  it.each([
    'developer',
    '333650866747867137 ',
    ' 333650866747867137',
    '333650866747867138',
    333650866747867137n,
    null,
    undefined,
  ])('never grants authority to another identity or a normalized alias: %s', (value) => {
    expect(isDeveloper(value)).toBe(false)
    expect(getPlatformRank(value)).toBe('user')
  })
})
