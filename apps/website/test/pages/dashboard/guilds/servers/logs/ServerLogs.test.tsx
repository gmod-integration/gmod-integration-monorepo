import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../../../../../testUtils.js'

const LOGS_URL = '/users/:discordID/guilds/:guildID/servers/:serverID/logs'

vi.mock('../../../../../../src/utils/api.js', () => ({
  fetchAPI: vi.fn((endpoint: string) => {
    if (typeof endpoint === 'string' && endpoint.startsWith(`${LOGS_URL}?`)) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ logs: [], query: { limit: 25, offset: 0, sort: 'createdAt', orderBy: 'DESC', total: 0 } }),
      })
    }
    return Promise.resolve({ ok: true, json: async () => [] })
  }),
  getAPIUrl: vi.fn(),
  getUrlWithActualParams: vi.fn((s: string) => s),
}))

const { default: ServerLogs } = await import('../../../../../../src/pages/dashboard/guilds/servers/logs/ServerLogs.js')

afterEach(() => cleanup())

describe('pages/dashboard/guilds/servers/logs/ServerLogs.tsx', () => {
  it('renders the logs parameters, triggers, and list panels together', async () => {
    window.localStorage.clear()
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
    renderWithProviders(() => <ServerLogs />, {
      path: '/dashboard/guilds/:guildID/config/servers/:serverID/logs',
      history: historyAt('/dashboard/guilds/g1/config/servers/s1/logs'),
    })
    await vi.waitFor(() => expect(screen.getByText('Logs Channel')).toBeInTheDocument())
    expect(screen.getByText('Logs Trigger')).toBeInTheDocument()
    expect(screen.getByText('Logs')).toBeInTheDocument()
  })
})
