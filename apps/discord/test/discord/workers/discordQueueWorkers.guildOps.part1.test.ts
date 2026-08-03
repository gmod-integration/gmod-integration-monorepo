import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeCollection, makeChannel, makeGuild, makeGuildClient, makeJob, makeMember, makeRole } from './fixtures.js'

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
  gm_guild_verify_msg: { findFirst: vi.fn(), delete: vi.fn(), create: vi.fn() },
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

const configDiscordMock: any = { guildID: 'main-guild', clientID: 'main-client' }
vi.mock('@gmod/config', () => ({ ConfigDiscord: configDiscordMock }))

const getDiscordEntitlementsMock = vi.fn()
vi.mock('@gmod/domain-guild/Guild.js', () => ({ getDiscordEntitlements: getDiscordEntitlementsMock }))

const ensureAvatarStoredMock = vi.fn()
const s3SendMock = vi.fn()
vi.mock('@gmod/infra-minio', () => ({ ensureAvatarStored: ensureAvatarStoredMock, s3: { send: s3SendMock } }))
vi.mock('@aws-sdk/client-s3', () => ({ GetObjectCommand: vi.fn().mockImplementation((input) => ({ input })) }))

const { discordGuildOpsWorker } = await import('../../../src/discord/workers/discordQueueWorkers.js')

function processor() {
  return (discordGuildOpsWorker as unknown as FakeWorker).processor
}

function resetAllMocks() {
  gmLogMock.mockClear()
  prismaMock.gm_guild_verify_msg.findFirst.mockReset()
  prismaMock.gm_guild_verify_msg.delete.mockReset().mockResolvedValue(undefined)
  prismaMock.gm_guild_verify_msg.create.mockReset()
  getUserFromSteamID64Mock.mockReset()
  getServerFromIDMock.mockReset()
  redisMock.set.mockReset().mockResolvedValue(undefined)
  getGuildClientMock.mockReset()
  getMainClientMock.mockReset()
  loadGuildBotInstanceMock.mockReset()
  addAutoRoleToUserMock.mockReset().mockResolvedValue(undefined)
  verifyUserMock.mockReset()
  getVerificationGuildMessageMock.mockReset()
  getDiscordEntitlementsMock.mockReset()
  ensureAvatarStoredMock.mockReset().mockResolvedValue('stored-url')
  s3SendMock.mockReset()
  configDiscordMock.guildID = 'main-guild'
  configDiscordMock.clientID = 'main-client'
}

function lastReplyPayload() {
  const call = redisMock.set.mock.calls.at(-1)
  return JSON.parse(call![1] as string)
}

describe('discordQueueWorkers - discordGuildOpsWorker (part 1)', () => {
  beforeEach(() => resetAllMocks())

  describe('guildSnapshot', () => {
    it('replies with guild=null when the guild cannot be fetched', async () => {
      const client = makeGuildClient(null)
      client.guilds.fetch = vi.fn().mockRejectedValueOnce(new Error('nope'))
      getGuildClientMock.mockResolvedValueOnce(client)
      await processor()(makeJob('guildSnapshot', { guildID: 'g1', correlationId: 'c1' }))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', guild: null })
    })

    it('builds a full guild summary (channels/roles/emojis), tolerating fetch failures', async () => {
      const channelWithPosition = makeChannel('chan1', { position: 3, parent: { id: 'parent1' } })
      const channelWithoutPosition = {
        id: 'chan2',
        name: 'no-pos',
        type: 2,
        isSendable: vi.fn().mockReturnValue(false),
        isTextBased: vi.fn().mockReturnValue(false),
        parent: null,
      }
      const channelsCache = new FakeCollection<string, any>([
        ['chan1', channelWithPosition],
        ['chan2', channelWithoutPosition],
      ])
      const role = makeRole('role1', { color: 255 })
      const rolesCache = new FakeCollection<string, any>([['role1', role]])
      const emoji = { id: 'emoji1', name: 'pepe', url: 'https://cdn.discord/emoji1.png' }
      const emojisCache = new FakeCollection<string, any>([['emoji1', emoji]])

      const guild = makeGuild('g1', {
        channels: { cache: channelsCache, fetch: vi.fn().mockRejectedValueOnce(new Error('fail')) },
        roles: { cache: rolesCache, fetch: vi.fn().mockRejectedValueOnce(new Error('fail')) },
        emojis: { cache: emojisCache, fetch: vi.fn().mockRejectedValueOnce(new Error('fail')) },
      })
      getGuildClientMock.mockResolvedValueOnce(makeGuildClient(guild))
      ensureAvatarStoredMock.mockResolvedValueOnce('https://stored/icon.png')

      await processor()(makeJob('guildSnapshot', { guildID: 'g1', correlationId: 'c1' }))

      const payload = lastReplyPayload()
      expect(payload.correlationId).toBe('c1')
      expect(payload.guild.id).toBe('g1')
      expect(payload.guild.icon).toBe('https://stored/icon.png')
      expect(payload.guild.channels).toEqual([
        {
          id: 'chan1',
          name: 'channel-chan1',
          type: '0',
          position: 3,
          parentID: 'parent1',
          sendable: true,
          textBased: true,
        },
        { id: 'chan2', name: 'no-pos', type: '2', position: null, parentID: null, sendable: false, textBased: false },
      ])
      expect(payload.guild.roles).toEqual([
        {
          id: 'role1',
          name: 'role-role1',
          position: 1,
          color: 255,
          colorHex: '#0000ff',
          managed: false,
          editable: true,
        },
      ])
      expect(payload.guild.emojis).toEqual([{ id: 'emoji1', name: 'pepe', url: 'https://cdn.discord/emoji1.png' }])
    })
  })

  describe('guildVerifyUser', () => {
    it('replies verified=false when the guild cannot be fetched', async () => {
      const client = makeGuildClient(null)
      client.guilds.fetch = vi.fn().mockRejectedValueOnce(new Error('nope'))
      getGuildClientMock.mockResolvedValueOnce(client)
      await processor()(makeJob('guildVerifyUser', { guildID: 'g1', userID: 'u1', correlationId: 'c1' }))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', verified: false })
    })

    it('replies verified=false when the member cannot be fetched', async () => {
      const guild = makeGuild('g1', {
        members: { fetch: vi.fn().mockRejectedValueOnce(new Error('nope')), cache: new FakeCollection() },
      })
      getGuildClientMock.mockResolvedValueOnce(makeGuildClient(guild))
      await processor()(makeJob('guildVerifyUser', { guildID: 'g1', userID: 'u1', correlationId: 'c1' }))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', verified: false })
      expect(verifyUserMock).not.toHaveBeenCalled()
    })

    it('replies verified=true when verifyUser resolves truthy', async () => {
      const member = makeMember('u1')
      const guild = makeGuild('g1', {
        members: { fetch: vi.fn().mockResolvedValueOnce(member), cache: new FakeCollection() },
      })
      getGuildClientMock.mockResolvedValueOnce(makeGuildClient(guild))
      verifyUserMock.mockResolvedValueOnce(true)
      await processor()(makeJob('guildVerifyUser', { guildID: 'g1', userID: 'u1', correlationId: 'c1' }))
      expect(verifyUserMock).toHaveBeenCalledWith(guild, member)
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', verified: true })
    })

    it('replies verified=false when verifyUser resolves falsy', async () => {
      const member = makeMember('u1')
      const guild = makeGuild('g1', {
        members: { fetch: vi.fn().mockResolvedValueOnce(member), cache: new FakeCollection() },
      })
      getGuildClientMock.mockResolvedValueOnce(makeGuildClient(guild))
      verifyUserMock.mockResolvedValueOnce(false)
      await processor()(makeJob('guildVerifyUser', { guildID: 'g1', userID: 'u1', correlationId: 'c1' }))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', verified: false })
    })
  })

  describe('guildRunVerificationCheck', () => {
    it('replies processed=0 when the guild cannot be fetched', async () => {
      const client = makeGuildClient(null)
      client.guilds.fetch = vi.fn().mockRejectedValueOnce(new Error('nope'))
      getGuildClientMock.mockResolvedValueOnce(client)
      await processor()(makeJob('guildRunVerificationCheck', { guildID: 'g1', correlationId: 'c1' }))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', processed: 0 })
    })

    it('replies processed=0 when members cannot be fetched', async () => {
      const guild = makeGuild('g1', {
        members: { fetch: vi.fn().mockRejectedValueOnce(new Error('nope')), cache: new FakeCollection() },
      })
      getGuildClientMock.mockResolvedValueOnce(makeGuildClient(guild))
      await processor()(makeJob('guildRunVerificationCheck', { guildID: 'g1', correlationId: 'c1' }))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', processed: 0 })
    })

    it('processes every member, calling addAutoRoleToUser and verifyUser for each', async () => {
      const member1 = makeMember('m1')
      const member2 = makeMember('m2')
      const membersMap = new FakeCollection<string, any>([
        ['m1', member1],
        ['m2', member2],
      ])
      const guild = makeGuild('g1', {
        members: { fetch: vi.fn().mockResolvedValueOnce(membersMap), cache: new FakeCollection() },
      })
      getGuildClientMock.mockResolvedValueOnce(makeGuildClient(guild))
      await processor()(makeJob('guildRunVerificationCheck', { guildID: 'g1', correlationId: 'c1' }))
      expect(addAutoRoleToUserMock).toHaveBeenCalledTimes(2)
      expect(verifyUserMock).toHaveBeenCalledTimes(2)
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', processed: 2 })
    })
  })

  describe('createVerificationMessage', () => {
    function baseData(overrides: Record<string, any> = {}) {
      return { guildID: 'g1', channelID: 'chan1', correlationId: 'c1', ...overrides }
    }

    it('replies with an error when the channel is not found/sendable', async () => {
      const guild = makeGuild('g1', {
        channels: { cache: new FakeCollection(), fetch: vi.fn().mockResolvedValueOnce(undefined) },
      })
      getGuildClientMock.mockResolvedValueOnce(makeGuildClient(guild))
      await processor()(makeJob('createVerificationMessage', baseData()))
      expect(lastReplyPayload()).toEqual({
        correlationId: 'c1',
        verifyMessage: null,
        error: 'Channel is not sendable',
      })
    })

    it('deletes an old verification message before sending a new one when an old record exists (swallowing a delete failure)', async () => {
      const oldMessage = { delete: vi.fn().mockRejectedValueOnce(new Error('delete fail')) }
      const oldChannel = makeChannel('old-chan', { messages: { fetch: vi.fn().mockResolvedValueOnce(oldMessage) } })
      const newChannel = makeChannel('chan1')
      const channelsCache = new FakeCollection<string, any>([
        ['old-chan', oldChannel],
        ['chan1', newChannel],
      ])
      const guild = makeGuild('g1', { channels: { cache: channelsCache, fetch: vi.fn() } })
      getGuildClientMock.mockResolvedValueOnce(makeGuildClient(guild))
      prismaMock.gm_guild_verify_msg.findFirst.mockResolvedValueOnce({
        guildID: 'g1',
        channelID: 'old-chan',
        messageID: 'old-msg',
      })
      getVerificationGuildMessageMock.mockResolvedValueOnce({ content: 'verify here' })
      newChannel.send = vi.fn().mockResolvedValueOnce({ id: 'new-msg' })
      prismaMock.gm_guild_verify_msg.create.mockResolvedValueOnce({
        guildID: 'g1',
        channelID: 'chan1',
        messageID: 'new-msg',
      })

      await processor()(makeJob('createVerificationMessage', baseData()))

      expect(oldMessage.delete).toHaveBeenCalled()
      expect(prismaMock.gm_guild_verify_msg.delete).toHaveBeenCalledWith({ where: { guildID: 'g1' } })
      expect(lastReplyPayload()).toEqual({
        correlationId: 'c1',
        verifyMessage: { guildID: 'g1', channelID: 'chan1', messageID: 'new-msg' },
      })
    })

    it('swallows a failure to fetch the old verification message and still sends a new one', async () => {
      const oldChannel = makeChannel('old-chan', {
        messages: { fetch: vi.fn().mockRejectedValueOnce(new Error('fetch fail')) },
      })
      const newChannel = makeChannel('chan1')
      const channelsCache = new FakeCollection<string, any>([
        ['old-chan', oldChannel],
        ['chan1', newChannel],
      ])
      const guild = makeGuild('g1', { channels: { cache: channelsCache, fetch: vi.fn() } })
      getGuildClientMock.mockResolvedValueOnce(makeGuildClient(guild))
      prismaMock.gm_guild_verify_msg.findFirst.mockResolvedValueOnce({
        guildID: 'g1',
        channelID: 'old-chan',
        messageID: 'old-msg',
      })
      getVerificationGuildMessageMock.mockResolvedValueOnce({ content: 'verify here' })
      newChannel.send = vi.fn().mockResolvedValueOnce({ id: 'new-msg' })
      prismaMock.gm_guild_verify_msg.create.mockResolvedValueOnce({
        guildID: 'g1',
        channelID: 'chan1',
        messageID: 'new-msg',
      })

      await processor()(makeJob('createVerificationMessage', baseData()))

      expect(lastReplyPayload().verifyMessage).toEqual({ guildID: 'g1', channelID: 'chan1', messageID: 'new-msg' })
    })

    it('skips deleting the old message when the old channel is not text-based, and skips when old message is not found', async () => {
      const oldChannelNotTextBased = makeChannel('old-chan', { isTextBased: vi.fn().mockReturnValue(false) })
      const newChannel = makeChannel('chan1')
      const channelsCache = new FakeCollection<string, any>([
        ['old-chan', oldChannelNotTextBased],
        ['chan1', newChannel],
      ])
      const guild = makeGuild('g1', { channels: { cache: channelsCache, fetch: vi.fn() } })
      getGuildClientMock.mockResolvedValueOnce(makeGuildClient(guild))
      prismaMock.gm_guild_verify_msg.findFirst.mockResolvedValueOnce({
        guildID: 'g1',
        channelID: 'old-chan',
        messageID: 'old-msg',
      })
      getVerificationGuildMessageMock.mockResolvedValueOnce({ content: 'verify here' })
      newChannel.send = vi.fn().mockResolvedValueOnce({ id: 'new-msg' })
      prismaMock.gm_guild_verify_msg.create.mockResolvedValueOnce({
        guildID: 'g1',
        channelID: 'chan1',
        messageID: 'new-msg',
      })

      await processor()(makeJob('createVerificationMessage', baseData()))

      expect(prismaMock.gm_guild_verify_msg.delete).toHaveBeenCalled()
      expect(lastReplyPayload().verifyMessage).toEqual({ guildID: 'g1', channelID: 'chan1', messageID: 'new-msg' })
    })

    it('falls back to fetching the channel when it is not in cache', async () => {
      const newChannel = makeChannel('chan1')
      const guild = makeGuild('g1', {
        channels: { cache: new FakeCollection(), fetch: vi.fn().mockResolvedValueOnce(newChannel) },
      })
      getGuildClientMock.mockResolvedValueOnce(makeGuildClient(guild))
      prismaMock.gm_guild_verify_msg.findFirst.mockResolvedValueOnce(null)
      getVerificationGuildMessageMock.mockResolvedValueOnce({ content: 'verify here' })
      newChannel.send = vi.fn().mockResolvedValueOnce({ id: 'new-msg' })
      prismaMock.gm_guild_verify_msg.create.mockResolvedValueOnce({
        guildID: 'g1',
        channelID: 'chan1',
        messageID: 'new-msg',
      })

      await processor()(makeJob('createVerificationMessage', baseData()))

      expect(guild.channels.fetch).toHaveBeenCalledWith('chan1')
      expect(lastReplyPayload().verifyMessage).toEqual({ guildID: 'g1', channelID: 'chan1', messageID: 'new-msg' })
    })

    it('replies with an error when an unexpected error is thrown', async () => {
      getGuildClientMock.mockRejectedValueOnce(new Error('boom'))
      await processor()(makeJob('createVerificationMessage', baseData()))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', verifyMessage: null, error: 'boom' })
    })
  })

  describe('deleteVerificationMessage', () => {
    function baseData(overrides: Record<string, any> = {}) {
      return { guildID: 'g1', channelID: 'chan1', messageID: 'msg1', correlationId: 'c1', ...overrides }
    }

    it('replies deleted=false when the guild cannot be fetched', async () => {
      const client = makeGuildClient(null)
      client.guilds.fetch = vi.fn().mockRejectedValueOnce(new Error('nope'))
      getGuildClientMock.mockResolvedValueOnce(client)
      await processor()(makeJob('deleteVerificationMessage', baseData()))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', deleted: false })
    })

    it('deletes the message when found (cache hit) and replies deleted=true, swallowing a delete failure', async () => {
      const message = { delete: vi.fn().mockRejectedValueOnce(new Error('delete fail')) }
      const channel = makeChannel('chan1', { messages: { fetch: vi.fn().mockResolvedValueOnce(message) } })
      const guild = makeGuild('g1', { channels: { cache: new FakeCollection([['chan1', channel]]), fetch: vi.fn() } })
      getGuildClientMock.mockResolvedValueOnce(makeGuildClient(guild))
      await processor()(makeJob('deleteVerificationMessage', baseData()))
      expect(message.delete).toHaveBeenCalled()
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', deleted: true })
    })

    it('swallows a failure to fetch the message and still replies deleted=true', async () => {
      const channel = makeChannel('chan1', {
        messages: { fetch: vi.fn().mockRejectedValueOnce(new Error('fetch fail')) },
      })
      const guild = makeGuild('g1', { channels: { cache: new FakeCollection([['chan1', channel]]), fetch: vi.fn() } })
      getGuildClientMock.mockResolvedValueOnce(makeGuildClient(guild))
      await processor()(makeJob('deleteVerificationMessage', baseData()))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', deleted: true })
    })

    it('falls back to fetching the channel and skips deletion when message is not found', async () => {
      const channel = makeChannel('chan1', { messages: { fetch: vi.fn().mockResolvedValueOnce(null) } })
      const guild = makeGuild('g1', {
        channels: { cache: new FakeCollection(), fetch: vi.fn().mockResolvedValueOnce(channel) },
      })
      getGuildClientMock.mockResolvedValueOnce(makeGuildClient(guild))
      await processor()(makeJob('deleteVerificationMessage', baseData()))
      expect(guild.channels.fetch).toHaveBeenCalledWith('chan1')
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', deleted: true })
    })

    it('skips deletion entirely when the channel is not text-based', async () => {
      const channel = makeChannel('chan1', { isTextBased: vi.fn().mockReturnValue(false) })
      const guild = makeGuild('g1', { channels: { cache: new FakeCollection([['chan1', channel]]), fetch: vi.fn() } })
      getGuildClientMock.mockResolvedValueOnce(makeGuildClient(guild))
      await processor()(makeJob('deleteVerificationMessage', baseData()))
      expect(channel.messages.fetch).not.toHaveBeenCalled()
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', deleted: true })
    })

    it('skips deletion entirely when the channel cannot be found at all', async () => {
      const guild = makeGuild('g1', {
        channels: { cache: new FakeCollection(), fetch: vi.fn().mockResolvedValueOnce(undefined) },
      })
      getGuildClientMock.mockResolvedValueOnce(makeGuildClient(guild))
      await processor()(makeJob('deleteVerificationMessage', baseData()))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', deleted: true })
    })
  })

  describe('guildBotClientInfo', () => {
    it('replies botInfo=null when the guild client cannot be resolved', async () => {
      getGuildClientMock.mockRejectedValueOnce(new Error('no client'))
      await processor()(makeJob('guildBotClientInfo', { guildID: 'g1', correlationId: 'c1' }))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', botInfo: null })
    })

    it('replies botInfo=null when the resolved client has no user', async () => {
      getGuildClientMock.mockResolvedValueOnce({ user: null })
      await processor()(makeJob('guildBotClientInfo', { guildID: 'g1', correlationId: 'c1' }))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', botInfo: null })
    })

    it('replies with custom=false, onGuild=false for the shared main client', async () => {
      getGuildClientMock.mockResolvedValueOnce({
        user: { id: 'main-client', username: 'MainBot', avatarURL: vi.fn().mockReturnValue(null) },
        guilds: { cache: { has: vi.fn().mockReturnValue(true) } },
      })
      await processor()(makeJob('guildBotClientInfo', { guildID: 'g1', correlationId: 'c1' }))
      expect(lastReplyPayload()).toEqual({
        correlationId: 'c1',
        botInfo: { id: 'main-client', username: 'MainBot', avatar: null, custom: false, onGuild: false },
      })
    })

    it('replies with custom=true and onGuild reflecting the guild cache for a custom bot', async () => {
      getGuildClientMock.mockResolvedValueOnce({
        user: { id: 'custom-bot', username: 'CustomBot', avatarURL: vi.fn().mockReturnValue('avatar-url') },
        guilds: { cache: { has: vi.fn().mockReturnValue(true) } },
      })
      await processor()(makeJob('guildBotClientInfo', { guildID: 'g1', correlationId: 'c1' }))
      expect(lastReplyPayload()).toEqual({
        correlationId: 'c1',
        botInfo: { id: 'custom-bot', username: 'CustomBot', avatar: 'avatar-url', custom: true, onGuild: true },
      })
    })
  })

  describe('guildReloadBotInstance', () => {
    it('replies reloaded=true on success', async () => {
      loadGuildBotInstanceMock.mockResolvedValueOnce(undefined)
      await processor()(makeJob('guildReloadBotInstance', { guildID: 'g1', correlationId: 'c1' }))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', reloaded: true })
    })

    it('replies reloaded=false when loadGuildBotInstance throws', async () => {
      loadGuildBotInstanceMock.mockRejectedValueOnce(new Error('boom'))
      await processor()(makeJob('guildReloadBotInstance', { guildID: 'g1', correlationId: 'c1' }))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', reloaded: false })
    })
  })

  describe('guildUpdateBotProfile', () => {
    function baseData(overrides: Record<string, any> = {}) {
      return { guildID: 'g1', correlationId: 'c1', ...overrides }
    }

    it('replies with an error when the bot instance has no user', async () => {
      getGuildClientMock.mockResolvedValueOnce({ user: null })
      await processor()(makeJob('guildUpdateBotProfile', baseData()))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', updated: false, error: 'Bot client user not found' })
    })

    it('replies with an error when the bot client is the shared (non-custom) main client', async () => {
      getGuildClientMock.mockResolvedValueOnce({ user: { id: 'main-client' } })
      await processor()(makeJob('guildUpdateBotProfile', baseData()))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', updated: false, error: 'Bot client is not custom' })
    })

    it('updates username and avatar when both differ from current, and replies updated=true', async () => {
      const setUsername = vi.fn().mockResolvedValue(undefined)
      const setAvatar = vi.fn().mockResolvedValue(undefined)
      getGuildClientMock.mockResolvedValueOnce({
        user: {
          id: 'custom-bot',
          username: 'OldName',
          avatarURL: vi.fn().mockReturnValue('old-avatar'),
          setUsername,
          setAvatar,
        },
      })
      await processor()(makeJob('guildUpdateBotProfile', baseData({ username: 'NewName', avatar: 'new-avatar-data' })))
      expect(setUsername).toHaveBeenCalledWith('NewName')
      expect(setAvatar).toHaveBeenCalledWith('new-avatar-data')
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', updated: true })
    })

    it('skips updates when username/avatar are unchanged or absent', async () => {
      const setUsername = vi.fn().mockResolvedValue(undefined)
      const setAvatar = vi.fn().mockResolvedValue(undefined)
      getGuildClientMock.mockResolvedValueOnce({
        user: {
          id: 'custom-bot',
          username: 'SameName',
          avatarURL: vi.fn().mockReturnValue('same-avatar'),
          setUsername,
          setAvatar,
        },
      })
      await processor()(makeJob('guildUpdateBotProfile', baseData({ username: 'SameName', avatar: 'same-avatar' })))
      expect(setUsername).not.toHaveBeenCalled()
      expect(setAvatar).not.toHaveBeenCalled()
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', updated: true })
    })

    it('replies with an error when the update throws', async () => {
      getGuildClientMock.mockResolvedValueOnce({
        user: {
          id: 'custom-bot',
          username: 'OldName',
          avatarURL: vi.fn().mockReturnValue('old-avatar'),
          setUsername: vi.fn().mockRejectedValueOnce(new Error('rate limited')),
        },
      })
      await processor()(makeJob('guildUpdateBotProfile', baseData({ username: 'NewName' })))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', updated: false, error: 'rate limited' })
    })
  })

  describe('guildSyncBan', () => {
    function baseData(overrides: Record<string, any> = {}) {
      return { guildID: 'g1', oldDiscordIDs: ['old1', 'old2'], newDiscordID: 'new1', correlationId: 'c1', ...overrides }
    }

    it('replies synced=false when the guild is not found', async () => {
      getGuildClientMock.mockResolvedValueOnce({ guilds: { cache: { get: vi.fn().mockReturnValue(undefined) } } })
      await processor()(makeJob('guildSyncBan', baseData()))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', synced: false })
    })

    it('bans every old ID plus the new ID, using the first found ban reason and defaulting when none/empty', async () => {
      const ban = vi.fn().mockResolvedValue(undefined)
      const bansFetch = vi.fn().mockImplementation(async (id: string) => {
        if (id === 'old1') throw new Error('not banned')
        if (id === 'old2') return { reason: '' }
        return null
      })
      const guild = { members: { ban }, bans: { fetch: bansFetch } }
      getGuildClientMock.mockResolvedValueOnce({ guilds: { cache: { get: vi.fn().mockReturnValue(guild) } } })
      await processor()(makeJob('guildSyncBan', baseData()))
      expect(ban).toHaveBeenCalledWith('old1', { reason: 'Gmod Integration - Sync Ban : No Reason' })
      expect(ban).toHaveBeenCalledWith('old2', { reason: 'Gmod Integration - Sync Ban : No Reason' })
      expect(ban).toHaveBeenCalledWith('new1', { reason: 'Gmod Integration - Sync Ban : No Reason' })
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', synced: true })
    })

    it('uses the found ban reason when present', async () => {
      const ban = vi.fn().mockResolvedValue(undefined)
      const bansFetch = vi.fn().mockImplementation(async (id: string) => {
        if (id === 'old1') return { reason: 'Spamming' }
        return null
      })
      const guild = { members: { ban }, bans: { fetch: bansFetch } }
      getGuildClientMock.mockResolvedValueOnce({ guilds: { cache: { get: vi.fn().mockReturnValue(guild) } } })
      await processor()(makeJob('guildSyncBan', baseData()))
      expect(ban).toHaveBeenCalledWith('new1', { reason: 'Gmod Integration - Sync Ban : Spamming' })
    })

    it('replies synced=false when an unexpected error occurs', async () => {
      getGuildClientMock.mockRejectedValueOnce(new Error('boom'))
      await processor()(makeJob('guildSyncBan', baseData()))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', synced: false })
    })
  })

  describe('guildAdmins', () => {
    it('replies admins=[] when the guild cannot be fetched', async () => {
      const client = makeGuildClient(null)
      client.guilds.fetch = vi.fn().mockRejectedValueOnce(new Error('nope'))
      getGuildClientMock.mockResolvedValueOnce(client)
      await processor()(makeJob('guildAdmins', { guildID: 'g1', correlationId: 'c1' }))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', admins: [] })
    })

    it('replies admins=[] when members cannot be fetched', async () => {
      const guild = makeGuild('g1', {
        members: { fetch: vi.fn().mockRejectedValueOnce(new Error('nope')), cache: new FakeCollection() },
      })
      getGuildClientMock.mockResolvedValueOnce(makeGuildClient(guild))
      await processor()(makeJob('guildAdmins', { guildID: 'g1', correlationId: 'c1' }))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', admins: [] })
    })

    it('filters to human administrators, with stored avatars', async () => {
      const admin = makeMember('a1', { hasPermission: true })
      const botAdmin = makeMember('a2', { hasPermission: true, user: { bot: true } })
      const nonAdmin = makeMember('a3', { hasPermission: false })
      const membersMap = new FakeCollection<string, any>([
        ['a1', admin],
        ['a2', botAdmin],
        ['a3', nonAdmin],
      ])
      const guild = makeGuild('g1', {
        members: { fetch: vi.fn().mockResolvedValueOnce(membersMap), cache: new FakeCollection() },
      })
      getGuildClientMock.mockResolvedValueOnce(makeGuildClient(guild))
      ensureAvatarStoredMock.mockResolvedValue('stored-avatar')

      await processor()(makeJob('guildAdmins', { guildID: 'g1', correlationId: 'c1' }))

      expect(lastReplyPayload()).toEqual({
        correlationId: 'c1',
        admins: [{ id: 'a1', name: 'Member a1', avatar: 'stored-avatar' }],
      })
    })
  })

  describe('guildBans', () => {
    it('replies bans=[] when the guild cannot be fetched', async () => {
      const client = makeGuildClient(null)
      client.guilds.fetch = vi.fn().mockRejectedValueOnce(new Error('nope'))
      getGuildClientMock.mockResolvedValueOnce(client)
      await processor()(makeJob('guildBans', { guildID: 'g1', correlationId: 'c1' }))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', bans: [] })
    })

    it('replies bans=[] when the ban list cannot be fetched', async () => {
      const guild = makeGuild('g1', { bans: { fetch: vi.fn().mockRejectedValueOnce(new Error('nope')) } })
      getGuildClientMock.mockResolvedValueOnce(makeGuildClient(guild))
      await processor()(makeJob('guildBans', { guildID: 'g1', correlationId: 'c1' }))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', bans: [] })
    })

    it('maps the fetched ban list to id/tag/reason', async () => {
      const bansMap = new FakeCollection<string, any>([
        ['u1', { user: { id: 'u1', tag: 'Cheater#0001' }, reason: 'cheating' }],
        ['u2', { user: { id: 'u2', tag: 'Griefer#0002' }, reason: null }],
      ])
      const guild = makeGuild('g1', { bans: { fetch: vi.fn().mockResolvedValueOnce(bansMap) } })
      getGuildClientMock.mockResolvedValueOnce(makeGuildClient(guild))

      await processor()(makeJob('guildBans', { guildID: 'g1', correlationId: 'c1' }))

      expect(lastReplyPayload()).toEqual({
        correlationId: 'c1',
        bans: [
          { id: 'u1', tag: 'Cheater#0001', reason: 'cheating' },
          { id: 'u2', tag: 'Griefer#0002', reason: null },
        ],
      })
    })
  })

  describe('guildSendLogMessage', () => {
    function baseData(overrides: Record<string, any> = {}) {
      return {
        guildID: 'g1',
        channelID: 'chan1',
        title: 'Title',
        color: '#ff0000',
        footer: 'Footer',
        correlationId: 'c1',
        ...overrides,
      }
    }

    it('replies sent=false with error when the guild cannot be fetched', async () => {
      const client = makeGuildClient(null)
      client.guilds.fetch = vi.fn().mockRejectedValueOnce(new Error('nope'))
      getGuildClientMock.mockResolvedValueOnce(client)
      await processor()(makeJob('guildSendLogMessage', baseData()))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', sent: false, error: 'Guild not found' })
    })

    it('replies sent=false with error when the channel is not sendable', async () => {
      const channel = makeChannel('chan1', { isSendable: vi.fn().mockReturnValue(false) })
      const guild = makeGuild('g1', { channels: { cache: new FakeCollection([['chan1', channel]]), fetch: vi.fn() } })
      getGuildClientMock.mockResolvedValueOnce(makeGuildClient(guild))
      await processor()(makeJob('guildSendLogMessage', baseData()))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', sent: false, error: 'Channel is not sendable' })
    })

    it('replies sent=false with error when the channel cannot be found at all', async () => {
      const guild = makeGuild('g1', {
        channels: { cache: new FakeCollection(), fetch: vi.fn().mockResolvedValueOnce(undefined) },
      })
      getGuildClientMock.mockResolvedValueOnce(makeGuildClient(guild))
      await processor()(makeJob('guildSendLogMessage', baseData()))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', sent: false, error: 'Channel is not sendable' })
    })

    it('sends the embed (with description) and replies sent=true', async () => {
      const channel = makeChannel('chan1')
      const guild = makeGuild('g1', { channels: { cache: new FakeCollection([['chan1', channel]]), fetch: vi.fn() } })
      getGuildClientMock.mockResolvedValueOnce(makeGuildClient(guild))
      await processor()(makeJob('guildSendLogMessage', baseData({ description: 'Something happened' })))
      expect(channel.send).toHaveBeenCalledWith({ embeds: [expect.anything()] })
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', sent: true })
    })

    it('sends the embed without a description and falls back to channel fetch', async () => {
      const channel = makeChannel('chan1')
      const guild = makeGuild('g1', {
        channels: { cache: new FakeCollection(), fetch: vi.fn().mockResolvedValueOnce(channel) },
      })
      getGuildClientMock.mockResolvedValueOnce(makeGuildClient(guild))
      await processor()(makeJob('guildSendLogMessage', baseData()))
      expect(guild.channels.fetch).toHaveBeenCalledWith('chan1')
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', sent: true })
    })

    it('replies sent=false with the error message when send throws', async () => {
      const channel = makeChannel('chan1')
      channel.send = vi.fn().mockRejectedValueOnce(new Error('rate limited'))
      const guild = makeGuild('g1', { channels: { cache: new FakeCollection([['chan1', channel]]), fetch: vi.fn() } })
      getGuildClientMock.mockResolvedValueOnce(makeGuildClient(guild))
      await processor()(makeJob('guildSendLogMessage', baseData()))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', sent: false, error: 'rate limited' })
    })
  })
})
