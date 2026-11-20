import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { Suspense } from 'solid-js'
import { renderWithProviders } from '../testUtils.js'
import Home from '../../src/pages/Home.js'

afterEach(() => {
  cleanup()
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
    expect(within(statistics).getAllByText('—')).toHaveLength(4)
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:5001/v3/stats')
    expect(screen.getByRole('link', { name: 'Go to Dashboard' })).toHaveAttribute('href', '/dashboard/guilds')
    expect(screen.getByRole('heading', { level: 1, name: 'Gmod Integration' })).toBeInTheDocument()
  })

  it('renders formatted statistics and labelled feature illustrations', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(validStats)))
    renderWithProviders(() => <Home />)
    const statistics = screen.getByRole('region', { name: 'Community statistics' })
    await vi.waitFor(() => expect(statistics).toHaveAttribute('aria-busy', 'false'))
    for (const number of Object.values(validStats)) {
      expect(within(statistics).getByText(number.toLocaleString())).toBeInTheDocument()
    }
    for (const name of ['Server Status', 'User Profile', 'Player Database']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument()
      expect(screen.getByRole('img', { name })).toHaveAttribute('loading', 'lazy')
    }
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
      expect(within(screen.getByRole('region', { name: 'Community statistics' })).getAllByText('—')).toHaveLength(4)
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
      await vi.waitFor(() => expect(screen.getByText(validStats.guild.toLocaleString())).toBeInTheDocument())
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
      expect(fetchMock).toHaveBeenCalledTimes(2)
    },
  )

  it('normalizes invalid counts instead of exposing malformed values', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response({ guild: -5, server: 'unknown', user: null, verifyUser: 12.8 })),
    )
    renderWithProviders(() => <Home />)
    const statistics = screen.getByRole('region', { name: 'Community statistics' })
    await vi.waitFor(() => expect(statistics).toHaveAttribute('aria-busy', 'false'))
    expect(within(statistics).getAllByText('0')).toHaveLength(3)
    expect(within(statistics).getByText('12')).toBeInTheDocument()
  })
})
