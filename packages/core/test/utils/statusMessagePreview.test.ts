import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Server } from '@gmod/domain-server/Server.js'

const mocks = vi.hoisted(() => ({
  cache: vi.fn(),
  legacy: vi.fn(),
  purchase: vi.fn(),
  buttons: vi.fn(),
  stored: vi.fn(),
  chart: vi.fn(),
}))
vi.mock('@gmod/config', () => ({
  ConfigDiscord: { embedColor: 0x393a41 },
  ConfigServer: { websiteUrl: 'https://website.example' },
}))
vi.mock('@gmod/infra-redis', () => ({ default: { get: mocks.cache } }))
vi.mock('@gmod/infra-prisma', () => ({
  default: {
    gm_guild_premium: { findFirst: mocks.legacy },
    gm_gmodstore_purchases: { findFirst: mocks.purchase },
    gm_status_button: { findMany: mocks.buttons },
    gm_server_status: { findUnique: mocks.stored },
  },
}))
vi.mock('@gmod/core/utils/localizations.js', () => ({
  getTranslate: async (key: string, lang: string, values?: string[]) =>
    `${lang}:${key}${values ? ':' + values.join(',') : ''}`,
}))
vi.mock('@gmod/shared/logger.js', () => ({ gmLog: vi.fn() }))
vi.mock('@gmod/core/utils/tools.js', () => ({ getEmojiVersion: () => '1' }))
vi.mock('@gmod/core/classes/v3/PlayerGmod.js', () => ({
  PlayerGmod: class {
    constructor(private raw: { name: string }) {}
    getStringFromString(format: string) {
      return format.replaceAll('{name}', this.raw.name)
    }
  },
}))
vi.mock('../../src/utils/serverStatusChart.js', () => ({ getServerChart: mocks.chart }))
const { renderStatusPreview, resolvePreviewAccess } = await import('../../src/utils/statusMessagePreview.js')
const { buildStatusConnectButton } = await import('../../src/utils/statusMessage.js')
const now = new Date('2026-11-26T12:00:00Z')
const access = (changes: Record<string, unknown> = {}) => ({
  guildID: 'g1',
  premium: true,
  customBot: false,
  state: 'ready',
  sources: ['discord'],
  revision: 'cached',
  validUntil: '2026-11-26T12:01:00Z',
  ...changes,
})
const button = { name: 'DOCS', emoji: '📘', url: 'https://example.com/docs', enable: true }
const server = () => {
  const settings = { show_status_chart: false, show_player_list_status: false, status_player_list_format: '{name}' }
  const source = {
    getID: () => 's1',
    getGuildID: () => 'g1',
    getName: () => 'My server',
    getSetting: vi.fn(async (key: keyof typeof settings) => settings[key]),
    getStatusData: vi.fn(async () => ({
      hostname: 'Live hostname',
      map: 'gm_construct',
      gameMode: 'sandbox',
      players: 2,
      maxPlayers: 32,
      ip: '192.0.2.1',
      port: 27015,
      playersList: [
        { name: 'New', connectTime: 1 },
        { name: 'Veteran', connectTime: 100 },
      ],
    })),
    getEffectiveSetting: vi.fn(() => {
      throw new Error('Must not verify access remotely')
    }),
    getEffectiveStatusButtons: vi.fn(() => {
      throw new Error('Must not verify access remotely')
    }),
    setSetting: vi.fn(),
    createStatus: vi.fn(),
    editStatusChannelAndMessage: vi.fn(),
  }
  return source as unknown as Server & typeof source
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
  vi.resetAllMocks()
  mocks.cache.mockResolvedValue(null)
  mocks.legacy.mockResolvedValue(null)
  mocks.purchase.mockResolvedValue(null)
  mocks.buttons.mockResolvedValue([])
  mocks.stored.mockResolvedValue(null)
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('No Discord or other external HTTP request is allowed')
    }),
  )
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('website status preview without Discord', () => {
  it('uses an unexpired local access proof and rejects expired, malformed or mismatched snapshots without fetching providers', async () => {
    mocks.cache.mockResolvedValueOnce(JSON.stringify(access()))
    expect(await resolvePreviewAccess('g1')).toMatchObject({ premium: true, state: 'ready', sources: ['discord'] })
    expect(mocks.legacy).not.toHaveBeenCalled()
    for (const raw of [
      JSON.stringify(access({ guildID: 'other' })),
      JSON.stringify(access({ validUntil: now.toISOString() })),
      '{bad',
      JSON.stringify(access({ state: 'unknown' })),
    ]) {
      mocks.cache.mockResolvedValueOnce(raw)
      expect(await resolvePreviewAccess('g1')).toMatchObject({ premium: false, state: 'unknown' })
    }
    expect(fetch).not.toHaveBeenCalled()
  })
  it('preserves valid local grants through cache/provider outages and stays conservative without a proof', async () => {
    mocks.cache.mockRejectedValue(new Error('Redis unavailable'))
    mocks.legacy.mockResolvedValueOnce({ revoked: false })
    mocks.purchase.mockResolvedValueOnce({ revoke: false })
    expect(await resolvePreviewAccess('g1')).toMatchObject({
      premium: true,
      customBot: true,
      state: 'ready',
      sources: ['legacy', 'gmodstore'],
    })
    mocks.legacy.mockResolvedValueOnce({ revoked: true })
    mocks.purchase.mockResolvedValueOnce({ revoke: true })
    expect(await resolvePreviewAccess('g1')).toMatchObject({ premium: false, state: 'unknown', sources: [] })
    mocks.legacy.mockRejectedValueOnce(new Error('Database unavailable'))
    mocks.purchase.mockRejectedValueOnce(new Error('Database unavailable'))
    expect(await resolvePreviewAccess('g1')).toMatchObject({ premium: false, state: 'unknown' })
    expect(fetch).not.toHaveBeenCalled()
  })
  it('renders draft data, formatting and links without mutating the source or invoking effective-setting remote access', async () => {
    mocks.cache.mockResolvedValue(JSON.stringify(access()))
    const source = server()
    const original = structuredClone(await source.getStatusData())
    const draft = {
      settings: { show_player_list_status: true, status_player_list_format: '**{name}** {name}' },
      buttons: [button],
      locale: 'fr' as const,
    }
    const preview = await renderStatusPreview(source, draft)
    expect(preview).toMatchObject({
      bot: { name: 'Gmod Integration', avatarUrl: null },
      online: true,
      accessState: 'ready',
    })
    expect(preview.embeds[0].title).toBe('fr:status_of:My server')
    expect(preview.embeds[0].fields.find((field) => field.name.includes('player_list'))?.value).toBe(
      '**Veteran** Veteran\n**New** New',
    )
    expect(preview.buttonRows[0]).toHaveLength(2)
    expect(preview.buttonRows[0][1]).toMatchObject({
      label: '⠀Docs',
      emoji: '📘',
      url: 'https://website.example/open?link=https%3A%2F%2Fexample.com%2Fdocs',
    })
    expect(await source.getStatusData()).toEqual(original)
    expect(source.getEffectiveSetting).not.toHaveBeenCalled()
    expect(source.getEffectiveStatusButtons).not.toHaveBeenCalled()
    expect(source.setSetting).not.toHaveBeenCalled()
    expect(source.createStatus).not.toHaveBeenCalled()
    expect(source.editStatusChannelAndMessage).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('uses conservative Free limits for a cold access cache and retains the unchanged draft', async () => {
    const source = server()
    const draft = {
      settings: { show_status_chart: true },
      buttons: Array.from({ length: 4 }, (_, i) => ({ ...button, name: `Link ${i}` })),
    }
    const preview = await renderStatusPreview(source, draft)
    expect(preview.accessState).toBe('unknown')
    expect(preview.embeds[0].imageUrl).toBeNull()
    expect(preview.buttonRows.flat().filter((entry) => entry.label.includes('Link'))).toHaveLength(3)
    expect(draft.settings.show_status_chart).toBe(true)
    expect(draft.buttons).toHaveLength(4)
    expect(mocks.chart).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('loads stored buttons in deterministic quota order and keeps incomplete drafts out', async () => {
    const source = server()
    mocks.buttons.mockResolvedValue([
      { ...button, enable: false },
      button,
      button,
      { ...button, name: 'Outside quota' },
    ])
    const saved = await renderStatusPreview(source, { settings: {} })
    expect(saved.buttonRows.flat()).toHaveLength(3)
    expect(saved.buttonRows.flat().some((entry) => entry.label.includes('Outside'))).toBe(false)
    expect(mocks.buttons).toHaveBeenCalledWith({ where: { server: 's1' }, orderBy: { id: 'asc' } })
    const preview = await renderStatusPreview(source, {
      settings: {},
      buttons: [
        { ...button, name: '' },
        { ...button, emoji: '' },
        { ...button, url: '' },
      ],
    })
    expect(preview.buttonRows.flat()).toHaveLength(1)
  })
  it('renders the paid chart locally without writing storage and respects offline status', async () => {
    mocks.cache.mockResolvedValue(JSON.stringify(access()))
    mocks.chart.mockResolvedValue(Buffer.from('png'))
    const source = server()
    const preview = await renderStatusPreview(source, { settings: { show_status_chart: true }, buttons: [] })
    expect(preview.embeds[0].imageUrl).toBe('data:image/png;base64,cG5n')
    expect(mocks.chart).toHaveBeenCalledWith(expect.anything(), { persist: false })
    source.getStatusData.mockResolvedValueOnce(null as never)
    const offline = await renderStatusPreview(source, { settings: {}, buttons: [button] })
    expect(offline.online).toBe(false)
    expect(offline.buttonRows.flat()).toHaveLength(1)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('uses fictional players only in simulation and never reads a real live snapshot for that mode', async () => {
    const source = server()
    mocks.stored.mockResolvedValue({ map: 'rp_downtown', gameMode: 'darkrp', maxPlayers: 64 })
    const preview = await renderStatusPreview(source, {
      settings: { show_player_list_status: true },
      simulation: true,
      buttons: [],
    })
    expect(preview).toMatchObject({ online: true, simulation: true })
    expect(preview.embeds[0].fields.some((field) => field.value === '5/64')).toBe(true)
    expect(preview.embeds[0].fields.find((field) => field.name.includes('player_list'))?.value.split('\n')).toEqual([
      'Alex',
      'Camille',
      'Sam',
      'Léa',
      'Noa',
    ])
    expect(source.getStatusData).not.toHaveBeenCalled()
    expect(source.setSetting).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each([
    [
      { hostname: 'Saved hostname', map: 'saved_map', gameMode: 'terrortown', maxPlayers: 2 },
      ['Saved hostname', 'saved_map', 'terrortown', '5/5'],
    ],
    [{ hostname: '', map: '', gameMode: '', maxPlayers: 0 }, ['Garry’s Mod', 'gm_construct', 'sandbox', '5/32']],
    [null, ['Garry’s Mod', 'gm_construct', 'sandbox', '5/32']],
  ])('renders a usable simulation without live data or a configured server name (%#)', async (stored, expected) => {
    const source = server()
    source.getName = () => ''
    mocks.stored.mockResolvedValueOnce(stored)
    const preview = await renderStatusPreview(source, { settings: {}, simulation: true, buttons: [] })
    expect(preview).toMatchObject({ online: true, simulation: true })
    expect(preview.embeds[0].fields.map((field) => field.value)).toEqual(expect.arrayContaining(expected))
    expect(source.getStatusData).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('normalizes a legacy server address that already includes its port in the Connect link', async () => {
    const connect = await buildStatusConnectButton('en', '203.0.113.7:27015', '27016')
    expect(connect.toJSON()).toMatchObject({
      style: 5,
      label: '⠀en:server-connect',
      url: 'https://website.example/open?link=steam://connect/203.0.113.7:27016',
    })
    expect(fetch).not.toHaveBeenCalled()
  })
})
