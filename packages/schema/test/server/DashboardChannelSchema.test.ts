import { describe, expect, it } from 'vitest'
import {
  DashboardChannelConfigurationSchema,
  DashboardChatConfigurationSchema,
} from '../../src/server/DashboardChannelSchema.js'

describe('browser channel configuration projections', () => {
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
