import { describe, expect, it } from 'vitest'
import {
  DashboardLinkSchema,
  DashboardRoleSchema,
  DashboardTeamSchema,
  DashboardPseudoSchema,
  DashboardChatFilterSchema,
  DashboardVerificationRoleSchema,
} from '../../src/server/DashboardEntitiesSchema.js'

describe('dashboard entity commands', () => {
  it('normalizes names and accepts only HTTP link destinations without scope overrides', () => {
    expect(DashboardLinkSchema.parse({ alias: ' Help ', url: 'https://example.com/help', active: false })).toEqual({
      alias: 'Help',
      url: 'https://example.com/help',
      active: false,
    })
    for (const url of ['not a URL', 'javascript:alert(1)', 'file:///tmp/example'])
      expect(DashboardLinkSchema.safeParse({ alias: 'Help', url, active: true }).success).toBe(false)
    expect(
      DashboardLinkSchema.safeParse({ alias: 'Help', url: 'http://example.com', active: true, guildID: 'other' })
        .success,
    ).toBe(false)
  })

  it('keeps entity-specific fields and explicit enabled states strict', () => {
    expect(DashboardRoleSchema.parse({ userGroup: ' vip ', enable: false })).toEqual({
      userGroup: 'vip',
      enable: false,
    })
    expect(DashboardTeamSchema.parse({ teamName: ' Police ', enable: true })).toEqual({
      teamName: 'Police',
      enable: true,
    })
    expect(DashboardPseudoSchema.safeParse({ role: 'vip', name: '', prefix: '', enabled: false }).success).toBe(true)
    expect(DashboardVerificationRoleSchema.safeParse({ isGiveRole: false, enabled: false }).success).toBe(true)
    expect(DashboardRoleSchema.safeParse({ userGroup: '', enable: true }).success).toBe(false)
    expect(DashboardTeamSchema.safeParse({ teamName: 'Police', enable: true, roleID: 'other' }).success).toBe(false)
  })

  it('requires a meaningful bounded chat trigger and known comparison/action values', () => {
    const filter = { element: 'message', operator: 'contain', trigger: 'spam', action: 'block', active: true }
    expect(DashboardChatFilterSchema.safeParse(filter).success).toBe(true)
    for (const changes of [
      { trigger: '   ' },
      { trigger: 'x'.repeat(256) },
      { operator: 'evaluate' },
      { action: 'execute' },
    ])
      expect(DashboardChatFilterSchema.safeParse({ ...filter, ...changes }).success).toBe(false)
  })
})
