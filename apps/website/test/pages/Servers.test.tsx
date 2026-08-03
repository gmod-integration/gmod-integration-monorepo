import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@solidjs/testing-library'
import { renderWithProviders } from '../testUtils.js'
import { setIsLogged } from '../../src/utils/event.js'
import Servers from '../../src/pages/Servers.js'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('pages/Servers.tsx', () => {
  beforeEach(() => {
    // DashboardMiddleware is rendered by Servers, so it must not redirect away mid-test.
    setIsLogged(true)
  })

  it('shows a loading indicator while the servers resource is loading', () => {
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}))
    vi.stubGlobal('fetch', fetchMock)

    const { container } = renderWithProviders(() => <Servers />)

    expect(container.querySelector('.loading')).toBeInTheDocument()
  })

  it('sorts servers by vote desc and renders full server info when status/name/description/image are present', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            name: 'Low Vote',
            vote: 1,
            image: 'https://img/low.png',
            description: 'Low desc',
            ip: '1.1.1.1',
            port: 27015,
            status: { hostname: 'Low Host', players: 2, maxPlayers: 10, gameMode: 'sandbox', map: 'gm_flatgrass' },
          },
          {
            name: 'High Vote',
            vote: 9,
            ip: '2.2.2.2',
            port: 27016,
            status: { hostname: 'High Host', players: 5, maxPlayers: 20, gameMode: 'ttt', map: 'ttt_map' },
          },
        ]),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    renderWithProviders(() => <Servers />)

    await vi.waitFor(() => expect(screen.getByText('High Host')).toBeInTheDocument())
    const names = screen.getAllByRole('heading', { level: 2 }).filter((h) => h.textContent !== 'Servers')
    expect(names.map((h) => h.textContent)).toEqual(['High Host', 'Low Host'])

    expect(screen.getByText('2/10')).toBeInTheDocument()
    expect(screen.getByText('5/20')).toBeInTheDocument()
    expect(screen.getByText('1.1.1.1:27015')).toHaveAttribute('href', 'steam://connect/1.1.1.1:27015')
    expect(screen.getByAltText('Low Vote')).toHaveAttribute('src', 'https://img/low.png')
  })

  it('falls back to name/no-name, description fallback, offline status, and default image when fields are missing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            vote: 0,
            ip: '3.3.3.3',
            port: 27017,
          },
        ]),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { container } = renderWithProviders(() => <Servers />)

    await vi.waitFor(() => expect(screen.getByText('No name')).toBeInTheDocument())
    expect(screen.getByText('No description')).toBeInTheDocument()
    const offlineSpans = screen.getAllByText('Offline')
    expect(offlineSpans.length).toBe(3)
    // server.name is undefined here, so the <img alt> (unlike the heading) has no text fallback.
    expect(container.querySelector('img')).toHaveAttribute('src', expect.stringContaining('defaultServer'))
  })
})
