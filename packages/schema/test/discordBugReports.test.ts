import { describe, expect, it } from 'vitest'
import { DiscordServerBugReportJobSchema } from '../src/bullmq.js'

describe('bug report Discord job', () => {
  it('accepts only a bounded server identity and persisted positive report ID', () => {
    expect(DiscordServerBugReportJobSchema.parse({ serverID: 'server', reportID: 42 })).toEqual({
      serverID: 'server',
      reportID: 42,
    })
    for (const reportID of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '42', null])
      expect(DiscordServerBugReportJobSchema.safeParse({ serverID: 'server', reportID }).success).toBe(false)
    for (const serverID of ['', 'x'.repeat(256), null])
      expect(DiscordServerBugReportJobSchema.safeParse({ serverID, reportID: 42 }).success).toBe(false)
    for (const extra of [
      { description: 'private' },
      { screenshot: 'private.png' },
      { channelID: 'foreign' },
      { guildID: 'foreign' },
    ])
      expect(DiscordServerBugReportJobSchema.safeParse({ serverID: 'server', reportID: 42, ...extra }).success).toBe(
        false,
      )
  })
})
