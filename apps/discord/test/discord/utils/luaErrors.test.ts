import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChannelType } from 'discord.js'
const mocks = vi.hoisted(() => ({ server: vi.fn(), setting: vi.fn(), client: vi.fn(), erasure: vi.fn() }))
vi.mock('@gmod/infra-prisma', () => ({
  default: { gm_server: { findUnique: mocks.server }, gm_server_settings: { findUnique: mocks.setting } },
}))
vi.mock('@gmod/domain-user/privacy.js', () => ({ isErasureBlocked: mocks.erasure }))
vi.mock('../../../src/discord/index.js', () => ({ getGuildClient: mocks.client }))
const { validateLuaErrorsChannel, sendLuaError } = await import('../../../src/discord/utils/luaErrors.js')
const serverID = 'server-one',
  guildID = '111111111111111111',
  channelID = '222222222222222222',
  botID = '333333333333333333'
const job = {
  serverID,
  errorID: '0123456789abcdef01234567',
  report: { error: 'boom @everyone', stack: 'line1', realm: 'server' as const, count: 3, uptime: 45 },
}
let guild: any, channel: any, member: any, fetchGuild: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.resetAllMocks()
  mocks.server.mockResolvedValue({ id: serverID, guild: guildID, name: 'Test server' })
  mocks.setting.mockResolvedValue({ value: channelID })
  mocks.erasure.mockResolvedValue(false)
  channel = {
    id: channelID,
    guild: { id: guildID },
    type: ChannelType.GuildText,
    permissionsFor: vi.fn().mockReturnValue({ has: vi.fn().mockReturnValue(true) }),
    send: vi.fn().mockResolvedValue({ id: 'message' }),
  }
  member = { id: botID, guild: { id: guildID } }
  guild = {
    id: guildID,
    channels: { fetch: vi.fn().mockImplementation(async () => channel) },
    roles: { fetch: vi.fn().mockResolvedValue(new Map()) },
    members: { fetchMe: vi.fn().mockImplementation(async () => member) },
  }
  fetchGuild = vi.fn().mockImplementation(async () => guild)
  mocks.client.mockResolvedValue({ user: { id: botID }, guilds: { fetch: fetchGuild } })
})
describe('Lua error channel validation', () => {
  it('requires fresh actual-server guild, channel, role and bot permission reads', async () => {
    expect(await validateLuaErrorsChannel(serverID, channelID)).toEqual({ valid: true })
    expect(mocks.server).toHaveBeenCalledWith({
      where: { id: serverID },
      select: { id: true, guild: true, name: true },
    })
    expect(mocks.client).toHaveBeenCalledWith(guildID, false)
    expect(fetchGuild).toHaveBeenCalledWith({ guild: guildID, force: true })
    expect(guild.channels.fetch).toHaveBeenCalledWith(channelID, { force: true, cache: false })
    expect(guild.roles.fetch).toHaveBeenCalledOnce()
    expect(guild.members.fetchMe).toHaveBeenCalledWith({ force: true })
  })
  it('does not invent a server or guild provider context', async () => {
    mocks.server.mockResolvedValueOnce(null)
    expect(await validateLuaErrorsChannel(serverID, channelID)).toEqual({ valid: false, reason: 'server_not_found' })
    guild = null
    expect(await validateLuaErrorsChannel(serverID, channelID)).toEqual({
      valid: false,
      reason: 'provider_unavailable',
    })
  })
  it.each([
    'foreign guild',
    'foreign channel ID',
    'foreign channel guild',
    'deleted channel',
    'unknown channel',
    'nontext channel',
  ])('rejects %s before attempting publication', async (kind) => {
    let reason = 'channel_not_found'
    if (kind === 'foreign guild') {
      guild.id = 'foreign'
      reason = 'provider_unavailable'
    }
    if (kind === 'foreign channel ID') channel.id = 'foreign'
    if (kind === 'foreign channel guild') channel.guild.id = 'foreign'
    if (kind === 'deleted channel') channel = null
    if (kind === 'unknown channel') guild.channels.fetch.mockRejectedValueOnce({ code: 10003 })
    if (kind === 'nontext channel') {
      channel.type = ChannelType.GuildVoice
      reason = 'unsupported_channel'
    }
    expect(await validateLuaErrorsChannel(serverID, channelID)).toEqual({ valid: false, reason })
  })
  it.each(['missing permission', 'no permissions', 'foreign bot member', 'foreign bot guild', 'missing bot identity'])(
    'rejects %s',
    async (kind) => {
      if (kind === 'missing permission') channel.permissionsFor.mockReturnValue({ has: () => false })
      if (kind === 'no permissions') channel.permissionsFor.mockReturnValue(null)
      if (kind === 'foreign bot member') member.id = 'foreign'
      if (kind === 'foreign bot guild') member.guild.id = 'foreign'
      if (kind === 'missing bot identity') mocks.client.mockResolvedValueOnce({ guilds: { fetch: fetchGuild } })
      expect(await validateLuaErrorsChannel(serverID, channelID)).toEqual({
        valid: false,
        reason: 'missing_permissions',
      })
    },
  )
  it.each([null, 'network failed', { code: 50001 }, { code: 50013 }, new Error('private provider detail')])(
    'returns only safe provider failure metadata (%j)',
    async (error) => {
      guild.channels.fetch.mockRejectedValueOnce(error)
      expect(await validateLuaErrorsChannel(serverID, channelID)).toEqual({
        valid: false,
        reason:
          error && typeof error === 'object' && 'code' in error && (error.code === 50001 || error.code === 50013)
            ? 'missing_permissions'
            : 'provider_unavailable',
      })
    },
  )
})
describe('Lua error Discord publication', () => {
  it.each(['client', 'server'] as const)(
    'sends saved %s errors with source/count/server metadata and mentions disabled',
    async (realm) => {
      await sendLuaError({ ...job, report: { ...job.report, realm } })
      const message = channel.send.mock.calls[0][0],
        embed = message.embeds[0].toJSON()
      expect(message.allowedMentions).toEqual({ parse: [] })
      expect(embed.title).toBe('Lua error — Test server')
      expect(embed.description).toContain(realm === 'client' ? 'Player client' : 'Game server')
      expect(embed.description).toContain('boom @everyone')
      expect(embed.description).toContain('line1')
      expect(embed.description).toContain('Occurrences:** 3')
      expect(embed.footer.text).toContain(serverID)
      expect(mocks.setting).toHaveBeenCalledTimes(2)
      expect(mocks.erasure).toHaveBeenCalledTimes(2)
    },
  )
  it('bounds all Discord payload fields and keeps backticks inside code fences', async () => {
    mocks.server.mockResolvedValueOnce({ id: 's'.repeat(255), guild: guildID, name: 'n'.repeat(1000) })
    await sendLuaError({
      ...job,
      report: { ...job.report, error: '```'.repeat(2000), stack: 's'.repeat(20000), name: 'n'.repeat(1000) },
    })
    const embed = channel.send.mock.calls[0][0].embeds[0].toJSON()
    expect(embed.title.length).toBe(256)
    expect(embed.description.length).toBeLessThanOrEqual(4096)
    expect(embed.description.match(/```/g)).toHaveLength(4)
    expect(embed.footer.text.length).toBeLessThanOrEqual(512)
  })
  it.each([null, { value: '' }, { value: 'invalid' }])(
    'skips unconfigured or broken destinations (%j)',
    async (value) => {
      mocks.setting.mockResolvedValueOnce(value)
      await sendLuaError(job)
      expect(mocks.client).not.toHaveBeenCalled()
      expect(channel.send).not.toHaveBeenCalled()
    },
  )
  it.each(['removed', 'changed'] as const)(
    'does not send to a destination %s during provider lookup',
    async (change) => {
      mocks.setting
        .mockResolvedValueOnce({ value: channelID })
        .mockResolvedValueOnce(change === 'removed' ? null : { value: '444444444444444444' })
      await sendLuaError(job)
      expect(channel.send).not.toHaveBeenCalled()
    },
  )
  it('does not send to a deleted channel or deleted server', async () => {
    guild.channels.fetch.mockResolvedValueOnce(null)
    await sendLuaError(job)
    mocks.server.mockResolvedValueOnce(null)
    await sendLuaError(job)
    expect(channel.send).not.toHaveBeenCalled()
  })
  it.each(['initial', 'after lookup'] as const)('does not publish erased data %s', async (stage) => {
    mocks.erasure.mockResolvedValueOnce(stage === 'initial').mockResolvedValueOnce(true)
    await sendLuaError({ ...job, report: { ...job.report, steamID64: '76561198000000001' } })
    expect(mocks.erasure).toHaveBeenCalledWith(undefined, '76561198000000001')
    expect(channel.send).not.toHaveBeenCalled()
    if (stage === 'initial') expect(mocks.setting).not.toHaveBeenCalled()
  })
  it('falls back to the server ID without inventing addon metadata', async () => {
    mocks.server.mockResolvedValueOnce({ id: serverID, guild: guildID, name: null })
    await sendLuaError(job)
    expect(channel.send.mock.calls[0][0].embeds[0].toJSON().title).toContain(serverID)
    expect(channel.send.mock.calls[0][0].embeds[0].toJSON().description).toContain('Unknown addon')
  })
  it.each(['lookup', 'send'] as const)(
    'preserves saved history after a %s outage and does not retry',
    async (stage) => {
      if (stage === 'lookup') mocks.client.mockRejectedValueOnce(new Error('private token'))
      else channel.send.mockRejectedValueOnce(new Error('private token'))
      await expect(sendLuaError(job)).resolves.toBeUndefined()
      expect(channel.send).toHaveBeenCalledTimes(stage === 'send' ? 1 : 0)
    },
  )
})
