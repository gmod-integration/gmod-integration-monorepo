import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChannelType } from 'discord.js'

vi.mock('@gmod/core/utils/tools.js', () => ({ generateToken: vi.fn(() => 'generated-token') }))
vi.mock('@gmod/core/utils/logger.js', () => ({ gmLog: vi.fn() }))
vi.mock('@gmod/config', () => ({
  ConfigDiscord: { clientID: 'client1', botToken: 'bot-token' },
}))

const redisMock = { get: vi.fn(), set: vi.fn(), del: vi.fn() }
vi.mock('@gmod/infra-redis', () => ({ default: redisMock }))

const wsAddMock = vi.fn()
vi.mock('@gmod/infra-websocket/queues.js', () => ({ wsSendToServerQueue: { add: wsAddMock } }))

const statusChannelMock = {
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}
vi.mock('../src/ServerStatusChannel.js', () => ({ ServerStatusChannel: statusChannelMock }))

const resolveDiscordGuildClientMock = vi.fn()
const buildDiscordStatusMessageMock = vi.fn()
vi.mock('../src/discordBridge.js', () => ({
  resolveDiscordGuildClient: resolveDiscordGuildClientMock,
  buildDiscordStatusMessage: buildDiscordStatusMessageMock,
}))

const prismaMock: any = {
  gm_server_settings: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  gm_guild_premium: { findFirst: vi.fn() },
  gm_gmodstore_purchases: { findFirst: vi.fn() },
  gm_server_sync_chat_filter: { findMany: vi.fn() },
  gm_status: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), delete: vi.fn() },
  gm_server_status: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  gm_server_status_history: { create: vi.fn() },
  gm_server: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn(), create: vi.fn() },
  gm_status_button: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() },
  gm_server_stat: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn(), findMany: vi.fn() },
  gm_server_screenshot_channels: { findFirst: vi.fn(), delete: vi.fn(), create: vi.fn() },
  gm_server_logs_channel: { findFirst: vi.fn(), delete: vi.fn(), create: vi.fn() },
  gm_server_vote_channels: { findFirst: vi.fn(), delete: vi.fn(), create: vi.fn() },
  gm_sync_chat: { findFirst: vi.fn(), delete: vi.fn(), create: vi.fn() },
  gm_server_sync_roles: { findMany: vi.fn() },
  gm_server_sync_team_roles: { findMany: vi.fn() },
  gm_server_logs_triggers: { findMany: vi.fn(), findFirst: vi.fn(), delete: vi.fn(), create: vi.fn(), update: vi.fn() },
}
vi.mock('@gmod/infra-prisma', () => ({ default: prismaMock }))

const { Server, getServerFromID, getServersFromDiscordGuildID, createServer, generateServerUniqueID, statusRoutine } =
  await import('../src/Server.js')

function resetAllMocks() {
  redisMock.get.mockReset()
  redisMock.set.mockReset()
  redisMock.del.mockReset()
  wsAddMock.mockReset()
  statusChannelMock.get.mockReset()
  statusChannelMock.create.mockReset()
  statusChannelMock.update.mockReset()
  statusChannelMock.delete.mockReset()
  resolveDiscordGuildClientMock.mockReset()
  buildDiscordStatusMessageMock.mockReset()
  for (const table of Object.values(prismaMock)) {
    for (const fn of Object.values(table as Record<string, any>)) {
      ;(fn as ReturnType<typeof vi.fn>).mockReset()
    }
  }
  vi.stubGlobal('fetch', vi.fn())
}

function makeServer(overrides: Record<string, any> = {}) {
  return new Server({
    token: 'tok1',
    id: 's1',
    guild: 'g1',
    name: 'My Server',
    ip: '127.0.0.1',
    port: '27015',
    image: '',
    verified: true,
    publicTempToken: 'pub-tok',
    description: 'desc',
    isPublic: true,
    ...overrides,
  })
}

describe('Server', () => {
  beforeEach(() => {
    resetAllMocks()
  })

  afterEach(() => {
    // vi.spyOn(console, 'error'/'log') is used throughout this file - restore between tests so
    // spy call counts don't accumulate across unrelated tests.
    vi.restoreAllMocks()
  })

  describe('simple getters', () => {
    it('exposes basic getters and isValidToken', () => {
      const server = makeServer()
      expect(server.getName()).toBe('My Server')
      expect(server.getID()).toBe('s1')
      expect(server.getGuildID()).toBe('g1')
      expect(server.getPublicToken()).toBe('pub-tok')
      expect(server.getToken()).toBe('tok1')
      expect(server.isValidToken('tok1')).toBe(true)
      expect(server.isValidToken('wrong')).toBe(false)
    })
  })

  describe('isPremium / isGuildPremiumForServer', () => {
    it('is true when a gm_guild_premium record exists', async () => {
      prismaMock.gm_guild_premium.findFirst.mockResolvedValueOnce({ guildID: 'g1' })
      await expect(makeServer().isPremium()).resolves.toBe(true)
    })

    it('is true when an active gmodstore purchase exists', async () => {
      prismaMock.gm_guild_premium.findFirst.mockResolvedValueOnce(null)
      prismaMock.gm_gmodstore_purchases.findFirst.mockResolvedValueOnce({ guild: 'g1' })
      await expect(makeServer().isPremium()).resolves.toBe(true)
    })

    it('returns the cached value from redis when present', async () => {
      prismaMock.gm_guild_premium.findFirst.mockResolvedValueOnce(null)
      prismaMock.gm_gmodstore_purchases.findFirst.mockResolvedValueOnce(null)
      redisMock.get.mockResolvedValueOnce('true')
      await expect(makeServer().isPremium()).resolves.toBe(true)
    })

    it('is false when Discord client credentials are not configured', async () => {
      prismaMock.gm_guild_premium.findFirst.mockResolvedValueOnce(null)
      prismaMock.gm_gmodstore_purchases.findFirst.mockResolvedValueOnce(null)
      redisMock.get.mockResolvedValueOnce(null)
      const { ConfigDiscord } = await import('@gmod/config')
      const original = ConfigDiscord.clientID
      ;(ConfigDiscord as any).clientID = ''
      try {
        await expect(makeServer().isPremium()).resolves.toBe(false)
      } finally {
        ;(ConfigDiscord as any).clientID = original
      }
    })

    it('fetches Discord entitlements and caches a positive result', async () => {
      prismaMock.gm_guild_premium.findFirst.mockResolvedValueOnce(null)
      prismaMock.gm_gmodstore_purchases.findFirst.mockResolvedValueOnce(null)
      redisMock.get.mockResolvedValueOnce(null)
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, json: async () => [{ guild_id: 'g1' }] }),
      )

      await expect(makeServer().isPremium()).resolves.toBe(true)
      expect(redisMock.set).toHaveBeenCalledWith('guild:g1:premium', 'true', 'EX', 60)
    })

    it('is false when the entitlements response does not include the guild', async () => {
      prismaMock.gm_guild_premium.findFirst.mockResolvedValueOnce(null)
      prismaMock.gm_gmodstore_purchases.findFirst.mockResolvedValueOnce(null)
      redisMock.get.mockResolvedValueOnce(null)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }))

      await expect(makeServer().isPremium()).resolves.toBe(false)
    })

    it('is false when the Discord API responds with a non-ok status', async () => {
      prismaMock.gm_guild_premium.findFirst.mockResolvedValueOnce(null)
      prismaMock.gm_gmodstore_purchases.findFirst.mockResolvedValueOnce(null)
      redisMock.get.mockResolvedValueOnce(null)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))

      await expect(makeServer().isPremium()).resolves.toBe(false)
    })

    it('is false and logs when the fetch throws', async () => {
      prismaMock.gm_guild_premium.findFirst.mockResolvedValueOnce(null)
      prismaMock.gm_gmodstore_purchases.findFirst.mockResolvedValueOnce(null)
      redisMock.get.mockResolvedValueOnce(null)
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await expect(makeServer().isPremium()).resolves.toBe(false)
      expect(errorSpy).toHaveBeenCalledWith('Error getting entitlements:', expect.any(Error))
    })
  })

  describe('saveIGSettings', () => {
    it('sets each setting with the ig_ prefix, swallowing individual failures', async () => {
      const server = makeServer()
      const spy = vi.spyOn(server, 'setSetting').mockResolvedValueOnce({} as any).mockRejectedValueOnce(new Error('x'))

      await server.saveIGSettings({ debug: true, maintenance: false })

      expect(spy).toHaveBeenNthCalledWith(1, 'ig_debug', true)
      expect(spy).toHaveBeenNthCalledWith(2, 'ig_maintenance', false)
    })
  })

  describe('status channel delegation', () => {
    it('getStatusChannel/putStatusChannel/deleteStatusChannel/postStatusChannel delegate to ServerStatusChannel', async () => {
      const server = makeServer()
      statusChannelMock.get.mockResolvedValueOnce('got')
      statusChannelMock.update.mockResolvedValueOnce('updated')
      statusChannelMock.delete.mockResolvedValueOnce(undefined)
      statusChannelMock.create.mockResolvedValueOnce('created')

      await expect(server.getStatusChannel()).resolves.toBe('got')
      await expect(server.putStatusChannel('ch1', 'fmt')).resolves.toBe('updated')
      await expect(server.deleteStatusChannel()).resolves.toBeUndefined()
      await expect(server.postStatusChannel('ch1', 'fmt')).resolves.toBe('created')

      expect(statusChannelMock.get).toHaveBeenCalledWith(server)
      expect(statusChannelMock.update).toHaveBeenCalledWith(server, 'ch1', 'fmt')
      expect(statusChannelMock.delete).toHaveBeenCalledWith(server)
      expect(statusChannelMock.create).toHaveBeenCalledWith(server, 'ch1', 'fmt')
    })
  })

  describe('getAllSettings / getAllIGSettings', () => {
    it('fills in defaults for unset settings when evenNotSet is true', async () => {
      prismaMock.gm_server_settings.findMany.mockResolvedValueOnce([])
      const settings = await makeServer().getAllSettings(true)
      expect(settings.ig_debug).toBe(false)
      expect(settings.sync_role_direction).toBe('gmod-to-discord')
    })

    it('does not include defaults when evenNotSet is false', async () => {
      prismaMock.gm_server_settings.findMany.mockResolvedValueOnce([])
      const settings = await makeServer().getAllSettings()
      expect(settings).toEqual({})
    })

    it('coerces "0"/"1"/"false"/"true" string values to booleans for boolean settings', async () => {
      prismaMock.gm_server_settings.findMany.mockResolvedValueOnce([
        { setting: 'ig_debug', value: '1' },
        { setting: 'ig_maintenance', value: 'true' },
        { setting: 'chat_sync_relay_all', value: '0' },
        { setting: 'sync_chat_prevent_ping', value: 'false' },
        { setting: 'pseudoFormat', value: 'custom' },
        // acceptedValues here has no boolean members, so `.includes(true)` is false and
        // `.includes(false)` must also be evaluated - covers the right side of that `||`.
        { setting: 'sync_role_direction', value: 'both' },
      ])

      const settings = await makeServer().getAllSettings()
      expect(settings.ig_debug).toBe(true)
      expect(settings.ig_maintenance).toBe(true)
      expect(settings.chat_sync_relay_all).toBe(false)
      expect(settings.sync_chat_prevent_ping).toBe(false)
      expect(settings.pseudoFormat).toBe('custom')
      expect(settings.sync_role_direction).toBe('both')
    })

    it('leaves values for unknown settings untouched', async () => {
      prismaMock.gm_server_settings.findMany.mockResolvedValueOnce([{ setting: 'totally_unknown', value: 'x' }])
      const settings = await makeServer().getAllSettings()
      expect(settings.totally_unknown).toBe('x')
    })

    it('getAllIGSettings only returns ig_-prefixed settings', async () => {
      prismaMock.gm_server_settings.findMany.mockResolvedValueOnce([])
      const settings = await makeServer().getAllIGSettings()
      expect(Object.keys(settings).every((key) => key.startsWith('ig_'))).toBe(true)
      expect(settings.ig_debug).toBe(false)
      expect(settings.sync_role_direction).toBeUndefined()
    })
  })

  describe('getSetting', () => {
    it('throws for an unknown setting', async () => {
      await expect(makeServer().getSetting('not_a_real_setting')).rejects.toThrow('Setting not found')
    })

    it('returns the cached value from redis when present', async () => {
      redisMock.get.mockResolvedValueOnce('"cached-value"')
      await expect(makeServer().getSetting('pseudoFormat')).resolves.toBe('cached-value')
      expect(prismaMock.gm_server_settings.findFirst).not.toHaveBeenCalled()
    })

    it('coerces and caches a boolean DB value', async () => {
      redisMock.get.mockResolvedValueOnce(null)
      prismaMock.gm_server_settings.findFirst.mockResolvedValueOnce({ value: '1' })
      await expect(makeServer().getSetting('ig_debug')).resolves.toBe(true)
      expect(redisMock.set).toHaveBeenCalledWith('server:s1:setting:ig_debug', 'true', 'EX', 10)
    })

    it('returns the raw DB value untouched for non-boolean settings', async () => {
      redisMock.get.mockResolvedValueOnce(null)
      prismaMock.gm_server_settings.findFirst.mockResolvedValueOnce({ value: 'custom-format' })
      await expect(makeServer().getSetting('pseudoFormat')).resolves.toBe('custom-format')
    })

    it('falls back to the default value when no DB row exists', async () => {
      redisMock.get.mockResolvedValueOnce(null)
      prismaMock.gm_server_settings.findFirst.mockResolvedValueOnce(null)
      await expect(makeServer().getSetting('ig_language')).resolves.toBe('en')
    })
  })

  describe('setSetting', () => {
    it('throws for an unknown setting', async () => {
      await expect(makeServer().setSetting('not_a_real_setting', 1)).rejects.toThrow('Setting not found')
    })

    it('throws for a premium setting on a non-premium server', async () => {
      redisMock.get.mockResolvedValue(null)
      prismaMock.gm_server_settings.findFirst.mockResolvedValue(null)
      prismaMock.gm_guild_premium.findFirst.mockResolvedValueOnce(null)
      prismaMock.gm_gmodstore_purchases.findFirst.mockResolvedValueOnce(null)

      await expect(makeServer().setSetting('show_status_chart', true)).rejects.toThrow('Premium setting')
    })

    it('throws for a value outside acceptedValues', async () => {
      redisMock.get.mockResolvedValue(null)
      prismaMock.gm_server_settings.findFirst.mockResolvedValue(null)

      await expect(makeServer().setSetting('sync_role_direction', 'sideways')).rejects.toThrow('Invalid value')
    })

    it('creates a new row when none exists, stringifying object values', async () => {
      redisMock.get.mockResolvedValue(null)
      // setSetting() calls getSetting() (findFirst #1, for previousValue), then its own
      // existence check (findFirst #2, null -> create path), then getSetting() again for the
      // returned value (findFirst #3, now populated).
      prismaMock.gm_server_settings.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ value: '{"a":1}' })

      await makeServer().setSetting('ig_adminRank', { a: 1 })

      expect(prismaMock.gm_server_settings.create).toHaveBeenCalledWith({
        data: { serverID: 's1', setting: 'ig_adminRank', value: '{"a":1}' },
      })
      expect(redisMock.del).toHaveBeenCalledWith('server:s1:setting:ig_adminRank')
    })

    it('updates an existing row, stringifying non-object values', async () => {
      redisMock.get.mockResolvedValue(null)
      prismaMock.gm_server_settings.findFirst
        .mockResolvedValueOnce({ value: 'gmod-to-discord' })
        .mockResolvedValueOnce({ value: 'both' })

      await makeServer().setSetting('sync_role_direction', 'both')

      expect(prismaMock.gm_server_settings.update).toHaveBeenCalledWith({
        where: { serverID_setting: { serverID: 's1', setting: 'sync_role_direction' } },
        data: { value: 'both' },
      })
    })

    it('triggers onChange for settings that define one', async () => {
      redisMock.get.mockResolvedValue(null)
      prismaMock.gm_server_settings.findFirst.mockResolvedValue({ value: 'false' })
      const server = makeServer()
      const editSpy = vi.spyOn(server, 'editStatusChannelAndMessage').mockResolvedValueOnce(undefined)
      vi.spyOn(server, 'getStatusData').mockResolvedValueOnce({} as any)

      await server.setSetting('show_player_list_status', true)

      expect(editSpy).toHaveBeenCalled()
    })

    it('triggers onChange for status_player_list_format', async () => {
      redisMock.get.mockResolvedValue(null)
      prismaMock.gm_server_settings.findFirst.mockResolvedValue({ value: 'old-format' })
      const server = makeServer()
      const editSpy = vi.spyOn(server, 'editStatusChannelAndMessage').mockResolvedValueOnce(undefined)
      vi.spyOn(server, 'getStatusData').mockResolvedValueOnce({} as any)

      await server.setSetting('status_player_list_format', 'new-format')

      expect(editSpy).toHaveBeenCalled()
    })

    it('triggers onChange for show_status_chart on a premium server', async () => {
      redisMock.get.mockResolvedValue(null)
      prismaMock.gm_server_settings.findFirst.mockResolvedValue({ value: 'false' })
      prismaMock.gm_guild_premium.findFirst.mockResolvedValueOnce({ guildID: 'g1' })
      const server = makeServer()
      const editSpy = vi.spyOn(server, 'editStatusChannelAndMessage').mockResolvedValueOnce(undefined)
      vi.spyOn(server, 'getStatusData').mockResolvedValueOnce({} as any)

      await server.setSetting('show_status_chart', true)

      expect(editSpy).toHaveBeenCalled()
    })

    it('skips onChange for dashboard-status-settings updated from the dashboard', async () => {
      redisMock.get.mockResolvedValue(null)
      prismaMock.gm_server_settings.findFirst.mockResolvedValue({ value: 'false' })
      const server = makeServer()
      const editSpy = vi.spyOn(server, 'editStatusChannelAndMessage').mockResolvedValueOnce(undefined)

      await server.setSetting('show_player_list_status', true, 'dashboard')

      expect(editSpy).not.toHaveBeenCalled()
    })

    it('pushes a websocket update when an ig_ setting is changed from the dashboard', async () => {
      redisMock.get.mockResolvedValue(null)
      prismaMock.gm_server_settings.findFirst.mockResolvedValue({ value: 'false' })

      await makeServer().setSetting('ig_debug', true, 'dashboard')

      expect(wsAddMock).toHaveBeenCalledWith(
        'wsSendToServer',
        expect.objectContaining({ id: 's1', data: expect.objectContaining({ method: 'wsEditSetting', setting: 'ig_debug' }) }),
      )
    })

    it('does not push a websocket update for a non-ig_ dashboard setting', async () => {
      redisMock.get.mockResolvedValue(null)
      prismaMock.gm_server_settings.findFirst.mockResolvedValue({ value: 'both' })

      await makeServer().setSetting('sync_role_direction', 'both', 'dashboard')

      expect(wsAddMock).not.toHaveBeenCalled()
    })
  })

  describe('getGmodToDiscordFilter', () => {
    it('returns the cached value from redis when present', async () => {
      redisMock.get.mockResolvedValueOnce('[{"id":1}]')
      await expect(makeServer().getGmodToDiscordFilter()).resolves.toEqual([{ id: 1 }])
    })

    it('caches and returns the DB result when found', async () => {
      redisMock.get.mockResolvedValueOnce(null)
      prismaMock.gm_server_sync_chat_filter.findMany.mockResolvedValueOnce([{ id: 1 }])
      await expect(makeServer().getGmodToDiscordFilter()).resolves.toEqual([{ id: 1 }])
      expect(redisMock.set).toHaveBeenCalled()
    })
  })

  describe('simple wrappers', () => {
    it('getStatusChannelAndMessage / getStatusData query the expected tables', async () => {
      prismaMock.gm_status.findFirst.mockResolvedValueOnce({ id: 1 })
      prismaMock.gm_server_status.findFirst.mockResolvedValueOnce({ id: 2 })
      await expect(makeServer().getStatusChannelAndMessage()).resolves.toEqual({ id: 1 })
      await expect(makeServer().getStatusData()).resolves.toEqual({ id: 2 })
    })

    it('regeneratePublicTempToken/regenerateToken persist a fresh token', async () => {
      const server = makeServer()
      await server.regeneratePublicTempToken()
      expect(server.publicTempToken).toBe('generated-token')
      await server.regenerateToken()
      expect(server.token).toBe('generated-token')
    })

    it('getServerStatusButtons queries enabled buttons for this server', async () => {
      prismaMock.gm_status_button.findMany.mockResolvedValueOnce([{ id: 1 }])
      await expect(makeServer().getServerStatusButtons()).resolves.toEqual([{ id: 1 }])
    })

    it('getPublicInformations returns the public-safe fields', async () => {
      const info = await makeServer().getPublicInformations()
      expect(info).toEqual(
        expect.objectContaining({ id: 's1', name: 'My Server', guild: 'g1', verified: true }),
      )
    })

    it('getDBPlayers/getPlayerStats query gm_server_stat', async () => {
      prismaMock.gm_server_stat.findMany.mockResolvedValueOnce([{ id: 1 }])
      prismaMock.gm_server_stat.findFirst.mockResolvedValueOnce({ id: 2 })
      await expect(makeServer().getDBPlayers()).resolves.toEqual([{ id: 1 }])
      await expect(makeServer().getPlayerStats('765')).resolves.toEqual({ id: 2 })
    })
  })

  describe('getBotInstance / getDiscordGuild', () => {
    it('getBotInstance resolves via the discord bridge', async () => {
      resolveDiscordGuildClientMock.mockResolvedValueOnce({ id: 'client' })
      await expect(makeServer().getBotInstance()).resolves.toEqual({ id: 'client' })
    })

    it('getDiscordGuild throws when the guild is not found', async () => {
      resolveDiscordGuildClientMock.mockResolvedValueOnce({ guilds: { fetch: vi.fn().mockResolvedValueOnce(null) } })
      await expect(makeServer().getDiscordGuild()).rejects.toThrow('Guild not found')
    })

    it('getDiscordGuild returns the fetched guild', async () => {
      resolveDiscordGuildClientMock.mockResolvedValueOnce({
        guilds: { fetch: vi.fn().mockResolvedValueOnce({ id: 'g1' }) },
      })
      await expect(makeServer().getDiscordGuild()).resolves.toEqual({ id: 'g1' })
    })
  })

  describe('deleteStatus', () => {
    it('returns early when there is no status record', async () => {
      prismaMock.gm_status.findFirst.mockResolvedValueOnce(null)
      await expect(makeServer().deleteStatus()).resolves.toBeUndefined()
      expect(prismaMock.gm_status.delete).not.toHaveBeenCalled()
    })

    it('deletes the Discord message and the DB record when everything is found', async () => {
      prismaMock.gm_status.findFirst.mockResolvedValueOnce({ channel: 'ch1', message: 'm1' })
      const deleteMsg = vi.fn().mockResolvedValue(undefined)
      resolveDiscordGuildClientMock.mockResolvedValueOnce({
        guilds: {
          fetch: vi.fn().mockResolvedValueOnce({
            channels: {
              cache: {
                get: vi.fn().mockReturnValueOnce({
                  isTextBased: () => true,
                  messages: { fetch: vi.fn().mockResolvedValueOnce({ delete: deleteMsg }) },
                }),
              },
            },
          }),
        },
      })
      prismaMock.gm_status.delete.mockResolvedValueOnce({})

      const result = await makeServer().deleteStatus()

      expect(deleteMsg).toHaveBeenCalled()
      expect(prismaMock.gm_status.delete).toHaveBeenCalledWith({ where: { server: 's1' } })
      expect(result).toEqual({ channel: 'ch1', message: 'm1' })
    })

    it('still deletes the DB record when fetching the Discord guild/channel/message fails', async () => {
      prismaMock.gm_status.findFirst.mockResolvedValueOnce({ channel: 'ch1', message: 'm1' })
      resolveDiscordGuildClientMock.mockRejectedValueOnce(new Error('discord down'))
      prismaMock.gm_status.delete.mockResolvedValueOnce({})

      await expect(makeServer().deleteStatus()).resolves.toEqual({ channel: 'ch1', message: 'm1' })
      expect(prismaMock.gm_status.delete).toHaveBeenCalled()
    })

    it('skips deleting the Discord message when the guild is missing', async () => {
      prismaMock.gm_status.findFirst.mockResolvedValueOnce({ channel: 'ch1', message: 'm1' })
      resolveDiscordGuildClientMock.mockResolvedValueOnce({ guilds: { fetch: vi.fn().mockResolvedValueOnce(null) } })
      prismaMock.gm_status.delete.mockResolvedValueOnce({})

      await makeServer().deleteStatus()
      expect(prismaMock.gm_status.delete).toHaveBeenCalled()
    })

    it('bails out of the whole function (bare `return`, not just the try block) when the channel is missing', async () => {
      prismaMock.gm_status.findFirst.mockResolvedValueOnce({ channel: 'ch1', message: 'm1' })
      resolveDiscordGuildClientMock.mockResolvedValueOnce({
        guilds: {
          fetch: vi.fn().mockResolvedValueOnce({ channels: { cache: { get: vi.fn().mockReturnValueOnce(undefined) } } }),
        },
      })

      const result = await makeServer().deleteStatus()
      // `if (!channel) return` inside deleteStatus() is a bare return, not scoped to the try
      // block - unlike a thrown-and-caught error, it exits before reaching the DB delete call.
      expect(result).toBeUndefined()
      expect(prismaMock.gm_status.delete).not.toHaveBeenCalled()
    })

    it('skips deleting the Discord message when the channel is not text based', async () => {
      prismaMock.gm_status.findFirst.mockResolvedValueOnce({ channel: 'ch1', message: 'm1' })
      resolveDiscordGuildClientMock.mockResolvedValueOnce({
        guilds: {
          fetch: vi.fn().mockResolvedValueOnce({
            channels: { cache: { get: vi.fn().mockReturnValueOnce({ isTextBased: () => false }) } },
          }),
        },
      })
      prismaMock.gm_status.delete.mockResolvedValueOnce({})

      await makeServer().deleteStatus()
      expect(prismaMock.gm_status.delete).toHaveBeenCalled()
    })

    it('skips deleting when the message itself is not found', async () => {
      prismaMock.gm_status.findFirst.mockResolvedValueOnce({ channel: 'ch1', message: 'm1' })
      resolveDiscordGuildClientMock.mockResolvedValueOnce({
        guilds: {
          fetch: vi.fn().mockResolvedValueOnce({
            channels: {
              cache: {
                get: vi.fn().mockReturnValueOnce({
                  isTextBased: () => true,
                  messages: { fetch: vi.fn().mockResolvedValueOnce(null) },
                }),
              },
            },
          }),
        },
      })
      prismaMock.gm_status.delete.mockResolvedValueOnce({})

      await makeServer().deleteStatus()
      expect(prismaMock.gm_status.delete).toHaveBeenCalled()
    })
  })

  describe('createStatus', () => {
    it('throws when channelID is falsy', async () => {
      resolveDiscordGuildClientMock.mockResolvedValueOnce({ guilds: { fetch: vi.fn().mockResolvedValueOnce({ channels: { cache: { get: vi.fn() } } }) } })
      await expect(makeServer().createStatus('')).rejects.toThrow('Channel ID is required')
    })

    it('throws when the channel is not found', async () => {
      resolveDiscordGuildClientMock.mockResolvedValueOnce({
        guilds: { fetch: vi.fn().mockResolvedValueOnce({ channels: { cache: { get: vi.fn().mockReturnValueOnce(undefined) } } }) },
      })
      await expect(makeServer().createStatus('ch1')).rejects.toThrow('Channel not found')
    })

    it('throws when the channel is not sendable', async () => {
      resolveDiscordGuildClientMock.mockResolvedValueOnce({
        guilds: {
          fetch: vi.fn().mockResolvedValueOnce({
            channels: { cache: { get: vi.fn().mockReturnValueOnce({ isSendable: () => false }) } },
          }),
        },
      })
      await expect(makeServer().createStatus('ch1')).rejects.toThrow('Channel is not sendable')
    })

    it('sends the status embed and persists the status record', async () => {
      const sendMock = vi.fn().mockResolvedValueOnce({ id: 'msg1' })
      resolveDiscordGuildClientMock.mockResolvedValueOnce({
        guilds: {
          fetch: vi.fn().mockResolvedValueOnce({
            preferredLocale: 'en',
            channels: {
              cache: { get: vi.fn().mockReturnValueOnce({ id: 'ch1', isSendable: () => true, send: sendMock }) },
            },
          }),
        },
      })
      prismaMock.gm_server_status.findFirst.mockResolvedValueOnce({ id: 'status1' })
      buildDiscordStatusMessageMock.mockResolvedValueOnce({ embeds: [] })
      prismaMock.gm_status.create.mockResolvedValueOnce({ server: 's1', message: 'msg1', channel: 'ch1' })

      const result = await makeServer().createStatus('ch1')

      expect(sendMock).toHaveBeenCalledWith({ embeds: [] })
      expect(prismaMock.gm_status.create).toHaveBeenCalledWith({
        data: { server: 's1', message: 'msg1', channel: 'ch1' },
      })
      expect(result).toEqual({ server: 's1', message: 'msg1', channel: 'ch1' })
    })
  })

  describe('editStatusChannelAndMessage', () => {
    it('returns early and logs when there is no status record', async () => {
      prismaMock.gm_status.findFirst.mockResolvedValueOnce(null)
      await makeServer().editStatusChannelAndMessage({})
      expect(resolveDiscordGuildClientMock).not.toHaveBeenCalled()
    })

    it('cleans up and returns when the guild is unknown (code 10004)', async () => {
      prismaMock.gm_status.findFirst.mockResolvedValueOnce({ channel: 'ch1', message: 'm1' })
      resolveDiscordGuildClientMock.mockResolvedValueOnce({
        guilds: { fetch: vi.fn().mockRejectedValueOnce(Object.assign(new Error('unknown guild'), { code: 10004 })) },
      })
      prismaMock.gm_status.delete.mockResolvedValueOnce({})

      await makeServer().editStatusChannelAndMessage({})
      expect(prismaMock.gm_status.delete).toHaveBeenCalledWith({ where: { server: 's1' } })
    })

    it('rethrows and logs for an unrecognized guild-fetch error', async () => {
      prismaMock.gm_status.findFirst.mockResolvedValueOnce({ channel: 'ch1', message: 'm1' })
      resolveDiscordGuildClientMock.mockResolvedValueOnce({
        guilds: { fetch: vi.fn().mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 1 })) },
      })
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await makeServer().editStatusChannelAndMessage({})
      expect(errorSpy).toHaveBeenCalled()
    })

    it('returns when the guild fetch resolves to null', async () => {
      prismaMock.gm_status.findFirst.mockResolvedValueOnce({ channel: 'ch1', message: 'm1' })
      resolveDiscordGuildClientMock.mockResolvedValueOnce({ guilds: { fetch: vi.fn().mockResolvedValueOnce(null) } })

      await makeServer().editStatusChannelAndMessage({})
      expect(prismaMock.gm_status.delete).not.toHaveBeenCalled()
    })

    it('cleans up and returns when the channel is unknown (code 10003)', async () => {
      prismaMock.gm_status.findFirst.mockResolvedValueOnce({ channel: 'ch1', message: 'm1' })
      resolveDiscordGuildClientMock.mockResolvedValueOnce({
        guilds: { fetch: vi.fn().mockResolvedValueOnce({ preferredLocale: 'en' }) },
        channels: { fetch: vi.fn().mockRejectedValueOnce(Object.assign(new Error('no channel'), { code: 10003 })) },
      })
      prismaMock.gm_status.delete.mockResolvedValueOnce({})

      await makeServer().editStatusChannelAndMessage({})
      expect(prismaMock.gm_status.delete).toHaveBeenCalled()
    })

    it('rethrows for an unrecognized channel-fetch error', async () => {
      prismaMock.gm_status.findFirst.mockResolvedValueOnce({ channel: 'ch1', message: 'm1' })
      resolveDiscordGuildClientMock.mockResolvedValueOnce({
        guilds: { fetch: vi.fn().mockResolvedValueOnce({ preferredLocale: 'en' }) },
        channels: { fetch: vi.fn().mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 1 })) },
      })
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await makeServer().editStatusChannelAndMessage({})
      expect(errorSpy).toHaveBeenCalled()
    })

    it('returns when the channel fetch resolves to null', async () => {
      prismaMock.gm_status.findFirst.mockResolvedValueOnce({ channel: 'ch1', message: 'm1' })
      resolveDiscordGuildClientMock.mockResolvedValueOnce({
        guilds: { fetch: vi.fn().mockResolvedValueOnce({ preferredLocale: 'en' }) },
        channels: { fetch: vi.fn().mockResolvedValueOnce(null) },
      })

      await makeServer().editStatusChannelAndMessage({})
      expect(prismaMock.gm_status.delete).not.toHaveBeenCalled()
    })

    it('returns when the channel is not text based', async () => {
      prismaMock.gm_status.findFirst.mockResolvedValueOnce({ channel: 'ch1', message: 'm1' })
      resolveDiscordGuildClientMock.mockResolvedValueOnce({
        guilds: { fetch: vi.fn().mockResolvedValueOnce({ preferredLocale: 'en' }) },
        channels: { fetch: vi.fn().mockResolvedValueOnce({ isTextBased: () => false }) },
      })

      await makeServer().editStatusChannelAndMessage({})
      expect(prismaMock.gm_status.delete).not.toHaveBeenCalled()
    })

    it('cleans up and returns when the message is unknown (code 10008)', async () => {
      prismaMock.gm_status.findFirst.mockResolvedValueOnce({ channel: 'ch1', message: 'm1' })
      resolveDiscordGuildClientMock.mockResolvedValueOnce({
        guilds: { fetch: vi.fn().mockResolvedValueOnce({ preferredLocale: 'en' }) },
        channels: {
          fetch: vi.fn().mockResolvedValueOnce({
            isTextBased: () => true,
            messages: { fetch: vi.fn().mockRejectedValueOnce(Object.assign(new Error('no msg'), { code: 10008 })) },
          }),
        },
      })
      prismaMock.gm_status.delete.mockResolvedValueOnce({})

      await makeServer().editStatusChannelAndMessage({})
      expect(prismaMock.gm_status.delete).toHaveBeenCalled()
    })

    it('cleans up and returns on missing-access (code 50001)', async () => {
      prismaMock.gm_status.findFirst.mockResolvedValueOnce({ channel: 'ch1', message: 'm1' })
      resolveDiscordGuildClientMock.mockResolvedValueOnce({
        guilds: { fetch: vi.fn().mockResolvedValueOnce({ preferredLocale: 'en' }) },
        channels: {
          fetch: vi.fn().mockResolvedValueOnce({
            isTextBased: () => true,
            messages: { fetch: vi.fn().mockRejectedValueOnce(Object.assign(new Error('forbidden'), { code: 50001 })) },
          }),
        },
      })
      prismaMock.gm_status.delete.mockResolvedValueOnce({})

      await makeServer().editStatusChannelAndMessage({})
      expect(prismaMock.gm_status.delete).toHaveBeenCalled()
    })

    it('rethrows for an unrecognized message-fetch error', async () => {
      prismaMock.gm_status.findFirst.mockResolvedValueOnce({ channel: 'ch1', message: 'm1' })
      resolveDiscordGuildClientMock.mockResolvedValueOnce({
        guilds: { fetch: vi.fn().mockResolvedValueOnce({ preferredLocale: 'en' }) },
        channels: {
          fetch: vi.fn().mockResolvedValueOnce({
            isTextBased: () => true,
            messages: { fetch: vi.fn().mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 1 })) },
          }),
        },
      })
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await makeServer().editStatusChannelAndMessage({})
      expect(errorSpy).toHaveBeenCalled()
    })

    it('returns when the message resolves to null', async () => {
      prismaMock.gm_status.findFirst.mockResolvedValueOnce({ channel: 'ch1', message: 'm1' })
      resolveDiscordGuildClientMock.mockResolvedValueOnce({
        guilds: { fetch: vi.fn().mockResolvedValueOnce({ preferredLocale: 'en' }) },
        channels: {
          fetch: vi.fn().mockResolvedValueOnce({
            isTextBased: () => true,
            messages: { fetch: vi.fn().mockResolvedValueOnce(null) },
          }),
        },
      })

      await makeServer().editStatusChannelAndMessage({})
      expect(prismaMock.gm_status.delete).not.toHaveBeenCalled()
    })

    it('returns when the message author is not the bot', async () => {
      prismaMock.gm_status.findFirst.mockResolvedValueOnce({ channel: 'ch1', message: 'm1' })
      resolveDiscordGuildClientMock.mockResolvedValueOnce({
        user: { id: 'bot1' },
        guilds: { fetch: vi.fn().mockResolvedValueOnce({ preferredLocale: 'en' }) },
        channels: {
          fetch: vi.fn().mockResolvedValueOnce({
            isTextBased: () => true,
            messages: { fetch: vi.fn().mockResolvedValueOnce({ author: { id: 'someone-else' } }) },
          }),
        },
      })

      await makeServer().editStatusChannelAndMessage({})
      expect(prismaMock.gm_status.delete).not.toHaveBeenCalled()
    })

    it('edits the message when everything checks out', async () => {
      const editMock = vi.fn().mockResolvedValueOnce(undefined)
      prismaMock.gm_status.findFirst.mockResolvedValueOnce({ channel: 'ch1', message: 'm1' })
      resolveDiscordGuildClientMock.mockResolvedValueOnce({
        user: { id: 'bot1' },
        guilds: { fetch: vi.fn().mockResolvedValueOnce({ preferredLocale: 'en' }) },
        channels: {
          fetch: vi.fn().mockResolvedValueOnce({
            isTextBased: () => true,
            messages: {
              fetch: vi.fn().mockResolvedValueOnce({ author: { id: 'bot1' }, edit: editMock }),
            },
          }),
        },
      })
      buildDiscordStatusMessageMock.mockResolvedValueOnce({ content: 'updated' })

      await makeServer().editStatusChannelAndMessage({ players: 5 })

      expect(editMock).toHaveBeenCalledWith({ content: 'updated' })
    })

    it('silently returns when the discord bridge is not configured', async () => {
      prismaMock.gm_status.findFirst.mockResolvedValueOnce({ channel: 'ch1', message: 'm1' })
      resolveDiscordGuildClientMock.mockRejectedValueOnce(
        new Error('Discord guild client resolver is not configured'),
      )
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await makeServer().editStatusChannelAndMessage({})
      expect(errorSpy).not.toHaveBeenCalled()
      expect(prismaMock.gm_status.delete).not.toHaveBeenCalled()
    })

    it('silently returns when the status message builder is not configured', async () => {
      prismaMock.gm_status.findFirst.mockResolvedValueOnce({ channel: 'ch1', message: 'm1' })
      resolveDiscordGuildClientMock.mockResolvedValueOnce({
        user: { id: 'bot1' },
        guilds: { fetch: vi.fn().mockResolvedValueOnce({ preferredLocale: 'en' }) },
        channels: {
          fetch: vi.fn().mockResolvedValueOnce({
            isTextBased: () => true,
            messages: { fetch: vi.fn().mockResolvedValueOnce({ author: { id: 'bot1' } }) },
          }),
        },
      })
      buildDiscordStatusMessageMock.mockRejectedValueOnce(
        new Error('Discord status message builder is not configured'),
      )
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await makeServer().editStatusChannelAndMessage({})
      expect(errorSpy).not.toHaveBeenCalled()
    })
  })

  describe('saveStatus', () => {
    const args = ['1.2.3.4', 27015, 'host', 'map1', 'sandbox', 5, 10, 100, [{ name: 'p1' }]] as const

    it('updates the existing status row and always records history', async () => {
      prismaMock.gm_server_status.findFirst.mockResolvedValueOnce({ id: 's1' })

      await makeServer().saveStatus(...args)

      expect(prismaMock.gm_server_status.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: {
          ip: '1.2.3.4',
          port: 27015,
          hostname: 'host',
          map: 'map1',
          gameMode: 'sandbox',
          players: 5,
          maxPlayers: 10,
          playersList: JSON.stringify([{ name: 'p1' }]),
        },
      })
      expect(prismaMock.gm_server_status_history.create).toHaveBeenCalledWith({
        data: { serverID: 's1', players: 5 },
      })
    })

    it('creates a new status row when none exists', async () => {
      prismaMock.gm_server_status.findFirst.mockResolvedValueOnce(null)

      await makeServer().saveStatus(...args)

      expect(prismaMock.gm_server_status.create).toHaveBeenCalledWith({
        data: {
          id: 's1',
          ip: '1.2.3.4',
          port: 27015,
          hostname: 'host',
          map: 'map1',
          gameMode: 'sandbox',
          players: 5,
          maxPlayers: 10,
          playersList: JSON.stringify([{ name: 'p1' }]),
        },
      })
      expect(prismaMock.gm_server_status_history.create).toHaveBeenCalled()
    })
  })

  describe('getSyncChatChannel', () => {
    it('returns the cached value from redis when present', async () => {
      redisMock.get.mockResolvedValueOnce('{"a":1}')
      await expect(makeServer().getSyncChatChannel()).resolves.toEqual({ a: 1 })
    })

    it('caches and returns the DB result when found', async () => {
      redisMock.get.mockResolvedValueOnce(null)
      prismaMock.gm_sync_chat.findFirst.mockResolvedValueOnce({ id: 1 })
      await expect(makeServer().getSyncChatChannel()).resolves.toEqual({ id: 1 })
      expect(redisMock.set).toHaveBeenCalled()
    })

    it('returns null when nothing is found', async () => {
      redisMock.get.mockResolvedValueOnce(null)
      prismaMock.gm_sync_chat.findFirst.mockResolvedValueOnce(null)
      await expect(makeServer().getSyncChatChannel()).resolves.toBeNull()
    })

    it('returns null and logs when an error is thrown', async () => {
      redisMock.get.mockRejectedValueOnce(new Error('redis down'))
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      await expect(makeServer().getSyncChatChannel()).resolves.toBeNull()
      expect(errorSpy).toHaveBeenCalled()
    })
  })

  describe('getSyncRoles / getSyncTeamRoles', () => {
    it('return the raw findMany results', async () => {
      prismaMock.gm_server_sync_roles.findMany.mockResolvedValueOnce([{ id: 1 }])
      prismaMock.gm_server_sync_team_roles.findMany.mockResolvedValueOnce([{ id: 2 }])
      await expect(makeServer().getSyncRoles()).resolves.toEqual([{ id: 1 }])
      await expect(makeServer().getSyncTeamRoles()).resolves.toEqual([{ id: 2 }])
    })
  })

  describe('saveUserConnectionInfo', () => {
    it('increments total_connect on an existing player', async () => {
      prismaMock.gm_server_stat.findFirst.mockResolvedValueOnce({ total_connect: 4 })

      await makeServer().saveUserConnectionInfo('7656119', 'Player1')

      expect(prismaMock.gm_server_stat.update).toHaveBeenCalledWith({
        where: { server_id_steam_id: { steam_id: '7656119', server_id: 's1' } },
        data: { name: 'Player1', total_connect: 5 },
      })
    })

    it('creates a new player row when none exists', async () => {
      prismaMock.gm_server_stat.findFirst.mockResolvedValueOnce(null)

      await makeServer().saveUserConnectionInfo('7656119', 'Player1')

      expect(prismaMock.gm_server_stat.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ steam_id: '7656119', server_id: 's1', name: 'Player1' }),
        }),
      )
    })

    it('rethrows and logs on failure', async () => {
      prismaMock.gm_server_stat.findFirst.mockRejectedValueOnce(new Error('db down'))
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await expect(makeServer().saveUserConnectionInfo('7656119', 'Player1')).rejects.toThrow('db down')
      expect(errorSpy).toHaveBeenCalled()
    })
  })

  describe('getServerPlayer', () => {
    it('returns the found player', async () => {
      prismaMock.gm_server_stat.findFirst.mockResolvedValueOnce({ id: 1 })
      await expect(makeServer().getServerPlayer('7656119')).resolves.toEqual({ id: 1 })
    })

    it('returns null and logs on failure', async () => {
      prismaMock.gm_server_stat.findFirst.mockRejectedValueOnce(new Error('db down'))
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      await expect(makeServer().getServerPlayer('7656119')).resolves.toBeNull()
      expect(errorSpy).toHaveBeenCalled()
    })
  })

  describe('delete', () => {
    it('deletes and returns the server row when it exists', async () => {
      prismaMock.gm_server.findFirst.mockResolvedValueOnce({ id: 's1' })
      await expect(makeServer().delete()).resolves.toEqual({ id: 's1' })
      expect(prismaMock.gm_server.delete).toHaveBeenCalledWith({ where: { id: 's1' } })
    })

    it('does nothing and returns null when the server does not exist', async () => {
      prismaMock.gm_server.findFirst.mockResolvedValueOnce(null)
      await expect(makeServer().delete()).resolves.toBeNull()
      expect(prismaMock.gm_server.delete).not.toHaveBeenCalled()
    })
  })

  describe('save', () => {
    it('persists the current fields when the server exists', async () => {
      prismaMock.gm_server.findFirst.mockResolvedValueOnce({ id: 's1' })
      await makeServer().save()
      expect(prismaMock.gm_server.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: {
          name: 'My Server',
          ip: '127.0.0.1',
          port: '27015',
          image: '',
          isPublic: true,
          verified: true,
          publicTempToken: 'pub-tok',
          description: 'desc',
        },
      })
    })

    it('does nothing when the server does not exist', async () => {
      prismaMock.gm_server.findFirst.mockResolvedValueOnce(null)
      await makeServer().save()
      expect(prismaMock.gm_server.update).not.toHaveBeenCalled()
    })
  })

  describe('status buttons', () => {
    it('findStatusButtons/findStatusButton query as expected', async () => {
      prismaMock.gm_status_button.findMany.mockResolvedValueOnce([{ id: 1 }])
      prismaMock.gm_status_button.findFirst.mockResolvedValueOnce({ id: 2 })
      await expect(makeServer().findStatusButtons()).resolves.toEqual([{ id: 1 }])
      await expect(makeServer().findStatusButton(2)).resolves.toEqual({ id: 2 })
    })

    it('createStatusButton creates a row for this server', async () => {
      prismaMock.gm_status_button.create.mockResolvedValueOnce({ id: 3 })
      await expect(makeServer().createStatusButton()).resolves.toEqual({ id: 3 })
      expect(prismaMock.gm_status_button.create).toHaveBeenCalledWith({ data: { server: 's1' } })
    })

    it('destroyStatusButton deletes and returns the button when found', async () => {
      prismaMock.gm_status_button.findFirst.mockResolvedValueOnce({ id: 4 })
      await expect(makeServer().destroyStatusButton(4)).resolves.toEqual({ id: 4 })
      expect(prismaMock.gm_status_button.delete).toHaveBeenCalledWith({ where: { id: 4, server: 's1' } })
    })

    it('destroyStatusButton does nothing when not found', async () => {
      prismaMock.gm_status_button.findFirst.mockResolvedValueOnce(null)
      await expect(makeServer().destroyStatusButton(4)).resolves.toBeNull()
      expect(prismaMock.gm_status_button.delete).not.toHaveBeenCalled()
    })
  })

  describe('getScreenshotsChannel / destroyScreenshotChannel / createScreenshotChannel', () => {
    it('getScreenshotsChannel queries with the admin flag', async () => {
      prismaMock.gm_server_screenshot_channels.findFirst.mockResolvedValueOnce({ id: 1 })
      await expect(makeServer().getScreenshotsChannel(true)).resolves.toEqual({ id: 1 })
      expect(prismaMock.gm_server_screenshot_channels.findFirst).toHaveBeenCalledWith({
        where: { server: 's1', adminCmd: true },
      })
    })

    it('destroyScreenshotChannel returns null when none exists', async () => {
      prismaMock.gm_server_screenshot_channels.findFirst.mockResolvedValueOnce(null)
      await expect(makeServer().destroyScreenshotChannel()).resolves.toBeNull()
      expect(prismaMock.gm_server_screenshot_channels.delete).not.toHaveBeenCalled()
    })

    it('destroyScreenshotChannel deletes the webhook and the DB row when found', async () => {
      prismaMock.gm_server_screenshot_channels.findFirst.mockResolvedValueOnce({
        webhook: 'wh1',
        adminCmd: false,
      })
      const deleteWebhook = vi.fn().mockResolvedValueOnce(undefined)
      resolveDiscordGuildClientMock.mockResolvedValueOnce({
        guilds: {
          fetch: vi.fn().mockResolvedValueOnce({
            fetchWebhooks: vi.fn().mockResolvedValueOnce([{ id: 'wh1', delete: deleteWebhook }]),
          }),
        },
      })

      await makeServer().destroyScreenshotChannel()

      expect(deleteWebhook).toHaveBeenCalled()
      expect(prismaMock.gm_server_screenshot_channels.delete).toHaveBeenCalledWith({
        where: { server_adminCmd: { server: 's1', adminCmd: false } },
      })
    })

    it('destroyScreenshotChannel skips webhook deletion when no matching webhook is found', async () => {
      prismaMock.gm_server_screenshot_channels.findFirst.mockResolvedValueOnce({
        webhook: 'wh1',
        adminCmd: false,
      })
      resolveDiscordGuildClientMock.mockResolvedValueOnce({
        guilds: {
          fetch: vi.fn().mockResolvedValueOnce({
            fetchWebhooks: vi.fn().mockResolvedValueOnce([{ id: 'other-wh' }]),
          }),
        },
      })

      await makeServer().destroyScreenshotChannel()

      expect(prismaMock.gm_server_screenshot_channels.delete).toHaveBeenCalled()
    })

    it('destroyScreenshotChannel still deletes the DB row when the Discord webhook lookup fails', async () => {
      prismaMock.gm_server_screenshot_channels.findFirst.mockResolvedValueOnce({
        webhook: 'wh1',
        adminCmd: false,
      })
      resolveDiscordGuildClientMock.mockRejectedValueOnce(new Error('discord down'))

      await makeServer().destroyScreenshotChannel()

      expect(prismaMock.gm_server_screenshot_channels.delete).toHaveBeenCalled()
    })

    it('createScreenshotChannel throws when the channel is missing or not a text channel', async () => {
      resolveDiscordGuildClientMock.mockResolvedValue({
        guilds: { fetch: vi.fn().mockResolvedValue({ channels: { cache: { get: vi.fn().mockReturnValue(undefined) } } }) },
      })
      await expect(makeServer().createScreenshotChannel('ch1')).rejects.toThrow('Channel not found')
    })

    it('createScreenshotChannel throws when the webhook is not created', async () => {
      resolveDiscordGuildClientMock.mockResolvedValueOnce({
        guilds: {
          fetch: vi.fn().mockResolvedValueOnce({
            channels: {
              cache: {
                get: vi.fn().mockReturnValueOnce({
                  type: ChannelType.GuildText,
                  createWebhook: vi.fn().mockResolvedValueOnce(undefined),
                }),
              },
            },
          }),
        },
      })
      await expect(makeServer().createScreenshotChannel('ch1')).rejects.toThrow('Webhook not created')
    })

    it('createScreenshotChannel creates the webhook and persists the row', async () => {
      resolveDiscordGuildClientMock.mockResolvedValueOnce({
        guilds: {
          fetch: vi.fn().mockResolvedValueOnce({
            channels: {
              cache: {
                get: vi.fn().mockReturnValueOnce({
                  type: ChannelType.GuildText,
                  createWebhook: vi.fn().mockResolvedValueOnce({ id: 'wh1', token: 'tok' }),
                }),
              },
            },
          }),
        },
      })
      prismaMock.gm_server_screenshot_channels.create.mockResolvedValueOnce({ id: 1 })

      await expect(makeServer().createScreenshotChannel('ch1')).resolves.toEqual({ id: 1 })
      expect(prismaMock.gm_server_screenshot_channels.create).toHaveBeenCalledWith({
        data: { server: 's1', channelID: 'ch1', webhook: 'wh1', token: 'tok' },
      })
    })
  })

  describe('getLogsChannel / getCachedLogsChannel / destroyLogsChannel / createLogsChannel', () => {
    it('getLogsChannel queries by serverID', async () => {
      prismaMock.gm_server_logs_channel.findFirst.mockResolvedValueOnce({ id: 1 })
      await expect(makeServer().getLogsChannel()).resolves.toEqual({ id: 1 })
    })

    it('getCachedLogsChannel returns the cached value from redis when present', async () => {
      redisMock.get.mockResolvedValueOnce('{"id":1}')
      await expect(makeServer().getCachedLogsChannel()).resolves.toEqual({ id: 1 })
      expect(prismaMock.gm_server_logs_channel.findFirst).not.toHaveBeenCalled()
    })

    it('getCachedLogsChannel caches the DB result when found', async () => {
      redisMock.get.mockResolvedValueOnce(null)
      prismaMock.gm_server_logs_channel.findFirst.mockResolvedValueOnce({ id: 1 })
      await expect(makeServer().getCachedLogsChannel()).resolves.toEqual({ id: 1 })
      expect(redisMock.set).toHaveBeenCalled()
    })

    it('getCachedLogsChannel does not cache when nothing is found', async () => {
      redisMock.get.mockResolvedValueOnce(null)
      prismaMock.gm_server_logs_channel.findFirst.mockResolvedValueOnce(null)
      await expect(makeServer().getCachedLogsChannel()).resolves.toBeNull()
      expect(redisMock.set).not.toHaveBeenCalled()
    })

    it('destroyLogsChannel returns null when none exists', async () => {
      prismaMock.gm_server_logs_channel.findFirst.mockResolvedValueOnce(null)
      await expect(makeServer().destroyLogsChannel()).resolves.toBeNull()
      expect(prismaMock.gm_server_logs_channel.delete).not.toHaveBeenCalled()
    })

    it('destroyLogsChannel deletes the webhook, clears the cache, and deletes the DB row', async () => {
      prismaMock.gm_server_logs_channel.findFirst.mockResolvedValueOnce({ webhookID: 'wh1' })
      const deleteWebhook = vi.fn().mockResolvedValueOnce(undefined)
      resolveDiscordGuildClientMock.mockResolvedValueOnce({
        guilds: {
          fetch: vi.fn().mockResolvedValueOnce({
            fetchWebhooks: vi.fn().mockResolvedValueOnce([{ id: 'wh1', delete: deleteWebhook }]),
          }),
        },
      })

      await makeServer().destroyLogsChannel()

      expect(deleteWebhook).toHaveBeenCalled()
      expect(redisMock.del).toHaveBeenCalledWith('server:s1:logsChannel')
      expect(prismaMock.gm_server_logs_channel.delete).toHaveBeenCalledWith({ where: { serverID: 's1' } })
    })

    it('destroyLogsChannel skips webhook deletion when no matching webhook is found', async () => {
      prismaMock.gm_server_logs_channel.findFirst.mockResolvedValueOnce({ webhookID: 'wh1' })
      resolveDiscordGuildClientMock.mockResolvedValueOnce({
        guilds: {
          fetch: vi.fn().mockResolvedValueOnce({
            fetchWebhooks: vi.fn().mockResolvedValueOnce([{ id: 'other-wh' }]),
          }),
        },
      })

      await makeServer().destroyLogsChannel()

      expect(prismaMock.gm_server_logs_channel.delete).toHaveBeenCalled()
    })

    it('destroyLogsChannel still deletes the DB row when the Discord webhook lookup fails', async () => {
      prismaMock.gm_server_logs_channel.findFirst.mockResolvedValueOnce({ webhookID: 'wh1' })
      resolveDiscordGuildClientMock.mockRejectedValueOnce(new Error('discord down'))

      await makeServer().destroyLogsChannel()

      expect(prismaMock.gm_server_logs_channel.delete).toHaveBeenCalled()
    })

    it('createLogsChannel destroys any existing channel, throws when the target channel is invalid', async () => {
      prismaMock.gm_server_logs_channel.findFirst.mockResolvedValueOnce(null)
      resolveDiscordGuildClientMock.mockResolvedValueOnce({
        guilds: { fetch: vi.fn().mockResolvedValueOnce({ channels: { cache: { get: vi.fn().mockReturnValueOnce(undefined) } } }) },
      })
      await expect(makeServer().createLogsChannel('ch1')).rejects.toThrow('Channel not found')
    })

    it('createLogsChannel throws when the webhook is not created', async () => {
      prismaMock.gm_server_logs_channel.findFirst.mockResolvedValueOnce(null)
      resolveDiscordGuildClientMock.mockResolvedValueOnce({
        guilds: {
          fetch: vi.fn().mockResolvedValueOnce({
            channels: {
              cache: {
                get: vi.fn().mockReturnValueOnce({
                  type: ChannelType.GuildText,
                  createWebhook: vi.fn().mockResolvedValueOnce(undefined),
                }),
              },
            },
          }),
        },
      })
      await expect(makeServer().createLogsChannel('ch1')).rejects.toThrow('Webhook not created')
    })

    it('createLogsChannel creates the webhook and persists the row', async () => {
      prismaMock.gm_server_logs_channel.findFirst.mockResolvedValueOnce(null)
      resolveDiscordGuildClientMock.mockResolvedValueOnce({
        guilds: {
          fetch: vi.fn().mockResolvedValueOnce({
            channels: {
              cache: {
                get: vi.fn().mockReturnValueOnce({
                  type: ChannelType.GuildText,
                  createWebhook: vi.fn().mockResolvedValueOnce({ id: 'wh1', token: 'tok' }),
                }),
              },
            },
          }),
        },
      })
      prismaMock.gm_server_logs_channel.create.mockResolvedValueOnce({ id: 1 })

      await expect(makeServer().createLogsChannel('ch1')).resolves.toEqual({ id: 1 })
      expect(prismaMock.gm_server_logs_channel.create).toHaveBeenCalledWith({
        data: { serverID: 's1', channelID: 'ch1', webhookID: 'wh1', webhookToken: 'tok' },
      })
    })
  })

  describe('getVoteChannel / destroyVoteChannel / createVoteChannel', () => {
    it('getVoteChannel queries by serverID', async () => {
      prismaMock.gm_server_vote_channels.findFirst.mockResolvedValueOnce({ id: 1 })
      await expect(makeServer().getVoteChannel()).resolves.toEqual({ id: 1 })
    })

    it('destroyVoteChannel returns null when none exists', async () => {
      prismaMock.gm_server_vote_channels.findFirst.mockResolvedValueOnce(null)
      await expect(makeServer().destroyVoteChannel()).resolves.toBeNull()
      expect(prismaMock.gm_server_vote_channels.delete).not.toHaveBeenCalled()
    })

    it('destroyVoteChannel deletes the webhook and the DB row when found', async () => {
      prismaMock.gm_server_vote_channels.findFirst.mockResolvedValueOnce({ webhookID: 'wh1', channelID: 'ch1' })
      const deleteWebhook = vi.fn().mockResolvedValueOnce(undefined)
      resolveDiscordGuildClientMock.mockResolvedValueOnce({
        guilds: {
          fetch: vi.fn().mockResolvedValueOnce({
            fetchWebhooks: vi.fn().mockResolvedValueOnce([{ id: 'wh1', delete: deleteWebhook }]),
          }),
        },
      })

      await makeServer().destroyVoteChannel()

      expect(deleteWebhook).toHaveBeenCalled()
      expect(prismaMock.gm_server_vote_channels.delete).toHaveBeenCalledWith({
        where: { channelID: 'ch1', serverID: 's1' },
      })
    })

    it('destroyVoteChannel skips webhook deletion when no matching webhook is found', async () => {
      prismaMock.gm_server_vote_channels.findFirst.mockResolvedValueOnce({ webhookID: 'wh1', channelID: 'ch1' })
      resolveDiscordGuildClientMock.mockResolvedValueOnce({
        guilds: {
          fetch: vi.fn().mockResolvedValueOnce({
            fetchWebhooks: vi.fn().mockResolvedValueOnce([{ id: 'other-wh' }]),
          }),
        },
      })

      await makeServer().destroyVoteChannel()

      expect(prismaMock.gm_server_vote_channels.delete).toHaveBeenCalled()
    })

    it('destroyVoteChannel still deletes the DB row when the Discord webhook lookup fails', async () => {
      prismaMock.gm_server_vote_channels.findFirst.mockResolvedValueOnce({ webhookID: 'wh1', channelID: 'ch1' })
      resolveDiscordGuildClientMock.mockRejectedValueOnce(new Error('discord down'))

      await makeServer().destroyVoteChannel()

      expect(prismaMock.gm_server_vote_channels.delete).toHaveBeenCalled()
    })

    it('createVoteChannel throws when the channel is missing or not a text channel', async () => {
      prismaMock.gm_server_vote_channels.findFirst.mockResolvedValueOnce(null)
      resolveDiscordGuildClientMock.mockResolvedValueOnce({
        guilds: { fetch: vi.fn().mockResolvedValueOnce({ channels: { cache: { get: vi.fn().mockReturnValueOnce(undefined) } } }) },
      })
      await expect(makeServer().createVoteChannel('ch1')).rejects.toThrow('Channel not found')
    })

    it('createVoteChannel throws when the webhook is not created', async () => {
      prismaMock.gm_server_vote_channels.findFirst.mockResolvedValueOnce(null)
      resolveDiscordGuildClientMock.mockResolvedValueOnce({
        guilds: {
          fetch: vi.fn().mockResolvedValueOnce({
            channels: {
              cache: {
                get: vi.fn().mockReturnValueOnce({
                  type: ChannelType.GuildText,
                  createWebhook: vi.fn().mockResolvedValueOnce(undefined),
                }),
              },
            },
          }),
        },
      })
      await expect(makeServer().createVoteChannel('ch1')).rejects.toThrow('Webhook not created')
    })

    it('createVoteChannel creates the webhook and persists the row', async () => {
      prismaMock.gm_server_vote_channels.findFirst.mockResolvedValueOnce(null)
      resolveDiscordGuildClientMock.mockResolvedValueOnce({
        guilds: {
          fetch: vi.fn().mockResolvedValueOnce({
            channels: {
              cache: {
                get: vi.fn().mockReturnValueOnce({
                  type: ChannelType.GuildText,
                  createWebhook: vi.fn().mockResolvedValueOnce({ id: 'wh1', token: 'tok' }),
                }),
              },
            },
          }),
        },
      })
      prismaMock.gm_server_vote_channels.create.mockResolvedValueOnce({ id: 1 })

      await expect(makeServer().createVoteChannel('ch1')).resolves.toEqual({ id: 1 })
      expect(prismaMock.gm_server_vote_channels.create).toHaveBeenCalledWith({
        data: { serverID: 's1', channelID: 'ch1', webhookID: 'wh1', webhookToken: 'tok' },
      })
    })
  })

  describe('getSyncChat / destroySyncChat / createSyncChat', () => {
    it('getSyncChat queries by server', async () => {
      prismaMock.gm_sync_chat.findFirst.mockResolvedValueOnce({ id: 1 })
      await expect(makeServer().getSyncChat()).resolves.toEqual({ id: 1 })
    })

    it('destroySyncChat returns null when none exists', async () => {
      prismaMock.gm_sync_chat.findFirst.mockResolvedValueOnce(null)
      await expect(makeServer().destroySyncChat()).resolves.toBeNull()
      expect(prismaMock.gm_sync_chat.delete).not.toHaveBeenCalled()
    })

    it('destroySyncChat deletes the webhook and the DB row when found', async () => {
      prismaMock.gm_sync_chat.findFirst.mockResolvedValueOnce({ id: 'wh1', guild: 'g1' })
      const deleteWebhook = vi.fn().mockResolvedValueOnce(undefined)
      resolveDiscordGuildClientMock.mockResolvedValueOnce({
        guilds: {
          fetch: vi.fn().mockResolvedValueOnce({
            fetchWebhooks: vi.fn().mockResolvedValueOnce([{ id: 'wh1', delete: deleteWebhook }]),
          }),
        },
      })

      await makeServer().destroySyncChat()

      expect(deleteWebhook).toHaveBeenCalled()
      expect(prismaMock.gm_sync_chat.delete).toHaveBeenCalledWith({
        where: { guild_server: { guild: 'g1', server: 's1' } },
      })
    })

    it('destroySyncChat skips webhook deletion when no matching webhook is found', async () => {
      prismaMock.gm_sync_chat.findFirst.mockResolvedValueOnce({ id: 'wh1', guild: 'g1' })
      resolveDiscordGuildClientMock.mockResolvedValueOnce({
        guilds: {
          fetch: vi.fn().mockResolvedValueOnce({
            fetchWebhooks: vi.fn().mockResolvedValueOnce([{ id: 'other-wh' }]),
          }),
        },
      })

      await makeServer().destroySyncChat()

      expect(prismaMock.gm_sync_chat.delete).toHaveBeenCalled()
    })

    it('destroySyncChat still deletes the DB row when the Discord webhook lookup fails', async () => {
      prismaMock.gm_sync_chat.findFirst.mockResolvedValueOnce({ id: 'wh1', guild: 'g1' })
      resolveDiscordGuildClientMock.mockRejectedValueOnce(new Error('discord down'))

      await makeServer().destroySyncChat()

      expect(prismaMock.gm_sync_chat.delete).toHaveBeenCalled()
    })

    it('createSyncChat throws when the channel is missing or not a text channel', async () => {
      prismaMock.gm_sync_chat.findFirst.mockResolvedValueOnce(null)
      resolveDiscordGuildClientMock.mockResolvedValueOnce({
        guilds: { fetch: vi.fn().mockResolvedValueOnce({ channels: { cache: { get: vi.fn().mockReturnValueOnce(undefined) } } }) },
      })
      await expect(makeServer().createSyncChat('ch1')).rejects.toThrow('Channel not found')
    })

    it('createSyncChat throws when the webhook is not created', async () => {
      prismaMock.gm_sync_chat.findFirst.mockResolvedValueOnce(null)
      resolveDiscordGuildClientMock.mockResolvedValueOnce({
        guilds: {
          fetch: vi.fn().mockResolvedValueOnce({
            channels: {
              cache: {
                get: vi.fn().mockReturnValueOnce({
                  type: ChannelType.GuildText,
                  createWebhook: vi.fn().mockResolvedValueOnce(undefined),
                }),
              },
            },
          }),
        },
      })
      await expect(makeServer().createSyncChat('ch1')).rejects.toThrow('Webhook not created')
    })

    it('createSyncChat creates the webhook and persists the row', async () => {
      prismaMock.gm_sync_chat.findFirst.mockResolvedValueOnce(null)
      resolveDiscordGuildClientMock.mockResolvedValueOnce({
        guilds: {
          fetch: vi.fn().mockResolvedValueOnce({
            channels: {
              cache: {
                get: vi.fn().mockReturnValueOnce({
                  type: ChannelType.GuildText,
                  createWebhook: vi.fn().mockResolvedValueOnce({ id: 'wh1', token: 'tok' }),
                }),
              },
            },
          }),
        },
      })
      prismaMock.gm_sync_chat.create.mockResolvedValueOnce({ id: 1 })

      await expect(makeServer().createSyncChat('ch1')).resolves.toEqual({ id: 1 })
      expect(prismaMock.gm_sync_chat.create).toHaveBeenCalledWith({
        data: { guild: 'g1', server: 's1', channel: 'ch1', id: 'wh1', token: 'tok' },
      })
    })
  })

  describe('logs triggers', () => {
    it('getLogsTrigger queries by serverID', async () => {
      prismaMock.gm_server_logs_triggers.findMany.mockResolvedValueOnce([{ id: 1 }])
      await expect(makeServer().getLogsTrigger()).resolves.toEqual([{ id: 1 }])
    })

    it('deleteLogsTrigger deletes and returns the trigger when found', async () => {
      prismaMock.gm_server_logs_triggers.findFirst.mockResolvedValueOnce({ id: 1, log_type: 'chat' })
      prismaMock.gm_server_logs_triggers.findMany.mockResolvedValue([])
      redisMock.get.mockResolvedValue(null)

      await expect(makeServer().deleteLogsTrigger(1)).resolves.toEqual({ id: 1, log_type: 'chat' })
      expect(prismaMock.gm_server_logs_triggers.delete).toHaveBeenCalledWith({ where: { id: 1, serverID: 's1' } })
    })

    it('deleteLogsTrigger does nothing but still resets redis when not found', async () => {
      prismaMock.gm_server_logs_triggers.findFirst.mockResolvedValueOnce(null)
      prismaMock.gm_server_logs_triggers.findMany.mockResolvedValue([])
      redisMock.get.mockResolvedValue(null)

      await expect(makeServer().deleteLogsTrigger(1)).resolves.toBeNull()
      expect(prismaMock.gm_server_logs_triggers.delete).not.toHaveBeenCalled()
    })

    it('createLogsTrigger maps the action/operator enums and resets redis', async () => {
      prismaMock.gm_server_logs_triggers.create.mockResolvedValueOnce({ id: 1 })
      prismaMock.gm_server_logs_triggers.findMany.mockResolvedValue([])
      redisMock.get.mockResolvedValue(null)

      await expect(
        makeServer().createLogsTrigger('sendMessageInChannel', 'cmp', 'ch1', 'val', 'equal', 'msg', 'chat'),
      ).resolves.toEqual({ id: 1 })

      expect(prismaMock.gm_server_logs_triggers.create).toHaveBeenCalledWith({
        data: {
          serverID: 's1',
          action: 'sendMessageInChannel',
          compare: 'cmp',
          channelID: 'ch1',
          value: 'val',
          operator: 'equal',
          adminIDS: '[]',
          message: 'msg',
          log_type: 'chat',
        },
      })
    })

    it('updateLogsTrigger maps the action/operator enums and resets redis', async () => {
      prismaMock.gm_server_logs_triggers.update.mockResolvedValueOnce({ id: 1 })
      prismaMock.gm_server_logs_triggers.findMany.mockResolvedValue([])
      redisMock.get.mockResolvedValue(null)

      await expect(
        makeServer().updateLogsTrigger(1, 'sendMessageInChannel', 'cmp', 'ch1', 'val', 'equal', 'msg', 'chat'),
      ).resolves.toEqual({ id: 1 })

      expect(prismaMock.gm_server_logs_triggers.update).toHaveBeenCalledWith({
        where: { id: 1, serverID: 's1' },
        data: {
          action: 'sendMessageInChannel',
          compare: 'cmp',
          channelID: 'ch1',
          value: 'val',
          operator: 'equal',
          message: 'msg',
          log_type: 'chat',
        },
      })
    })

    it('resetRedisLogsTrigger clears per-type redis keys for each trigger', async () => {
      redisMock.get.mockResolvedValue(null)
      prismaMock.gm_server_logs_triggers.findMany.mockResolvedValue([
        { id: 1, log_type: 'chat' },
        { id: 2, log_type: 'connect' },
      ])

      await makeServer().resetRedisLogsTrigger()

      expect(redisMock.del).toHaveBeenCalledWith('server:s1:logsTrigger')
      expect(redisMock.del).toHaveBeenCalledWith('server:s1:logsTrigger:chat')
      expect(redisMock.del).toHaveBeenCalledWith('server:s1:logsTrigger:connect')
    })

    it('getLogsTriggerFromRedis returns the cached value when present', async () => {
      redisMock.get.mockResolvedValueOnce('["chat"]')
      await expect(makeServer().getLogsTriggerFromRedis()).resolves.toEqual(['chat'])
      expect(prismaMock.gm_server_logs_triggers.findMany).not.toHaveBeenCalled()
    })

    it('getLogsTriggerFromRedis groups triggers by type and caches them when redis is empty', async () => {
      redisMock.get.mockResolvedValueOnce(null)
      prismaMock.gm_server_logs_triggers.findMany.mockResolvedValueOnce([
        { id: 1, log_type: 'chat' },
        { id: 2, log_type: 'chat' },
        { id: 3, log_type: 'connect' },
      ])

      const result = await makeServer().getLogsTriggerFromRedis()

      expect(result).toEqual(['chat', 'connect'])
      expect(redisMock.set).toHaveBeenCalledWith(
        'server:s1:logsTrigger:chat',
        JSON.stringify([
          { id: 1, log_type: 'chat' },
          { id: 2, log_type: 'chat' },
        ]),
        'EX',
        60 * 60 * 24,
      )
      expect(redisMock.set).toHaveBeenCalledWith(
        'server:s1:logsTrigger',
        JSON.stringify(['chat', 'connect']),
        'EX',
        60 * 60 * 24,
      )
    })
  })

  describe('module-level functions', () => {
    describe('generateServerUniqueID', () => {
      it('returns a freshly generated ID when it is not already taken', async () => {
        prismaMock.gm_server.findFirst.mockResolvedValueOnce(null)
        await expect(generateServerUniqueID()).resolves.toBe('generated-token')
      })

      it('retries when the generated ID collides with an existing server', async () => {
        prismaMock.gm_server.findFirst.mockResolvedValueOnce({ id: 'generated-token' }).mockResolvedValueOnce(null)
        await expect(generateServerUniqueID()).resolves.toBe('generated-token')
        expect(prismaMock.gm_server.findFirst).toHaveBeenCalledTimes(2)
      })
    })

    describe('getServerFromID', () => {
      it('returns a Server instance when found', async () => {
        prismaMock.gm_server.findFirst.mockResolvedValueOnce({ id: 's1', token: 'tok1' })
        const server = await getServerFromID('s1')
        expect(server).toBeInstanceOf(Server)
        expect(server?.getID()).toBe('s1')
      })

      it('returns null when not found', async () => {
        prismaMock.gm_server.findFirst.mockResolvedValueOnce(null)
        await expect(getServerFromID('s1')).resolves.toBeNull()
      })
    })

    describe('getServersFromDiscordGuildID', () => {
      it('returns Server instances for every matching row', async () => {
        prismaMock.gm_server.findMany.mockResolvedValueOnce([{ id: 's1' }, { id: 's2' }])
        const servers = await getServersFromDiscordGuildID('g1')
        expect(servers).toHaveLength(2)
        expect(servers[0]).toBeInstanceOf(Server)
      })
    })

    describe('createServer', () => {
      it('generates an ID and token, then creates the server row', async () => {
        prismaMock.gm_server.findFirst.mockResolvedValueOnce(null)
        prismaMock.gm_server.create.mockResolvedValueOnce({ id: 'generated-token', token: 'generated-token' })

        const server = await createServer('g1')

        expect(prismaMock.gm_server.create).toHaveBeenCalledWith({
          data: { id: 'generated-token', token: 'generated-token', guild: 'g1' },
        })
        expect(server).toBeInstanceOf(Server)
      })
    })

    describe('statusRoutine', () => {
      it('deletes the status row when the server no longer exists', async () => {
        prismaMock.gm_status.findMany.mockResolvedValueOnce([{ server: 's-missing' }])
        prismaMock.gm_server.findFirst.mockResolvedValueOnce(null)

        await statusRoutine()

        expect(prismaMock.gm_status.delete).toHaveBeenCalledWith({ where: { server: 's-missing' } })
      })

      it('skips servers whose status is not in the 6-10 minute stale window', async () => {
        prismaMock.gm_status.findMany.mockResolvedValueOnce([{ server: 's1' }])
        prismaMock.gm_server.findFirst.mockResolvedValueOnce({ id: 's1', token: 'tok1' })
        prismaMock.gm_server_status.findFirst.mockResolvedValueOnce(null)

        await statusRoutine()

        expect(prismaMock.gm_status.delete).not.toHaveBeenCalled()
      })

      it('refreshes the status message for servers in the stale window', async () => {
        prismaMock.gm_status.findMany.mockResolvedValueOnce([{ server: 's1' }])
        prismaMock.gm_server.findFirst.mockResolvedValueOnce({ id: 's1', token: 'tok1' })
        prismaMock.gm_server_status.findFirst
          .mockResolvedValueOnce({ id: 's1' }) // stale-window check inside statusRoutine
          .mockResolvedValueOnce({ id: 's1' }) // getStatusData() inside editStatusChannelAndMessage
        prismaMock.gm_status.findFirst.mockResolvedValueOnce(null) // editStatusChannelAndMessage's own lookup

        await statusRoutine()

        expect(resolveDiscordGuildClientMock).not.toHaveBeenCalled()
      })
    })
  })
})
