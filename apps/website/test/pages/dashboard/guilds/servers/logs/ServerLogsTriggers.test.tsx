import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../../../../../testUtils.js'
import { okJson } from '../testHelpers.js'

vi.mock('../../../../../../src/utils/api.js', () => ({
  fetchAPI: vi.fn(() => Promise.resolve({ ok: true, json: async () => [] })),
  getAPIUrl: vi.fn(),
  getUrlWithActualParams: vi.fn((s: string) => s),
}))

const { fetchAPI } = await import('../../../../../../src/utils/api.js')
const { guildChannelsMutate } = await import('../../../../../../src/pages/dashboard/guilds/GuildInformations.js')
const { ServerLogsTriggers } =
  await import('../../../../../../src/pages/dashboard/guilds/servers/logs/ServerLogsTriggers.js')

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
      await vi.waitFor(() => expect(container.querySelector('tbody svg[data-icon="pencil"]')).toBeInTheDocument())
      const row = within(container.querySelector('tbody tr') as HTMLElement)
      expect(row.getByText('DarkRP Drop Money')).toBeInTheDocument()
      expect(row.getByText('Amount')).toBeInTheDocument()
      expect(row.getByText('Greater Than')).toBeInTheDocument()
      expect(row.getByText('1000000')).toBeInTheDocument()
      expect(row.getByText('Send a Discord message')).toBeInTheDocument()
    })

    it('shows a real access refusal as an error instead of a false empty list', async () => {
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === TRIGGERS_URL && method === 'GET') return Promise.resolve({ status: 403, ok: false })
        return Promise.resolve(okJson([]))
      })
      const { container } = renderPage()
      await vi.waitFor(() => expect(container.querySelector('.loading')).not.toBeInTheDocument())
      expect(screen.getByRole('alert')).toHaveTextContent('Unable to load')
      expect(
        screen.queryByText('No log alerts are configured. Add a rule to receive notifications for matching events.'),
      ).not.toBeInTheDocument()
    })

    it('shows a recoverable error when the fetch fails for a reason other than 403', async () => {
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === TRIGGERS_URL && method === 'GET') return Promise.resolve({ status: 500, ok: false })
        return Promise.resolve(okJson([]))
      })
      renderPage()
      await vi.waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Unable to load'))
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    })

    it('shows the premium upsell when the guild is not premium', async () => {
      window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: false }))
      ;(fetchAPI as Mock).mockImplementation(() => Promise.resolve(okJson([])))
      renderPage()
      await vi.waitFor(() => expect(screen.getByText('Log alerts')).toBeInTheDocument())
      await vi.waitFor(() => expect(screen.getByRole('note')).toHaveTextContent('This feature requires Premium.'))
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
    it('saves a new trigger only after explicit confirmation and closes after success', async () => {
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string, body: unknown) => {
        if (endpoint === TRIGGERS_URL && method === 'GET') return Promise.resolve(okJson([]))
        if (endpoint === TRIGGERS_URL && method === 'POST')
          return Promise.resolve(okJson({ ...(body as object), id: 2 }))
        return Promise.resolve(okJson([]))
      })
      const { container } = renderPage()
      await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Add Trigger' })).not.toBeDisabled())
      await fireEvent.click(screen.getByRole('button', { name: 'Add Trigger' }))
      const modal = container.querySelector('#edit_log_trigger') as HTMLDialogElement
      expect(within(modal).getByRole('button', { name: 'Add' })).toBeDisabled()
      await fireEvent.change(within(modal).getByRole('combobox', { name: 'Select a Channel' }), {
        target: { value: 'c1' },
      })
      await fireEvent.input(within(modal).getByPlaceholderText('Value'), { target: { value: '42' } })
      expect((fetchAPI as Mock).mock.calls.filter(([, method]) => method === 'POST')).toHaveLength(0)
      await fireEvent.click(within(modal).getByRole('button', { name: 'Add' }))
      await vi.waitFor(() => expect(modal).not.toHaveAttribute('open'))
      expect(screen.getByText('42')).toBeInTheDocument()
    })

    it('keeps failed edits open, blocks duplicate saves and discards the draft on cancel', async () => {
      let finish!: (value: { ok: false }) => void
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === TRIGGERS_URL && method === 'GET') return Promise.resolve(okJson([trigger()]))
        if (endpoint === `${TRIGGERS_URL}/1` && method === 'PUT') return new Promise((resolve) => (finish = resolve))
        return Promise.resolve(okJson([]))
      })
      const { container } = renderPage()
      await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument())
      await fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
      const modal = container.querySelector('#edit_log_trigger') as HTMLDialogElement
      const value = within(modal).getByPlaceholderText('Value')
      await fireEvent.input(value, { target: { value: '42' } })
      expect(screen.getByText('1000000')).toBeInTheDocument()
      const save = within(modal).getByRole('button', { name: 'Save' })
      await fireEvent.click(save)
      await fireEvent.click(save)
      expect((fetchAPI as Mock).mock.calls.filter(([, method]) => method === 'PUT')).toHaveLength(1)
      expect(within(modal).getByRole('button', { name: 'Close' })).toBeDisabled()
      finish({ ok: false })
      await vi.waitFor(() => expect(within(modal).getByRole('alert')).toHaveTextContent('Unable to save'))
      expect(modal).toHaveAttribute('open')
      expect(value).toHaveValue('42')
      await fireEvent.click(within(modal).getByRole('button', { name: 'Cancel' }))
      await fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
      expect(within(modal).getByPlaceholderText('Value')).toHaveValue('1000000')
    })

    it('deletes a trigger and removes it from the list on success', async () => {
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === TRIGGERS_URL && method === 'GET') return Promise.resolve(okJson([trigger()]))
        if (endpoint === `${TRIGGERS_URL}/1` && method === 'DELETE') return Promise.resolve(okJson({ id: 1 }))
        return Promise.resolve(okJson([]))
      })
      const { container } = renderPage()
      await vi.waitFor(() => expect(container.querySelector('tbody svg[data-icon="trash-2"]')).toBeInTheDocument())
      await fireEvent.click(container.querySelector('tbody svg[data-icon="trash-2"]') as HTMLElement)
      expect((fetchAPI as Mock).mock.calls.filter(([, method]) => method === 'DELETE')).toHaveLength(0)
      await fireEvent.click(
        within(screen.getByRole('dialog', { name: 'Delete trigger?' })).getByRole('button', { name: 'Delete' }),
      )
      await vi.waitFor(() => expect(container.querySelector('tbody svg[data-icon="trash-2"]')).not.toBeInTheDocument())
      expect(screen.getByRole('status')).toHaveTextContent(
        'No log alerts are configured. Add a rule to receive notifications for matching events.',
      )
    })

    it('does not remove the row when deleting a trigger fails, and shows the error', async () => {
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === TRIGGERS_URL && method === 'GET') return Promise.resolve(okJson([trigger()]))
        if (endpoint === `${TRIGGERS_URL}/1` && method === 'DELETE')
          return Promise.resolve({ ok: false, json: async () => ({}) })
        return Promise.resolve(okJson([]))
      })
      const { container } = renderPage()
      await vi.waitFor(() => expect(container.querySelector('tbody svg[data-icon="trash-2"]')).toBeInTheDocument())
      await fireEvent.click(container.querySelector('tbody svg[data-icon="trash-2"]') as HTMLElement)
      expect((fetchAPI as Mock).mock.calls.filter(([, method]) => method === 'DELETE')).toHaveLength(0)
      await fireEvent.click(
        within(screen.getByRole('dialog', { name: 'Delete trigger?' })).getByRole('button', { name: 'Delete' }),
      )
      await vi.waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('The action failed'))
      expect(container.querySelectorAll('tbody tr')).toHaveLength(1)
    })
  })
  it('paginates alerts and opens the trigger belonging to the selected page', async () => {
    const triggers = Array.from({ length: 26 }, (_, index) => trigger({ id: index + 1, value: String(index + 100) }))
    ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) =>
      Promise.resolve(okJson(endpoint === TRIGGERS_URL && method === 'GET' ? triggers : [])),
    )
    renderPage()
    await vi.waitFor(() => expect(screen.getByText('100')).toBeInTheDocument())
    expect(screen.getByRole('table').querySelectorAll('tbody tr')).toHaveLength(25)
    const pager = screen.getByRole('navigation', { name: 'Pagination' })
    expect(pager.closest('table')).toBeNull()
    await fireEvent.click(within(pager).getByRole('button', { name: 'Next page' }))
    expect(screen.getByText('125')).toBeInTheDocument()
    expect(screen.queryByText('100')).not.toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(within(document.getElementById('edit_log_trigger')!).getByPlaceholderText('Value')).toHaveValue('125')
    expect((fetchAPI as Mock).mock.calls.filter(([, method]) => method !== 'GET')).toHaveLength(0)
  })
})
