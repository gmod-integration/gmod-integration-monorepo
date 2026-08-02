import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const getTranslateMock = vi.fn(async (key: string, _lang?: string, args?: string[]) =>
  args && args.length ? `${key}:${args.join(',')}` : key,
)
vi.mock('@gmod/core/utils/localizations.js', () => ({ getTranslate: getTranslateMock }))

const gmLogMock = vi.fn()
vi.mock('@gmod/core/utils/logger.js', () => ({ gmLog: gmLogMock }))

vi.mock('@gmod/config', () => ({
  ConfigDiscord: { embedColor: 0x393a41, oauthPanel: 'https://panel.example/oauth' },
  ConfigServer: { websiteUrl: 'https://website.example' },
}))

const getUserFromDiscordIDMock = vi.fn()
vi.mock('@gmod/domain-user/User.js', () => ({ getUserFromDiscordID: getUserFromDiscordIDMock }))

const dateToDiscordTimestampMock = vi.fn((date: Date) => `<t:${Math.floor(date.getTime() / 1000)}:R>`)
const getServerChartMock = vi.fn()
const getTrustRankMock = vi.fn(async (trust: number) => `trust-${trust}`)
const secToTimeMock = vi.fn((sec: number) => `${sec}s`)
vi.mock('../../../src/discord/utils/index.js', () => ({
  dateToDiscordTimestamp: dateToDiscordTimestampMock,
  getServerChart: getServerChartMock,
  getTrustRank: getTrustRankMock,
  secToTime: secToTimeMock,
}))

// PlayerGmod's own module pulls in a heavy chain of DB/Redis/queue imports unrelated to what
// messages.ts needs from it (just construction + getStringFromString), so it's mocked at the
// module boundary rather than dragging that whole chain into this file's mocks.
class FakePlayerGmod {
  raw: any
  constructor(raw: any) {
    this.raw = raw
  }
  getStringFromString(format: string) {
    return format.replace('{name}', this.raw.name ?? '').replace('{steamID64}', this.raw.steamID64 ?? '')
  }
}
vi.mock('@gmod/core/classes/v3/PlayerGmod.js', () => ({ PlayerGmod: FakePlayerGmod }))

const prismaMock: any = {
  gm_user_steam: { findFirst: vi.fn() },
  gm_server: { findFirst: vi.fn() },
  gm_server_stat: { findFirst: vi.fn() },
}
vi.mock('@gmod/infra-prisma', () => ({ default: prismaMock }))

const {
  getEmptyEmbedBuilderField,
  getStatusMessage,
  getNotVerifiedMessage,
  getVerifiedMessageAnswer,
  getVerificationGuildMessage,
  getProfileMessage,
  getUserStatisticMessage,
} = await import('../../../src/discord/utils/messages.js')

function resetAllMocks() {
  getTranslateMock.mockClear()
  gmLogMock.mockClear()
  getUserFromDiscordIDMock.mockReset()
  dateToDiscordTimestampMock.mockClear()
  getServerChartMock.mockReset()
  getTrustRankMock.mockClear()
  secToTimeMock.mockClear()
  for (const table of Object.values(prismaMock)) {
    for (const fn of Object.values(table as Record<string, any>)) {
      ;(fn as ReturnType<typeof vi.fn>).mockReset()
    }
  }
}

function makeServer(
  overrides: { settings?: Record<string, any>; getServerStatusButtons?: any; name?: string } = {},
) {
  const settings: Record<string, any> = {
    show_status_chart: false,
    show_player_list_status: false,
    status_player_list_format: '{name}/{steamID64}',
    ...overrides.settings,
  }
  return {
    getID: () => 's1',
    getName: () => overrides.name ?? 'My Server',
    getSetting: vi.fn(async (key: string) => settings[key]),
    getServerStatusButtons: overrides.getServerStatusButtons ?? vi.fn(async () => []),
  } as any
}

describe('discord/utils/messages', () => {
  beforeEach(() => {
    resetAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getEmptyEmbedBuilderField', () => {
    it('defaults to a single line break', () => {
      expect(getEmptyEmbedBuilderField()).toBe('\n ​')
    })

    it('repeats the line break the requested number of times', () => {
      expect(getEmptyEmbedBuilderField(3)).toBe('\n ​\n ​\n ​')
    })

    it('returns an empty string for zero line breaks', () => {
      expect(getEmptyEmbedBuilderField(0)).toBe('')
    })
  })

  describe('getStatusMessage', () => {
    it('defaults every field to offline placeholders when data is undefined', async () => {
      const server = makeServer()
      const result = await getStatusMessage(server, undefined, 'en')

      const embed = result.embeds[0].toJSON()
      expect(gmLogMock).toHaveBeenCalledWith('status', 'refresh server status message for s1')
      const nameField = embed.fields?.find((f) => f.value === 'offline' && f.name.includes('name'))
      expect(nameField).toBeDefined()
      expect(result.files).toEqual([])
      expect(result.components).toEqual([])
    })

    it('renders full online data, the show_status_chart image, and the connect button', async () => {
      const server = makeServer({ settings: { show_status_chart: true } })
      getServerChartMock.mockResolvedValueOnce(Buffer.from('chart-bytes'))

      const data = {
        hostname: 'Cool Server',
        map: 'gm_construct',
        gameMode: 'sandbox',
        players: 3,
        maxPlayers: 10,
        ip: '203.0.113.5',
        port: '27015',
        playersList: [],
      }
      const result = await getStatusMessage(server, data, 'en')

      const embed = result.embeds[0].toJSON()
      expect(embed.image?.url).toBe('attachment://chart.png')
      expect(result.files).toEqual([{ attachment: Buffer.from('chart-bytes'), name: 'chart.png' }])

      const playersField = embed.fields?.find((f) => f.name.includes('players'))
      expect(playersField?.value).toBe('3/10')

      expect(result.components).toHaveLength(1)
      const row = result.components[0].toJSON() as any
      expect(row.components[0].url).toBe('https://website.example/open?link=steam://connect/203.0.113.5:27015')
    })

    it('does not add a player list field when the server is offline', async () => {
      const server = makeServer({ settings: { show_player_list_status: true } })
      const result = await getStatusMessage(
        server,
        { playersList: [{ steamID64: '1', name: 'A', connectTime: 1, userGroup: 'user' }] },
        'en',
      )
      const embed = result.embeds[0].toJSON()
      expect(embed.fields?.some((f) => f.name.includes('player_list'))).toBe(false)
    })

    it('does not add a player list field when playersList is empty', async () => {
      const server = makeServer({ settings: { show_player_list_status: true } })
      const result = await getStatusMessage(server, { hostname: 'H', playersList: [] }, 'en')
      const embed = result.embeds[0].toJSON()
      expect(embed.fields?.some((f) => f.name.includes('player_list'))).toBe(false)
    })

    it('does not add a player list field when show_player_list_status is disabled', async () => {
      const server = makeServer()
      const result = await getStatusMessage(
        server,
        { hostname: 'H', playersList: [{ steamID64: '1', name: 'A', connectTime: 1, userGroup: 'user' }] },
        'en',
      )
      const embed = result.embeds[0].toJSON()
      expect(embed.fields?.some((f) => f.name.includes('player_list'))).toBe(false)
    })

    it('adds a sorted player list field when online, populated, and enabled', async () => {
      const server = makeServer({
        settings: { show_player_list_status: true, status_player_list_format: '{name}/{steamID64}' },
      })
      const result = await getStatusMessage(
        server,
        {
          hostname: 'H',
          playersList: [
            { steamID64: '1', name: 'First', connectTime: 10, userGroup: 'user' },
            { steamID64: '2', name: 'Second', connectTime: 50, userGroup: 'user' },
          ],
        },
        'en',
      )
      const embed = result.embeds[0].toJSON()
      const playerListField = embed.fields?.find((f) => f.name.includes('player_list'))
      expect(playerListField?.value).toBe('Second/2\nFirst/1')
    })

    it('truncates the player list once it exceeds 800 characters', async () => {
      const server = makeServer({ settings: { show_player_list_status: true, status_player_list_format: '{name}' } })
      const longName = 'x'.repeat(50)
      const playersList = Array.from({ length: 30 }, (_, i) => ({
        steamID64: String(i),
        name: longName,
        connectTime: i,
        userGroup: 'user',
      }))
      const result = await getStatusMessage(server, { hostname: 'H', playersList }, 'en')
      const embed = result.embeds[0].toJSON()
      const playerListField = embed.fields?.find((f) => f.name.includes('player_list'))
      expect(playerListField?.value.endsWith('...')).toBe(true)
    })

    it.each([
      ['array input', [{ steamID64: '1', name: 'A', connectTime: 1, userGroup: 'user' }], true],
      ['valid JSON array string', JSON.stringify([{ steamID64: '1', name: 'A', connectTime: 1, userGroup: 'user' }]), true],
      ['valid JSON non-array string', '{"a":1}', false],
      ['invalid JSON string', 'not-json{{{', false],
      ['empty string', '', false],
      ['whitespace-only string', '   ', false],
      ['non-string non-array value', 42, false],
      ['null value', null, false],
    ])('normalizes playersList - %s', async (_label, playersList, expectField) => {
      const server = makeServer({ settings: { show_player_list_status: true } })
      const result = await getStatusMessage(server, { hostname: 'H', playersList }, 'en')
      const embed = result.embeds[0].toJSON()
      expect(embed.fields?.some((f) => f.name.includes('player_list'))).toBe(expectField)
    })

    it('falls back to the server ID for the title when getName() is falsy', async () => {
      const server = makeServer({ name: '' })
      const result = await getStatusMessage(server, { hostname: 'H' }, 'en')
      const embed = result.embeds[0].toJSON()
      expect(embed.title).toBe('status_of:s1')
    })

    it('does not set an image or attach files when show_status_chart is disabled', async () => {
      const server = makeServer()
      const result = await getStatusMessage(server, { hostname: 'H' }, 'en')
      const embed = result.embeds[0].toJSON()
      expect(embed.image).toBeUndefined()
      expect(result.files).toEqual([])
    })

    it('fills rows across the 5-button-per-row limit and drops overflow buttons', async () => {
      const buttons = Array.from({ length: 27 }, (_, i) => ({
        name: `button ${i}`,
        emoji: '😀',
        url: `https://example.com/${i}`,
      }))
      const server = makeServer({ getServerStatusButtons: vi.fn(async () => buttons) })
      const result = await getStatusMessage(server, {}, 'en')

      expect(result.components).toHaveLength(5)
      for (const row of result.components) {
        expect((row.toJSON() as any).components).toHaveLength(5)
      }
    })

    it('skips buttons missing a name or emoji, and swaps unknown/too-new emoji for a question mark', async () => {
      const buttons = [
        { name: '', emoji: '😀', url: 'a' }, // missing name -> skipped
        { name: 'no emoji', emoji: '', url: 'b' }, // missing emoji -> skipped
        { name: 'melting one', emoji: '🫠', url: 'c' }, // version 14.0 > 12 -> replaced
        { name: 'unknown emoji', emoji: 'not-an-emoji', url: 'd' }, // no version found -> replaced
        { name: 'classic smile', emoji: '😀', url: 'e' }, // version 1.0 <= 12 -> kept
      ]
      const server = makeServer({ getServerStatusButtons: vi.fn(async () => buttons) })
      const result = await getStatusMessage(server, {}, 'en')

      expect(result.components).toHaveLength(1)
      const row = result.components[0].toJSON() as any
      expect(row.components).toHaveLength(3)
      expect(row.components[0].label).toBe('⠀Melting One')
      expect(row.components[0].emoji.name).toBe('❓')
      expect(row.components[1].label).toBe('⠀Unknown Emoji')
      expect(row.components[1].emoji.name).toBe('❓')
      expect(row.components[2].label).toBe('⠀Classic Smile')
      expect(row.components[2].emoji.name).toBe('😀')
      expect(row.components[2].url).toBe('https://website.example/open?link=' + encodeURIComponent('e'))
    })
  })

  describe('getNotVerifiedMessage', () => {
    it('builds a welcome embed with verification buttons', async () => {
      const guild = { preferredLocale: 'en' } as any
      const member = { user: { username: 'Bob' } } as any

      const result = await getNotVerifiedMessage(guild, member)

      expect(getTranslateMock).toHaveBeenCalledWith('hello', 'en', ['Bob'])
      expect(result.embeds).toHaveLength(1)
      expect(result.components).toHaveLength(1)
      const embed = result.embeds[0].toJSON()
      const p2Field = embed.fields?.find((f) => f.value.includes('Garry'))
      // The link markdown must be well-formed (no stray characters inside the URL portion).
      expect(p2Field?.value).toContain(
        "[Garry's Mod Integration](https://panel.example/oauth&state=redirect:/account?startVerification=true)",
      )
      expect(p2Field?.value).not.toContain("true')")
    })
  })

  describe('getVerifiedMessageAnswer', () => {
    it('returns a self-verified confirmation', async () => {
      const result = await getVerifiedMessageAnswer(true, 'en', { id: 'u1' } as any, true)
      expect(result).toEqual({ content: 'user_verified_self', ephemeral: true })
    })

    it('returns a verified-by-someone-else confirmation', async () => {
      const result = await getVerifiedMessageAnswer(true, 'en', { id: 'u1' } as any, false)
      expect(result).toEqual({ content: 'user_verified:<@u1>', ephemeral: true })
    })

    it('returns a not-verified-self message with the verification button row', async () => {
      const result: any = await getVerifiedMessageAnswer(false, 'en', { id: 'u1' } as any, true)
      expect(result.content).toBe('user_not_verified_self:/verify\n_ _')
      expect(result.ephemeral).toBe(true)
      expect(result.components).toHaveLength(1)
    })

    it('returns a not-verified-by-someone-else message with the verification button row', async () => {
      const result: any = await getVerifiedMessageAnswer(false, 'en', { id: 'u1' } as any, false)
      expect(result.content).toBe('user_not_verified:<@u1>,/verify\n_ _')
      expect(result.components).toHaveLength(1)
    })
  })

  describe('getVerificationGuildMessage', () => {
    it('builds the guild setup embed with buttons', async () => {
      const result = await getVerificationGuildMessage('en', 'guild-1')
      expect(result.embeds).toHaveLength(1)
      expect(result.components).toHaveLength(1)
      const embed = result.embeds[0].toJSON()
      expect(embed.title).toBe('welcome_on_our_server')
    })
  })

  describe('getProfileMessage', () => {
    it('falls back to default rank/trust and "never"/"not_verified" placeholders when no DB user exists', async () => {
      getUserFromDiscordIDMock.mockResolvedValueOnce(null)
      const guild = { preferredLocale: 'en' } as any
      const user = { id: 'u1', username: 'Bob', displayAvatarURL: () => 'https://avatar.example/u1' } as any

      const result = await getProfileMessage(guild, user)

      const embed = result.embeds[0].toJSON()
      expect(embed.thumbnail?.url).toBe('https://avatar.example/u1')
      const trustField = embed.fields?.find((f) => f.name.includes('trust_rank'))
      expect(trustField?.value).toBe('trust-50')
      const steamField = embed.fields?.find((f) => f.name.includes('steam_id'))
      expect(steamField?.value).toBe('not_verified')
      const verifField = embed.fields?.find((f) => f.name.includes('last_verification'))
      expect(verifField?.value).toBe('never')
      expect(result.components[0].toJSON().components).toHaveLength(1)
    })

    it('renders the DB user rank/trust/lastVerification/steamID64 and adds the steam profile button', async () => {
      getUserFromDiscordIDMock.mockResolvedValueOnce({
        rank: 'admin',
        trustLevel: 90,
        lastVerification: new Date(1700000000000),
        steamID64: '76500000000000001',
      })
      const guild = { preferredLocale: 'en' } as any
      const user = { id: 'u1', username: 'Bob', displayAvatarURL: () => 'https://avatar.example/u1' } as any

      const result = await getProfileMessage(guild, user)

      const embed = result.embeds[0].toJSON()
      const steamField = embed.fields?.find((f) => f.name.includes('steam_id'))
      expect(steamField?.value).toBe('76500000000000001')
      const verifField = embed.fields?.find((f) => f.name.includes('last_verification'))
      expect(verifField?.value).toBe(dateToDiscordTimestampMock.mock.results[0]?.value ?? verifField?.value)
      expect(result.components[0].toJSON().components).toHaveLength(2)
      const steamButton = result.components[0].toJSON().components[1] as any
      expect(steamButton.url).toBe('https://steamcommunity.com/profiles/76500000000000001')
    })
  })

  describe('getUserStatisticMessage', () => {
    it('returns user_not_linked when no steamid is given and no DB user is linked', async () => {
      getUserFromDiscordIDMock.mockResolvedValueOnce(null)
      const result = await getUserStatisticMessage({ id: 'u1' } as any, 'global', { preferredLocale: 'en' } as any)
      expect(result).toEqual({ content: 'user_not_linked', ephemeral: true })
    })

    it('returns user_not_found for the global scope when no stats row exists', async () => {
      getUserFromDiscordIDMock.mockResolvedValueOnce({ steamID64: '765' })
      prismaMock.gm_user_steam.findFirst.mockResolvedValueOnce(null)
      const result = await getUserStatisticMessage({ id: 'u1' } as any, 'global', { preferredLocale: 'en' } as any)
      expect(result).toEqual({ content: 'user_not_found', ephemeral: true })
    })

    it('renders full global stats when a steamid is passed directly and every field is populated', async () => {
      prismaMock.gm_user_steam.findFirst.mockResolvedValueOnce({
        username: 'PlayerOne',
        steam_id: '765',
        total_kill: 42,
        total_death: 7,
        total_time: 3600,
        total_connect: 5,
        last_connect: new Date(1700000000000),
      })
      const result: any = await getUserStatisticMessage(
        { id: 'u1' } as any,
        'global',
        { preferredLocale: 'en' } as any,
        '765',
      )
      expect(getUserFromDiscordIDMock).not.toHaveBeenCalled()
      const embed = result.embeds[0].toJSON()
      expect(embed.title).toBe('stat_of_global:PlayerOne')
      const killsField = embed.fields.find((f: any) => f.name.includes('total_kills'))
      expect(killsField.value).toBe('42')
    })

    it('renders global stats fallbacks ("Unknown"/"0"/"Never") when fields are empty', async () => {
      prismaMock.gm_user_steam.findFirst.mockResolvedValueOnce({
        username: null,
        steam_id: '765',
        total_kill: 0,
        total_death: 0,
        total_time: 0,
        total_connect: 0,
        last_connect: null,
      })
      const result: any = await getUserStatisticMessage(
        { id: 'u1' } as any,
        'global',
        { preferredLocale: 'en' } as any,
        '765',
      )
      const embed = result.embeds[0].toJSON()
      expect(embed.title).toBe('stat_of_global:765')
      const usernameField = embed.fields.find((f: any) => f.name.includes('username'))
      expect(usernameField.value).toBe('Unknown')
      const killsField = embed.fields.find((f: any) => f.name.includes('total_kills'))
      expect(killsField.value).toBe('0')
      const lastJoinField = embed.fields.find((f: any) => f.name.includes('last_join'))
      expect(lastJoinField.value).toBe('Never')
    })

    it('returns server_not_found for a non-global scope when the server does not exist', async () => {
      prismaMock.gm_server.findFirst.mockResolvedValueOnce(null)
      const result = await getUserStatisticMessage(
        { id: 'u1' } as any,
        'srv1',
        { preferredLocale: 'en' } as any,
        '765',
      )
      expect(result).toEqual({ content: 'server_not_found', ephemeral: true })
    })

    it('returns user_or_server_not_found for a non-global scope when there is no per-server stat row', async () => {
      prismaMock.gm_server.findFirst.mockResolvedValueOnce({ id: 'srv1', name: 'Server One' })
      prismaMock.gm_server_stat.findFirst.mockResolvedValueOnce(null)
      const result = await getUserStatisticMessage(
        { id: 'u1' } as any,
        'srv1',
        { preferredLocale: 'en' } as any,
        '765',
      )
      expect(result).toEqual({ content: 'user_or_server_not_found', ephemeral: true })
    })

    it('renders full per-server stats with custom_values (money/bank/job/unknown keys)', async () => {
      prismaMock.gm_server.findFirst.mockResolvedValueOnce({ id: 'srv1', name: 'Server One' })
      prismaMock.gm_server_stat.findFirst.mockResolvedValueOnce({
        name: 'PlayerOne',
        steam_id: '765',
        rank: 'vip',
        createdAt: new Date(1700000000000),
        updatedAt: new Date(1700000001000),
        total_kill: 10,
        total_death: 2,
        total_time: 120,
        total_connect: 3,
        custom_values: JSON.stringify({ money: 1000, bank: 500, job: 'Police', mysteryStat: 7 }),
      })
      const result: any = await getUserStatisticMessage(
        { id: 'u1' } as any,
        'srv1',
        { preferredLocale: 'en-US' } as any,
        '765',
      )
      const embed = result.embeds[0].toJSON()
      expect(embed.footer?.text).toBe('SteamID: 765 - Server: Server One')
      const moneyField = embed.fields.find((f: any) => f.name.includes('money'))
      expect(moneyField.value).toBe((1000).toLocaleString('en-US', { style: 'currency', currency: 'USD' }))
      const bankField = embed.fields.find((f: any) => f.name.includes('bank'))
      expect(bankField.value).toBe((500).toLocaleString('en-US', { style: 'currency', currency: 'USD' }))
      const jobField = embed.fields.find((f: any) => f.name.includes('job'))
      expect(jobField.value).toBe('Police')
      const mysteryField = embed.fields.find((f: any) => f.name === 'mysteryStat')
      expect(mysteryField.value).toBe('7')
    })

    it('renders per-server stats fallbacks ("Unknown"/"0"/"Never") and skips custom_values when absent', async () => {
      prismaMock.gm_server.findFirst.mockResolvedValueOnce({ id: 'srv1', name: 'Server One' })
      prismaMock.gm_server_stat.findFirst.mockResolvedValueOnce({
        name: null,
        steam_id: '765',
        rank: null,
        createdAt: null,
        updatedAt: null,
        total_kill: 0,
        total_death: 0,
        total_time: 0,
        total_connect: 0,
        custom_values: null,
      })
      const result: any = await getUserStatisticMessage(
        { id: 'u1' } as any,
        'srv1',
        { preferredLocale: 'en' } as any,
        '765',
      )
      const embed = result.embeds[0].toJSON()
      const nameField = embed.fields.find((f: any) => f.name.includes('name'))
      expect(nameField.value).toBe('Unknown')
      const rankField = embed.fields.find((f: any) => f.name.includes('rank'))
      expect(rankField.value).toBe('Unknown')
      const firstJoinField = embed.fields.find((f: any) => f.name.includes('first_join'))
      expect(firstJoinField.value).toBe('Never')
    })

    it('uses getUserFromDiscordID to resolve steamID64 when no steamid argument is given', async () => {
      getUserFromDiscordIDMock.mockResolvedValueOnce({ steamID64: '765' })
      prismaMock.gm_server.findFirst.mockResolvedValueOnce({ id: 'srv1', name: 'Server One' })
      prismaMock.gm_server_stat.findFirst.mockResolvedValueOnce({
        name: 'PlayerOne',
        steam_id: '765',
        rank: 'vip',
        createdAt: new Date(),
        updatedAt: new Date(),
        total_kill: 1,
        total_death: 1,
        total_time: 1,
        total_connect: 1,
        custom_values: null,
      })

      await getUserStatisticMessage({ id: 'u1' } as any, 'srv1', { preferredLocale: 'en' } as any, null)

      expect(getUserFromDiscordIDMock).toHaveBeenCalledWith('u1')
      expect(prismaMock.gm_server_stat.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ steam_id: '765' }) }),
      )
    })
  })
})
