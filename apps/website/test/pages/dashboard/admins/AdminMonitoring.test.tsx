import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { renderWithProviders } from '../../../testUtils.js'
import AdminMonitoring from '../../../../src/pages/dashboard/admins/AdminMonitoring.js'
import { fetchAPI } from '../../../../src/utils/api.js'
import { ok, failed } from './adminFixtures.js'
import {
  AdminConnectionsQuerySchema,
  AdminErrorsQuerySchema,
  AdminBugsQuerySchema,
  type AdminConnections,
} from '@gmod/schema/admin/AdminMonitoringSchema.js'
vi.mock('../../../../src/utils/api.js', () => ({ fetchAPI: vi.fn() }))
const timestamp = '2026-11-22T12:00:00.000Z'
const fixture = (endpoint: string) => {
  const url = new URL(endpoint, 'https://local.test')
  const query = Object.fromEntries(url.searchParams)
  if (url.pathname.endsWith('/connections')) {
    const q = AdminConnectionsQuerySchema.parse(query)
    const page: AdminConnections = {
      query: q,
      total: 26,
      presence: 'ready',
      telemetry: 'ready',
      trafficObservedAt: timestamp,
      trafficWindowSeconds: 60,
      observedAt: timestamp,
      leaseTtlSeconds: 90,
      generatedAt: timestamp,
      items: [
        {
          id: `server-${q.offset + 1}`,
          name: `Example ${q.offset + 1}`,
          guildID: 'guild-1',
          guildName: 'Example community',
          activeSockets: 2,
          leaseExpiresAt: '2026-11-22T12:01:30.000Z',
          addonVersion: '5.2.8',
          protocol: 'legacy',
          lastSeenAt: timestamp,
          lastHttpAt: timestamp,
          lastWebsocketAt: null,
          httpRequestsPerMinute: 12,
          websocketRequestsPerMinute: 0,
          requestsPerMinute: 12,
        },
      ],
    }
    return page
  }
  const isError = url.pathname.endsWith('/errors')
  return {
    query: isError ? AdminErrorsQuerySchema.parse(query) : AdminBugsQuerySchema.parse(query),
    total: 1,
    since: timestamp,
    generatedAt: timestamp,
    items: [
      {
        id: 'a'.repeat(64),
        summary: isError ? 'Example Lua failure' : 'Example recurring report',
        reports: 3,
        serverCount: 2,
        firstSeenAt: timestamp,
        lastSeenAt: timestamp,
        ...(isError ? { realm: 'server', occurrences: 5 } : {}),
      },
    ],
  }
}
beforeEach(() => {
  localStorage.clear()
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  vi.mocked(fetchAPI)
    .mockReset()
    .mockImplementation(async (endpoint) => ok(fixture(endpoint)) as Response)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})
describe('administration monitoring', () => {
  it('submits incident searches and combines period, recurrence and state filters without changing other sources', async () => {
    renderWithProviders(AdminMonitoring)
    await screen.findByText('Example recurring report')
    const panel = screen.getByRole('region', { name: 'Recurring player bug reports' })
    const connectionsBefore = vi.mocked(fetchAPI).mock.calls.filter(([path]) => path.includes('/connections')).length
    await fireEvent.input(within(panel).getByRole('searchbox', { name: 'Search' }), {
      target: { value: 'texture problem' },
    })
    await fireEvent.submit(within(panel).getByRole('searchbox').closest('form')!)
    await fireEvent.change(within(panel).getByRole('combobox', { name: 'Period' }), { target: { value: '30' } })
    await fireEvent.change(within(panel).getByRole('combobox', { name: 'Recurrence' }), { target: { value: 'false' } })
    await fireEvent.change(within(panel).getByRole('combobox', { name: 'Report state' }), { target: { value: 'all' } })
    await vi.waitFor(() => {
      const query = new URL(vi.mocked(fetchAPI).mock.calls.at(-1)![0], 'http://local.test').searchParams
      expect(query.get('search')).toBe('texture problem')
      expect(query.get('days')).toBe('30')
      expect(query.get('recurringOnly')).toBe('false')
      expect(query.get('state')).toBe('all')
    })
    await vi.waitFor(() => expect(within(panel).getByRole('button', { name: 'Refresh' })).toBeEnabled())
    const requests = vi.mocked(fetchAPI).mock.calls.length
    await fireEvent.click(within(panel).getByRole('button', { name: 'Refresh' }))
    await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledTimes(requests + 1))
    expect(vi.mocked(fetchAPI).mock.calls.filter(([path]) => path.includes('/connections'))).toHaveLength(
      connectionsBefore,
    )
  })

  it('retries unavailable connection monitoring independently of the incident lists', async () => {
    vi.mocked(fetchAPI).mockImplementationOnce(async () => failed() as Response)
    renderWithProviders(AdminMonitoring)
    const panel = screen.getByRole('region', { name: 'Server connections' })
    await within(panel).findByRole('alert')
    await screen.findByText('Example Lua failure')
    await fireEvent.click(within(panel).getByRole('button', { name: 'Try again' }))
    await within(panel).findByText('Example 1')
    expect(vi.mocked(fetchAPI).mock.calls.filter(([path]) => path.includes('/errors'))).toHaveLength(1)
  })

  it('keeps each source independent and paginates registered server leases on the backend', async () => {
    renderWithProviders(AdminMonitoring)
    const panel = screen.getByRole('region', { name: 'Server connections' })
    await within(panel).findByText('Example 1')
    expect(within(panel.querySelector('tbody')!).getByText('Connected')).toBeInTheDocument()
    expect(screen.getByText('Example Lua failure')).toBeInTheDocument()
    expect(screen.getByText('Example recurring report')).toBeInTheDocument()
    await fireEvent.click(within(panel).getByRole('button', { name: 'Next page' }))
    await within(panel).findByText('Example 26')
    expect(vi.mocked(fetchAPI).mock.calls.at(-1)?.[0]).toContain('offset=25')
    const link = within(panel).getByRole('link', { name: 'Preview' })
    expect(link).toHaveAttribute('href', '/dashboard/admins/previews?serverID=server-26')
  })
  it('preserves connection data when errors fail and retries only the failed source', async () => {
    let fail = true
    vi.mocked(fetchAPI).mockImplementation(async (endpoint) =>
      endpoint.includes('/errors') && fail ? (failed() as Response) : (ok(fixture(endpoint)) as Response),
    )
    renderWithProviders(AdminMonitoring)
    const errors = screen.getByRole('region', { name: 'Detected Lua errors' })
    await within(errors).findByRole('alert')
    expect(screen.getByText('Example 1')).toBeInTheDocument()
    expect(screen.getByText('Example recurring report')).toBeInTheDocument()
    const calls = vi.mocked(fetchAPI).mock.calls.length
    fail = false
    await fireEvent.click(within(errors).getByRole('button', { name: 'Try again' }))
    await within(errors).findByText('Example Lua failure')
    expect(fetchAPI).toHaveBeenCalledTimes(calls + 1)
  })
  it('shows unknown connection state during Redis failure and applies incident filters on the server', async () => {
    vi.mocked(fetchAPI).mockImplementation(async (endpoint) => {
      const body = fixture(endpoint)
      if ('presence' in body) {
        body.presence = 'unavailable'
        body.observedAt = null as unknown as string
        body.items = body.items.map((row) => ({
          ...row,
          activeSockets: null,
          leaseExpiresAt: null,
        })) as typeof body.items
      }
      return ok(body) as Response
    })
    renderWithProviders(AdminMonitoring)
    const panel = screen.getByRole('region', { name: 'Server connections' })
    await within(panel.querySelector('tbody')!).findAllByText('Unknown')
    expect(within(panel.querySelector('tbody')!).queryByText('Connected')).not.toBeInTheDocument()
    const errors = screen.getByRole('region', { name: 'Detected Lua errors' })
    await fireEvent.change(within(errors).getByRole('combobox', { name: 'Source' }), { target: { value: 'all' } })
    await vi.waitFor(() =>
      expect(vi.mocked(fetchAPI).mock.calls.some(([path]) => path.includes('source=all'))).toBe(true),
    )
  })

  it('distinguishes HTTP traffic, an idle acknowledged socket and missing observations without inferring protocol from version', async () => {
    vi.mocked(fetchAPI).mockImplementation(async (endpoint) => {
      const body = fixture(endpoint)
      if ('presence' in body) {
        const server = body.items[0]
        body.items = [
          { ...server, activeSockets: 0, leaseExpiresAt: null },
          {
            ...server,
            id: 'server-new',
            name: 'Acknowledged server',
            addonVersion: '5.2.8',
            protocol: 'acknowledged',
            httpRequestsPerMinute: 0,
            websocketRequestsPerMinute: 0,
            requestsPerMinute: 0,
          },
          {
            ...server,
            id: 'server-unknown',
            name: 'Unobserved server',
            addonVersion: null,
            protocol: null,
            lastSeenAt: null,
            lastHttpAt: null,
            lastWebsocketAt: null,
          },
        ]
      }
      return ok(body) as Response
    })
    renderWithProviders(AdminMonitoring)
    const panel = screen.getByRole('region', { name: 'Server connections' })
    await within(panel).findByText('Acknowledged server')
    const legacy = within(panel).getByText('Example 1').closest('tr')!
    expect(within(legacy).getByText('server-1')).toBeInTheDocument()
    expect(within(legacy).getByText('Example community')).toBeInTheDocument()
    expect(within(legacy).getByText('5.2.8')).toBeInTheDocument()
    expect(within(legacy).getByText('HTTP / legacy WebSocket')).toBeInTheDocument()
    expect(within(legacy).getByText('No confirmed WebSocket')).toBeInTheDocument()
    expect(within(legacy).getByText('HTTP: 12 · WS: 0')).toBeInTheDocument()
    expect(legacy.querySelector('time')).toHaveAttribute('datetime', timestamp)
    const acknowledged = within(panel).getByText('Acknowledged server').closest('tr')!
    expect(within(acknowledged).getByText('Connected')).toBeInTheDocument()
    expect(within(acknowledged).getByText('Acknowledged WebSocket')).toBeInTheDocument()
    expect(within(acknowledged).getByText('No requests in the last 60 seconds')).toBeInTheDocument()
    const unknown = within(panel).getByText('Unobserved server').closest('tr')!
    expect(within(unknown).getAllByText('Unknown')).toHaveLength(2)
    expect(within(unknown).getByText('No recorded activity')).toBeInTheDocument()
    expect(within(panel).getByText('Current page')).toBeInTheDocument()
  })

  it('keeps confirmed presence distinct from unavailable request monitoring', async () => {
    vi.mocked(fetchAPI).mockImplementation(async (endpoint) => {
      const body = fixture(endpoint)
      if ('presence' in body) {
        body.telemetry = 'unavailable'
        body.trafficObservedAt = null
        body.items = body.items.map((server) => ({
          ...server,
          addonVersion: null,
          protocol: null,
          lastSeenAt: null,
          lastHttpAt: null,
          lastWebsocketAt: null,
          httpRequestsPerMinute: null,
          websocketRequestsPerMinute: null,
          requestsPerMinute: null,
        }))
      }
      return ok(body) as Response
    })
    renderWithProviders(AdminMonitoring)
    const panel = screen.getByRole('region', { name: 'Server connections' })
    await within(panel.querySelector('tbody')!).findByText('Connected')
    expect(within(panel).getByText('HTTP: Unknown · WS: Unknown')).toBeInTheDocument()
    expect(
      within(panel).getByText('Request monitoring is unavailable. Traffic and activity are unknown.'),
    ).toBeInTheDocument()
    expect(within(panel).queryByText('No recorded activity')).not.toBeInTheDocument()
    expect(within(panel).queryByText('No requests in the last 60 seconds')).not.toBeInTheDocument()
  })

  it('refreshes connections only on request and preserves the current page and search', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const view = renderWithProviders(AdminMonitoring)
    const panel = screen.getByRole('region', { name: 'Server connections' })
    await within(panel).findByText('Example 1')
    const countConnections = () =>
      vi.mocked(fetchAPI).mock.calls.filter(([path]) => path.includes('/connections')).length
    await fireEvent.input(within(panel).getByRole('searchbox'), { target: { value: 'community' } })
    await fireEvent.submit(within(panel).getByRole('searchbox').closest('form')!)
    await vi.waitFor(() => expect(within(panel).getByRole('button', { name: 'Refresh' })).toBeEnabled())
    await fireEvent.click(within(panel).getByRole('button', { name: 'Next page' }))
    await within(panel).findByText('Example 26')
    const before = countConnections()
    await vi.advanceTimersByTimeAsync(60_000)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(30_000)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(30_000)
    expect(countConnections()).toBe(before)
    let finish: ((response: Response) => void) | undefined
    vi.mocked(fetchAPI).mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve
        }),
    )
    await fireEvent.click(within(panel).getByRole('button', { name: 'Refresh' }))
    expect(countConnections()).toBe(before + 1)
    const request = vi.mocked(fetchAPI).mock.calls.at(-1)![0]
    expect(request).toContain('offset=25')
    expect(request).toContain('search=community')
    expect(within(panel).getByText('Example 26')).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Refresh' })).toBeDisabled()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(countConnections()).toBe(before + 1)
    finish!(ok(fixture(request)) as Response)
    await vi.waitFor(() => expect(within(panel).getByRole('button', { name: 'Refresh' })).toBeEnabled())
    expect(vi.mocked(fetchAPI).mock.calls.filter(([path]) => path.includes('/errors'))).toHaveLength(1)
    expect(vi.mocked(fetchAPI).mock.calls.filter(([path]) => path.includes('/bugs'))).toHaveLength(1)
    view.unmount()
    await vi.advanceTimersByTimeAsync(30_000)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(countConnections()).toBe(before + 1)
  })

  it.each([
    ['Server name', 'name'],
    ['WebSocket presence', 'activeSockets'],
    ['Addon version', 'addonVersion'],
    ['Observed protocol', 'protocol'],
    ['Requests / min', 'requestsPerMinute'],
    ['Last received activity', 'lastSeenAt'],
  ])('sorts %s in both directions on the backend and resets pagination', async (label, sort) => {
    renderWithProviders(AdminMonitoring)
    const panel = screen.getByRole('region', { name: 'Server connections' })
    await within(panel).findByText('Example 1')
    await fireEvent.click(within(panel).getByRole('button', { name: 'Next page' }))
    await within(panel).findByText('Example 26')
    const button = within(panel).getByRole('button', { name: label })
    await fireEvent.click(button)
    await within(panel).findByText('Example 1')
    let query = new URL(vi.mocked(fetchAPI).mock.calls.at(-1)![0], 'https://local.test').searchParams
    expect(query.get('sort')).toBe(sort)
    expect(query.get('orderBy')).toBe('ASC')
    expect(query.get('offset')).toBe('0')
    expect(button.closest('th')).toHaveAttribute('aria-sort', 'ascending')
    await fireEvent.click(button)
    await vi.waitFor(() => {
      query = new URL(vi.mocked(fetchAPI).mock.calls.at(-1)![0], 'https://local.test').searchParams
      expect(query.get('sort')).toBe(sort)
      expect(query.get('orderBy')).toBe('DESC')
    })
    expect(button.closest('th')).toHaveAttribute('aria-sort', 'descending')
    expect(vi.mocked(fetchAPI).mock.calls.filter(([path]) => path.includes('/errors'))).toHaveLength(1)
    expect(vi.mocked(fetchAPI).mock.calls.filter(([path]) => path.includes('/bugs'))).toHaveLength(1)
  })

  it('combines column filters before pagination and keeps them through sorting and manual refresh', async () => {
    renderWithProviders(AdminMonitoring)
    const panel = screen.getByRole('region', { name: 'Server connections' })
    await within(panel).findByText('Example 1')
    await fireEvent.click(within(panel).getByRole('button', { name: 'Next page' }))
    await within(panel).findByText('Example 26')
    const countConnections = () =>
      vi.mocked(fetchAPI).mock.calls.filter(([path]) => path.includes('/connections')).length
    const before = countConnections()
    await fireEvent.input(within(panel).getByLabelText('Filter by server name'), { target: { value: 'Example' } })
    await fireEvent.change(within(panel).getByLabelText('Filter by WebSocket presence'), {
      target: { value: 'connected' },
    })
    await fireEvent.input(within(panel).getByLabelText('Filter by addon version'), { target: { value: '5.2' } })
    await fireEvent.change(within(panel).getByLabelText('Filter by protocol'), { target: { value: 'legacy' } })
    await fireEvent.input(within(panel).getByLabelText('Minimum requests per minute'), { target: { value: '2' } })
    await fireEvent.input(within(panel).getByLabelText('Maximum requests per minute'), { target: { value: '20' } })
    await fireEvent.input(within(panel).getByLabelText('Activity from'), { target: { value: '2026-11-20T09:00' } })
    await fireEvent.input(within(panel).getByLabelText('Activity until'), { target: { value: '2026-11-23T21:30' } })
    expect(countConnections()).toBe(before)
    await fireEvent.click(within(panel).getByRole('button', { name: 'Apply filters' }))
    await within(panel).findByText('Example 1')
    const expected = {
      name: 'Example',
      connectionState: 'connected',
      addonVersion: '5.2',
      protocol: 'legacy',
      minRequestsPerMinute: '2',
      maxRequestsPerMinute: '20',
      lastSeenFrom: new Date('2026-11-20T09:00').toISOString(),
      lastSeenTo: new Date('2026-11-23T21:30').toISOString(),
    }
    const assertFilters = (offset: string) => {
      const request = vi
        .mocked(fetchAPI)
        .mock.calls.filter(([path]) => path.includes('/connections'))
        .at(-1)![0]
      const query = new URL(request, 'https://local.test').searchParams
      expect(query.get('offset')).toBe(offset)
      for (const [key, value] of Object.entries(expected)) expect(query.get(key)).toBe(value)
      return query
    }
    assertFilters('0')
    await fireEvent.click(within(panel).getByRole('button', { name: 'Addon version' }))
    await vi.waitFor(() => expect(assertFilters('0').get('sort')).toBe('addonVersion'))
    await vi.waitFor(() => expect(within(panel).getByRole('button', { name: 'Refresh' })).toBeEnabled())
    await fireEvent.click(within(panel).getByRole('button', { name: 'Next page' }))
    await within(panel).findByText('Example 26')
    assertFilters('25')
    const requests = countConnections()
    await fireEvent.click(within(panel).getByRole('button', { name: 'Refresh' }))
    await vi.waitFor(() => expect(countConnections()).toBe(requests + 1))
    expect(assertFilters('25').get('sort')).toBe('addonVersion')
    await vi.waitFor(() => expect(within(panel).getByRole('button', { name: 'Refresh' })).toBeEnabled())
    await fireEvent.click(within(panel).getByRole('button', { name: 'Reset filters' }))
    await within(panel).findByText('Example 1')
    const request = vi
      .mocked(fetchAPI)
      .mock.calls.filter(([path]) => path.includes('/connections'))
      .at(-1)![0]
    const query = new URL(request, 'https://local.test').searchParams
    expect(query.get('offset')).toBe('0')
    for (const key of Object.keys(expected)) expect([null, 'all']).toContain(query.get(key))
    expect(within(panel).getByLabelText('Filter by server name')).toHaveValue('')
    expect(within(panel).getByLabelText('Filter by addon version')).toHaveValue('')
    expect(within(panel).getByLabelText('Filter by WebSocket presence')).toHaveValue('all')
    expect(within(panel).getByLabelText('Filter by protocol')).toHaveValue('all')
    expect(within(panel).getByLabelText('Minimum requests per minute')).toHaveValue(null)
    expect(within(panel).getByLabelText('Maximum requests per minute')).toHaveValue(null)
    expect(within(panel).getByLabelText('Activity from')).toHaveValue('')
    expect(within(panel).getByLabelText('Activity until')).toHaveValue('')
  })

  it('keeps the last accepted results when rate or activity bounds are reversed and permits correction', async () => {
    renderWithProviders(AdminMonitoring)
    const panel = screen.getByRole('region', { name: 'Server connections' })
    await within(panel).findByText('Example 1')
    const countConnections = () =>
      vi.mocked(fetchAPI).mock.calls.filter(([path]) => path.includes('/connections')).length
    const before = countConnections()
    const apply = within(panel).getByRole('button', { name: 'Apply filters' })
    await fireEvent.input(within(panel).getByLabelText('Minimum requests per minute'), { target: { value: '20' } })
    await fireEvent.input(within(panel).getByLabelText('Maximum requests per minute'), { target: { value: '2' } })
    await fireEvent.click(apply)
    expect(within(panel).getByRole('alert')).toHaveTextContent('minimums must not exceed maximums')
    expect(countConnections()).toBe(before)
    expect(within(panel).getByText('Example 1')).toBeInTheDocument()
    expect(within(panel).getByLabelText('Minimum requests per minute')).toHaveValue(20)
    await fireEvent.input(within(panel).getByLabelText('Maximum requests per minute'), { target: { value: '30' } })
    await fireEvent.input(within(panel).getByLabelText('Activity from'), { target: { value: '2026-11-23T12:00' } })
    await fireEvent.input(within(panel).getByLabelText('Activity until'), { target: { value: '2026-11-20T12:00' } })
    await fireEvent.click(apply)
    expect(within(panel).getByRole('alert')).toBeInTheDocument()
    expect(countConnections()).toBe(before)
    await fireEvent.input(within(panel).getByLabelText('Activity until'), { target: { value: '2026-11-25T12:00' } })
    await fireEvent.click(apply)
    await vi.waitFor(() => expect(countConnections()).toBe(before + 1))
    expect(within(panel).queryByRole('alert')).not.toBeInTheDocument()
    const request = vi
      .mocked(fetchAPI)
      .mock.calls.filter(([path]) => path.includes('/connections'))
      .at(-1)![0]
    const query = new URL(request, 'https://local.test').searchParams
    expect(query.get('minRequestsPerMinute')).toBe('20')
    expect(query.get('maxRequestsPerMinute')).toBe('30')
    expect(query.get('lastSeenFrom')).toBe(new Date('2026-11-23T12:00').toISOString())
    expect(query.get('lastSeenTo')).toBe(new Date('2026-11-25T12:00').toISOString())
  })
})
