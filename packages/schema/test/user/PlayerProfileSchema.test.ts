import { describe, expect, it } from 'vitest'
import { PlayerProfileQuerySchema, PlayerSteamID64Schema } from '../../src/user/PlayerProfileSchema.js'

describe('player profile input', () => {
  it('accepts stored 17 digit Steam IDs without coercing identifiers', () => {
    expect(PlayerSteamID64Schema.safeParse('76561198000000001').success).toBe(true)
    expect(PlayerSteamID64Schema.safeParse('12345678901234567').success).toBe(true)
    for (const value of ['123', '1234567890123456x', ['76561198000000001'], Number('76561198000000001')])
      expect(PlayerSteamID64Schema.safeParse(value).success).toBe(false)
  })

  it('defaults and coerces primitive pagination values while rejecting ambiguous or unbounded queries', () => {
    expect(PlayerProfileQuerySchema.parse({})).toEqual({ limit: 10, offset: 0 })
    expect(PlayerProfileQuerySchema.parse({ limit: '50', offset: '100' })).toEqual({ limit: 50, offset: 100 })
    for (const value of [
      { limit: 11 },
      { limit: 0 },
      { limit: ['10'] },
      { offset: true },
      { offset: 0.5 },
      { offset: -1 },
      { offset: '1e3' },
      { offset: 1_000_001 },
      { private: true },
    ])
      expect(PlayerProfileQuerySchema.safeParse(value).success).toBe(false)
  })
})
