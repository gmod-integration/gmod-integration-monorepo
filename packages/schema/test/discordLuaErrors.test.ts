import { describe, expect, it } from 'vitest'
import {
  DiscordServerErrorsChannelValidateJobSchema,
  DiscordServerErrorsChannelValidateReplySchema,
  DiscordServerLuaErrorJobSchema,
} from '../src/bullmq.js'

const validation = { serverID: 'server', channelID: '111111111111111111', correlationId: 'reply' }
const notification = {
  serverID: 'server',
  errorID: '0123456789abcdef01234567',
  report: { error: 'boom', stack: 'line1', realm: 'server', count: 1, uptime: 12 },
}
describe('Lua error Discord contracts', () => {
  it('accepts scoped channel validation and bounded saved report jobs', () => {
    expect(DiscordServerErrorsChannelValidateJobSchema.parse(validation)).toEqual(validation)
    expect(DiscordServerErrorsChannelValidateReplySchema.parse({ correlationId: 'reply', valid: true })).toEqual({
      correlationId: 'reply',
      valid: true,
    })
    expect(
      DiscordServerErrorsChannelValidateReplySchema.safeParse({
        correlationId: 'reply',
        valid: false,
        reason: 'provider_unavailable',
      }).success,
    ).toBe(true)
    expect(DiscordServerLuaErrorJobSchema.parse(notification)).toEqual(notification)
    expect(
      DiscordServerLuaErrorJobSchema.safeParse({
        ...notification,
        report: {
          ...notification.report,
          realm: 'client',
          steamID64: '76561198000000001',
          workshopID: '123',
          name: 'Addon',
        },
      }).success,
    ).toBe(true)
    expect(
      DiscordServerLuaErrorJobSchema.safeParse({
        ...notification,
        report: { ...notification.report, steamID64: '', workshopID: '' },
      }).success,
    ).toBe(true)
  })
  it('rejects malformed and caller-provided destinations or grants', () => {
    for (const change of [{ channelID: '' }, { channelID: '1'.repeat(21) }, { channelID: 123 }, { guildID: 'foreign' }])
      expect(DiscordServerErrorsChannelValidateJobSchema.safeParse({ ...validation, ...change }).success).toBe(false)
    expect(
      DiscordServerErrorsChannelValidateReplySchema.safeParse({
        correlationId: 'reply',
        valid: false,
        reason: 'private provider message',
      }).success,
    ).toBe(false)
    for (const change of [
      { errorID: '' },
      { errorID: '1'.repeat(25) },
      { channelID: validation.channelID },
      { webhookToken: 'secret' },
    ])
      expect(DiscordServerLuaErrorJobSchema.safeParse({ ...notification, ...change }).success).toBe(false)
    for (const change of [
      { realm: 'menu' },
      { count: 0 },
      { uptime: Infinity },
      { error: 'x'.repeat(2049) },
      { stack: 'x'.repeat(8193) },
      { name: 'x'.repeat(129) },
      { steamID64: 'bad' },
      { workshopID: 'bad' },
      { channelID: validation.channelID },
    ])
      expect(
        DiscordServerLuaErrorJobSchema.safeParse({ ...notification, report: { ...notification.report, ...change } })
          .success,
      ).toBe(false)
  })
})
