import { describe, expect, it } from 'vitest'
import {
  DashboardChannelConfigurationSchema,
  DashboardChatConfigurationSchema,
  LuaErrorChannelRequestSchema,
} from '../../src/server/DashboardChannelSchema.js'

describe('browser channel configuration projections', () => {
  it('requires an exact Discord destination identifier and rejects target overrides', () => {
    const channelID = '333333333333333333'
    expect(LuaErrorChannelRequestSchema.parse({ channelID })).toEqual({ channelID })
    for (const value of ['', '1', '1'.repeat(21), 123, null])
      expect(LuaErrorChannelRequestSchema.safeParse({ channelID: value }).success).toBe(false)
    expect(LuaErrorChannelRequestSchema.safeParse({ channelID, serverID: 'foreign' }).success).toBe(false)
  })
  it('keeps only channel display settings, including for old records carrying unexpected credentials', () => {
    const raw = {
      channelID: 'channel-1',
      adminCmd: false,
      token: 'private',
      webhookToken: 'private',
      webhookID: 'internal',
      nested: { token: 'private' },
    }
    expect(DashboardChannelConfigurationSchema.parse(raw)).toEqual({ channelID: 'channel-1', adminCmd: false })
    expect(DashboardChatConfigurationSchema.parse({ ...raw, channel: 'chat-1', guild: 'g1', id: 'internal' })).toEqual({
      channel: 'chat-1',
    })
  })
  it('accepts an absent configuration and rejects an invalid destination type', () => {
    for (const schema of [DashboardChannelConfigurationSchema, DashboardChatConfigurationSchema])
      expect(schema.parse({})).toEqual({})
    expect(DashboardChannelConfigurationSchema.safeParse({ channelID: { token: 'private' } }).success).toBe(false)
    expect(DashboardChatConfigurationSchema.safeParse({ channel: ['channel-1'] }).success).toBe(false)
  })
})
