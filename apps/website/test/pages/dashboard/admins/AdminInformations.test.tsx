import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
import { renderWithProviders } from '../../../testUtils.js'
import AdminInformations from '../../../../src/pages/dashboard/admins/AdminInformations.js'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// See GuildList.test.tsx for why the render call is wrapped in a plain host <div>: this
// component's top-level return is also a Fragment whose first child is a <Show>, which hits the
// same test-environment-only (duplicate solid-js copies) reactivity gap.
function renderAdminInformations() {
  return renderWithProviders(() => (
    <div>
      <AdminInformations />
    </div>
  ))
}

const adminData = {
  guild: {
    total: 120,
    language: [
      { label: 'en', value: 80 },
      { label: 'fr', value: 40 },
    ],
  },
  server: { total: 45 },
  user: {
    total: 1000,
    totalDiscordMembers: 900,
    totalDiscordUser: 700,
    totalVerified: 600,
    totalUnverified: 400,
    totalSteamUser: 500,
  },
}

describe('pages/dashboard/admins/AdminInformations.tsx', () => {
  it('shows the shared loading state while service statistics are loading', () => {
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}))
    vi.stubGlobal('fetch', fetchMock)

    renderAdminInformations()

    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
    expect(screen.queryByText('Service overview')).not.toBeInTheDocument()
  })

  it.each(['http', 'network'])(
    'shows a recoverable %s failure instead of an endless loading placeholder',
    async (failure) => {
      const fetchMock = vi.fn()
      if (failure === 'http') fetchMock.mockResolvedValueOnce(new Response('{}', { status: 500 }))
      else fetchMock.mockRejectedValueOnce(new Error('Network unavailable'))
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(adminData)))
      vi.stubGlobal('fetch', fetchMock)

      const { container } = renderAdminInformations()

      await vi.waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent('Unable to load the service statistics.'),
      )
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
      expect(container.querySelector('.skeleton')).not.toBeInTheDocument()
      expect(screen.queryByText('Service overview')).not.toBeInTheDocument()
      expect(container.querySelector('svg')).not.toBeInTheDocument()

      await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
      await vi.waitFor(() => expect(screen.getByText('120')).toBeInTheDocument())
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.getByText('Communities by bot language')).toBeInTheDocument()
    },
  )

  it('renders general/user stats, percentages, the guild-language pie chart, and refetches on click', async () => {
    // A fresh Response per call - refetch() re-reads .json() on the resolved value, and a
    // Response body can only be consumed once.
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(adminData))))
    vi.stubGlobal('fetch', fetchMock)

    renderAdminInformations()

    await vi.waitFor(() => expect(screen.getByText('Discord communities')).toBeInTheDocument())
    expect(screen.getByText('120')).toBeInTheDocument()
    expect(screen.getByText('45')).toBeInTheDocument()
    expect(screen.getByText('1,000')).toBeInTheDocument()
    expect(screen.getByText(/900 - 90%/)).toBeInTheDocument()
    expect(screen.getByText(/700 - 70%/)).toBeInTheDocument()
    expect(screen.getByText(/600 - 60%/)).toBeInTheDocument()
    expect(screen.getByText(/400 - 40%/)).toBeInTheDocument()
    expect(screen.getByText('Communities by bot language')).toBeInTheDocument()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByText('Refresh statistics'))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    // Let the refetch's resource state settle back to resolved before the test (and its
    // cleanup()) tears the tree down, so nothing is disposed mid-flight.
    await vi.waitFor(() => expect(screen.getByText('Discord communities')).toBeInTheDocument())
  })
})
