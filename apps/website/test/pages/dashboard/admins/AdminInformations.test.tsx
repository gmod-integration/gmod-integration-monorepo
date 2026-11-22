import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
import { renderWithProviders } from '../../../testUtils.js'
import AdminInformations from '../../../../src/pages/dashboard/admins/AdminInformations.js'
import { fetchAPI } from '../../../../src/utils/api.js'
import { failed, ok, overviewFixture } from './adminFixtures.js'

vi.mock('../../../../src/utils/api.js', () => ({ fetchAPI: vi.fn() }))
beforeEach(() => {
  localStorage.clear()
  vi.mocked(fetchAPI).mockReset()
})
afterEach(cleanup)
const renderPage = () =>
  renderWithProviders(() => (
    <div>
      <AdminInformations />
    </div>
  ))

describe('platform overview', () => {
  it('waits for the v6 overview and exposes a recoverable error', async () => {
    vi.mocked(fetchAPI)
      .mockResolvedValueOnce(failed() as Response)
      .mockResolvedValueOnce(ok(overviewFixture()) as Response)
    renderPage()
    await screen.findByRole('alert')
    expect(screen.queryByText('120')).not.toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByText('120')
    expect(fetchAPI).toHaveBeenCalledWith('/v6/admin/overview', 'GET')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it('shows distinct platform counts and accessible language text, then refreshes', async () => {
    vi.mocked(fetchAPI).mockImplementation(async () => ok(overviewFixture()) as Response)
    renderPage()
    await screen.findByText('120')
    expect(screen.getByText('700')).toBeInTheDocument()
    expect(screen.getByText('900')).toBeInTheDocument()
    expect(screen.getByText('24')).toBeInTheDocument()
    expect(screen.getByText('English')).toBeInTheDocument()
    expect(screen.getByText('French')).toBeInTheDocument()
    expect(screen.getByText(/Memberships are counted per community/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Manage Premium' })).toHaveAttribute('href', '/dashboard/admins/premium')
    await fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledTimes(2))
    await screen.findByText('120')
  })
  it('handles an empty platform without fictitious percentages or invalid numbers', async () => {
    const empty = overviewFixture()
    for (const key of Object.keys(empty.totals) as (keyof typeof empty.totals)[]) empty.totals[key] = 0
    empty.recent = { days: 7, guilds: 0, servers: 0, users: 0 }
    empty.languages = []
    vi.mocked(fetchAPI).mockResolvedValue(ok(empty) as Response)
    const { container } = renderPage()
    await screen.findByText('No language data is available yet.')
    expect(container.textContent).not.toMatch(/NaN|Infinity|\d%/)
    expect(screen.getByText('New in the last 7 days')).toBeInTheDocument()
  })
  it('rejects malformed overview data instead of displaying fabricated zero totals', async () => {
    vi.mocked(fetchAPI).mockResolvedValue(ok({ totals: {} }) as Response)
    renderPage()
    await screen.findByRole('alert')
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })
})
