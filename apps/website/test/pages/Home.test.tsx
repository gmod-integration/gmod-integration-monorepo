import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@solidjs/testing-library'
import { renderWithProviders } from '../testUtils.js'
import Home from '../../src/pages/Home.js'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('pages/Home.tsx', () => {
  it('shows 0 for every stat while the stats resource is loading', () => {
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}))
    vi.stubGlobal('fetch', fetchMock)

    renderWithProviders(() => <Home />)

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:5001/v3/stats')
    expect(screen.getByText('Go to Dashboard')).toHaveAttribute('href', '/dashboard/guilds')
    expect(screen.getAllByText(/\+0/).length).toBe(4)
  })

  it('renders formatted stats once the resource resolves, and both feature-row layout branches', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ guild: 1234, server: 42, user: 98765, verifyUser: 555 }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    renderWithProviders(() => <Home />)

    await vi.waitFor(() => expect(screen.getByText(/1,234/)).toBeInTheDocument())
    expect(screen.getByText(/42/)).toBeInTheDocument()
    expect(screen.getByText(/98,765/)).toBeInTheDocument()
    expect(screen.getByText(/555/)).toBeInTheDocument()

    // Every showFeatures title is rendered, exercising the `index() % 2` reverse/forward layout
    // branches of the For loop (server_status = even index -> reversed, user_profile = odd).
    expect(screen.getByText('Server Status')).toBeInTheDocument()
    expect(screen.getByText('User Profile')).toBeInTheDocument()
    expect(screen.getByText('Player Database')).toBeInTheDocument()
  })
})
