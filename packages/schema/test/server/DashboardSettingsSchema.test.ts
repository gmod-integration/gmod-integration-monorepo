import { describe, expect, it } from 'vitest'
import {
  ServerDashboardSettingsSchema,
  GuildDashboardSettingsSchema,
  ServerDashboardSettingsRequestSchema,
  GuildDashboardSettingsRequestSchema,
} from '../../src/server/DashboardSettingsSchema.js'

describe('dashboard settings storage contracts', () => {
  it('accepts a Discord whitelist role or removal, while preserving the existing mode key', () => {
    for (const value of ['', '333333333333333333'])
      expect(ServerDashboardSettingsSchema.parse({ maintenance_whitelist_role: value, ig_maintenance: true })).toEqual({
        maintenance_whitelist_role: value,
        ig_maintenance: true,
      })
    for (const value of [null, true, 333, 'role', '1'.repeat(21)])
      expect(ServerDashboardSettingsSchema.safeParse({ maintenance_whitelist_role: value }).success).toBe(false)
  })
  it('requires a nonempty explicit patch and rejects unknown settings or wrapper fields', () => {
    expect(ServerDashboardSettingsSchema.safeParse({}).success).toBe(false)
    expect(GuildDashboardSettingsSchema.safeParse({}).success).toBe(false)
    expect(ServerDashboardSettingsRequestSchema.parse({ settings: { ig_maintenance: false } })).toEqual({
      settings: { ig_maintenance: false },
    })
    expect(GuildDashboardSettingsRequestSchema.parse({ settings: { verification_dont_mp: false } })).toEqual({
      settings: { verification_dont_mp: false },
    })
    expect(ServerDashboardSettingsRequestSchema.safeParse({ settings: { token: 'secret' } }).success).toBe(false)
    expect(
      GuildDashboardSettingsRequestSchema.safeParse({ settings: { verification_dont_mp: true }, guildID: 'other' })
        .success,
    ).toBe(false)
  })

  it('requires at least one enabled administrator rank and respects the serialized database limit', () => {
    expect(ServerDashboardSettingsSchema.safeParse({ ig_adminRank: {} }).success).toBe(false)
    expect(ServerDashboardSettingsSchema.safeParse({ ig_adminRank: { admin: false } }).success).toBe(false)
    const ranks = { ['a'.repeat(64)]: true, ['b'.repeat(64)]: true, ['c'.repeat(64)]: true, ['d'.repeat(30)]: true }
    expect(JSON.stringify(ranks)).toHaveLength(255)
    expect(ServerDashboardSettingsSchema.safeParse({ ig_adminRank: ranks }).success).toBe(true)
    const oversized = { ['a'.repeat(64)]: true, ['b'.repeat(64)]: true, ['c'.repeat(64)]: true, ['d'.repeat(31)]: true }
    expect(JSON.stringify(oversized)).toHaveLength(256)
    expect(ServerDashboardSettingsSchema.safeParse({ ig_adminRank: oversized }).success).toBe(false)
  })
})

describe('dashboard support URL validation', () => {
  it.each(['', 'https://support.example/help', 'http://localhost/help'])(
    'accepts an optional HTTP support destination: %s',
    (ig_supportLink) => {
      expect(ServerDashboardSettingsSchema.safeParse({ ig_supportLink }).success).toBe(true)
    },
  )
  it.each(['not a URL', 'https://', 'javascript:alert(1)'])(
    'rejects an invalid support destination: %s',
    (ig_supportLink) => {
      expect(ServerDashboardSettingsSchema.safeParse({ ig_supportLink }).success).toBe(false)
    },
  )
})
