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

const validStats = { guild: 1234, server: 42, user: 98765, verifyUser: 555 }
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

  it('renders the three defined totals without presenting cumulative membership as unique users', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(validStats)))
    renderWithProviders(() => <Home />)
    const statistics = screen.getByRole('region', { name: 'Community statistics' })
    await vi.waitFor(() => expect(statistics).toHaveAttribute('aria-busy', 'false'))
    for (const number of [validStats.guild, validStats.server, validStats.verifyUser]) {
      expect(within(statistics).getByText(number.toLocaleString())).toBeInTheDocument()
    }
    expect(within(statistics).queryByText(validStats.user.toLocaleString())).not.toBeInTheDocument()
    expect(within(statistics).queryByText('Users')).not.toBeInTheDocument()
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
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response({ guild: -5, server: 'unknown', user: null, verifyUser: 12.8 })),
    )
    renderWithProviders(() => <Home />)
    const statistics = screen.getByRole('region', { name: 'Community statistics' })
    await vi.waitFor(() => expect(statistics).toHaveAttribute('aria-busy', 'false'))
    expect(within(statistics).getAllByText('—')).toHaveLength(2)
    expect(within(statistics).queryByText('0')).not.toBeInTheDocument()
    expect(within(statistics).getByText('12')).toBeInTheDocument()
  })

  it('switches hero and statistics independently and restores the chosen combination on the next visit', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(response(validStats)))
    vi.stubGlobal('fetch', fetchMock)
    const firstVisit = renderWithProviders(() => <Home />)
    const heroChoices = screen.getByRole('group', { name: 'Hero' })
    const statsChoices = screen.getByRole('group', { name: 'Statistics' })
    expect(within(heroChoices).getByRole('button', { name: 'Panorama' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(statsChoices).getByRole('button', { name: 'Ribbon' })).toHaveAttribute('aria-pressed', 'true')

    await fireEvent.click(within(heroChoices).getByRole('button', { name: 'Console' }))
    await fireEvent.click(within(statsChoices).getByRole('button', { name: 'Register' }))
    expect(within(heroChoices).getByRole('button', { name: 'Console' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(heroChoices).getByRole('button', { name: 'Panorama' })).toHaveAttribute('aria-pressed', 'false')
    expect(JSON.parse(window.localStorage.getItem('gmod-home-appearance')!)).toEqual({
      hero: 'console',
      stats: 'ledger',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    firstVisit.unmount()
    renderWithProviders(() => <Home />)
    expect(
      within(screen.getByRole('group', { name: 'Hero' })).getByRole('button', { name: 'Console' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(
      within(screen.getByRole('group', { name: 'Statistics' })).getByRole('button', { name: 'Register' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('falls back to usable appearance choices when saved settings are invalid and storage writes fail', async () => {
    window.localStorage.setItem('gmod-home-appearance', JSON.stringify({ hero: 'missing', stats: 'missing' }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(validStats)))
    renderWithProviders(() => <Home />)
    const heroChoices = screen.getByRole('group', { name: 'Hero' })
    expect(within(heroChoices).getByRole('button', { name: 'Panorama' })).toHaveAttribute('aria-pressed', 'true')
    const storagePrototype = Object.getPrototypeOf(window.localStorage)
    vi.spyOn(storagePrototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable')
    })
    await fireEvent.click(within(heroChoices).getByRole('button', { name: 'Editorial' }))
    expect(within(heroChoices).getByRole('button', { name: 'Editorial' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('lets visitors switch the Console preview between actual integration screenshots', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(validStats))
    vi.stubGlobal('fetch', fetchMock)
    renderWithProviders(() => <Home />)
    await fireEvent.click(within(screen.getByRole('group', { name: 'Hero' })).getByRole('button', { name: 'Console' }))
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
    for (const image of screen.getAllByRole('img')) expect(image).toHaveAttribute('loading', 'lazy')

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
