import { describe, expect, it } from 'vitest'
import { DiscordGuildMemberRoleJobSchema, DiscordGuildMemberRoleReplySchema } from '../src/bullmq.js'
describe('Discord member role lookup contract', () => {
  const job = {
    guildID: '111111111111111111',
    discordID: '222222222222222222',
    roleID: '333333333333333333',
    correlationId: 'reply',
  }
  it('accepts only exact scoped Discord IDs and no client-provided grant', () => {
    expect(DiscordGuildMemberRoleJobSchema.safeParse(job).success).toBe(true)
    for (const change of [
      { guildID: '' },
      { discordID: 'person' },
      { roleID: '123' },
      { roleID: '1'.repeat(21) },
      { hasRole: true },
    ])
      expect(DiscordGuildMemberRoleJobSchema.safeParse({ ...job, ...change }).success).toBe(false)
  })
  it('distinguishes unavailability and known negatives while forbidding impossible grants', () => {
    for (const value of [
      { available: false, hasRole: false, roleExists: false },
      { available: true, hasRole: false, roleExists: false },
      { available: true, hasRole: false, roleExists: true },
      { available: true, hasRole: true, roleExists: true },
    ])
      expect(DiscordGuildMemberRoleReplySchema.safeParse({ correlationId: 'reply', ...value }).success).toBe(true)
    for (const value of [
      { available: false, hasRole: true, roleExists: true },
      { available: false, hasRole: false, roleExists: true },
      { available: true, hasRole: true, roleExists: false },
    ])
      expect(DiscordGuildMemberRoleReplySchema.safeParse({ correlationId: 'reply', ...value }).success).toBe(false)
  })
})
