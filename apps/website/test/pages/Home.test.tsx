import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { Suspense } from 'solid-js'
import { renderWithProviders } from '../testUtils.js'
import Home from '../../src/pages/Home.js'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
beforeEach(() => window.localStorage.clear())

const validStats = { guild: 1234, server: 42, user: 98765, verifyUser: 555, totalUsers: 23456 }
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })

describe('Home', () => {
  it('shows unavailable placeholders while statistics are loading, while keeping the page usable', () => {
    const fetchMock = vi.fn().mockReturnValue(new Promise<Response>(() => {}))
    vi.stubGlobal('fetch', fetchMock)
    renderWithProviders(() => (
      <Suspense fallback={<div>Waiting for page</div>}>
        <Home />
      </Suspense>
    ))
    const statistics = screen.getByRole('region', { name: 'Community statistics' })
    expect(statistics).toHaveAttribute('aria-busy', 'true')
    expect(within(statistics).getAllByText('—')).toHaveLength(3)
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:5001/v3/stats')
    expect(
      within(screen.getByRole('region', { name: 'Gmod Integration' })).getByRole('link', {
        name: 'Open the dashboard',
      }),
    ).toHaveAttribute('href', '/dashboard/guilds')
    expect(
      screen.getByRole('heading', { level: 1, name: /Your server.*Your community.*Connected/ }),
    ).toBeInTheDocument()
  })

  it('shows all registered Steam and Discord accounts instead of linked accounts or cumulative membership', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(validStats)))
    renderWithProviders(() => <Home />)
    const statistics = screen.getByRole('region', { name: 'Community statistics' })
    await vi.waitFor(() => expect(statistics).toHaveAttribute('aria-busy', 'false'))
    for (const number of [validStats.guild, validStats.server, validStats.totalUsers]) {
      expect(within(statistics).getByText(number.toLocaleString())).toBeInTheDocument()
    }
    expect(within(statistics).queryByText(validStats.user.toLocaleString())).not.toBeInTheDocument()
    expect(within(statistics).queryByText(validStats.verifyUser.toLocaleString())).not.toBeInTheDocument()
    expect(within(statistics).getByText('Users')).toBeInTheDocument()
    expect(within(statistics).getByText('Registered Steam and Discord accounts')).toBeInTheDocument()
  })

  it.each(['network', 'http', 'invalid JSON', 'null payload'])(
    'offers recovery after a %s statistics failure',
    async (failure) => {
      const fetchMock = vi.fn()
      if (failure === 'network') fetchMock.mockRejectedValueOnce(new Error('network unavailable'))
      else if (failure === 'http') fetchMock.mockResolvedValueOnce(response({}, 503))
      else if (failure === 'invalid JSON') fetchMock.mockResolvedValueOnce(new Response('{invalid'))
      else fetchMock.mockResolvedValueOnce(response(null))
      fetchMock.mockResolvedValueOnce(response(validStats))
      vi.stubGlobal('fetch', fetchMock)
      renderWithProviders(() => <Home />)

      await vi.waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent('Community statistics are temporarily unavailable.'),
      )
      expect(within(screen.getByRole('region', { name: 'Community statistics' })).getAllByText('—')).toHaveLength(3)
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
      await vi.waitFor(() => expect(screen.getByText(validStats.guild.toLocaleString())).toBeInTheDocument())
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
      expect(fetchMock).toHaveBeenCalledTimes(2)
    },
  )

  it('preserves unknown counts as unavailable rather than displaying invented zeroes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ guild: -5, server: 'unknown', totalUsers: 12.8 })))
    renderWithProviders(() => <Home />)
    const statistics = screen.getByRole('region', { name: 'Community statistics' })
    await vi.waitFor(() => expect(statistics).toHaveAttribute('aria-busy', 'false'))
    expect(within(statistics).getAllByText('—')).toHaveLength(3)
    expect(within(statistics).queryByText('0')).not.toBeInTheDocument()
    expect(within(statistics).queryByText('12')).not.toBeInTheDocument()
  })

  it('keeps the account total unavailable when an older API returns only linked-account counts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ guild: 12, server: 3, verifyUser: 555, user: 999 })))
    renderWithProviders(() => <Home />)
    const statistics = screen.getByRole('region', { name: 'Community statistics' })
    await vi.waitFor(() => expect(statistics).toHaveAttribute('aria-busy', 'false'))
    expect(within(statistics).getByText('—')).toBeInTheDocument()
    expect(within(statistics).queryByText('555')).not.toBeInTheDocument()
    expect(within(statistics).queryByText('999')).not.toBeInTheDocument()
  })

  it('keeps the selected Console and Ribbon presentation for visitors with an old design preference', async () => {
    window.localStorage.setItem('gmod-home-appearance', JSON.stringify({ hero: 'panorama', stats: 'ledger' }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(validStats)))
    const { container } = renderWithProviders(() => <Home />)
    expect(container.querySelector('.home-redesign')).toHaveAttribute('data-hero', 'console')
    expect(container.querySelector('.home-redesign')).toHaveAttribute('data-stats', 'ribbon')
    expect(screen.queryByRole('group', { name: 'Hero' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Statistics' })).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'A glimpse of your Discord' })).toBeInTheDocument()
  })

  it('formats large totals with the chosen language and preserves genuine zero counts', async () => {
    window.localStorage.setItem('locale', 'fr')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ guild: 0, server: 12345, totalUsers: 67890 })))
    renderWithProviders(() => <Home />)
    const statistics = screen.getByRole('region', { name: 'Statistiques des communautés' })
    await vi.waitFor(() => expect(statistics).toHaveAttribute('aria-busy', 'false'))
    expect(
      within(statistics)
        .getAllByRole('definition')
        .map((value) => value.firstElementChild?.textContent),
    ).toEqual([0, 12345, 67890].map((number) => number.toLocaleString('fr')))
  })

  it('lets visitors switch the Console preview between actual integration screenshots', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(validStats))
    vi.stubGlobal('fetch', fetchMock)
    renderWithProviders(() => <Home />)
    const preview = screen.getByRole('group', { name: 'A glimpse of your Discord' })
    const figure = preview.closest('figure')!
    const initialImage = within(figure).getByRole('img', { name: 'Server Status' }).getAttribute('src')

    await fireEvent.click(within(preview).getByRole('button', { name: 'Chat Bridge' }))
    expect(within(preview).getByRole('button', { name: 'Chat Bridge' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(figure).getByRole('img', { name: 'Chat Bridge' }).getAttribute('src')).not.toBe(initialImage)
    expect(within(figure).queryByRole('img', { name: 'Server Status' })).not.toBeInTheDocument()

    await fireEvent.click(within(preview).getByRole('button', { name: 'Discord and Steam verification' }))
    expect(within(figure).getByRole('img', { name: 'Discord and Steam verification' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('lets visitors explore shipped features and return to the full catalogue without another request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(validStats))
    vi.stubGlobal('fetch', fetchMock)
    renderWithProviders(() => <Home />)
    expect(screen.getAllByRole('article')).toHaveLength(8)
    for (const capability of [/AWarn3/, /RCON/, /Lua/]) {
      expect(screen.getAllByText(capability).length).toBeGreaterThan(0)
    }
    expect(document.body).not.toHaveTextContent(/Streams|Tickets/)
    const catalogue = screen.getByRole('region', { name: 'One community. All the connections.' })
    for (const image of within(catalogue).getAllByRole('img')) expect(image).toHaveAttribute('loading', 'lazy')

    const filters = screen.getByRole('group', { name: /Explore features/i })
    const chatFilter = within(filters).getByRole('button', { name: /Chat.*screenshots/i })
    await fireEvent.click(chatFilter)
    expect(chatFilter).toHaveAttribute('aria-pressed', 'true')
    const shown = screen.getAllByRole('article')
    expect(shown).toHaveLength(1)
    expect(within(shown[0]).getByRole('heading', { level: 3, name: /Chat.*screenshots/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 3, name: /Moderation/i })).not.toBeInTheDocument()

    await fireEvent.click(within(filters).getByRole('button', { name: /All features/i }))
    expect(screen.getAllByRole('article')).toHaveLength(8)
    expect(chatFilter).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('heading', { level: 3, name: /Moderation/i })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
