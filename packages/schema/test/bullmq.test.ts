import { describe, expect, it } from 'vitest'
import type { ZodType } from 'zod'
import * as bullmq from '../src/bullmq.js'

interface Case {
  name: string
  schema: ZodType
  valid: Record<string, unknown>
  requiredKeys: string[]
}

// Every job/reply/record schema in packages/schema/src/bullmq.ts, table-driven: each entry is
// checked to (a) accept its valid sample and (b) reject the sample with any one required key
// removed. See docs/reports/ (test coverage plan, Phase 1) for why a table beats 69 near-identical
// hand-written blocks here.
const cases: Case[] = [
  {
    name: 'UpdateGuildUserPseudoJobSchema',
    schema: bullmq.UpdateGuildUserPseudoJobSchema,
    valid: { serverID: 's1', steamID64: '76561198219049673', playerName: 'Bob', userGroup: 'user' },
    requiredKeys: ['serverID', 'steamID64', 'playerName', 'userGroup'],
  },
  {
    name: 'UpdatePlayerUserGroupJobSchema',
    schema: bullmq.UpdatePlayerUserGroupJobSchema,
    valid: { serverID: 's1', steamID64: '76561198219049673', userGroup: 'user' },
    requiredKeys: ['serverID', 'steamID64', 'userGroup'],
  },
  {
    name: 'UpdateDiscordTeamRoleJobSchema',
    schema: bullmq.UpdateDiscordTeamRoleJobSchema,
    valid: { serverID: 's1', steamID64: '76561198219049673' },
    requiredKeys: ['serverID', 'steamID64'],
  },
  {
    name: 'DiscordJobResultSchema',
    schema: bullmq.DiscordJobResultSchema,
    valid: { correlationId: 'c1', success: true },
    requiredKeys: ['correlationId', 'success'],
  },
  {
    name: 'MainClientHasGuildJobSchema',
    schema: bullmq.MainClientHasGuildJobSchema,
    valid: { guildID: 'g1', correlationId: 'c1' },
    requiredKeys: ['guildID', 'correlationId'],
  },
  {
    name: 'MainClientHasGuildReplySchema',
    schema: bullmq.MainClientHasGuildReplySchema,
    valid: { correlationId: 'c1', hasGuild: true },
    requiredKeys: ['correlationId', 'hasGuild'],
  },
  {
    name: 'MainClientUploadScreenshotJobSchema',
    schema: bullmq.MainClientUploadScreenshotJobSchema,
    valid: {
      channelID: 'ch1',
      content: 'hello',
      minioKey: 'key1',
      fileName: 'f.png',
      contentType: 'image/png',
      correlationId: 'c1',
    },
    requiredKeys: ['channelID', 'content', 'minioKey', 'fileName', 'contentType', 'correlationId'],
  },
  {
    name: 'MainClientUploadScreenshotReplySchema',
    schema: bullmq.MainClientUploadScreenshotReplySchema,
    valid: { correlationId: 'c1', discordUrl: 'https://cdn.discordapp.com/x.png' },
    requiredKeys: ['correlationId', 'discordUrl'],
  },
  {
    name: 'MainClientFetchUserJobSchema',
    schema: bullmq.MainClientFetchUserJobSchema,
    valid: { discordID: 'd1', correlationId: 'c1' },
    requiredKeys: ['discordID', 'correlationId'],
  },
  {
    name: 'MainClientFetchUserReplySchema',
    schema: bullmq.MainClientFetchUserReplySchema,
    valid: { correlationId: 'c1', user: null },
    requiredKeys: ['correlationId', 'user'],
  },
  {
    name: 'MainClientSyncPremiumRolesJobSchema',
    schema: bullmq.MainClientSyncPremiumRolesJobSchema,
    valid: { correlationId: 'c1' },
    requiredKeys: ['correlationId'],
  },
  {
    name: 'MainClientSyncPremiumRolesReplySchema',
    schema: bullmq.MainClientSyncPremiumRolesReplySchema,
    valid: { correlationId: 'c1', synced: true },
    requiredKeys: ['correlationId', 'synced'],
  },
  {
    name: 'MainClientSetPresenceJobSchema',
    schema: bullmq.MainClientSetPresenceJobSchema,
    valid: { activityName: 'Playing', correlationId: 'c1' },
    requiredKeys: ['activityName', 'correlationId'],
  },
  {
    name: 'MainClientSetPresenceReplySchema',
    schema: bullmq.MainClientSetPresenceReplySchema,
    valid: { correlationId: 'c1', updated: true },
    requiredKeys: ['correlationId', 'updated'],
  },
  {
    name: 'DiscordGuildChannelSummarySchema',
    schema: bullmq.DiscordGuildChannelSummarySchema,
    valid: { id: 'id1', name: 'general', type: 'text', position: 0, parentID: null, sendable: true, textBased: true },
    requiredKeys: ['id', 'name', 'type', 'position', 'parentID', 'sendable', 'textBased'],
  },
  {
    name: 'DiscordGuildRoleSummarySchema',
    schema: bullmq.DiscordGuildRoleSummarySchema,
    valid: { id: 'id1', name: 'Admin', position: 1, color: 0, colorHex: '#000000', managed: false, editable: true },
    requiredKeys: ['id', 'name', 'position', 'color', 'colorHex', 'managed', 'editable'],
  },
  {
    name: 'DiscordGuildEmojiSummarySchema',
    schema: bullmq.DiscordGuildEmojiSummarySchema,
    valid: { id: null, name: null, url: 'https://cdn.discordapp.com/e.png' },
    requiredKeys: ['id', 'name', 'url'],
  },
  {
    name: 'DiscordGuildSummarySchema',
    schema: bullmq.DiscordGuildSummarySchema,
    valid: {
      id: 'g1',
      name: 'My Guild',
      icon: null,
      ownerID: 'o1',
      preferredLocale: 'en-US',
      channels: [],
      roles: [],
      emojis: [],
    },
    requiredKeys: ['id', 'name', 'icon', 'ownerID', 'preferredLocale', 'channels', 'roles', 'emojis'],
  },
  {
    name: 'DiscordGuildSnapshotJobSchema',
    schema: bullmq.DiscordGuildSnapshotJobSchema,
    valid: { guildID: 'g1', correlationId: 'c1' },
    requiredKeys: ['guildID', 'correlationId'],
  },
  {
    name: 'DiscordGuildSnapshotReplySchema',
    schema: bullmq.DiscordGuildSnapshotReplySchema,
    valid: { correlationId: 'c1', guild: null },
    requiredKeys: ['correlationId', 'guild'],
  },
  {
    name: 'DiscordGuildVerifyUserJobSchema',
    schema: bullmq.DiscordGuildVerifyUserJobSchema,
    valid: { guildID: 'g1', userID: 'u1', correlationId: 'c1' },
    requiredKeys: ['guildID', 'userID', 'correlationId'],
  },
  {
    name: 'DiscordGuildVerifyUserReplySchema',
    schema: bullmq.DiscordGuildVerifyUserReplySchema,
    valid: { correlationId: 'c1', verified: true },
    requiredKeys: ['correlationId', 'verified'],
  },
  {
    name: 'DiscordGuildRunVerificationCheckJobSchema',
    schema: bullmq.DiscordGuildRunVerificationCheckJobSchema,
    valid: { guildID: 'g1', correlationId: 'c1' },
    requiredKeys: ['guildID', 'correlationId'],
  },
  {
    name: 'DiscordGuildRunVerificationCheckReplySchema',
    schema: bullmq.DiscordGuildRunVerificationCheckReplySchema,
    valid: { correlationId: 'c1', processed: 0 },
    requiredKeys: ['correlationId', 'processed'],
  },
  {
    name: 'DiscordCreateVerificationMessageJobSchema',
    schema: bullmq.DiscordCreateVerificationMessageJobSchema,
    valid: { guildID: 'g1', channelID: 'ch1', correlationId: 'c1' },
    requiredKeys: ['guildID', 'channelID', 'correlationId'],
  },
  {
    name: 'DiscordCreateVerificationMessageReplySchema',
    schema: bullmq.DiscordCreateVerificationMessageReplySchema,
    valid: { correlationId: 'c1', verifyMessage: null },
    requiredKeys: ['correlationId', 'verifyMessage'],
  },
  {
    name: 'DiscordDeleteVerificationMessageJobSchema',
    schema: bullmq.DiscordDeleteVerificationMessageJobSchema,
    valid: { guildID: 'g1', channelID: 'ch1', messageID: 'm1', correlationId: 'c1' },
    requiredKeys: ['guildID', 'channelID', 'messageID', 'correlationId'],
  },
  {
    name: 'DiscordDeleteVerificationMessageReplySchema',
    schema: bullmq.DiscordDeleteVerificationMessageReplySchema,
    valid: { correlationId: 'c1', deleted: true },
    requiredKeys: ['correlationId', 'deleted'],
  },
  {
    name: 'DiscordGuildBotClientInfoJobSchema',
    schema: bullmq.DiscordGuildBotClientInfoJobSchema,
    valid: { guildID: 'g1', correlationId: 'c1' },
    requiredKeys: ['guildID', 'correlationId'],
  },
  {
    name: 'DiscordGuildBotClientInfoReplySchema',
    schema: bullmq.DiscordGuildBotClientInfoReplySchema,
    valid: { correlationId: 'c1', botInfo: null },
    requiredKeys: ['correlationId', 'botInfo'],
  },
  {
    name: 'DiscordGuildReloadBotInstanceJobSchema',
    schema: bullmq.DiscordGuildReloadBotInstanceJobSchema,
    valid: { guildID: 'g1', correlationId: 'c1' },
    requiredKeys: ['guildID', 'correlationId'],
  },
  {
    name: 'DiscordGuildReloadBotInstanceReplySchema',
    schema: bullmq.DiscordGuildReloadBotInstanceReplySchema,
    valid: { correlationId: 'c1', reloaded: true },
    requiredKeys: ['correlationId', 'reloaded'],
  },
  {
    name: 'DiscordGuildUpdateBotProfileJobSchema',
    schema: bullmq.DiscordGuildUpdateBotProfileJobSchema,
    valid: { guildID: 'g1', correlationId: 'c1' },
    requiredKeys: ['guildID', 'correlationId'],
  },
  {
    name: 'DiscordGuildUpdateBotProfileReplySchema',
    schema: bullmq.DiscordGuildUpdateBotProfileReplySchema,
    valid: { correlationId: 'c1', updated: true },
    requiredKeys: ['correlationId', 'updated'],
  },
  {
    name: 'DiscordGuildSyncBanJobSchema',
    schema: bullmq.DiscordGuildSyncBanJobSchema,
    valid: { guildID: 'g1', oldDiscordIDs: ['old1'], newDiscordID: 'new1', correlationId: 'c1' },
    requiredKeys: ['guildID', 'oldDiscordIDs', 'newDiscordID', 'correlationId'],
  },
  {
    name: 'DiscordGuildSyncBanReplySchema',
    schema: bullmq.DiscordGuildSyncBanReplySchema,
    valid: { correlationId: 'c1', synced: true },
    requiredKeys: ['correlationId', 'synced'],
  },
  {
    name: 'DiscordGuildAdminsJobSchema',
    schema: bullmq.DiscordGuildAdminsJobSchema,
    valid: { guildID: 'g1', correlationId: 'c1' },
    requiredKeys: ['guildID', 'correlationId'],
  },
  {
    name: 'DiscordGuildAdminsReplySchema',
    schema: bullmq.DiscordGuildAdminsReplySchema,
    valid: { correlationId: 'c1', admins: [{ id: 'a1', name: 'Admin', avatar: null }] },
    requiredKeys: ['correlationId', 'admins'],
  },
  {
    name: 'DiscordGuildBansJobSchema',
    schema: bullmq.DiscordGuildBansJobSchema,
    valid: { guildID: 'g1', correlationId: 'c1' },
    requiredKeys: ['guildID', 'correlationId'],
  },
  {
    name: 'DiscordGuildBansReplySchema',
    schema: bullmq.DiscordGuildBansReplySchema,
    valid: { correlationId: 'c1', bans: [{ id: 'u1', tag: 'User#0001', reason: 'cheating' }] },
    requiredKeys: ['correlationId', 'bans'],
  },
  {
    name: 'DiscordGuildSendLogMessageJobSchema',
    schema: bullmq.DiscordGuildSendLogMessageJobSchema,
    valid: { guildID: 'g1', channelID: 'ch1', title: 'Title', color: '#fff', footer: 'Footer', correlationId: 'c1' },
    requiredKeys: ['guildID', 'channelID', 'title', 'color', 'footer', 'correlationId'],
  },
  {
    name: 'DiscordGuildSendLogMessageReplySchema',
    schema: bullmq.DiscordGuildSendLogMessageReplySchema,
    valid: { correlationId: 'c1', sent: true },
    requiredKeys: ['correlationId', 'sent'],
  },
  {
    name: 'DiscordServerStatusRecordSchema',
    schema: bullmq.DiscordServerStatusRecordSchema,
    valid: { server: 's1', channel: 'ch1', message: 'm1' },
    requiredKeys: ['server', 'channel', 'message'],
  },
  {
    name: 'DiscordServerStatusCreateJobSchema',
    schema: bullmq.DiscordServerStatusCreateJobSchema,
    valid: { serverID: 's1', channelID: 'ch1', correlationId: 'c1' },
    requiredKeys: ['serverID', 'channelID', 'correlationId'],
  },
  {
    name: 'DiscordServerStatusCreateReplySchema',
    schema: bullmq.DiscordServerStatusCreateReplySchema,
    valid: { correlationId: 'c1', status: null },
    requiredKeys: ['correlationId', 'status'],
  },
  {
    name: 'DiscordServerStatusDeleteJobSchema',
    schema: bullmq.DiscordServerStatusDeleteJobSchema,
    valid: { serverID: 's1', correlationId: 'c1' },
    requiredKeys: ['serverID', 'correlationId'],
  },
  {
    name: 'DiscordServerStatusDeleteReplySchema',
    schema: bullmq.DiscordServerStatusDeleteReplySchema,
    valid: { correlationId: 'c1', status: null },
    requiredKeys: ['correlationId', 'status'],
  },
  {
    name: 'DiscordServerStatusRefreshJobSchema',
    schema: bullmq.DiscordServerStatusRefreshJobSchema,
    valid: { serverID: 's1', correlationId: 'c1' },
    requiredKeys: ['serverID', 'correlationId'],
  },
  {
    name: 'DiscordServerStatusRefreshReplySchema',
    schema: bullmq.DiscordServerStatusRefreshReplySchema,
    valid: { correlationId: 'c1', refreshed: true },
    requiredKeys: ['correlationId', 'refreshed'],
  },
  {
    name: 'DiscordServerLogsChannelRecordSchema',
    schema: bullmq.DiscordServerLogsChannelRecordSchema,
    valid: { serverID: 's1', channelID: 'ch1', webhookID: 'w1', webhookToken: 'wt1' },
    requiredKeys: ['serverID', 'channelID', 'webhookID', 'webhookToken'],
  },
  {
    name: 'DiscordServerLogsChannelCreateJobSchema',
    schema: bullmq.DiscordServerLogsChannelCreateJobSchema,
    valid: { serverID: 's1', channelID: 'ch1', correlationId: 'c1' },
    requiredKeys: ['serverID', 'channelID', 'correlationId'],
  },
  {
    name: 'DiscordServerLogsChannelCreateReplySchema',
    schema: bullmq.DiscordServerLogsChannelCreateReplySchema,
    valid: { correlationId: 'c1', logsChannel: null },
    requiredKeys: ['correlationId', 'logsChannel'],
  },
  {
    name: 'DiscordServerLogsChannelDeleteJobSchema',
    schema: bullmq.DiscordServerLogsChannelDeleteJobSchema,
    valid: { serverID: 's1', correlationId: 'c1' },
    requiredKeys: ['serverID', 'correlationId'],
  },
  {
    name: 'DiscordServerLogsChannelDeleteReplySchema',
    schema: bullmq.DiscordServerLogsChannelDeleteReplySchema,
    valid: { correlationId: 'c1', logsChannel: null },
    requiredKeys: ['correlationId', 'logsChannel'],
  },
  {
    name: 'DiscordServerScreenshotChannelRecordSchema',
    schema: bullmq.DiscordServerScreenshotChannelRecordSchema,
    valid: { server: 's1', adminCmd: false, channelID: 'ch1', webhook: 'wh1', token: 'tok1' },
    requiredKeys: ['server', 'adminCmd', 'channelID', 'webhook', 'token'],
  },
  {
    name: 'DiscordServerScreenshotChannelCreateJobSchema',
    schema: bullmq.DiscordServerScreenshotChannelCreateJobSchema,
    valid: { serverID: 's1', channelID: 'ch1', correlationId: 'c1' },
    requiredKeys: ['serverID', 'channelID', 'correlationId'],
  },
  {
    name: 'DiscordServerScreenshotChannelCreateReplySchema',
    schema: bullmq.DiscordServerScreenshotChannelCreateReplySchema,
    valid: { correlationId: 'c1', screenshotChannel: null },
    requiredKeys: ['correlationId', 'screenshotChannel'],
  },
  {
    name: 'DiscordServerScreenshotChannelDeleteJobSchema',
    schema: bullmq.DiscordServerScreenshotChannelDeleteJobSchema,
    valid: { serverID: 's1', correlationId: 'c1' },
    requiredKeys: ['serverID', 'correlationId'],
  },
  {
    name: 'DiscordServerScreenshotChannelDeleteReplySchema',
    schema: bullmq.DiscordServerScreenshotChannelDeleteReplySchema,
    valid: { correlationId: 'c1', screenshotChannel: null },
    requiredKeys: ['correlationId', 'screenshotChannel'],
  },
  {
    name: 'DiscordServerVoteChannelRecordSchema',
    schema: bullmq.DiscordServerVoteChannelRecordSchema,
    valid: { serverID: 's1', channelID: 'ch1', webhookID: 'w1', webhookToken: 'wt1' },
    requiredKeys: ['serverID', 'channelID', 'webhookID', 'webhookToken'],
  },
  {
    name: 'DiscordServerVoteChannelCreateJobSchema',
    schema: bullmq.DiscordServerVoteChannelCreateJobSchema,
    valid: { serverID: 's1', channelID: 'ch1', correlationId: 'c1' },
    requiredKeys: ['serverID', 'channelID', 'correlationId'],
  },
  {
    name: 'DiscordServerVoteChannelCreateReplySchema',
    schema: bullmq.DiscordServerVoteChannelCreateReplySchema,
    valid: { correlationId: 'c1', voteChannel: null },
    requiredKeys: ['correlationId', 'voteChannel'],
  },
  {
    name: 'DiscordServerVoteChannelDeleteJobSchema',
    schema: bullmq.DiscordServerVoteChannelDeleteJobSchema,
    valid: { serverID: 's1', correlationId: 'c1' },
    requiredKeys: ['serverID', 'correlationId'],
  },
  {
    name: 'DiscordServerVoteChannelDeleteReplySchema',
    schema: bullmq.DiscordServerVoteChannelDeleteReplySchema,
    valid: { correlationId: 'c1', voteChannel: null },
    requiredKeys: ['correlationId', 'voteChannel'],
  },
  {
    name: 'DiscordServerSyncChatRecordSchema',
    schema: bullmq.DiscordServerSyncChatRecordSchema,
    valid: { guild: 'g1', channel: 'ch1', server: 's1', id: 'id1', token: 'tok1' },
    requiredKeys: ['guild', 'channel', 'server', 'id', 'token'],
  },
  {
    name: 'DiscordServerSyncChatCreateJobSchema',
    schema: bullmq.DiscordServerSyncChatCreateJobSchema,
    valid: { serverID: 's1', channelID: 'ch1', correlationId: 'c1' },
    requiredKeys: ['serverID', 'channelID', 'correlationId'],
  },
  {
    name: 'DiscordServerSyncChatCreateReplySchema',
    schema: bullmq.DiscordServerSyncChatCreateReplySchema,
    valid: { correlationId: 'c1', syncChat: null },
    requiredKeys: ['correlationId', 'syncChat'],
  },
  {
    name: 'DiscordServerSyncChatDeleteJobSchema',
    schema: bullmq.DiscordServerSyncChatDeleteJobSchema,
    valid: { serverID: 's1', correlationId: 'c1' },
    requiredKeys: ['serverID', 'correlationId'],
  },
  {
    name: 'DiscordServerSyncChatDeleteReplySchema',
    schema: bullmq.DiscordServerSyncChatDeleteReplySchema,
    valid: { correlationId: 'c1', syncChat: null },
    requiredKeys: ['correlationId', 'syncChat'],
  },
  {
    name: 'DiscordGuildRemoveSyncRolesJobSchema',
    schema: bullmq.DiscordGuildRemoveSyncRolesJobSchema,
    valid: { guildID: 'g1', discordID: 'd1', candidateRoleIDs: ['r1'], correlationId: 'c1' },
    requiredKeys: ['guildID', 'discordID', 'candidateRoleIDs', 'correlationId'],
  },
  {
    name: 'DiscordGuildRemoveSyncRolesReplySchema',
    schema: bullmq.DiscordGuildRemoveSyncRolesReplySchema,
    valid: { correlationId: 'c1', processed: true },
    requiredKeys: ['correlationId', 'processed'],
  },
]

describe('bullmq job/reply/record schemas', () => {
  for (const { name, schema, valid, requiredKeys } of cases) {
    describe(name, () => {
      it('parses a valid payload', () => {
        const result = schema.safeParse(valid)
        expect(result.success).toBe(true)
      })

      it('accepts unknown extra metadata (correlationId/timestamp are always optional)', () => {
        const result = schema.safeParse({ ...valid, timestamp: new Date().toISOString() })
        expect(result.success).toBe(true)
      })

      for (const key of requiredKeys) {
        it(`rejects when required field "${key}" is missing`, () => {
          const clone: Record<string, unknown> = { ...valid }
          delete clone[key]
          const result = schema.safeParse(clone)
          expect(result.success).toBe(false)
        })
      }
    })
  }
})

describe('bullmq schemas: extra constraints beyond required-field presence', () => {
  it('DiscordGuildSyncBanJobSchema rejects an empty oldDiscordIDs array', () => {
    const result = bullmq.DiscordGuildSyncBanJobSchema.safeParse({
      guildID: 'g1',
      oldDiscordIDs: [],
      newDiscordID: 'new1',
      correlationId: 'c1',
    })
    expect(result.success).toBe(false)
  })

  it('DiscordGuildRunVerificationCheckReplySchema rejects a negative processed count', () => {
    const result = bullmq.DiscordGuildRunVerificationCheckReplySchema.safeParse({
      correlationId: 'c1',
      processed: -1,
    })
    expect(result.success).toBe(false)
  })

  it('DiscordJobResultSchema rejects a non-boolean success flag', () => {
    const result = bullmq.DiscordJobResultSchema.safeParse({ correlationId: 'c1', success: 'yes' })
    expect(result.success).toBe(false)
  })

  it('MainClientFetchUserReplySchema accepts a full user object, not just null', () => {
    const result = bullmq.MainClientFetchUserReplySchema.safeParse({
      correlationId: 'c1',
      user: { id: 'u1', username: 'bob', displayName: 'Bob', avatarURL: null },
    })
    expect(result.success).toBe(true)
  })

  it('DiscordGuildSnapshotReplySchema accepts a full guild summary, not just null', () => {
    const result = bullmq.DiscordGuildSnapshotReplySchema.safeParse({
      correlationId: 'c1',
      guild: {
        id: 'g1',
        name: 'My Guild',
        icon: null,
        ownerID: 'o1',
        preferredLocale: 'en-US',
        channels: [],
        roles: [],
        emojis: [],
      },
    })
    expect(result.success).toBe(true)
  })

  it('DiscordServerStatusCreateReplySchema accepts a full status record, not just null', () => {
    const result = bullmq.DiscordServerStatusCreateReplySchema.safeParse({
      correlationId: 'c1',
      status: { server: 's1', channel: 'ch1', message: 'm1' },
    })
    expect(result.success).toBe(true)
  })

  it('DiscordGuildUpdateBotProfileJobSchema accepts the optional username/avatar fields', () => {
    const result = bullmq.DiscordGuildUpdateBotProfileJobSchema.safeParse({
      guildID: 'g1',
      correlationId: 'c1',
      username: 'NewName',
      avatar: 'data:image/png;base64,xyz',
    })
    expect(result.success).toBe(true)
  })

  it('DiscordGuildSendLogMessageJobSchema accepts a null description', () => {
    const result = bullmq.DiscordGuildSendLogMessageJobSchema.safeParse({
      guildID: 'g1',
      channelID: 'ch1',
      title: 'Title',
      description: null,
      color: '#fff',
      footer: 'Footer',
      correlationId: 'c1',
    })
    expect(result.success).toBe(true)
  })
})
