import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import type { PublicRankedServer, PublicServerRankingResponse } from '@gmod/schema/server/PublicServerRankingSchema.js'
import { renderWithProviders } from '../testUtils.js'
import { setIsLogged } from '../../src/utils/event.js'
import Servers from '../../src/pages/Servers.js'

const point = { at: '2026-11-19T00:00:00.000Z', players: 8 }
function server(rank: number, overrides: Partial<PublicRankedServer> = {}): PublicRankedServer {
  return {
    id: `s${rank}`,
    guild: 'g1',
    name: `Server ${rank}`,
    image: `https://images.example.test/${rank}.png`,
    description: `Description ${rank}`,
    ip: `192.0.2.${rank}`,
    port: '27015',
    vote: 100 - rank,
    rank,
    online: true,
    discordUrl: 'https://discord.gg/real-community',
    lastSeenAt: '2026-11-20T12:00:00.000Z',
    status: { hostname: `Host ${rank}`, players: 5, maxPlayers: 32, gameMode: 'sandbox', map: 'gm_construct' },
    activity: [point, { at: '2026-11-20T00:00:00.000Z', players: 5 }],
    ...overrides,
  }
}
function response(
  servers: PublicRankedServer[],
  total = servers.length,
  offset = 0,
  limit = 10,
): PublicServerRankingResponse {
  return { servers, pagination: { total, offset, limit }, filters: { gameModes: ['darkrp', 'sandbox'] } }
}
const ok = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })
function mockPages(count = 23) {
  const rows = Array.from({ length: count }, (_, i) => server(i + 1))
  const fetchMock = vi.fn(async (input: string) => {
    const params = new URL(input).searchParams
    const offset = Number(params.get('offset'))
    const limit = Number(params.get('limit'))
    return ok(response(rows.slice(offset, offset + limit), count, offset, limit))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
const lastQuery = (mock: ReturnType<typeof vi.fn>) => new URL(String(mock.mock.calls.at(-1)![0])).searchParams
const waitForCard = (name = 'Host 1') =>
  vi.waitFor(() => expect(screen.getByRole('heading', { name })).toBeInTheDocument())

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
beforeEach(() => {
  localStorage.clear()
  setIsLogged(true)
})

describe('public server ranking', () => {
  it('requests the first ten servers and presents the top three without duplicate cards', async () => {
    const fetchMock = mockPages()
    const { container } = renderWithProviders(() => <Servers />)
    await waitForCard()
    expect(lastQuery(fetchMock).get('limit')).toBe('10')
    expect(lastQuery(fetchMock).get('offset')).toBe('0')
    expect(String(fetchMock.mock.calls[0][0])).toContain('/servers/ranking?')
    const podium = screen.getByRole('region', { name: 'Top 3' })
    expect(within(podium).getAllByRole('article')).toHaveLength(3)
    expect(
      within(podium)
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(['Host 1', 'Host 2', 'Host 3'])
    expect(container.querySelectorAll('article')).toHaveLength(10)
    expect(
      new Set(Array.from(container.querySelectorAll('article')).map((card) => card.getAttribute('data-server-id')))
        .size,
    ).toBe(10)
    expect(screen.getByText('Showing 1–10 of 23 servers')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Back to the first page' })).toBeDisabled()
    expect(screen.getByRole('navigation', { name: 'Pagination' }).closest('table')).toBeNull()
  })

  it('navigates next, previous, last and first pages with correct boundaries', async () => {
    const fetchMock = mockPages()
    renderWithProviders(() => <Servers />)
    await waitForCard()
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await waitForCard('Host 11')
    expect(lastQuery(fetchMock).get('offset')).toBe('10')
    expect(screen.queryByRole('region', { name: 'Top 3' })).not.toBeInTheDocument()
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Last page' }))
    await waitForCard('Host 21')
    expect(lastQuery(fetchMock).get('offset')).toBe('20')
    expect(screen.getAllByRole('article')).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Last page' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }))
    await waitForCard('Host 11')
    fireEvent.click(screen.getByRole('button', { name: 'Back to the first page' }))
    await waitForCard()
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument()
  })

  it('resets to page one when changing the page size, mode or status filters', async () => {
    const fetchMock = mockPages(100)
    renderWithProviders(() => <Servers />)
    await waitForCard()
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await waitForCard('Host 11')
    fireEvent.change(screen.getByRole('combobox', { name: 'Servers per page' }), { target: { value: '25' } })
    await waitForCard()
    expect(lastQuery(fetchMock).get('limit')).toBe('25')
    expect(lastQuery(fetchMock).get('offset')).toBe('0')
    expect(screen.getAllByRole('article')).toHaveLength(25)
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await waitForCard('Host 26')
    fireEvent.change(screen.getByRole('combobox', { name: 'Game Mode' }), { target: { value: 'darkrp' } })
    await waitForCard()
    expect(lastQuery(fetchMock).get('gameMode')).toBe('darkrp')
    expect(lastQuery(fetchMock).get('offset')).toBe('0')
    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'offline' } })
    await vi.waitFor(() => expect(lastQuery(fetchMock).get('status')).toBe('offline'))
    expect(lastQuery(fetchMock).get('gameMode')).toBe('darkrp')
    expect(lastQuery(fetchMock).get('offset')).toBe('0')
  })

  it('debounces searches, sends the final trimmed value and clears all filters', async () => {
    const fetchMock = mockPages()
    renderWithProviders(() => <Servers />)
    await waitForCard()
    const input = screen.getByRole('searchbox', { name: 'Search' })
    fireEvent.input(input, { target: { value: ' A' } })
    fireEvent.input(input, { target: { value: ' Alice ' } })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(lastQuery(fetchMock).get('search')).toBe('Alice'))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'online' } })
    await vi.waitFor(() => expect(lastQuery(fetchMock).get('status')).toBe('online'))
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    await vi.waitFor(() => expect(lastQuery(fetchMock).get('search')).toBe(''))
    expect(lastQuery(fetchMock).get('status')).toBe('all')
    expect(input).toHaveValue('')
  })

  it('clears a pending search timer when the page unmounts', async () => {
    const fetchMock = mockPages()
    const { unmount } = renderWithProviders(() => <Servers />)
    await waitForCard()
    fireEvent.input(screen.getByRole('searchbox', { name: 'Search' }), { target: { value: 'Alice' } })
    unmount()
    await new Promise((resolve) => setTimeout(resolve, 280))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('uses real Discord invite and Steam links and keeps historical charts for offline servers', async () => {
    const offline = server(2, {
      online: false,
      discordUrl: 'https://discord.com/invite/another-community',
      status: { hostname: 'Offline Host', players: 0, maxPlayers: 20, gameMode: 'darkrp', map: 'rp_downtown' },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok(response([server(1), offline]))),
    )
    renderWithProviders(() => <Servers />)
    await waitForCard()
    const links = screen.getAllByRole('link', { name: 'Join Discord' })
    expect(links[0]).toHaveAttribute('href', 'https://discord.gg/real-community')
    expect(links[1]).toHaveAttribute('href', 'https://discord.com/invite/another-community')
    expect(links[0]).toHaveAttribute('target', '_blank')
    expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByRole('link', { name: '192.0.2.1:27015' })).toHaveAttribute(
      'href',
      'steam://connect/192.0.2.1:27015',
    )
    const offlineCard = screen.getByRole('heading', { name: 'Offline Host' }).closest('article')!
    expect(within(offlineCard).getByText('rp_downtown')).toBeInTheDocument()
    expect(within(offlineCard).getByText(/Last server update/)).toBeInTheDocument()
    expect(within(offlineCard).getByRole('img', { name: /Activity/ })).toBeInTheDocument()
    expect(offlineCard.querySelector('time')).toHaveAttribute('datetime', offline.lastSeenAt)
  })

  it('keeps an online server distinct from an unknown player count', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok(response([server(1, { online: true, status: null })]))),
    )
    renderWithProviders(() => <Servers />)
    await waitForCard('Server 1')
    const card = screen.getByRole('heading', { name: 'Server 1' }).closest('article')!
    const playerMetric = within(card).getByText('Players').parentElement!
    expect(within(card).getByText('Online')).toBeInTheDocument()
    expect(within(playerMetric).getByText('Unknown')).toBeInTheDocument()
    expect(within(card).queryByText('Offline')).not.toBeInTheDocument()
  })

  it('disables missing Discord destinations and uses safe information fallbacks', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        ok(
          response([
            server(1, {
              discordUrl: null,
              name: '',
              description: '',
              image: '',
              ip: '',
              port: '',
              status: null,
              online: false,
              lastSeenAt: null,
              activity: [],
            }),
            server(2, { discordUrl: null }),
          ]),
        ),
      ),
    )
    const { container } = renderWithProviders(() => <Servers />)
    await waitForCard('No name')
    expect(screen.getAllByRole('button', { name: 'Discord invitation unavailable' })).toHaveLength(2)
    expect(
      screen
        .getAllByRole('button', { name: 'Discord invitation unavailable' })
        .every((button) => button.hasAttribute('disabled')),
    ).toBe(true)
    expect(screen.queryByRole('link', { name: 'Join Discord' })).not.toBeInTheDocument()
    expect(screen.getByText('No description')).toBeInTheDocument()
    expect(screen.getByAltText('No name')).toHaveAttribute('src', expect.stringContaining('defaultServer'))
    expect(screen.getByText('No activity data is available for this period.')).toBeInTheDocument()
    expect(container.querySelector('time')).toBeNull()
  })

  it('replaces stale cards with a loading indicator while another page loads', async () => {
    let resolvePage!: (value: Response) => void
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        ok(
          response(
            Array.from({ length: 10 }, (_, i) => server(i + 1)),
            20,
          ),
        ),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolvePage = resolve
          }),
      )
    vi.stubGlobal('fetch', fetchMock)
    renderWithProviders(() => <Servers />)
    await waitForCard()
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.queryByRole('heading', { name: 'Host 1' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Loading servers')
    resolvePage(ok(response([server(11)], 20, 10)))
    await waitForCard('Host 11')
  })

  it('shows an empty state without pagination when no servers match', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok(response([]))),
    )
    renderWithProviders(() => <Servers />)
    await vi.waitFor(() => expect(screen.getByText('No servers match these filters.')).toBeInTheDocument())
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it.each(['network', 'http', 'invalid-data', 'unsafe-invite'])('offers a retry after a %s error', async (failure) => {
    const fetchMock = vi.fn()
    if (failure === 'network') fetchMock.mockRejectedValueOnce(new Error('Network failure'))
    else if (failure === 'http') fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }))
    else if (failure === 'unsafe-invite')
      fetchMock.mockResolvedValueOnce(
        ok(response([server(1, { discordUrl: 'https://evil.example.test/invite/fake' })])),
      )
    else fetchMock.mockResolvedValueOnce(ok({ servers: 'invalid' }))
    fetchMock.mockImplementation(async () => ok(response([server(1)])))
    vi.stubGlobal('fetch', fetchMock)
    renderWithProviders(() => <Servers />)
    await vi.waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Unable to load servers.'))
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitForCard()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
