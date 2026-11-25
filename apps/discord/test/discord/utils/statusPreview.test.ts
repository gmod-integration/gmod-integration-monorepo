import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GmodPlayersListSchema } from '@gmod/schema/gmod/GmodPlayerSchema.js'
import type * as AccessModule from '@gmod/domain-access/index.js'

const accessMock = vi.hoisted(() => vi.fn())
vi.mock('@gmod/domain-access/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof AccessModule>()
  return { ...actual, resolveGuildAccess: accessMock }
})
beforeEach(() =>
  accessMock.mockImplementation(async (guildID: string) => ({
    guildID,
    premium: true,
    customBot: true,
    state: 'ready',
    sources: ['gmodstore'],
    revision: 'test',
    validUntil: '2030-01-01T00:00:00.000Z',
  })),
)

vi.mock('@gmod/core/utils/localizations.js', () => ({
  getTranslate: vi.fn(
    async (key: string, lang: string, values?: string[]) => `${lang}:${key}${values ? ':' + values.join(',') : ''}`,
  ),
}))
vi.mock('@gmod/shared/logger.js', () => ({ gmLog: vi.fn() }))
vi.mock('@gmod/config', () => ({
  ConfigDiscord: { embedColor: 0x393a41 },
  ConfigServer: { websiteUrl: 'https://website.example' },
}))
vi.mock('@gmod/domain-user/User.js', () => ({ getUserFromDiscordID: vi.fn() }))
const chart = vi.fn()
vi.mock('../../../src/discord/utils/index.js', () => ({
  getServerChart: chart,
  dateToDiscordTimestamp: vi.fn(),
  getTrustRank: vi.fn(),
  secToTime: vi.fn(),
}))
const playerInputs: unknown[] = []
vi.mock('@gmod/core/classes/v3/PlayerGmod.js', () => ({
  PlayerGmod: class {
    constructor(private raw: { name: string }) {
      playerInputs.push(raw)
    }
    getStringFromString(format: string) {
      return format.replaceAll('{name}', this.raw.name)
    }
  },
}))
const statusRead = vi.fn()
vi.mock('@gmod/infra-prisma', () => ({ default: { gm_server_status: { findUnique: statusRead } } }))
const { renderStatusPreview } = await import('../../../src/discord/utils/statusPreview.js')
const { getStatusMessage } = await import('../../../src/discord/utils/messages.js')

function guild(member: boolean = true) {
  return {
    preferredLocale: 'fr',
    members: {
      me: member ? { displayName: 'Community bot', displayAvatarURL: () => 'https://cdn.example/member.png' } : null,
    },
    client: { user: { username: 'Main bot', displayAvatarURL: () => 'https://cdn.example/bot.png' } },
  } as any
}
function server(
  data: any = {
    hostname: 'Actual hostname',
    players: 2,
    maxPlayers: 32,
    ip: '192.0.2.1',
    port: 27015,
    map: 'gm_construct',
    gameMode: 'sandbox',
    playersList: [
      { name: 'New player', connectTime: 10 },
      { name: 'Veteran', connectTime: 300 },
    ],
  },
) {
  const result = {
    getGuildID: () => 'guild',
    getID: () => 's1',
    getName: () => 'Actual server',
    getStatusData: vi.fn(async () => data),
    getSetting: vi.fn(
      async (key: string) =>
        ({ show_status_chart: false, show_player_list_status: false, status_player_list_format: '{name}' })[key],
    ),
    getServerStatusButtons: vi.fn(async () => []),
    setSetting: vi.fn(),
    createStatus: vi.fn(),
    editStatusChannelAndMessage: vi.fn(),
  } as any
  result.getEffectiveSetting = result.getSetting
  result.getEffectiveStatusButtons = result.getServerStatusButtons
  return result
}
const button = { name: 'DOCS', emoji: '📘', url: 'https://example.com/docs', enable: true }

describe('read-only Discord status preview', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-20T12:00:00.000Z'))
    chart.mockReset()
    statusRead.mockReset()
    playerInputs.length = 0
  })
  afterEach(() => vi.useRealTimers())

  it('renders exact bot fields and draft values without changing the source or posting a message', async () => {
    const source = server()
    const originalData = structuredClone(await source.getStatusData())
    const preview = await renderStatusPreview(
      source,
      {
        settings: { show_player_list_status: true, status_player_list_format: '**{name}** {name}' },
        buttons: [button],
      },
      guild(),
    )
    expect(preview.bot).toEqual({ name: 'Community bot', avatarUrl: 'https://cdn.example/member.png' })
    expect(preview.online).toBe(true)
    expect(preview.embeds[0].title).toBe('fr:status_of:Actual server')
    expect(preview.embeds[0].fields.find((field) => field.name.includes('player_list'))!.value).toBe(
      '**Veteran** Veteran\n**New player** New player',
    )
    expect(preview.buttonRows[0]).toHaveLength(2)
    expect(preview.buttonRows[0][1]).toMatchObject({
      label: '⠀Docs',
      emoji: '📘',
      url: 'https://website.example/open?link=https%3A%2F%2Fexample.com%2Fdocs',
    })
    expect(await source.getStatusData()).toEqual(originalData)
    expect(source.setSetting).not.toHaveBeenCalled()
    expect(source.createStatus).not.toHaveBeenCalled()
    expect(source.editStatusChannelAndMessage).not.toHaveBeenCalled()
    expect(await source.getSetting('show_player_list_status')).toBe(false)
  })

  it('rechecks access at execution so a queued preview cannot keep a paid chart after expiry', async () => {
    accessMock.mockResolvedValueOnce({
      guildID: 'guild',
      premium: false,
      customBot: false,
      state: 'ready',
      sources: [],
      revision: 'expired',
      validUntil: '2030-01-01T00:00:00.000Z',
    })
    const source = server()
    const preview = await renderStatusPreview(
      source,
      {
        settings: { show_status_chart: true },
        buttons: Array.from({ length: 4 }, (_, index) => ({ ...button, name: 'Link ' + index })),
      },
      guild(),
    )
    expect(chart).not.toHaveBeenCalled()
    expect(preview.embeds[0].imageUrl).toBeNull()
    expect(preview.buttonRows.flat().filter((entry) => entry.label.includes('Link'))).toHaveLength(3)
    expect(source.setSetting).not.toHaveBeenCalled()
  })

  it('retains stored values when no draft override exists and renders offline custom buttons', async () => {
    const source = server(undefined)
    source.getStatusData.mockResolvedValueOnce(undefined)
    source.getServerStatusButtons.mockResolvedValueOnce([button])
    const preview = await renderStatusPreview(source, { settings: {} }, guild(false))
    expect(preview.online).toBe(false)
    expect(preview.bot.name).toBe('Main bot')
    expect(preview.bot.avatarUrl).toBe('https://cdn.example/bot.png')
    expect(preview.embeds[0].fields.find((field) => field.name.includes('status'))!.value).toBe('fr:offline')
    expect(preview.embeds[0].fields.some((field) => field.name.includes('player_list'))).toBe(false)
    expect(preview.buttonRows.flat()).toHaveLength(1)
    expect(source.getServerStatusButtons).toHaveBeenCalledOnce()
  })

  it.each([
    ['en', 'fr'],
    ['fr', 'en-US'],
  ] as const)('renders a %s simulation even when the guild language is %s', async (locale, guildLocale) => {
    const source = server()
    source.getName = () => 'Mon serveur'
    const community = guild()
    community.preferredLocale = guildLocale
    const preview = await renderStatusPreview(
      source,
      { simulation: true, locale, settings: {}, buttons: [{ ...button, name: 'Mon guide' }] },
      community,
    )

    expect(preview.embeds[0].title).toBe(`${locale}:status_of:Mon serveur`)
    expect(preview.embeds[0].fields).toContainEqual({ name: `💾⠀${locale}:name`, value: 'Mon serveur', inline: true })
    expect(preview.embeds[0].fields).toContainEqual({
      name: `📡⠀${locale}:status`,
      value: `${locale}:online`,
      inline: true,
    })
    expect(preview.embeds[0].fields).toContainEqual({ name: `🗺️⠀${locale}:map`, value: 'gm_construct', inline: true })
    expect(preview.buttonRows[0][0].label).toBe(`⠀${locale}:server-connect`)
    expect(preview.buttonRows[0][1].label).toBe('⠀Mon Guide')
    expect(community.preferredLocale).toBe(guildLocale)
    expect(source.setSetting).not.toHaveBeenCalled()
  })

  it('falls back to the guild language when a simulation has no website language override', async () => {
    const preview = await renderStatusPreview(server(), { simulation: true, settings: {} }, guild())
    expect(preview.embeds[0].title).toBe('fr:status_of:Actual server')
    expect(preview.buttonRows[0][0].label).toBe('⠀fr:server-connect')
  })

  it('uses the same renderer as publishing and serializes charts without storage', async () => {
    const source = server()
    chart.mockResolvedValue(Buffer.from('actual-png'))
    const draft = { settings: { show_status_chart: true }, buttons: [] }
    const preview = await renderStatusPreview(source, draft, guild())
    expect(chart).toHaveBeenCalledWith(expect.anything(), { persist: false })
    expect(preview.embeds[0].imageUrl).toBe('data:image/png;base64,YWN0dWFsLXBuZw==')
    const publishedView = Object.create(source)
    publishedView.getEffectiveSetting = async (key: string) =>
      key === 'show_status_chart' ? true : source.getSetting(key)
    const rendered = await getStatusMessage(publishedView, await source.getStatusData(), 'fr', { persistChart: false })
    const embed = rendered.embeds[0].toJSON()
    expect(preview.embeds[0]).toMatchObject({
      title: embed.title,
      color: embed.color,
      fields: embed.fields,
      timestamp: embed.timestamp,
    })
    expect(rendered.files[0].attachment).toEqual(Buffer.from('actual-png'))
  })

  it('skips incomplete drafts, keeps disabled buttons out, and shares the 25-button Discord limit', async () => {
    const source = server()
    const omitted = await renderStatusPreview(
      source,
      {
        settings: {},
        buttons: [
          { ...button, name: '' },
          { ...button, emoji: '' },
          { ...button, url: '' },
          { ...button, enable: false },
        ],
      },
      guild(),
    )
    expect(omitted.buttonRows.flat()).toHaveLength(1) // Connect only.
    const preview = await renderStatusPreview(
      source,
      { settings: {}, buttons: Array.from({ length: 25 }, (_, i) => ({ ...button, name: `Docs ${i}` })) },
      guild(),
    )
    expect(preview.buttonRows).toHaveLength(5)
    expect(preview.buttonRows.every((row) => row.length === 5)).toBe(true)
  })

  it('represents an empty player format without invalid empty Discord fields', async () => {
    const preview = await renderStatusPreview(
      server(),
      { settings: { show_player_list_status: true, status_player_list_format: '' } },
      guild(),
    )
    expect(preview.embeds[0].fields.find((field) => field.name.includes('player_list'))!.value).toBe('\u200b')
    const one = server({ hostname: 'Online', playersList: [{ name: 'Only player', connectTime: 1 }] })
    const single = await renderStatusPreview(
      one,
      { settings: { show_player_list_status: true, status_player_list_format: '' } },
      guild(),
    )
    expect(single.embeds[0].fields.find((field) => field.name.includes('player_list'))!.value).toBe('\u200b')
  })

  it('simulates five valid players while retaining server metadata even when its live snapshot has expired', async () => {
    const stored = { hostname: 'Last hostname', map: 'rp_downtown', gameMode: 'darkrp', maxPlayers: 64 }
    statusRead.mockResolvedValue(stored)
    const original = structuredClone(stored)
    const source = server()
    source.getStatusData.mockResolvedValue(undefined)
    const draft = {
      simulation: true,
      settings: { show_player_list_status: true, status_player_list_format: '{name} | {name}' },
    }
    const preview = await renderStatusPreview(source, draft, guild())

    expect(preview).toMatchObject({ online: true, simulation: true })
    expect(preview.embeds[0].fields.some((field) => field.value === '5/64')).toBe(true)
    expect(preview.embeds[0].fields.some((field) => field.value === 'rp_downtown')).toBe(true)
    expect(preview.embeds[0].fields.some((field) => field.value === 'darkrp')).toBe(true)
    const players = GmodPlayersListSchema.parse(playerInputs)
    expect(players).toHaveLength(5)
    expect(new Set(players.map((player) => player.steamID64)).size).toBe(5)
    expect(new Set(players.map((player) => player.team.name)).size).toBe(5)
    expect(new Set(players.map((player) => player.userGroup)).size).toBeGreaterThan(1)
    expect(players.every((player) => player.name.includes('[SIMULATION]'))).toBe(true)
    expect(players.map((player) => player.connectTime)).toEqual([4200, 3600, 3000, 2400, 1800])
    const lines = preview.embeds[0].fields.find((field) => field.name.includes('player_list'))!.value.split('\n')
    expect(lines).toHaveLength(5)
    for (const [index, line] of lines.entries()) expect(line).toBe(`${players[index].name} | ${players[index].name}`)
    expect(preview.buttonRows.flat()[0].url).toContain('192.0.2.1')
    expect(statusRead).toHaveBeenCalledWith({
      where: { id: 's1' },
      select: { hostname: true, map: true, gameMode: true, maxPlayers: true },
    })
    expect(source.getStatusData).not.toHaveBeenCalled()
    expect(source.setSetting).not.toHaveBeenCalled()
    expect(source.createStatus).not.toHaveBeenCalled()
    expect(source.editStatusChannelAndMessage).not.toHaveBeenCalled()
    expect(stored).toEqual(original)

    const repeated = await renderStatusPreview(source, draft, guild())
    expect(repeated).toEqual(preview)
    const real = await renderStatusPreview(source, { settings: {} }, guild())
    expect(real.online).toBe(false)
    expect(real).not.toHaveProperty('simulation')
    expect(source.getStatusData).toHaveBeenCalledOnce()
  })

  it.each([
    [
      { hostname: 'Saved hostname', map: 'saved_map', gameMode: 'terrortown', maxPlayers: 2 },
      'Saved hostname',
      'saved_map',
      'terrortown',
      '5/5',
    ],
    [{ hostname: '', map: '', gameMode: '', maxPlayers: 0 }, 'Garry’s Mod', 'gm_construct', 'sandbox', '5/32'],
    [null, 'Garry’s Mod', 'gm_construct', 'sandbox', '5/32'],
  ])(
    'provides a complete simulation with missing or small stored metadata (%#)',
    async (stored, name, map, mode, population) => {
      statusRead.mockResolvedValueOnce(stored)
      const source = server()
      source.getName = () => ''
      const preview = await renderStatusPreview(
        source,
        { simulation: true, settings: { show_player_list_status: true } },
        guild(),
      )
      const values = preview.embeds[0].fields.map((field) => field.value)
      expect(preview.online).toBe(true)
      expect(values).toContain(name)
      expect(values).toContain(map)
      expect(values).toContain(mode)
      expect(values).toContain(population)
      expect(GmodPlayersListSchema.parse(playerInputs)).toHaveLength(5)
    },
  )

  it('keeps synthetic players hidden when the player-list option is disabled and does not affect real previews', async () => {
    statusRead.mockResolvedValueOnce(null)
    const source = server()
    const preview = await renderStatusPreview(
      source,
      { simulation: true, settings: { show_player_list_status: false } },
      guild(),
    )
    expect(preview.online).toBe(true)
    expect(preview.embeds[0].fields.some((field) => field.name.includes('player_list'))).toBe(false)
    expect(playerInputs).toEqual([])
    statusRead.mockClear()
    const real = await renderStatusPreview(source, { simulation: false, settings: {} }, guild())
    expect(statusRead).not.toHaveBeenCalled()
    expect(real).not.toHaveProperty('simulation')
    expect(real.embeds[0].fields.some((field) => field.value === '2/32')).toBe(true)
  })
})
