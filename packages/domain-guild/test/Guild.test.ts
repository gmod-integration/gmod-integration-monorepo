import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChannelType } from 'discord.js'

vi.mock('@gmod/config', () => ({
  ConfigDiscord: {
    clientID: 'client1',
    botToken: 'bot-token',
    gmodIntegrationLogo: 'logo-url',
    subscriptionSKUID: 'sku1',
  },
}))

const redisMock = { get: vi.fn(), set: vi.fn(), del: vi.fn() }
vi.mock('@gmod/infra-redis', () => ({ default: redisMock }))

const getServersFromDiscordGuildIDMock = vi.fn()
vi.mock('@gmod/domain-server/Server.js', () => ({ getServersFromDiscordGuildID: getServersFromDiscordGuildIDMock }))

const axiosGetMock = vi.fn()
vi.mock('axios', () => ({ default: { get: axiosGetMock } }))

const enqueueDiscordGuildAdminsMock = vi.fn()
const enqueueDiscordGuildBotClientInfoMock = vi.fn()
const enqueueDiscordGuildReloadBotInstanceMock = vi.fn()
const enqueueDiscordGuildSnapshotMock = vi.fn()
const enqueueDiscordGuildUpdateBotProfileMock = vi.fn()
const enqueueMainClientHasGuildMock = vi.fn()
vi.mock('@gmod/infra-bullmq/discordQueueAdapters.js', () => ({
  enqueueDiscordGuildAdmins: enqueueDiscordGuildAdminsMock,
  enqueueDiscordGuildBotClientInfo: enqueueDiscordGuildBotClientInfoMock,
  enqueueDiscordGuildReloadBotInstance: enqueueDiscordGuildReloadBotInstanceMock,
  enqueueDiscordGuildSnapshot: enqueueDiscordGuildSnapshotMock,
  enqueueDiscordGuildUpdateBotProfile: enqueueDiscordGuildUpdateBotProfileMock,
  enqueueMainClientHasGuild: enqueueMainClientHasGuildMock,
}))

const prismaMock: any = {
  gm_guild_settings: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  gm_guild_premium: { findFirst: vi.fn() },
  gm_gmodstore_purchases: { findFirst: vi.fn(), update: vi.fn() },
  gm_guild: { findFirst: vi.fn() },
  gm_guild_verification_check: { findFirst: vi.fn() },
  gm_guild_webooks: { findFirst: vi.fn(), create: vi.fn() },
  gm_server_links: { findMany: vi.fn(), findFirst: vi.fn(), delete: vi.fn(), create: vi.fn() },
  gm_guild_verify_role: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
}
vi.mock('@gmod/infra-prisma', () => ({ default: prismaMock }))

const {
  Guild,
  getDiscordEntitlements,
  isGuildPremium,
  replyNeedPremium,
  handlePremiumInteraction,
  guildSettingExists,
} = await import('../src/Guild.js')

function resetAllMocks() {
  redisMock.get.mockReset()
  redisMock.set.mockReset()
  redisMock.del.mockReset()
  getServersFromDiscordGuildIDMock.mockReset()
  axiosGetMock.mockReset()
  enqueueDiscordGuildAdminsMock.mockReset()
  enqueueDiscordGuildBotClientInfoMock.mockReset()
  enqueueDiscordGuildReloadBotInstanceMock.mockReset()
  enqueueDiscordGuildSnapshotMock.mockReset()
  enqueueDiscordGuildUpdateBotProfileMock.mockReset()
  enqueueMainClientHasGuildMock.mockReset()
  for (const table of Object.values(prismaMock)) {
    for (const fn of Object.values(table as Record<string, any>)) {
      ;(fn as ReturnType<typeof vi.fn>).mockReset()
    }
  }
  vi.stubGlobal('fetch', vi.fn())
}

function makeGuild(overrides: Record<string, any> = {}) {
  return new Guild({ id: 'g1', ...overrides } as any)
}

describe('Guild', () => {
  beforeEach(() => {
    resetAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('constructor', () => {
    it('treats a plain { id } object as having no live discord runtime', () => {
      const guild = makeGuild()
      expect(guild.id).toBe('g1')
      expect(guild.dscGuild).toBeNull()
    })

    it('keeps the live discord.js Guild when channels.cache is present', () => {
      const dscGuild = { id: 'g1', channels: { cache: new Map() } }
      const guild = new Guild(dscGuild as any)
      expect(guild.dscGuild).toBe(dscGuild)
    })
  })

  describe('isPremium / isGuildPremium', () => {
    it('is true when a gm_guild_premium record exists', async () => {
      prismaMock.gm_guild_premium.findFirst.mockResolvedValueOnce({ guildID: 'g1' })
      await expect(makeGuild().isPremium()).resolves.toBe(true)
    })

    it('is true when an active gmodstore purchase exists', async () => {
      prismaMock.gm_guild_premium.findFirst.mockResolvedValueOnce(null)
      prismaMock.gm_gmodstore_purchases.findFirst.mockResolvedValueOnce({ guild: 'g1' })
      await expect(isGuildPremium('g1')).resolves.toBe(true)
    })

    it('returns the cached value from redis when present', async () => {
      prismaMock.gm_guild_premium.findFirst.mockResolvedValueOnce(null)
      prismaMock.gm_gmodstore_purchases.findFirst.mockResolvedValueOnce(null)
      redisMock.get.mockResolvedValueOnce('true')
      await expect(isGuildPremium('g1')).resolves.toBe(true)
    })

    it('fetches entitlements and caches a positive result', async () => {
      prismaMock.gm_guild_premium.findFirst.mockResolvedValueOnce(null)
      prismaMock.gm_gmodstore_purchases.findFirst.mockResolvedValueOnce(null)
      redisMock.get.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
      axiosGetMock.mockResolvedValueOnce({ data: [{ guild_id: 'g1' }] })

      await expect(isGuildPremium('g1')).resolves.toBe(true)
      expect(redisMock.set).toHaveBeenCalledWith('guild:g1:premium', 'true', 'EX', 60)
    })

    it('is false when the entitlements response does not include the guild', async () => {
      prismaMock.gm_guild_premium.findFirst.mockResolvedValueOnce(null)
      prismaMock.gm_gmodstore_purchases.findFirst.mockResolvedValueOnce(null)
      redisMock.get.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
      axiosGetMock.mockResolvedValueOnce({ data: [] })

      await expect(isGuildPremium('g1')).resolves.toBe(false)
    })
  })

  describe('getDiscordEntitlements', () => {
    it('fetches and caches entitlements when not cached', async () => {
      redisMock.get.mockResolvedValueOnce(null)
      axiosGetMock.mockResolvedValueOnce({ data: [{ guild_id: 'g1' }] })

      await expect(getDiscordEntitlements()).resolves.toEqual([{ guild_id: 'g1' }])
      expect(redisMock.set).toHaveBeenCalledWith('discord:entitlements', JSON.stringify([{ guild_id: 'g1' }]), 'EX', 60)
    })

    it('returns the cached entitlements when present', async () => {
      redisMock.get.mockResolvedValueOnce(JSON.stringify([{ guild_id: 'g1' }]))
      await expect(getDiscordEntitlements()).resolves.toEqual([{ guild_id: 'g1' }])
      expect(axiosGetMock).not.toHaveBeenCalled()
    })

    it('returns [] and logs when the request throws', async () => {
      redisMock.get.mockResolvedValueOnce(null)
      axiosGetMock.mockRejectedValueOnce(new Error('network down'))
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await expect(getDiscordEntitlements()).resolves.toEqual([])
      expect(errorSpy).toHaveBeenCalledWith('Error getting entitlements:', expect.any(Error))
    })
  })

  describe('getAllSettings', () => {
    it('coerces boolean-like string values for boolean settings', async () => {
      prismaMock.gm_guild_settings.findMany.mockResolvedValueOnce([
        { setting: 'verification_dont_mp', value: '1' },
        { setting: 'verification_dont_join_support', value: 'false' },
        { setting: 'bot_status', value: 'rotate' },
        { setting: 'totally_unknown', value: 'x' },
      ])

      const settings = await makeGuild().getAllSettings()

      expect(settings.verification_dont_mp).toBe(true)
      expect(settings.verification_dont_join_support).toBe(false)
      expect(settings.bot_status).toBe('rotate')
      expect(settings.totally_unknown).toBe('x')
    })
  })

  describe('canCheckVerif', () => {
    it('is false when the guild has more than 1000 members', async () => {
      prismaMock.gm_guild.findFirst.mockResolvedValueOnce({ member: 1500 })
      await expect(makeGuild().canCheckVerif()).resolves.toBe(false)
    })

    it('is true when there is no prior verification check', async () => {
      prismaMock.gm_guild.findFirst.mockResolvedValueOnce({ member: 10 })
      prismaMock.gm_guild_verification_check.findFirst.mockResolvedValueOnce(null)
      await expect(makeGuild().canCheckVerif()).resolves.toBe(true)
    })

    it('returns the last check when it is older than 24 hours', async () => {
      prismaMock.gm_guild.findFirst.mockResolvedValueOnce({ member: 10 })
      const lastCheck = { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) }
      prismaMock.gm_guild_verification_check.findFirst.mockResolvedValueOnce(lastCheck)
      await expect(makeGuild().canCheckVerif()).resolves.toBe(lastCheck)
    })

    it('is false when the last check is within the last 24 hours', async () => {
      prismaMock.gm_guild.findFirst.mockResolvedValueOnce({ member: 10 })
      const lastCheck = { createdAt: new Date() }
      prismaMock.gm_guild_verification_check.findFirst.mockResolvedValueOnce(lastCheck)
      await expect(makeGuild().canCheckVerif()).resolves.toBe(false)
    })
  })

  describe('getSetting', () => {
    it('throws for an unknown setting', async () => {
      await expect(makeGuild().getSetting('not_real')).rejects.toThrow('Setting not found')
    })

    it('returns the cached value from redis when present', async () => {
      redisMock.get.mockResolvedValueOnce('"disabled"')
      await expect(makeGuild().getSetting('bot_status')).resolves.toBe('disabled')
      expect(prismaMock.gm_guild_settings.findFirst).not.toHaveBeenCalled()
    })

    it('coerces and caches a boolean DB value ("1" -> true)', async () => {
      redisMock.get.mockResolvedValueOnce(null)
      prismaMock.gm_guild_settings.findFirst.mockResolvedValueOnce({ value: '1' })
      await expect(makeGuild().getSetting('verification_dont_mp')).resolves.toBe(true)
      expect(redisMock.set).toHaveBeenCalledWith('server:g1:setting:verification_dont_mp', 'true', 'EX', 10)
    })

    it('coerces and caches a boolean DB value ("0" -> false)', async () => {
      redisMock.get.mockResolvedValueOnce(null)
      prismaMock.gm_guild_settings.findFirst.mockResolvedValueOnce({ value: '0' })
      await expect(makeGuild().getSetting('verification_dont_mp')).resolves.toBe(false)
      expect(redisMock.set).toHaveBeenCalledWith('server:g1:setting:verification_dont_mp', 'false', 'EX', 10)
    })

    it('returns the raw DB value untouched for non-boolean settings', async () => {
      redisMock.get.mockResolvedValueOnce(null)
      prismaMock.gm_guild_settings.findFirst.mockResolvedValueOnce({ value: 'rotate' })
      await expect(makeGuild().getSetting('bot_status')).resolves.toBe('rotate')
    })

    it('falls back to the default value when no DB row exists', async () => {
      redisMock.get.mockResolvedValueOnce(null)
      prismaMock.gm_guild_settings.findFirst.mockResolvedValueOnce(null)
      await expect(makeGuild().getSetting('bot_status')).resolves.toBe('disabled')
    })
  })

  describe('getOrCreateChannelWebhook', () => {
    it('throws when there is no live discord runtime', async () => {
      await expect(makeGuild().getOrCreateChannelWebhook('ch1')).rejects.toThrow('Guild runtime unavailable')
    })

    it('throws when the channel is not found', async () => {
      const dscGuild = { id: 'g1', channels: { cache: { get: vi.fn().mockReturnValueOnce(undefined) } } }
      const guild = new Guild(dscGuild as any)
      prismaMock.gm_guild_webooks.findFirst.mockResolvedValueOnce(null)

      await expect(guild.getOrCreateChannelWebhook('ch1')).rejects.toThrow('Channel not found')
    })

    it('throws when the channel is not a guild text channel', async () => {
      const dscGuild = {
        id: 'g1',
        channels: { cache: { get: vi.fn().mockReturnValueOnce({ type: ChannelType.GuildVoice }) } },
      }
      const guild = new Guild(dscGuild as any)
      prismaMock.gm_guild_webooks.findFirst.mockResolvedValueOnce(null)

      await expect(guild.getOrCreateChannelWebhook('ch1')).rejects.toThrow('Channel is not a guild text channel')
    })

    it('creates a new webhook and persists it when none exists yet', async () => {
      const createWebhook = vi.fn().mockResolvedValueOnce({ id: 'wh1', token: 'tok' })
      const dscGuild = {
        id: 'g1',
        channels: { cache: { get: vi.fn().mockReturnValueOnce({ type: ChannelType.GuildText, createWebhook }) } },
      }
      const guild = new Guild(dscGuild as any)
      prismaMock.gm_guild_webooks.findFirst.mockResolvedValueOnce(null)

      const webhook = await guild.getOrCreateChannelWebhook('ch1')

      expect(createWebhook).toHaveBeenCalledWith({ name: 'Gmod Integration', avatar: 'logo-url' })
      expect(prismaMock.gm_guild_webooks.create).toHaveBeenCalledWith({
        data: { guild: 'g1', channelID: 'ch1', webhookID: 'wh1', webhookToken: 'tok' },
      })
      expect(webhook).toEqual({ id: 'wh1', token: 'tok' })
    })

    it('throws when the stored webhook can no longer be fetched', async () => {
      const dscGuild = {
        id: 'g1',
        channels: { cache: { get: vi.fn().mockReturnValueOnce({ type: ChannelType.GuildText }) } },
        client: { fetchWebhook: vi.fn().mockResolvedValueOnce(null) },
      }
      const guild = new Guild(dscGuild as any)
      prismaMock.gm_guild_webooks.findFirst.mockResolvedValueOnce({ webhookID: 'wh1', webhookToken: 'tok' })

      await expect(guild.getOrCreateChannelWebhook('ch1')).rejects.toThrow('Webhook not found')
    })

    it('returns the existing webhook when it can still be fetched', async () => {
      const fetchWebhook = vi.fn().mockResolvedValueOnce({ id: 'wh1' })
      const dscGuild = {
        id: 'g1',
        channels: { cache: { get: vi.fn().mockReturnValueOnce({ type: ChannelType.GuildText }) } },
        client: { fetchWebhook },
      }
      const guild = new Guild(dscGuild as any)
      prismaMock.gm_guild_webooks.findFirst.mockResolvedValueOnce({ webhookID: 'wh1', webhookToken: 'tok' })

      await expect(guild.getOrCreateChannelWebhook('ch1')).resolves.toEqual({ id: 'wh1' })
      expect(fetchWebhook).toHaveBeenCalledWith('wh1', 'tok')
    })
  })

  describe('setSetting', () => {
    it('throws for an unknown setting', async () => {
      await expect(makeGuild().setSetting('not_real', 1)).rejects.toThrow('Setting not found')
    })

    it('throws for a premium setting on a non-premium guild', async () => {
      prismaMock.gm_guild_premium.findFirst.mockResolvedValueOnce(null)
      prismaMock.gm_gmodstore_purchases.findFirst.mockResolvedValueOnce(null)
      redisMock.get.mockResolvedValueOnce(null)

      await expect(makeGuild().setSetting('verification_dont_mp', true)).rejects.toThrow('Premium setting')
    })

    it('throws for a value outside acceptedValues', async () => {
      prismaMock.gm_guild_premium.findFirst.mockResolvedValueOnce({ guildID: 'g1' })

      await expect(makeGuild().setSetting('bot_status', 'not-a-real-status')).rejects.toThrow('Invalid value')
    })

    it('creates a new row when none exists', async () => {
      prismaMock.gm_guild_premium.findFirst.mockResolvedValueOnce({ guildID: 'g1' })
      prismaMock.gm_guild_settings.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ value: 'rotate' })

      await makeGuild().setSetting('bot_status', 'rotate')

      expect(prismaMock.gm_guild_settings.create).toHaveBeenCalledWith({
        data: { guildID: 'g1', setting: 'bot_status', value: 'rotate' },
      })
      expect(redisMock.del).toHaveBeenCalledWith('server:g1:setting:bot_status')
    })

    it('updates an existing row', async () => {
      prismaMock.gm_guild_premium.findFirst.mockResolvedValueOnce({ guildID: 'g1' })
      prismaMock.gm_guild_settings.findFirst
        .mockResolvedValueOnce({ value: 'disabled' })
        .mockResolvedValueOnce({ value: 'rotate' })

      await makeGuild().setSetting('bot_status', 'rotate')

      expect(prismaMock.gm_guild_settings.update).toHaveBeenCalledWith({
        where: { guildID_setting: { guildID: 'g1', setting: 'bot_status' } },
        data: { value: 'rotate' },
      })
    })
  })

  describe('getServers', () => {
    it('delegates to getServersFromDiscordGuildID', async () => {
      getServersFromDiscordGuildIDMock.mockResolvedValueOnce([{ id: 's1' }])
      await expect(makeGuild().getServers()).resolves.toEqual([{ id: 's1' }])
      expect(getServersFromDiscordGuildIDMock).toHaveBeenCalledWith('g1')
    })
  })

  describe('getCustomBotClient', () => {
    it('always throws (not available outside the discord runtime)', async () => {
      await expect(makeGuild().getCustomBotClient()).rejects.toThrow('Not available outside discord runtime')
    })
  })

  describe('mainBotOnGuild', () => {
    it('delegates to the bullmq adapter', async () => {
      enqueueMainClientHasGuildMock.mockResolvedValueOnce(true)
      await expect(makeGuild().mainBotOnGuild()).resolves.toBe(true)
    })
  })

  describe('getBotRoleSubordination', () => {
    it('throws when the snapshot is not found', async () => {
      enqueueDiscordGuildSnapshotMock.mockResolvedValueOnce(null)
      await expect(makeGuild().getBotRoleSubordination()).rejects.toThrow('Guild not found')
    })

    it('maps role snapshots into a roleID-keyed record', async () => {
      enqueueDiscordGuildSnapshotMock.mockResolvedValueOnce({
        roles: [
          { id: 'r1', name: 'Admin', editable: true },
          { id: 'r2', name: 'Member', editable: false },
        ],
      })

      await expect(makeGuild().getBotRoleSubordination()).resolves.toEqual({
        r1: { name: 'Admin', editable: true },
        r2: { name: 'Member', editable: false },
      })
    })
  })

  describe('getBotClientInfo', () => {
    const user = { steamID64: '765' } as any

    it('throws when the bot client info is not found', async () => {
      enqueueDiscordGuildBotClientInfoMock.mockResolvedValueOnce(null)
      await expect(makeGuild().getBotClientInfo(user)).rejects.toThrow('Bot client not found')
    })

    it('builds the full info payload for a purchased, active, custom bot', async () => {
      enqueueDiscordGuildBotClientInfoMock.mockResolvedValueOnce({
        id: 'bot1',
        username: 'BotName',
        avatar: 'avatar-url',
        custom: true,
        onGuild: true,
      })
      prismaMock.gm_gmodstore_purchases.findFirst
        .mockResolvedValueOnce({ token: 'bot-token-1' }) // activeGuild lookup
        .mockResolvedValueOnce({ steamID64: '765' }) // user purchase lookup
      redisMock.get.mockResolvedValueOnce(null)
      prismaMock.gm_guild_settings.findFirst.mockResolvedValueOnce({ value: 'rotate' })

      const info = await makeGuild().getBotClientInfo(user)

      expect(info).toEqual({
        id: 'bot1',
        username: 'BotName',
        avatar: 'avatar-url',
        custom: true,
        token: 'bot-token-1',
        active: true,
        purchased: true,
        onGuild: true,
        status: 'rotate',
      })
    })

    it('reports not purchased/active and a disabled status when nothing is set up', async () => {
      enqueueDiscordGuildBotClientInfoMock.mockResolvedValueOnce({
        id: 'bot1',
        username: 'BotName',
        avatar: 'avatar-url',
        custom: false,
        onGuild: false,
      })
      prismaMock.gm_gmodstore_purchases.findFirst.mockResolvedValueOnce(null)
      const userNoSteam = {} as any

      const info = await makeGuild().getBotClientInfo(userNoSteam)

      expect(info).toEqual(
        expect.objectContaining({ token: null, active: false, purchased: false, status: 'disabled' }),
      )
    })

    it('falls back to a disabled status when getSetting throws', async () => {
      enqueueDiscordGuildBotClientInfoMock.mockResolvedValueOnce({
        id: 'bot1',
        username: 'BotName',
        avatar: 'avatar-url',
        custom: false,
        onGuild: true,
      })
      prismaMock.gm_gmodstore_purchases.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
      redisMock.get.mockRejectedValueOnce(new Error('redis down'))

      const info = await makeGuild().getBotClientInfo(user)

      expect(info.status).toBe('disabled')
    })
  })

  describe('reloadBotInstance', () => {
    it('delegates to the bullmq adapter', async () => {
      enqueueDiscordGuildReloadBotInstanceMock.mockResolvedValueOnce(undefined)
      await makeGuild().reloadBotInstance()
      expect(enqueueDiscordGuildReloadBotInstanceMock).toHaveBeenCalledWith('g1')
    })
  })

  describe('updateBotInstanceToken', () => {
    it('throws when there is no active gmodstore purchase', async () => {
      prismaMock.gm_gmodstore_purchases.findFirst.mockResolvedValueOnce(null)
      await expect(makeGuild().updateBotInstanceToken('new-token')).rejects.toThrow('Bot client not found')
    })

    it('updates the token and reloads the bot instance', async () => {
      prismaMock.gm_gmodstore_purchases.findFirst.mockResolvedValueOnce({ steamID64: '765' })
      enqueueDiscordGuildReloadBotInstanceMock.mockResolvedValueOnce(undefined)

      await makeGuild().updateBotInstanceToken('new-token')

      expect(prismaMock.gm_gmodstore_purchases.update).toHaveBeenCalledWith({
        where: { steamID64: '765' },
        data: { token: 'new-token' },
      })
      expect(enqueueDiscordGuildReloadBotInstanceMock).toHaveBeenCalledWith('g1')
    })
  })

  describe('updateBotInstanceInfo', () => {
    it('throws when the bullmq update reports failure', async () => {
      enqueueDiscordGuildUpdateBotProfileMock.mockResolvedValueOnce({ updated: false, error: 'nope' })
      await expect(
        makeGuild().updateBotInstanceInfo({ username: 'n', avatar: 'a', token: 't', status: '' }),
      ).rejects.toThrow('nope')
    })

    it('throws a generic message when the bullmq update fails without an error message', async () => {
      enqueueDiscordGuildUpdateBotProfileMock.mockResolvedValueOnce({ updated: false })
      await expect(
        makeGuild().updateBotInstanceInfo({ username: 'n', avatar: 'a', token: 't', status: '' }),
      ).rejects.toThrow('Unable to update bot profile')
    })

    it('updates the status setting when the update succeeds and a status is given', async () => {
      enqueueDiscordGuildUpdateBotProfileMock.mockResolvedValueOnce({ updated: true })
      prismaMock.gm_guild_premium.findFirst.mockResolvedValueOnce({ guildID: 'g1' })
      prismaMock.gm_guild_settings.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ value: 'rotate' })

      await makeGuild().updateBotInstanceInfo({ username: 'n', avatar: 'a', token: 't', status: 'rotate' })

      expect(prismaMock.gm_guild_settings.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ setting: 'bot_status', value: 'rotate' }) }),
      )
    })

    it('does not touch the status setting when no status is given', async () => {
      enqueueDiscordGuildUpdateBotProfileMock.mockResolvedValueOnce({ updated: true })

      await makeGuild().updateBotInstanceInfo({ username: 'n', avatar: 'a', token: 't', status: '' })

      expect(prismaMock.gm_guild_settings.create).not.toHaveBeenCalled()
      expect(prismaMock.gm_guild_settings.update).not.toHaveBeenCalled()
    })
  })

  describe('getAdmins', () => {
    it('delegates to the bullmq adapter', async () => {
      enqueueDiscordGuildAdminsMock.mockResolvedValueOnce([{ id: 'a1' }])
      await expect(makeGuild().getAdmins()).resolves.toEqual([{ id: 'a1' }])
    })
  })

  describe('links', () => {
    it('getLinks queries by guild', async () => {
      prismaMock.gm_server_links.findMany.mockResolvedValueOnce([{ id: 1 }])
      await expect(makeGuild().getLinks()).resolves.toEqual([{ id: 1 }])
    })

    it('getLink parses a string linkID and queries by guild + id', async () => {
      prismaMock.gm_server_links.findFirst.mockResolvedValueOnce({ id: 2 })
      await expect(makeGuild().getLink('2')).resolves.toEqual({ id: 2 })
      expect(prismaMock.gm_server_links.findFirst).toHaveBeenCalledWith({ where: { guild: 'g1', id: 2 } })
    })

    it('getLink accepts a numeric linkID directly', async () => {
      prismaMock.gm_server_links.findFirst.mockResolvedValueOnce({ id: 2 })
      await makeGuild().getLink(2)
      expect(prismaMock.gm_server_links.findFirst).toHaveBeenCalledWith({ where: { guild: 'g1', id: 2 } })
    })

    it('deleteLink parses a string linkID and deletes by guild + id', async () => {
      prismaMock.gm_server_links.delete.mockResolvedValueOnce({ id: 2 })
      await makeGuild().deleteLink('2')
      expect(prismaMock.gm_server_links.delete).toHaveBeenCalledWith({ where: { id: 2, guild: 'g1' } })
    })

    it('deleteLink accepts a numeric linkID directly', async () => {
      prismaMock.gm_server_links.delete.mockResolvedValueOnce({ id: 2 })
      await makeGuild().deleteLink(2)
      expect(prismaMock.gm_server_links.delete).toHaveBeenCalledWith({ where: { id: 2, guild: 'g1' } })
    })

    it('createNewLink creates a row for this guild', async () => {
      prismaMock.gm_server_links.create.mockResolvedValueOnce({ id: 3 })
      await expect(makeGuild().createNewLink()).resolves.toEqual({ id: 3 })
      expect(prismaMock.gm_server_links.create).toHaveBeenCalledWith({ data: { guild: 'g1' } })
    })
  })

  describe('verification roles', () => {
    it('getVerificationRoles queries by guildID', async () => {
      prismaMock.gm_guild_verify_role.findMany.mockResolvedValueOnce([{ id: 1 }])
      await expect(makeGuild().getVerificationRoles()).resolves.toEqual([{ id: 1 }])
    })

    it('getVerificationRole queries by guildID + roleID', async () => {
      prismaMock.gm_guild_verify_role.findFirst.mockResolvedValueOnce({ id: 1 })
      await expect(makeGuild().getVerificationRole('r1')).resolves.toEqual({ id: 1 })
      expect(prismaMock.gm_guild_verify_role.findFirst).toHaveBeenCalledWith({
        where: { guildID: 'g1', roleID: 'r1' },
      })
    })

    it('createVerificationRole creates a row for this guild', async () => {
      prismaMock.gm_guild_verify_role.create.mockResolvedValueOnce({ id: 1 })
      await expect(makeGuild().createVerificationRole('r1')).resolves.toEqual({ id: 1 })
      expect(prismaMock.gm_guild_verify_role.create).toHaveBeenCalledWith({
        data: { guildID: 'g1', roleID: 'r1' },
      })
    })
  })

  describe('replyNeedPremium', () => {
    it('replies with a premium-required message and a premium-SKU button', async () => {
      const reply = vi.fn().mockResolvedValueOnce(undefined)
      const interaction = { reply } as any

      await replyNeedPremium(interaction)

      expect(reply).toHaveBeenCalledWith(
        expect.objectContaining({ ephemeral: true, content: expect.stringContaining('Premium') }),
      )
    })
  })

  describe('handlePremiumInteraction', () => {
    function makeInteraction(overrides: Record<string, any> = {}) {
      return {
        isButton: () => true,
        user: { bot: false },
        guild: { id: 'g1' },
        customId: 'premium',
        reply: vi.fn().mockResolvedValue(undefined),
        ...overrides,
      }
    }

    it('does nothing when the interaction is not a button', async () => {
      const interaction = makeInteraction({ isButton: () => false })
      await handlePremiumInteraction(interaction as any)
      expect(interaction.reply).not.toHaveBeenCalled()
    })

    it('does nothing for bot users', async () => {
      const interaction = makeInteraction({ user: { bot: true } })
      await handlePremiumInteraction(interaction as any)
      expect(interaction.reply).not.toHaveBeenCalled()
    })

    it('does nothing when there is no guild (DM context)', async () => {
      const interaction = makeInteraction({ guild: null })
      await handlePremiumInteraction(interaction as any)
      expect(interaction.reply).not.toHaveBeenCalled()
    })

    it('does nothing for an unrelated customId', async () => {
      const interaction = makeInteraction({ customId: 'other' })
      await handlePremiumInteraction(interaction as any)
      expect(interaction.reply).not.toHaveBeenCalled()
    })

    it('replies with the premium-required message for the premium customId', async () => {
      const interaction = makeInteraction()
      await handlePremiumInteraction(interaction as any)
      expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }))
    })
  })

  describe('guildSettingExists', () => {
    it('is true for a known setting', async () => {
      await expect(guildSettingExists('bot_status')).resolves.toBe(true)
    })

    it('is false for an unknown setting', async () => {
      await expect(guildSettingExists('not_real')).resolves.toBe(false)
    })
  })
})
