import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { renderWithProviders } from '../../../testUtils.js'
import AdminInformations from '../../../../src/pages/dashboard/admins/AdminInformations.js'
import { fetchAPI } from '../../../../src/utils/api.js'
import { failed, ok, overviewFixture } from './adminFixtures.js'
import { analyticsFixture } from './analyticsFixtures.js'
import type { AdminAnalyticsDays } from '@gmod/schema/admin/AdminAnalyticsSchema.js'

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
const analyticsFor = (endpoint: string) =>
  analyticsFixture(Number(new URL(endpoint, 'http://local.test').searchParams.get('days')) as AdminAnalyticsDays)
const useValidResponses = () =>
  vi
    .mocked(fetchAPI)
    .mockImplementation(
      async (endpoint) => ok(endpoint.includes('/analytics') ? analyticsFor(endpoint) : overviewFixture()) as Response,
    )

describe('platform overview', () => {
  it('refreshes the daily-registration chart without reloading the overview totals', async () => {
    useValidResponses()
    renderPage()
    const panel = screen.getByRole('region', { name: 'Daily registrations' })
    await within(panel).findByRole('img', { name: /Daily registration trends in UTC/ })
    await fireEvent.click(within(panel).getByRole('button', { name: 'Refresh chart' }))
    await vi.waitFor(() =>
      expect(vi.mocked(fetchAPI).mock.calls.filter(([path]) => path.includes('/analytics'))).toHaveLength(2),
    )
    expect(vi.mocked(fetchAPI).mock.calls.filter(([path]) => path.endsWith('/overview'))).toHaveLength(1)
  })

  it('waits for the v6 overview and exposes a recoverable error', async () => {
    let unavailable = true
    vi.mocked(fetchAPI).mockImplementation(async (endpoint) =>
      endpoint.includes('/analytics')
        ? (ok(analyticsFor(endpoint)) as Response)
        : unavailable
          ? (failed() as Response)
          : (ok(overviewFixture()) as Response),
    )
    renderPage()
    await screen.findByRole('alert')
    expect(screen.queryByText('120')).not.toBeInTheDocument()
    unavailable = false
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByText('120')
    expect(fetchAPI).toHaveBeenCalledWith('/v6/admin/overview', 'GET')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it('shows distinct platform counts and accessible language text, then refreshes', async () => {
    useValidResponses()
    renderPage()
    await screen.findByText('120')
    expect(screen.getByText('700')).toBeInTheDocument()
    expect(screen.getByText('900')).toBeInTheDocument()
    expect(screen.getByText('24')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'English: 80' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'French: 40' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Discord subscriptions: 8' })).toBeInTheDocument()
    expect(screen.getByText(/Memberships are counted per community/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Manage Premium' })).toHaveAttribute('href', '/dashboard/admins/premium')
    await fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledTimes(4))
    await screen.findByText('120')
  })
  it('handles an empty platform without fictitious percentages or invalid numbers', async () => {
    const empty = overviewFixture()
    for (const key of Object.keys(empty.totals) as (keyof typeof empty.totals)[]) empty.totals[key] = 0
    empty.recent = { days: 7, guilds: 0, servers: 0, users: 0 }
    empty.languages = []
    vi.mocked(fetchAPI).mockImplementation(
      async (endpoint) => ok(endpoint.includes('/analytics') ? analyticsFixture(30, true) : empty) as Response,
    )
    const { container } = renderPage()
    await screen.findByText('No language data is available yet.')
    expect(container.textContent).not.toMatch(/NaN|Infinity|\d%/)
    expect(screen.getByText('New in the last 7 days')).toBeInTheDocument()
  })
  it('rejects malformed overview data instead of displaying fabricated zero totals', async () => {
    vi.mocked(fetchAPI).mockImplementation(
      async (endpoint) => ok(endpoint.includes('/analytics') ? analyticsFor(endpoint) : { totals: {} }) as Response,
    )
    renderPage()
    await screen.findByRole('alert')
    expect(
      within(screen.getByRole('region', { name: 'Platform overview' })).queryByRole('link', { name: 'View records' }),
    ).not.toBeInTheDocument()
  })

  it('keeps Discord subscription counts unknown when verification is unavailable', async () => {
    const overview = overviewFixture()
    overview.totals.discordPremium = null
    vi.mocked(fetchAPI).mockImplementation(
      async (endpoint) => ok(endpoint.includes('/analytics') ? analyticsFor(endpoint) : overview) as Response,
    )
    renderPage()
    const panel = await screen.findByRole('region', { name: 'Premium access sources' })
    await within(panel).findByText('Discord subscriptions could not be verified. Other sources remain available.')
    expect(within(panel).getByRole('img', { name: 'Manual Premium grants: 15' })).toBeInTheDocument()
    expect(within(panel).queryByRole('img', { name: /Discord subscriptions:/ })).not.toBeInTheDocument()
    expect(within(within(panel).getByRole('list')).getByText('Unknown')).toBeInTheDocument()
    await fireEvent.click(within(panel).getByText('View chart data'))
    const row = within(panel).getByRole('rowheader', { name: 'Discord subscriptions' }).closest('tr')!
    expect(within(row).getByRole('cell')).toHaveTextContent('Unknown')
  })

  it('requests the selected UTC window and switches chart metrics without another request', async () => {
    useValidResponses()
    const { container } = renderPage()
    await screen.findByRole('img', { name: /Daily registration trends in UTC/ })
    expect(fetchAPI).toHaveBeenCalledWith('/v6/admin/analytics?days=30', 'GET')
    expect(container.querySelectorAll('[data-registration-series]')).toHaveLength(3)
    await fireEvent.change(screen.getByRole('combobox', { name: 'Period' }), { target: { value: '7' } })
    await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith('/v6/admin/analytics?days=7', 'GET'))
    await screen.findByRole('img', { name: /Daily registration trends in UTC/ })
    await fireEvent.click(screen.getByText('View daily data'))
    expect(
      within(screen.getByRole('table', { name: 'Daily registration counts (UTC)' })).getAllByRole('row'),
    ).toHaveLength(8)
    const count = vi.mocked(fetchAPI).mock.calls.length
    await fireEvent.change(screen.getByRole('combobox', { name: 'Show' }), { target: { value: 'accounts' } })
    expect(container.querySelectorAll('[data-registration-series]')).toHaveLength(1)
    expect(container.querySelector('[data-registration-series]')).toHaveAttribute(
      'data-registration-series',
      'accounts',
    )
    expect(fetchAPI).toHaveBeenCalledTimes(count)
    await fireEvent.change(screen.getByRole('combobox', { name: 'Period' }), { target: { value: '90' } })
    await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith('/v6/admin/analytics?days=90', 'GET'))
  })

  it('separates loading, failed analytics and a successful retry', async () => {
    let complete!: (value: Response) => void
    let first = true
    vi.mocked(fetchAPI).mockImplementation(async (endpoint) => {
      if (!endpoint.includes('/analytics')) return ok(overviewFixture()) as Response
      if (first) {
        first = false
        return await new Promise<Response>((resolve) => {
          complete = resolve
        })
      }
      return ok(analyticsFor(endpoint)) as Response
    })
    renderPage()
    const panel = screen.getByRole('region', { name: 'Daily registrations' })
    expect(within(panel).getByRole('status')).toHaveTextContent('Loading')
    expect(within(panel).queryByRole('img')).not.toBeInTheDocument()
    complete(failed() as Response)
    await within(panel).findByRole('alert')
    expect(
      within(panel).queryByText('No registrations for the selected metric in this period.'),
    ).not.toBeInTheDocument()
    await fireEvent.click(within(panel).getByRole('button', { name: 'Try again' }))
    await within(panel).findByRole('img', { name: /Daily registration trends in UTC/ })
    expect(within(panel).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('rejects a valid response for the wrong requested period', async () => {
    vi.mocked(fetchAPI).mockImplementation(
      async (endpoint) => ok(endpoint.includes('/analytics') ? analyticsFixture(7) : overviewFixture()) as Response,
    )
    renderPage()
    const panel = screen.getByRole('region', { name: 'Daily registrations' })
    await within(panel).findByRole('alert')
    expect(within(panel).queryByRole('img')).not.toBeInTheDocument()
  })
})
