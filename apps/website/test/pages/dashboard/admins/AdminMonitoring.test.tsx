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
} from '@gmod/schema/admin/AdminMonitoringSchema.js'
vi.mock('../../../../src/utils/api.js', () => ({ fetchAPI: vi.fn() }))
const timestamp = '2026-11-22T12:00:00.000Z'
const fixture = (endpoint: string) => {
  const url = new URL(endpoint, 'https://local.test')
  const query = Object.fromEntries(url.searchParams)
  if (url.pathname.endsWith('/connections')) {
    const q = AdminConnectionsQuerySchema.parse(query)
    return {
      query: q,
      total: 26,
      presence: 'ready',
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
        },
      ],
    }
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
  vi.mocked(fetchAPI)
    .mockReset()
    .mockImplementation(async (endpoint) => ok(fixture(endpoint)) as Response)
})
afterEach(cleanup)
describe('administration monitoring', () => {
  it('keeps each source independent and paginates registered server leases on the backend', async () => {
    renderWithProviders(AdminMonitoring)
    const panel = screen.getByRole('region', { name: 'WebSocket connections' })
    await within(panel).findByText('Example 1')
    expect(within(panel).getByText('Connected')).toBeInTheDocument()
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
    const panel = screen.getByRole('region', { name: 'WebSocket connections' })
    await within(panel).findByText('Unknown')
    expect(within(panel).queryByText('Connected')).not.toBeInTheDocument()
    const errors = screen.getByRole('region', { name: 'Detected Lua errors' })
    await fireEvent.change(within(errors).getByRole('combobox', { name: 'Source' }), { target: { value: 'all' } })
    await vi.waitFor(() =>
      expect(vi.mocked(fetchAPI).mock.calls.some(([path]) => path.includes('source=all'))).toBe(true),
    )
  })
})
