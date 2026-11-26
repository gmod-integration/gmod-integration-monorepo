import { describe, expect, it } from 'vitest'
import {
  AdminGuildListQuerySchema,
  AdminServerListQuerySchema,
  AdminUserListQuerySchema,
  AdminServerUpdateSchema,
  AdminServerCommandSchema,
  AdminPremiumUpdateSchema,
  AdminPartnerUpdateSchema,
  AdminPartnerMutationResultSchema,
  AdminGuildRowSchema,
  AdminOverviewSchema,
  AdminRevokeSessionsSchema,
} from '../../src/admin/AdminDashboardSchema.js'

describe('administration request contracts', () => {
  it('parses bounded flat pagination and normalizes search text', () => {
    expect(AdminGuildListQuerySchema.parse({ offset: '25', limit: '50', search: ' example ' })).toEqual({
      offset: 25,
      limit: 50,
      search: 'example',
      sort: 'createdAt',
      orderBy: 'DESC',
      premium: 'all',
    })
  })
  it.each([
    { limit: '1000' },
    { offset: '-1' },
    { sort: 'token' },
    { search: 'x'.repeat(101) },
    { unexpected: true },
    { limit: ['25'] },
    { offset: false },
    { offset: '' },
  ])('rejects ambiguous or unbounded list input %j', (query) => {
    expect(AdminGuildListQuerySchema.safeParse(query).success).toBe(false)
  })
  it('restricts filters and sorts to the requested resource', () => {
    expect(AdminGuildListQuerySchema.parse({ premium: 'discord' }).premium).toBe('discord')
    expect(AdminServerListQuerySchema.safeParse({ rank: 'developer' }).success).toBe(false)
    expect(AdminUserListQuerySchema.safeParse({ sort: 'lastSeenAt' }).success).toBe(false)
    expect(AdminUserListQuerySchema.safeParse({ sort: 'rank' }).success).toBe(false)
    expect(AdminUserListQuerySchema.safeParse({ rank: 'owner' }).success).toBe(false)
    expect(
      AdminServerListQuerySchema.parse({ guildID: 'guild-1', verified: 'verified', visibility: 'public' }),
    ).toMatchObject({ guildID: 'guild-1', verified: 'verified', visibility: 'public' })
  })
  it('requires a meaningful reason and an actual editable server value', () => {
    expect(AdminServerUpdateSchema.safeParse({ reason: 'Support request' }).success).toBe(false)
    expect(AdminServerUpdateSchema.safeParse({ name: ' ', reason: 'Support request' }).success).toBe(false)
    expect(AdminServerUpdateSchema.safeParse({ token: 'secret', reason: 'Support request' }).success).toBe(false)
    expect(AdminServerUpdateSchema.parse({ name: ' New name ', verified: true, reason: ' Support request ' })).toEqual({
      name: 'New name',
      verified: true,
      reason: 'Support request',
    })
  })
  it('uses explicit typed confirmation and refuses extra mutation keys', () => {
    for (const schema of [AdminServerCommandSchema, AdminRevokeSessionsSchema]) {
      expect(schema.safeParse({ confirm: 'server-1', reason: 'Support request' }).success).toBe(true)
      expect(schema.safeParse({ reason: 'Support request' }).success).toBe(false)
      expect(schema.safeParse({ confirm: 'server-1', reason: 'test' }).success).toBe(false)
    }
    expect(
      AdminPremiumUpdateSchema.safeParse({ enabled: true, transaction: 'invented', reason: 'Support request' }).success,
    ).toBe(false)
  })

  it('requires an explicit partner decision and reason without accepting grant fields', () => {
    expect(AdminPartnerUpdateSchema.parse({ enabled: true, reason: ' Partnership approved ' })).toEqual({
      enabled: true,
      reason: 'Partnership approved',
    })
    for (const input of [
      { enabled: 'true', reason: 'Partnership approved' },
      { enabled: true },
      { enabled: true, reason: 'short'.slice(0, 4) },
      { enabled: true, reason: 'x'.repeat(501) },
      { enabled: true, reason: 'Partnership approved', manualPremium: true },
    ])
      expect(AdminPartnerUpdateSchema.safeParse(input).success).toBe(false)
    expect(AdminPartnerMutationResultSchema.parse({ guildID: 'g1', partner: false })).toEqual({
      guildID: 'g1',
      partner: false,
    })
    expect(AdminPartnerMutationResultSchema.safeParse({ guildID: 'g1', partner: true, access: {} }).success).toBe(false)
  })

  it('defaults older guild responses to no partner badge', () => {
    const guild = {
      id: 'g1',
      name: 'Guild',
      language: 'en',
      members: 1,
      serverCount: 1,
      manualPremium: false,
      gmodstore: false,
      createdAt: '2026-11-23T00:00:00.000Z',
      updatedAt: '2026-11-23T00:00:00.000Z',
    }
    expect(AdminGuildRowSchema.parse(guild).partner).toBe(false)
    expect(AdminGuildRowSchema.parse(guild).discordPremium).toBeNull()
    expect(AdminGuildRowSchema.parse({ ...guild, partner: true }).partner).toBe(true)
    for (const discordPremium of [true, false, null])
      expect(AdminGuildRowSchema.parse({ ...guild, discordPremium }).discordPremium).toBe(discordPremium)
  })
  it('keeps unavailable or older Discord overview counts unknown and validates known counts', () => {
    const overview = {
      totals: {
        guilds: 1,
        servers: 1,
        discordUsers: 1,
        linkedUsers: 1,
        steamProfiles: 1,
        discordMemberships: 1,
        activeSessions: 1,
        manualPremium: 1,
        gmodstorePremium: 1,
      },
      recent: { days: 7, guilds: 1, servers: 1, users: 1 },
      languages: [],
      generatedAt: '2026-11-23T00:00:00.000Z',
    }
    expect(AdminOverviewSchema.parse(overview).totals.discordPremium).toBeNull()
    for (const discordPremium of [0, 3, null])
      expect(
        AdminOverviewSchema.parse({ ...overview, totals: { ...overview.totals, discordPremium } }).totals
          .discordPremium,
      ).toBe(discordPremium)
    for (const discordPremium of [-1, 0.5, '3'])
      expect(
        AdminOverviewSchema.safeParse({ ...overview, totals: { ...overview.totals, discordPremium } }).success,
      ).toBe(false)
  })
})
