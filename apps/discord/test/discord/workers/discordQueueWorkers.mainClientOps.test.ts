import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeJob } from './fixtures.js'

class FakeWorker extends EventEmitter {
  name: string
  processor: (job: any) => any
  opts: any
  constructor(name: string, processor: (job: any) => any, opts: any) {
    super()
    this.name = name
    this.processor = processor
    this.opts = opts
  }
}
vi.mock('bullmq', () => ({ Worker: FakeWorker }))
vi.mock('@gmod/infra-bullmq', () => ({ connection: {} }))

const gmLogMock = vi.fn()
vi.mock('@gmod/core/utils/logger.js', () => ({ gmLog: gmLogMock }))

const prismaMock: any = {
  gm_gmodstore_purchases: { findMany: vi.fn() },
  gm_user: { findFirst: vi.fn() },
}
vi.mock('@gmod/infra-prisma', () => ({ default: prismaMock }))

const getUserFromSteamID64Mock = vi.fn()
vi.mock('@gmod/domain-user/User.js', () => ({ getUserFromSteamID64: getUserFromSteamID64Mock }))

const getServerFromIDMock = vi.fn()
vi.mock('@gmod/domain-server/Server.js', () => ({ getServerFromID: getServerFromIDMock }))

const redisMock = { set: vi.fn().mockResolvedValue(undefined) }
vi.mock('@gmod/infra-redis', () => ({ default: redisMock }))

const getGuildClientMock = vi.fn()
const getMainClientMock = vi.fn()
const loadGuildBotInstanceMock = vi.fn()
vi.mock('../../../src/discord/index.js', () => ({
  getGuildClient: getGuildClientMock,
  getMainClient: getMainClientMock,
  loadGuildBotInstance: loadGuildBotInstanceMock,
}))

const addAutoRoleToUserMock = vi.fn()
const verifyUserMock = vi.fn()
vi.mock('@gmod/domain-guild/discordModels.js', () => ({
  addAutoRoleToUser: addAutoRoleToUserMock,
  verifyUser: verifyUserMock,
}))

const getVerificationGuildMessageMock = vi.fn()
vi.mock('../../../src/discord/utils/messages.js', () => ({
  getVerificationGuildMessage: getVerificationGuildMessageMock,
}))

const configDiscordMock: any = {
  guildID: 'main-guild',
  premiumRoleID: 'premium-role',
  gmodStorePremiumRoleID: 'gmodstore-role',
  discordPremiumRoleID: 'discord-role',
  clientID: 'main-client',
}
vi.mock('@gmod/config', () => ({ ConfigDiscord: configDiscordMock }))

const getDiscordEntitlementsMock = vi.fn()
vi.mock('@gmod/domain-guild/Guild.js', () => ({ getDiscordEntitlements: getDiscordEntitlementsMock }))

const ensureAvatarStoredMock = vi.fn()
const s3SendMock = vi.fn()
vi.mock('@gmod/infra-minio', () => ({ ensureAvatarStored: ensureAvatarStoredMock, s3: { send: s3SendMock } }))

class FakeGetObjectCommand {
  input: any
  constructor(input: any) {
    this.input = input
  }
}
vi.mock('@aws-sdk/client-s3', () => ({ GetObjectCommand: FakeGetObjectCommand }))

const { discordMainClientOpsWorker } = await import('../../../src/discord/workers/discordQueueWorkers.js')

function processor() {
  return (discordMainClientOpsWorker as unknown as FakeWorker).processor
}

function resetAllMocks() {
  gmLogMock.mockClear()
  prismaMock.gm_gmodstore_purchases.findMany.mockReset().mockResolvedValue([])
  prismaMock.gm_user.findFirst.mockReset().mockResolvedValue(null)
  getUserFromSteamID64Mock.mockReset()
  getServerFromIDMock.mockReset()
  redisMock.set.mockReset().mockResolvedValue(undefined)
  getGuildClientMock.mockReset()
  getMainClientMock.mockReset()
  loadGuildBotInstanceMock.mockReset()
  addAutoRoleToUserMock.mockReset()
  verifyUserMock.mockReset()
  getVerificationGuildMessageMock.mockReset()
  getDiscordEntitlementsMock.mockReset().mockResolvedValue([])
  ensureAvatarStoredMock.mockReset().mockResolvedValue('stored-url')
  s3SendMock.mockReset()
  configDiscordMock.guildID = 'main-guild'
  configDiscordMock.premiumRoleID = 'premium-role'
  configDiscordMock.gmodStorePremiumRoleID = 'gmodstore-role'
  configDiscordMock.discordPremiumRoleID = 'discord-role'
  configDiscordMock.clientID = 'main-client'
}

function lastReplyPayload() {
  const call = redisMock.set.mock.calls.at(-1)
  return JSON.parse(call![1] as string)
}

describe('discordQueueWorkers - discordMainClientOpsWorker', () => {
  beforeEach(() => resetAllMocks())

  describe('mainClientHasGuild', () => {
    it('replies with hasGuild=true when the main client cache has the guild', async () => {
      getMainClientMock.mockResolvedValueOnce({ guilds: { cache: { has: vi.fn().mockReturnValue(true) } } })
      await processor()(makeJob('mainClientHasGuild', { guildID: 'g1', correlationId: 'c1' }))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', hasGuild: true })
    })

    it('replies with hasGuild=false when the main client cache lacks the guild', async () => {
      getMainClientMock.mockResolvedValueOnce({ guilds: { cache: { has: vi.fn().mockReturnValue(false) } } })
      await processor()(makeJob('mainClientHasGuild', { guildID: 'g1', correlationId: 'c1' }))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', hasGuild: false })
    })
  })

  describe('mainClientUploadScreenshot', () => {
    function baseData(overrides: Record<string, any> = {}) {
      return {
        channelID: 'chan1',
        content: 'hello',
        minioKey: 'key1',
        fileName: 'shot.png',
        contentType: 'image/png',
        correlationId: 'c1',
        ...overrides,
      }
    }

    it('replies with empty discordUrl and logs when the S3 body is missing', async () => {
      s3SendMock.mockResolvedValueOnce({ Body: undefined })
      await processor()(makeJob('mainClientUploadScreenshot', baseData()))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', discordUrl: '' })
      expect(gmLogMock).toHaveBeenCalledWith('bullmq-worker', expect.stringContaining('No file content from Minio'))
    })

    it('replies with empty discordUrl when the channel cannot be fetched', async () => {
      async function* chunks() {
        yield new Uint8Array([1, 2, 3])
      }
      s3SendMock.mockResolvedValueOnce({ Body: chunks() })
      getMainClientMock.mockResolvedValueOnce({ channels: { fetch: vi.fn().mockResolvedValueOnce(null) } })
      await processor()(makeJob('mainClientUploadScreenshot', baseData()))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', discordUrl: '' })
    })

    it('replies with empty discordUrl when the channel is not sendable', async () => {
      async function* chunks() {
        yield new Uint8Array([1, 2, 3])
      }
      s3SendMock.mockResolvedValueOnce({ Body: chunks() })
      const channel = { isSendable: vi.fn().mockReturnValue(false) }
      getMainClientMock.mockResolvedValueOnce({ channels: { fetch: vi.fn().mockResolvedValueOnce(channel) } })
      await processor()(makeJob('mainClientUploadScreenshot', baseData()))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', discordUrl: '' })
    })

    it('uploads the file and replies with the discord attachment URL', async () => {
      async function* chunks() {
        yield new Uint8Array([1, 2, 3])
      }
      s3SendMock.mockResolvedValueOnce({ Body: chunks() })
      const send = vi.fn().mockResolvedValueOnce({
        attachments: { first: vi.fn().mockReturnValue({ url: 'https://cdn.discord/attach.png' }) },
      })
      const channel = { isSendable: vi.fn().mockReturnValue(true), send }
      getMainClientMock.mockResolvedValueOnce({ channels: { fetch: vi.fn().mockResolvedValueOnce(channel) } })
      await processor()(makeJob('mainClientUploadScreenshot', baseData()))
      expect(send).toHaveBeenCalledWith({
        content: 'hello',
        files: [{ attachment: Buffer.from([1, 2, 3]), name: 'shot.png' }],
      })
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', discordUrl: 'https://cdn.discord/attach.png' })
    })

    it('falls back to empty discordUrl when the sent message has no attachment', async () => {
      async function* chunks() {
        yield new Uint8Array([1, 2, 3])
      }
      s3SendMock.mockResolvedValueOnce({ Body: chunks() })
      const send = vi.fn().mockResolvedValueOnce({ attachments: { first: vi.fn().mockReturnValue(undefined) } })
      const channel = { isSendable: vi.fn().mockReturnValue(true), send }
      getMainClientMock.mockResolvedValueOnce({ channels: { fetch: vi.fn().mockResolvedValueOnce(channel) } })
      await processor()(makeJob('mainClientUploadScreenshot', baseData()))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', discordUrl: '' })
    })

    it('logs and replies with empty discordUrl when the S3 call throws', async () => {
      s3SendMock.mockRejectedValueOnce(new Error('s3 down'))
      await processor()(makeJob('mainClientUploadScreenshot', baseData()))
      expect(gmLogMock).toHaveBeenCalledWith(
        'bullmq-worker',
        expect.stringContaining('[mainClientUploadScreenshot] Error: s3 down'),
      )
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', discordUrl: '' })
    })
  })

  describe('mainClientFetchUser', () => {
    it('replies with user=null when the user cannot be fetched', async () => {
      getMainClientMock.mockResolvedValueOnce({ users: { fetch: vi.fn().mockRejectedValueOnce(new Error('nope')) } })
      await processor()(makeJob('mainClientFetchUser', { discordID: 'd1', correlationId: 'c1' }))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', user: null })
    })

    it('replies with the user summary (with stored avatar) when found', async () => {
      const user = {
        id: 'd1',
        username: 'bob',
        displayName: 'Bob',
        displayAvatarURL: vi.fn().mockReturnValue('https://cdn.discord/avatar.png'),
      }
      getMainClientMock.mockResolvedValueOnce({ users: { fetch: vi.fn().mockResolvedValueOnce(user) } })
      ensureAvatarStoredMock.mockResolvedValueOnce('https://stored/avatar.png')
      await processor()(makeJob('mainClientFetchUser', { discordID: 'd1', correlationId: 'c1' }))
      expect(ensureAvatarStoredMock).toHaveBeenCalledWith('discord', 'd1', 'https://cdn.discord/avatar.png')
      expect(lastReplyPayload()).toEqual({
        correlationId: 'c1',
        user: { id: 'd1', username: 'bob', displayName: 'Bob', avatarURL: 'https://stored/avatar.png' },
      })
    })
  })

  describe('mainClientSyncPremiumRoles', () => {
    function makeGuild(overrides: Record<string, any> = {}) {
      return {
        roles: { cache: { get: vi.fn() } },
        members: { fetch: vi.fn() },
        ...overrides,
      }
    }

    it('replies synced=false when the configured guild is not found', async () => {
      getMainClientMock.mockResolvedValueOnce({ guilds: { cache: { get: vi.fn().mockReturnValue(undefined) } } })
      await processor()(makeJob('mainClientSyncPremiumRoles', { correlationId: 'c1' }))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', synced: false })
    })

    it('replies synced=false when premium role IDs are not fully configured', async () => {
      configDiscordMock.premiumRoleID = ''
      getMainClientMock.mockResolvedValueOnce({ guilds: { cache: { get: vi.fn().mockReturnValue(makeGuild()) } } })
      await processor()(makeJob('mainClientSyncPremiumRoles', { correlationId: 'c1' }))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', synced: false })
    })

    it('replies synced=false when the premium roles cannot be resolved on the guild', async () => {
      const guild = makeGuild({ roles: { cache: { get: vi.fn().mockReturnValue(undefined) } } })
      getMainClientMock.mockResolvedValueOnce({ guilds: { cache: { get: vi.fn().mockReturnValue(guild) } } })
      await processor()(makeJob('mainClientSyncPremiumRoles', { correlationId: 'c1' }))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', synced: false })
    })

    it('reconciles premium roles across gmodstore buyers and discord entitlement subscribers', async () => {
      const premiumRole = { id: 'premium-role', members: new Map() }
      const gmodStorePremiumRole = { id: 'gmodstore-role', members: new Map() }
      const discordPremiumRole = { id: 'discord-role', members: new Map() }

      // Existing premium-role holder who should be *removed* (no subscription, no purchase match).
      const staleMemberRemove = vi.fn().mockResolvedValue(undefined)
      premiumRole.members.set('stale-user', { id: 'stale-user', roles: { remove: staleMemberRemove } })
      // Existing premium-role holder who is a current entitlement subscriber -> kept.
      const keptMemberRemove = vi.fn().mockResolvedValue(undefined)
      premiumRole.members.set('sub-user', { id: 'sub-user', roles: { remove: keptMemberRemove } })

      const gmodStoreStaleRemove = vi.fn().mockResolvedValue(undefined)
      gmodStorePremiumRole.members.set('gs-stale', { id: 'gs-stale', roles: { remove: gmodStoreStaleRemove } })

      const discordStaleRemove = vi.fn().mockResolvedValue(undefined)
      discordPremiumRole.members.set('d-stale', { id: 'd-stale', roles: { remove: discordStaleRemove } })

      const guild = makeGuild({
        roles: {
          cache: {
            get: vi.fn().mockImplementation((id: string) => {
              if (id === 'premium-role') return premiumRole
              if (id === 'gmodstore-role') return gmodStorePremiumRole
              if (id === 'discord-role') return discordPremiumRole
              return undefined
            }),
          },
        },
        members: {
          fetch: vi.fn().mockImplementation(async (id: string) => {
            if (id === 'buyer-discord-id') {
              return { id: 'buyer-discord-id', roles: { cache: new Map(), add: vi.fn().mockResolvedValue(undefined) } }
            }
            if (id === 'sub-user') {
              return { id: 'sub-user', roles: { cache: new Map([['premium-role', {}]]), add: vi.fn().mockResolvedValue(undefined) } }
            }
            return null
          }),
        },
      })

      getMainClientMock.mockResolvedValueOnce({ guilds: { cache: { get: vi.fn().mockReturnValue(guild) } } })
      prismaMock.gm_gmodstore_purchases.findMany.mockResolvedValueOnce([{ steamID64: '765' }])
      getDiscordEntitlementsMock.mockResolvedValueOnce([{ user_id: 'sub-user' }, { user_id: 'sub-user' }])
      prismaMock.gm_user.findFirst.mockImplementation(async ({ where }: any) => {
        if (where.id === 'stale-user') return { id: 'stale-user', steam: null }
        if (where.id === 'sub-user') return { id: 'sub-user', steam: '765' }
        if (where.id === 'gs-stale') return null
        return null
      })
      getUserFromSteamID64Mock.mockResolvedValueOnce({ getDiscordID: () => 'buyer-discord-id' })

      await processor()(makeJob('mainClientSyncPremiumRoles', { correlationId: 'c1' }))

      expect(staleMemberRemove).toHaveBeenCalledWith(premiumRole)
      expect(keptMemberRemove).not.toHaveBeenCalled()
      expect(gmodStoreStaleRemove).toHaveBeenCalledWith(gmodStorePremiumRole)
      expect(discordStaleRemove).toHaveBeenCalledWith(discordPremiumRole)
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', synced: true })
    })

    it('skips gmodstore buyers/subscribers whose member cannot be resolved in the guild', async () => {
      const premiumRole = { id: 'premium-role', members: new Map() }
      const gmodStorePremiumRole = { id: 'gmodstore-role', members: new Map() }
      const discordPremiumRole = { id: 'discord-role', members: new Map() }
      const guild = makeGuild({
        roles: {
          cache: {
            get: vi.fn().mockImplementation((id: string) => {
              if (id === 'premium-role') return premiumRole
              if (id === 'gmodstore-role') return gmodStorePremiumRole
              if (id === 'discord-role') return discordPremiumRole
              return undefined
            }),
          },
        },
        members: { fetch: vi.fn().mockResolvedValue(null) },
      })
      getMainClientMock.mockResolvedValueOnce({ guilds: { cache: { get: vi.fn().mockReturnValue(guild) } } })
      prismaMock.gm_gmodstore_purchases.findMany.mockResolvedValueOnce([{ steamID64: '765' }])
      getDiscordEntitlementsMock.mockResolvedValueOnce([{ user_id: 'sub-user' }])
      getUserFromSteamID64Mock.mockResolvedValueOnce({ getDiscordID: () => 'buyer-discord-id' })

      await processor()(makeJob('mainClientSyncPremiumRoles', { correlationId: 'c1' }))

      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', synced: true })
    })

    it('skips a gmodstore buyer with no linked discord user', async () => {
      const premiumRole = { id: 'premium-role', members: new Map() }
      const gmodStorePremiumRole = { id: 'gmodstore-role', members: new Map() }
      const discordPremiumRole = { id: 'discord-role', members: new Map() }
      const guild = makeGuild({
        roles: {
          cache: {
            get: vi.fn().mockImplementation((id: string) => {
              if (id === 'premium-role') return premiumRole
              if (id === 'gmodstore-role') return gmodStorePremiumRole
              if (id === 'discord-role') return discordPremiumRole
              return undefined
            }),
          },
        },
        members: { fetch: vi.fn().mockResolvedValue(null) },
      })
      getMainClientMock.mockResolvedValueOnce({ guilds: { cache: { get: vi.fn().mockReturnValue(guild) } } })
      prismaMock.gm_gmodstore_purchases.findMany.mockResolvedValueOnce([{ steamID64: '765' }])
      getDiscordEntitlementsMock.mockResolvedValueOnce([])
      getUserFromSteamID64Mock.mockResolvedValueOnce(null)

      await processor()(makeJob('mainClientSyncPremiumRoles', { correlationId: 'c1' }))

      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', synced: true })
    })

    it('replies synced=false when an unexpected error occurs', async () => {
      getMainClientMock.mockRejectedValueOnce(new Error('boom'))
      await processor()(makeJob('mainClientSyncPremiumRoles', { correlationId: 'c1' }))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', synced: false })
    })

    it('swallows individual role add/remove/member-fetch failures via their .catch(() => null) fallbacks', async () => {
      const staleRejectRemove = vi.fn().mockRejectedValue(new Error('remove fail'))
      const premiumRole = {
        id: 'premium-role',
        members: new Map([['stale-reject', { id: 'stale-reject', roles: { remove: staleRejectRemove } }]]),
      }

      // 'gs-find-reject' has a resolvable user with a steam ID that does NOT match any gmodstore
      // purchase, so the `gmodStoreBuyers.find(...)` lookup itself actually executes (rather than
      // short-circuiting on `!user`/`!user.steam` like the other reconciliation test does).
      const gsFindRejectRemove = vi.fn().mockRejectedValue(new Error('remove fail'))
      const gmodStorePremiumRole = {
        id: 'gmodstore-role',
        members: new Map([['gs-find-reject', { id: 'gs-find-reject', roles: { remove: gsFindRejectRemove } }]]),
      }

      const discordRejectRemove = vi.fn().mockRejectedValue(new Error('remove fail'))
      const discordPremiumRole = {
        id: 'discord-role',
        members: new Map([['d-reject', { id: 'd-reject', roles: { remove: discordRejectRemove } }]]),
      }

      const membersFetch = vi.fn().mockImplementation(async (id: string) => {
        if (id === 'buyer-fetch-reject' || id === 'sub-fetch-reject') throw new Error('fetch fail')
        if (id === 'buyer-add-reject' || id === 'sub-add-reject') {
          return { id, roles: { cache: new Map(), add: vi.fn().mockRejectedValue(new Error('add fail')) } }
        }
        return null
      })

      const guild = makeGuild({
        roles: {
          cache: {
            get: vi.fn().mockImplementation((id: string) => {
              if (id === 'premium-role') return premiumRole
              if (id === 'gmodstore-role') return gmodStorePremiumRole
              if (id === 'discord-role') return discordPremiumRole
              return undefined
            }),
          },
        },
        members: { fetch: membersFetch },
      })

      getMainClientMock.mockResolvedValueOnce({ guilds: { cache: { get: vi.fn().mockReturnValue(guild) } } })
      prismaMock.gm_gmodstore_purchases.findMany.mockResolvedValueOnce([
        { steamID64: 's-fetch-reject' },
        { steamID64: 's-add-reject' },
      ])
      getDiscordEntitlementsMock.mockResolvedValueOnce([{ user_id: 'sub-fetch-reject' }, { user_id: 'sub-add-reject' }])
      prismaMock.gm_user.findFirst.mockImplementation(async ({ where }: any) => {
        if (where.id === 'gs-find-reject') return { id: 'gs-find-reject', steam: 'unmatched-steam' }
        return null
      })
      getUserFromSteamID64Mock.mockImplementation(async (steamID64: string) => {
        if (steamID64 === 's-fetch-reject') return { getDiscordID: () => 'buyer-fetch-reject' }
        if (steamID64 === 's-add-reject') return { getDiscordID: () => 'buyer-add-reject' }
        return null
      })

      await processor()(makeJob('mainClientSyncPremiumRoles', { correlationId: 'c1' }))

      expect(staleRejectRemove).toHaveBeenCalled()
      expect(gsFindRejectRemove).toHaveBeenCalled()
      expect(discordRejectRemove).toHaveBeenCalled()
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', synced: true })
    })

    it('keeps every legitimately-entitled member and skips already-assigned role adds', async () => {
      const keepBuyerRemove = vi.fn().mockResolvedValue(undefined)
      const premiumRole = {
        id: 'premium-role',
        members: new Map([['keep-buyer', { id: 'keep-buyer', roles: { remove: keepBuyerRemove } }]]),
      }

      const keepGsRemove = vi.fn().mockResolvedValue(undefined)
      const gmodStorePremiumRole = {
        id: 'gmodstore-role',
        members: new Map([['keep-gs', { id: 'keep-gs', roles: { remove: keepGsRemove } }]]),
      }

      const keepDiscordRemove = vi.fn().mockResolvedValue(undefined)
      const discordPremiumRole = {
        id: 'discord-role',
        members: new Map([['keep-discord', { id: 'keep-discord', roles: { remove: keepDiscordRemove } }]]),
      }

      const buyerAdd = vi.fn().mockResolvedValue(undefined)
      const subAdd = vi.fn().mockResolvedValue(undefined)

      const guild = makeGuild({
        roles: {
          cache: {
            get: vi.fn().mockImplementation((id: string) => {
              if (id === 'premium-role') return premiumRole
              if (id === 'gmodstore-role') return gmodStorePremiumRole
              if (id === 'discord-role') return discordPremiumRole
              return undefined
            }),
          },
        },
        members: {
          fetch: vi.fn().mockImplementation(async (id: string) => {
            if (id === 'buyer-has-both') {
              return {
                id,
                roles: {
                  cache: new Map([
                    ['premium-role', {}],
                    ['gmodstore-role', {}],
                  ]),
                  add: buyerAdd,
                },
              }
            }
            if (id === 'sub-has-both') {
              return {
                id,
                roles: {
                  cache: new Map([
                    ['premium-role', {}],
                    ['discord-role', {}],
                  ]),
                  add: subAdd,
                },
              }
            }
            return null
          }),
        },
      })

      getMainClientMock.mockResolvedValueOnce({ guilds: { cache: { get: vi.fn().mockReturnValue(guild) } } })
      prismaMock.gm_gmodstore_purchases.findMany.mockResolvedValueOnce([{ steamID64: 'keep-steam' }])
      getDiscordEntitlementsMock.mockResolvedValueOnce([{ user_id: 'keep-discord' }, { user_id: 'sub-has-both' }])
      prismaMock.gm_user.findFirst.mockImplementation(async ({ where }: any) => {
        if (where.id === 'keep-buyer') return { id: 'keep-buyer', steam: 'keep-steam' }
        if (where.id === 'keep-gs') return { id: 'keep-gs', steam: 'keep-steam' }
        return null
      })
      getUserFromSteamID64Mock.mockResolvedValueOnce({ getDiscordID: () => 'buyer-has-both' })

      await processor()(makeJob('mainClientSyncPremiumRoles', { correlationId: 'c1' }))

      expect(keepBuyerRemove).not.toHaveBeenCalled()
      expect(keepGsRemove).not.toHaveBeenCalled()
      expect(keepDiscordRemove).not.toHaveBeenCalled()
      expect(buyerAdd).not.toHaveBeenCalled()
      expect(subAdd).not.toHaveBeenCalled()
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', synced: true })
    })
  })

  describe('mainClientSetPresence', () => {
    it('sets the presence with a default activity type and replies updated=true', async () => {
      const setPresence = vi.fn()
      getMainClientMock.mockResolvedValueOnce({ user: { setPresence } })
      await processor()(makeJob('mainClientSetPresence', { activityName: 'Playing', correlationId: 'c1' }))
      expect(setPresence).toHaveBeenCalledWith({ activities: [{ name: 'Playing', type: 3 }] })
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', updated: true })
    })

    it('sets the presence with an explicit activity type', async () => {
      const setPresence = vi.fn()
      getMainClientMock.mockResolvedValueOnce({ user: { setPresence } })
      await processor()(
        makeJob('mainClientSetPresence', { activityName: 'Watching', activityType: 1, correlationId: 'c1' }),
      )
      expect(setPresence).toHaveBeenCalledWith({ activities: [{ name: 'Watching', type: 1 }] })
    })

    it('replies updated=false when the main client has no user', async () => {
      getMainClientMock.mockResolvedValueOnce({ user: null })
      await processor()(makeJob('mainClientSetPresence', { activityName: 'Playing', correlationId: 'c1' }))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', updated: false })
    })

    it('replies updated=false when an unexpected error occurs', async () => {
      getMainClientMock.mockRejectedValueOnce(new Error('boom'))
      await processor()(makeJob('mainClientSetPresence', { activityName: 'Playing', correlationId: 'c1' }))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', updated: false })
    })
  })
})
