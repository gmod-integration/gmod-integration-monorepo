import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { ErrorBoundary } from 'solid-js/web'
import { historyAt, renderWithProviders } from '../../../../../testUtils.js'
import { okJson } from '../testHelpers.js'

vi.mock('../../../../../../src/utils/api.js', () => ({
  fetchAPI: vi.fn(() => Promise.resolve({ ok: true, json: async () => [] })),
  getAPIUrl: vi.fn(),
  getUrlWithActualParams: vi.fn((s: string) => s),
}))

const { fetchAPI } = await import('../../../../../../src/utils/api.js')
const { guildChannelsMutate } = await import('../../../../../../src/pages/dashboard/guilds/GuildInformations.js')
const { ServerLogsTriggers } = await import(
  '../../../../../../src/pages/dashboard/guilds/servers/logs/ServerLogsTriggers.js'
)

const TRIGGERS_URL = '/users/:discordID/guilds/:guildID/servers/:serverID/logs/triggers'

afterEach(() => cleanup())

function trigger(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    log_type: 'dark_rp_drop_money',
    value: '1000000',
    operator: 'greaterThan',
    compare: 'amount',
    action: 'sendMessageInChannel',
    channelID: 'c1',
    adminIDS: [],
    message: 'A lot of money dropped',
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  }
}

function renderPage() {
  return renderWithProviders(() => <ServerLogsTriggers />, {
    path: '/dashboard/guilds/:guildID/config/servers/:serverID/logs',
    history: historyAt('/dashboard/guilds/g1/config/servers/s1/logs'),
  })
}

describe('pages/dashboard/guilds/servers/logs/ServerLogsTriggers.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
    guildChannelsMutate([{ id: 'c1', name: 'general', type: 0, position: 0, parentID: null }])
    ;(fetchAPI as Mock).mockReset()
  })

  describe('panel and table rendering', () => {
    it('shows a loading indicator for the table while logTriggers is loading', () => {
      ;(fetchAPI as Mock).mockImplementation(() => new Promise(() => {}))
      const { container } = renderPage()
      expect(container.querySelector('.loading')).toBeInTheDocument()
    })

    it('renders a fetched trigger row with translated compare/operator/action text', async () => {
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === TRIGGERS_URL && method === 'GET') return Promise.resolve(okJson([trigger()]))
        return Promise.resolve(okJson([]))
      })
      const { container } = renderPage()
      // "DarkRP Drop Money" also appears as an <option> in the always-rendered modal select, so
      // wait on the tbody row itself (not text alone) to be sure the table has actually loaded.
      await vi.waitFor(() => expect(container.querySelectorAll('tbody tr')).toHaveLength(1))
      const row = within(container.querySelector('tbody tr') as HTMLElement)
      expect(row.getByText('DarkRP Drop Money')).toBeInTheDocument()
      expect(row.getByText('Amount')).toBeInTheDocument()
      expect(row.getByText('Greater Than')).toBeInTheDocument()
      expect(row.getByText('1000000')).toBeInTheDocument()
      expect(row.getByText('Send Message In Channel')).toBeInTheDocument()
    })

    it('renders no rows and no error when the server returns 403 (not premium)', async () => {
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === TRIGGERS_URL && method === 'GET') return Promise.resolve({ status: 403, ok: false })
        return Promise.resolve(okJson([]))
      })
      const { container } = renderPage()
      await vi.waitFor(() => expect(container.querySelector('.loading')).not.toBeInTheDocument())
      expect(container.querySelectorAll('tbody tr')).toHaveLength(0)
    })

    it('throws to the app-level ErrorBoundary when the fetch fails for a reason other than 403', async () => {
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === TRIGGERS_URL && method === 'GET') return Promise.resolve({ status: 500, ok: false })
        return Promise.resolve(okJson([]))
      })
      renderWithProviders(
        () => (
          <ErrorBoundary fallback={(err) => <div data-testid="boundary-error">{err.message}</div>}>
            <ServerLogsTriggers />
          </ErrorBoundary>
        ),
        {
          path: '/dashboard/guilds/:guildID/config/servers/:serverID/logs',
          history: historyAt('/dashboard/guilds/g1/config/servers/s1/logs'),
        },
      )
      await vi.waitFor(() =>
        expect(screen.getByTestId('boundary-error')).toHaveTextContent('An error occurred while fetching the log triggers.'),
      )
    })

    it('shows the premium upsell when the guild is not premium', async () => {
      window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: false }))
      ;(fetchAPI as Mock).mockImplementation(() => Promise.resolve(okJson([])))
      renderPage()
      await vi.waitFor(() => expect(screen.getByText('Logs Trigger')).toBeInTheDocument())
      expect(screen.getByText('This feature is only available to premium users.')).toBeInTheDocument()
    })

    it('disables the Add Trigger button when not premium', async () => {
      window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: false }))
      ;(fetchAPI as Mock).mockImplementation(() => Promise.resolve(okJson([])))
      renderPage()
      // "Add Trigger" also matches the (always-rendered) modal's <h2> title text since the
      // default editedTrigger has id 0, so scope to the button by role.
      await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Add Trigger' })).toBeDisabled())
    })
  })

  describe('row actions', () => {
    it('deletes a trigger and removes it from the list on success', async () => {
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === TRIGGERS_URL && method === 'GET') return Promise.resolve(okJson([trigger()]))
        if (endpoint === `${TRIGGERS_URL}/1` && method === 'DELETE') return Promise.resolve(okJson({ id: 1 }))
        return Promise.resolve(okJson([]))
      })
      const { container } = renderPage()
      await vi.waitFor(() => expect(container.querySelectorAll('tbody tr')).toHaveLength(1))
      await fireEvent.click(container.querySelector('tbody .fa-trash') as HTMLElement)
      await vi.waitFor(() => expect(container.querySelectorAll('tbody tr')).toHaveLength(0))
    })

    it('does not remove the row when deleting a trigger fails, and logs the error', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === TRIGGERS_URL && method === 'GET') return Promise.resolve(okJson([trigger()]))
        if (endpoint === `${TRIGGERS_URL}/1` && method === 'DELETE') return Promise.resolve({ ok: false, json: async () => ({}) })
        return Promise.resolve(okJson([]))
      })
      const { container } = renderPage()
      await vi.waitFor(() => expect(container.querySelectorAll('tbody tr')).toHaveLength(1))
      await fireEvent.click(container.querySelector('tbody .fa-trash') as HTMLElement)
      await vi.waitFor(() => expect(errorSpy).toHaveBeenCalled())
      expect(container.querySelectorAll('tbody tr')).toHaveLength(1)
      errorSpy.mockRestore()
    })
  })
})
