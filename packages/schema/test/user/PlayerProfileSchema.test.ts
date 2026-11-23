import { describe, expect, it } from 'vitest'
import {
  PlayerIdentifierSchema,
  PlayerProfileBanSchema,
  PlayerProfileQuerySchema,
  PlayerProfileWarningSchema,
  PlayerSteamID64Schema,
} from '../../src/user/PlayerProfileSchema.js'

describe('player profile input', () => {
  it('accepts stored 17 digit Steam IDs without coercing identifiers', () => {
    expect(PlayerSteamID64Schema.safeParse('76561198000000001').success).toBe(true)
    expect(PlayerSteamID64Schema.safeParse('12345678901234567').success).toBe(true)
    for (const value of ['123', '1234567890123456x', ['76561198000000001'], Number('76561198000000001')])
      expect(PlayerSteamID64Schema.safeParse(value).success).toBe(false)
  })

  it('defaults and coerces primitive pagination values while rejecting ambiguous or unbounded queries', () => {
    expect(PlayerProfileQuerySchema.parse({})).toEqual({ limit: 10, offset: 0, warningOffset: 0, banOffset: 0 })
    expect(
      PlayerProfileQuerySchema.parse({ limit: '50', offset: '100', warningOffset: '50', banOffset: '150' }),
    ).toEqual({
      limit: 50,
      offset: 100,
      warningOffset: 50,
      banOffset: 150,
    })
    for (const value of [
      { limit: 11 },
      { limit: 0 },
      { limit: ['10'] },
      { offset: true },
      { offset: 0.5 },
      { offset: -1 },
      { offset: '1e3' },
      { offset: 1_000_001 },
      { warningOffset: -1 },
      { warningOffset: 1_000_001 },
      { banOffset: ['10'] },
      { banOffset: true },
      { private: true },
    ])
      expect(PlayerProfileQuerySchema.safeParse(value).success).toBe(false)
  })

  it('accepts either provider identity as a string without lossy numeric coercion', () => {
    for (const identifier of ['76561198000000001', '333650866747867137', '12345678901234567890'])
      expect(PlayerIdentifierSchema.safeParse(identifier).success).toBe(true)
    for (const identifier of ['123', '123456789012345678901', 'a333650866747867137', 333650866747867137n])
      expect(PlayerIdentifierSchema.safeParse(identifier).success).toBe(false)
  })

  it('bounds moderation records and rejects leaking internal moderator fields', () => {
    const warning = {
      id: 1,
      serverID: 'server',
      serverName: 'Community server',
      reason: 'Spam',
      createdAt: '2026-11-23T12:00:00.000Z',
    }
    expect(PlayerProfileWarningSchema.safeParse(warning).success).toBe(true)
    expect(PlayerProfileWarningSchema.safeParse({ ...warning, adminSteamID64: 'private' }).success).toBe(false)
    const ban = { ...warning, durationMinutes: 0, expiresAt: null, active: true }
    expect(PlayerProfileBanSchema.safeParse(ban).success).toBe(true)
    expect(PlayerProfileBanSchema.safeParse({ ...ban, durationMinutes: -1 }).success).toBe(false)
    expect(PlayerProfileBanSchema.safeParse({ ...ban, expiresAt: 'yesterday' }).success).toBe(false)
  })
})
