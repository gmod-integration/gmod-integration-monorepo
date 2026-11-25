import { describe, expect, it } from 'vitest'
import { DashboardAccessDenialReasonSchema, DashboardAccessDenialSchema } from '../../src/user/DashboardAccessSchema.js'

describe('dashboard access denial contract', () => {
  it.each(['discord_admin_required', 'steam_link_required', 'game_admin_required', 'scope_unavailable'])(
    'accepts the safe reason %s without adding any account or server data',
    (reason) => {
      expect(DashboardAccessDenialReasonSchema.parse(reason)).toBe(reason)
      expect(DashboardAccessDenialSchema.parse({ allowed: false, reason })).toEqual({ allowed: false, reason })
    },
  )

  it.each([
    null,
    {},
    { reason: 'game_admin_required' },
    { allowed: true, reason: 'game_admin_required' },
    { allowed: false },
    { allowed: false, reason: 'unknown' },
    { allowed: false, reason: ['game_admin_required'] },
    { allowed: 'false', reason: 'game_admin_required' },
  ])('rejects incomplete, ambiguous or non-denial payloads: %j', (value) => {
    expect(DashboardAccessDenialSchema.safeParse(value).success).toBe(false)
  })

  it.each(['rank', 'adminRank', 'steamID64', 'discordID', 'serverID', 'guildID', 'message'])(
    'rejects extra information in the diagnostic: %s',
    (key) => {
      expect(
        DashboardAccessDenialSchema.safeParse({ allowed: false, reason: 'game_admin_required', [key]: 'private' })
          .success,
      ).toBe(false)
    },
  )
})
