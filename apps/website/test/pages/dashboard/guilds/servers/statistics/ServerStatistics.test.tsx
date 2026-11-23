import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../../../../../testUtils.js'
import ServerStatistics from '../../../../../../src/pages/dashboard/guilds/servers/statistics/ServerStatistics.js'
import { fetchAPI } from '../../../../../../src/utils/api.js'
import type { ServerStatisticsResponse } from '@gmod/schema/server/ServerStatisticsSchema.js'
import {
  customPeriod,
  linePath,
} from '../../../../../../src/pages/dashboard/guilds/servers/statistics/statisticsFormat.js'

vi.mock('../../../../../../src/utils/api.js', () => ({ fetchAPI: vi.fn() }))

const ok = (body: unknown) => ({ ok: true, json: async () => body }) as Response
const failed = () => ({ ok: false }) as Response
const fixture = (endpoint = '', empty = false): ServerStatisticsResponse => {
  const query = new URL(endpoint || '/', 'https://test.local').searchParams
  const from = query.get('from') || '2026-11-16T00:00:00.000Z'
  const to = query.get('to') || '2026-11-23T00:00:00.000Z'
  return {
    period: { from, to, bucket: 'day', timeZone: 'UTC' },
    summary: {
      registeredPlayers: empty ? 0 : 83,
      newPlayers: empty ? 0 : 2,
      peakPlayers: empty ? null : 8,
      averagePlayers: empty ? null : 4,
      completedSessions: empty ? 0 : 3,
      playedSeconds: empty ? 0 : 7200,
      medianSessionSeconds: empty ? null : 1800,
      activePlayers: empty ? 0 : 2,
    },
    population: [
      { at: from, average: empty ? null : 4, peak: empty ? null : 8, samples: empty ? 0 : 12 },
      { at: '2026-11-17T00:00:00.000Z', average: null, peak: null, samples: 0 },
      { at: '2026-11-18T00:00:00.000Z', average: empty ? null : 2, peak: empty ? null : 3, samples: empty ? 0 : 4 },
    ],
    activity: [{ at: from, newPlayers: empty ? 0 : 2, sessions: empty ? 0 : 3, playedSeconds: empty ? 0 : 7200 }],
    heatmap: Array.from({ length: 168 }, (_, index) => ({
      day: Math.floor(index / 24),
      hour: index % 24,
      average: !empty && index === 0 ? 4 : null,
      samples: !empty && index === 0 ? 12 : 0,
    })),
    sessionDurations: [
      { key: 'under15m', count: 0 },
      { key: '15to60m', count: empty ? 0 : 2 },
      { key: '1to3h', count: empty ? 0 : 1 },
      { key: 'over3h', count: 0 },
    ],
    topPlayers: empty ? [] : [{ steamID64: '76561198000000001', name: 'Alice', playedSeconds: 5400, sessions: 2 }],
    countries: {
      available: true,
      totalPlayers: empty ? 0 : 6,
      items: empty
        ? []
        : [
            { country: null, players: 3 },
            { country: 'FR', players: 2 },
            { country: 'US', players: 1 },
          ],
    },
    live: {
      updatedAt: empty ? null : new Date().toISOString(),
      online: !empty,
      players: empty ? 0 : 3,
      maxPlayers: 32,
      branches: empty
        ? []
        : [
            { name: 'x86-64', count: 2 },
            { name: 'unknown', count: 1 },
          ],
    },
  }
}
const renderPage = (initialPath = '/dashboard/guilds/guild-one/config/servers/server-one/statistics') => {
  const history = historyAt(initialPath)
  return {
    history,
    ...renderWithProviders(() => <ServerStatistics />, {
      history,
      path: '/dashboard/guilds/:guildID/config/servers/:serverID/statistics',
    }),
  }
}

beforeEach(() => {
  localStorage.clear()
  vi.mocked(fetchAPI).mockReset()
  vi.mocked(fetchAPI).mockImplementation(async (endpoint) => ok(fixture(endpoint)))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('server statistics', () => {
  it('loads server data, preserves population gaps and exposes chart values accessibly', async () => {
    const { container } = renderPage()
    await screen.findByText('83')
    expect(fetchAPI).toHaveBeenCalledWith(
      '/users/:discordID/guilds/guild-one/servers/server-one/statistics?period=7d',
      'GET',
    )
    expect(screen.getByText('All time · records still stored')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    const population = screen.getByRole('region', { name: 'Player population' })
    const path = population.querySelector('[data-statistics-series] path')!
    expect(path.getAttribute('d')?.match(/M/g)).toHaveLength(2)
    expect(path.getAttribute('d')).not.toContain('L')
    await fireEvent.click(within(population).getByText('View chart data'))
    expect(within(population).getByRole('table', { name: 'Player population · UTC' })).toBeInTheDocument()
    expect(within(population).getAllByText('No sample').length).toBeGreaterThan(0)
    expect(container.textContent).not.toMatch(/NaN|Infinity/)
  })

  it('changes preset windows and submits controlled custom UTC bounds', async () => {
    renderPage()
    await screen.findByText('Alice')
    await fireEvent.change(screen.getByRole('combobox', { name: 'Period' }), { target: { value: '24h' } })
    await vi.waitFor(() => expect(fetchAPI).toHaveBeenLastCalledWith(expect.stringContaining('period=24h'), 'GET'))
    await fireEvent.change(screen.getByRole('combobox', { name: 'Period' }), { target: { value: '30d' } })
    await vi.waitFor(() => expect(fetchAPI).toHaveBeenLastCalledWith(expect.stringContaining('period=30d'), 'GET'))
    await fireEvent.change(screen.getByRole('combobox', { name: 'Period' }), { target: { value: 'custom' } })
    await fireEvent.input(screen.getByLabelText('From (UTC)'), { target: { value: '2026-01-01T00:00' } })
    await fireEvent.input(screen.getByLabelText('To (UTC)'), { target: { value: '2026-01-08T00:00' } })
    await vi.waitFor(() => {
      const endpoint = vi.mocked(fetchAPI).mock.calls.at(-1)![0]
      const query = new URL(endpoint, 'https://test.local').searchParams
      expect(query.get('period')).toBe('custom')
      expect(query.get('from')).toBe('2026-01-01T00:00:00.000Z')
      expect(query.get('to')).toBe('2026-01-08T00:00:00.000Z')
    })
    await screen.findByText('Alice')
  })

  it('shows localized country names and percentages including players with unknown countries', async () => {
    renderPage()
    const countries = await screen.findByRole('region', { name: 'Player countries' })
    expect(within(countries).getByText('Players with a recorded connection: 6')).toBeInTheDocument()
    expect(within(countries).getByRole('img', { name: 'France: 2 (33.3%)' })).toBeInTheDocument()
    expect(within(countries).getByRole('img', { name: 'United States: 1 (16.7%)' })).toBeInTheDocument()
    expect(within(countries).getByRole('img', { name: 'Unknown country: 3 (50%)' })).toBeInTheDocument()
    expect(within(countries).getByRole('link', { name: 'MaxMind' })).toHaveAttribute('href', 'https://www.maxmind.com')
    await fireEvent.click(within(countries).getByText('View chart data'))
    expect(within(countries).getByRole('table', { name: 'Player countries' })).toBeInTheDocument()
    expect(within(countries).getByRole('row', { name: 'Unknown country 3 (50%)' })).toBeInTheDocument()
  })

  it('keeps unavailable country data distinct from no connections while showing other statistics', async () => {
    const data = fixture()
    data.countries = { available: false, totalPlayers: 0, items: [] }
    vi.mocked(fetchAPI).mockResolvedValue(ok(data))
    renderPage()
    const countries = await screen.findByRole('region', { name: 'Player countries' })
    expect(within(countries).getByText('Player countries are temporarily unavailable.')).toBeInTheDocument()
    expect(within(countries).queryByText('No recorded player connections for this period.')).not.toBeInTheDocument()
    expect(within(countries).queryByText(/Players with a recorded connection/)).not.toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it('counts recorded connections as activity even when there are no completed sessions or samples', async () => {
    const data = fixture('', true)
    data.countries = { available: true, totalPlayers: 1, items: [{ country: 'FR', players: 1 }] }
    vi.mocked(fetchAPI).mockResolvedValue(ok(data))
    renderPage()
    await screen.findByRole('img', { name: 'France: 1 (100%)' })
    expect(screen.queryByText(/No recorded activity for this period/)).not.toBeInTheDocument()
  })

  it('blocks invalid custom ranges without presenting previous data under new dates', async () => {
    renderPage()
    await screen.findByText('Alice')
    await fireEvent.change(screen.getByRole('combobox', { name: 'Period' }), { target: { value: 'custom' } })
    await screen.findByText('Alice')
    const calls = vi.mocked(fetchAPI).mock.calls.length
    await fireEvent.input(screen.getByLabelText('From (UTC)'), { target: { value: '2020-01-01T00:00' } })
    await screen.findByRole('alert')
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a period of 90 days or less.')
    expect(fetchAPI).toHaveBeenCalledTimes(calls)
    expect(screen.queryByText('Alice')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled()
  })

  it('keeps request failures distinct from an empty period and retries', async () => {
    vi.mocked(fetchAPI).mockResolvedValueOnce(failed())
    renderPage()
    await screen.findByRole('alert')
    expect(screen.queryByText(/No recorded activity/)).not.toBeInTheDocument()
    expect(screen.queryByText('83')).not.toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByText('83')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('rejects malformed data rather than showing invented zero counts', async () => {
    vi.mocked(fetchAPI).mockResolvedValue(ok({ summary: {} }))
    renderPage()
    await screen.findByRole('alert')
    expect(screen.queryByText('Registered players')).not.toBeInTheDocument()
  })

  it('accepts the server clock clamping custom period end by up to a minute', async () => {
    vi.mocked(fetchAPI).mockImplementation(async (endpoint) => {
      const body = fixture(endpoint)
      if (endpoint.includes('period=custom'))
        body.period.to = new Date(Date.parse(body.period.to) - 30_000).toISOString()
      return ok(body)
    })
    renderPage()
    await screen.findByText('Alice')
    await fireEvent.change(screen.getByRole('combobox', { name: 'Period' }), { target: { value: 'custom' } })
    await screen.findByText('Alice')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('formats French counts, dates and branch percentages without unresolved placeholders', async () => {
    localStorage.setItem('locale', 'fr')
    vi.mocked(fetchAPI).mockImplementation(async (endpoint) => {
      const body = fixture(endpoint)
      body.live.players = 8
      return ok(body)
    })
    const { container } = renderPage()
    await screen.findByText('Alice')
    expect(screen.getByRole('heading', { name: 'Statistiques du serveur' })).toBeInTheDocument()
    expect(screen.getByText('8 / 32 joueurs')).toBeInTheDocument()
    expect(screen.getByText(/Dernier relevé :/)).toHaveTextContent('UTC')
    const countries = screen.getByRole('region', { name: 'Pays des joueurs' })
    const percent = (1 / 6).toLocaleString('fr', { style: 'percent', maximumFractionDigits: 1 })
    expect(within(countries).getByRole('img', { name: `États-Unis: 1 (${percent})` })).toBeInTheDocument()
    expect(within(countries).getAllByText('Pays inconnu').length).toBeGreaterThan(0)
    expect(within(countries).getByText('Joueurs avec une connexion enregistrée : 6')).toBeInTheDocument()
    expect(container.textContent).toContain('66,7')
    expect(container.textContent).not.toMatch(/\{[12]\}/)
    await fireEvent.change(screen.getByRole('combobox', { name: 'Période' }), { target: { value: 'custom' } })
    await fireEvent.input(screen.getByLabelText('Du (UTC)'), { target: { value: '' } })
    expect(screen.getByRole('alert')).toHaveTextContent('Choisissez une date de début antérieure à la date de fin.')
  })

  it('shows missing samples and no live snapshot without fabricated population', async () => {
    vi.mocked(fetchAPI).mockImplementation(async (endpoint) => ok(fixture(endpoint, true)))
    const { container } = renderPage()
    await screen.findByText(/No recorded activity for this period/)
    expect(screen.getByText('No server snapshot')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Player population' })).not.toBeInTheDocument()
    expect(screen.queryByText('Current player branches')).not.toBeInTheDocument()
    const countries = screen.getByRole('region', { name: 'Player countries' })
    expect(within(countries).getByText('No recorded player connections for this period.')).toBeInTheDocument()
    expect(within(countries).queryByRole('img')).not.toBeInTheDocument()
    expect(container.textContent).not.toMatch(/NaN|Infinity/)
  })

  it('discards a late response when changing server and guild', async () => {
    let resolveOld!: (value: Response) => void
    vi.mocked(fetchAPI).mockImplementation(async (endpoint) => {
      if (endpoint.includes('guild-one'))
        return new Promise<Response>((resolve) => {
          resolveOld = resolve
        })
      const body = fixture(endpoint)
      body.topPlayers[0].name = 'Bob'
      return ok(body)
    })
    const { history } = renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    history.set({ value: '/dashboard/guilds/guild-two/config/servers/server-one/statistics' })
    await screen.findByText('Bob')
    expect(fetchAPI).toHaveBeenLastCalledWith(
      '/users/:discordID/guilds/guild-two/servers/server-one/statistics?period=7d',
      'GET',
    )
    resolveOld(ok(fixture()))
    await Promise.resolve()
    expect(screen.queryByText('Alice')).not.toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    history.set({ value: '/dashboard/guilds/guild-two/config/servers/server-two/statistics' })
    await vi.waitFor(() =>
      expect(fetchAPI).toHaveBeenLastCalledWith(
        '/users/:discordID/guilds/guild-two/servers/server-two/statistics?period=7d',
        'GET',
      ),
    )
  })

  it('hides stale live branch data and expires snapshots while the page stays open', async () => {
    vi.useFakeTimers()
    const data = fixture()
    data.live.updatedAt = new Date(Date.now() - 299_000).toISOString()
    vi.mocked(fetchAPI).mockResolvedValue(ok(data))
    renderPage()
    await vi.waitFor(() => expect(screen.getAllByText('x86-64').length).toBeGreaterThan(0))
    vi.advanceTimersByTime(30_000)
    await Promise.resolve()
    expect(screen.getByText('Server snapshot is out of date')).toBeInTheDocument()
    expect(screen.queryAllByText('x86-64')).toHaveLength(0)
  })
})

describe('statistics calculations', () => {
  it('validates UTC ordering, maximum duration and future dates', () => {
    const now = Date.parse('2026-11-23T12:00:00Z')
    expect(customPeriod('', '', now).error).toBe('order')
    expect(customPeriod('2026-11-22T00:00', '2026-11-21T00:00', now).error).toBe('order')
    expect(customPeriod('2026-01-01T00:00', '2026-11-21T00:00', now).error).toBe('range')
    expect(customPeriod('2026-11-22T00:00', '2026-11-24T00:00', now).error).toBe('future')
    expect(customPeriod('2026-11-22T00:00', '2026-11-23T00:00', now)).toEqual({
      from: '2026-11-22T00:00:00.000Z',
      to: '2026-11-23T00:00:00.000Z',
    })
  })
  it('preserves measured zero counts and breaks lines across missing buckets', () => {
    expect(linePath([0, null, 4], 4)).toBe('M10.00,180.00  M680.00,10.00')
    expect(linePath([null, null], 0).trim()).toBe('')
  })
})
