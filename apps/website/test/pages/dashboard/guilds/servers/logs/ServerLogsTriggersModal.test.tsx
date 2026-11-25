import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../../../../../testUtils.js'
import { okJson, errJson } from '../testHelpers.js'
import { DraftEditingProvider } from '../../../../../../src/components/DraftEditingProvider.js'
import { A } from '@solidjs/router'

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

afterEach(() => {
  cleanup()
})

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

function renderPage(guard = false) {
  return renderWithProviders(
    () =>
      guard ? (
        <DraftEditingProvider>
          <ServerLogsTriggers />
          <A href="/other">Other page</A>
        </DraftEditingProvider>
      ) : (
        <ServerLogsTriggers />
      ),
    {
      path: '/dashboard/guilds/:guildID/config/servers/:serverID/logs',
      history: historyAt('/dashboard/guilds/g1/config/servers/s1/logs'),
    },
  )
}

function modal(container: HTMLElement) {
  return container.querySelector('#edit_log_trigger') as HTMLElement
}

describe('pages/dashboard/guilds/servers/logs/ServerLogsTriggers.tsx modal', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
    guildChannelsMutate([
      { id: 'c1', name: 'general', type: 0, position: 0, parentID: null },
      { id: 'c2', name: 'alerts', type: 0, position: 1, parentID: null },
    ])
    ;(fetchAPI as Mock).mockReset()
    ;(fetchAPI as Mock).mockImplementation(() => Promise.resolve(okJson([])))
  })

  it('shows "Add Trigger" as the title and disables Save while channelID is empty', async () => {
    const { container } = renderPage()
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Add Trigger' })).not.toBeDisabled())
    await fireEvent.click(screen.getByRole('button', { name: 'Add Trigger' }))
    const m = within(modal(container))
    expect(m.getByText('Add Trigger')).toBeInTheDocument()
    const saveBtn = m.getByText('Add')
    expect(saveBtn).toBeDisabled()
  })

  it('enables Save once a channel is selected, and creates a new trigger on click', async () => {
    const { container } = renderPage()
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Add Trigger' })).not.toBeDisabled())
    await fireEvent.click(screen.getByRole('button', { name: 'Add Trigger' }))
    const m = within(modal(container))
    const select = m.getByRole('combobox', { name: 'Select a Channel' })
    await fireEvent.change(select, { target: { value: 'c1' } })

    const newTrigger = trigger({ id: 5, channelID: 'c1' })
    ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
      if (endpoint === TRIGGERS_URL && method === 'POST') return Promise.resolve(okJson(newTrigger))
      return Promise.resolve(okJson([]))
    })

    const saveBtn = m.getByText('Add')
    await vi.waitFor(() => expect(saveBtn).not.toBeDisabled())
    await fireEvent.click(saveBtn)

    await vi.waitFor(() =>
      expect(fetchAPI).toHaveBeenCalledWith(TRIGGERS_URL, 'POST', expect.objectContaining({ channelID: 'c1' })),
    )
    await vi.waitFor(() => expect(screen.getByText('1000000')).toBeInTheDocument())
  })

  it('shows an error and keeps the draft open when creating a trigger fails', async () => {
    const { container } = renderPage()
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Add Trigger' })).not.toBeDisabled())
    await fireEvent.click(screen.getByRole('button', { name: 'Add Trigger' }))
    const m = within(modal(container))
    const select = m.getByRole('combobox', { name: 'Select a Channel' })
    await fireEvent.change(select, { target: { value: 'c1' } })

    ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
      if (endpoint === TRIGGERS_URL && method === 'POST') return Promise.resolve(errJson())
      return Promise.resolve(okJson([]))
    })
    const saveBtn = m.getByText('Add')
    await vi.waitFor(() => expect(saveBtn).not.toBeDisabled())
    await fireEvent.click(saveBtn)

    await vi.waitFor(() => expect(m.getByRole('alert')).toHaveTextContent('Unable to save'))
    expect(modal(container)).toHaveAttribute('open')
    expect(select).toHaveValue('c1')
    expect(container.querySelector('tbody svg[data-icon="pencil"]')).not.toBeInTheDocument()
  })

  it('opens with "Edit Trigger" title and the trigger fields prefilled when the edit icon is clicked', async () => {
    ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
      if (endpoint === TRIGGERS_URL && method === 'GET') return Promise.resolve(okJson([trigger()]))
      return Promise.resolve(okJson([]))
    })
    const { container } = renderPage()
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument())
    await fireEvent.click(screen.getByRole('button', { name: 'Edit' }))

    const m = within(modal(container))
    expect(m.getByText('Edit Trigger')).toBeInTheDocument()
    expect((m.getByPlaceholderText('Value') as HTMLInputElement).value).toBe('1000000')
    expect(m.getByText('Save')).toBeInTheDocument()
  })

  it('edits and saves the trigger, replacing only the matching row (leaving other rows as-is)', async () => {
    ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
      if (endpoint === TRIGGERS_URL && method === 'GET')
        return Promise.resolve(okJson([trigger(), trigger({ id: 2, value: '555' })]))
      return Promise.resolve(okJson([]))
    })
    const { container } = renderPage()
    await vi.waitFor(() => expect(container.querySelectorAll('tbody tr')).toHaveLength(2))
    await fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])

    const m = within(modal(container))
    const valueInput = m.getByPlaceholderText('Value') as HTMLInputElement
    await fireEvent.input(valueInput, { target: { value: '2000000' } })

    const updated = trigger({ value: '2000000' })
    ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
      if (endpoint === `${TRIGGERS_URL}/1` && method === 'PUT') return Promise.resolve(okJson(updated))
      return Promise.resolve(okJson([]))
    })
    await fireEvent.click(m.getByText('Save'))
    await vi.waitFor(() =>
      expect(fetchAPI).toHaveBeenCalledWith(`${TRIGGERS_URL}/1`, 'PUT', expect.objectContaining({ value: '2000000' })),
    )
    await vi.waitFor(() => expect(screen.getByText('2000000')).toBeInTheDocument())
    // The other row (id 2) is untouched - covers the .map ternary's "leave unmatched rows as-is" branch.
    expect(screen.getByText('555')).toBeInTheDocument()
  })

  it('shows an error and keeps the old row when saving an edited trigger fails', async () => {
    ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
      if (endpoint === TRIGGERS_URL && method === 'GET') return Promise.resolve(okJson([trigger()]))
      return Promise.resolve(okJson([]))
    })
    const { container } = renderPage()
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument())
    await fireEvent.click(screen.getByRole('button', { name: 'Edit' }))

    const m = within(modal(container))
    ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
      if (endpoint === `${TRIGGERS_URL}/1` && method === 'PUT') return Promise.resolve(errJson())
      return Promise.resolve(okJson([]))
    })
    await fireEvent.input(m.getByPlaceholderText('Value'), { target: { value: '2000000' } })
    await fireEvent.click(m.getByText('Save'))
    await vi.waitFor(() => expect(m.getByRole('alert')).toHaveTextContent('Unable to save'))
    expect(within(container.querySelector('tbody tr') as HTMLElement).getByText('1000000')).toBeInTheDocument()
    expect(modal(container)).toHaveAttribute('open')
  })

  it('changes the log_type, compare, operator and message fields via their selects/inputs', async () => {
    const { container } = renderPage()
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Add Trigger' })).not.toBeDisabled())
    await fireEvent.click(screen.getByRole('button', { name: 'Add Trigger' }))
    const m = within(modal(container))

    const triggerSelect = m.getByLabelText('Event')
    await fireEvent.change(triggerSelect, { target: { value: 'ch_atm_send_money' } })

    const compareSelect = m.getByLabelText('Event field')
    await fireEvent.change(compareSelect, { target: { value: 'amount' } })

    const operatorSelect = m.getByLabelText('Condition')
    await fireEvent.change(operatorSelect, { target: { value: 'lessThan' } })

    const messageTextarea = modal(container).querySelector('textarea') as HTMLTextAreaElement
    await fireEvent.input(messageTextarea, { target: { value: 'Custom message' } })

    expect(messageTextarea.value).toBe('Custom message')
    // None of these throw and the modal keeps functioning - functional assertion via a
    // subsequent create carrying the edited fields through.
    const channelSelect = m.getByRole('combobox', { name: 'Select a Channel' })
    await fireEvent.change(channelSelect, { target: { value: 'c2' } })

    ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
      if (endpoint === TRIGGERS_URL && method === 'POST') return Promise.resolve(okJson(trigger({ id: 9 })))
      return Promise.resolve(okJson([]))
    })
    const saveBtn = m.getByText('Add')
    await vi.waitFor(() => expect(saveBtn).not.toBeDisabled())
    await fireEvent.click(saveBtn)
    await vi.waitFor(() =>
      expect(fetchAPI).toHaveBeenCalledWith(
        TRIGGERS_URL,
        'POST',
        expect.objectContaining({
          log_type: 'ch_atm_send_money',
          operator: 'lessThan',
          message: 'Custom message',
          channelID: 'c2',
        }),
      ),
    )
  })

  it('opens the Add Trigger modal reset to the example trigger when clicking the panel Add Trigger button', async () => {
    ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
      if (endpoint === TRIGGERS_URL && method === 'GET') return Promise.resolve(okJson([trigger()]))
      return Promise.resolve(okJson([]))
    })
    const { container } = renderPage()
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument())
    // Open+edit first, to move state away from the default example trigger.
    await fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const m1 = within(modal(container))
    expect(m1.getByText('Edit Trigger')).toBeInTheDocument()

    await fireEvent.click(m1.getByRole('button', { name: 'Cancel' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Add Trigger' }))
    const m2 = within(modal(container))
    expect(m2.getByText('Add Trigger')).toBeInTheDocument()
    expect((m2.getByPlaceholderText('Value') as HTMLInputElement).value).toBe('1000000')
  })
  it('requires a change before saving an existing trigger and restores it after native cancellation', async () => {
    ;(fetchAPI as Mock).mockImplementation((path: string, method: string) =>
      Promise.resolve(okJson(path === TRIGGERS_URL && method === 'GET' ? [trigger()] : [])),
    )
    const { container } = renderPage()
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Edit' })).toBeEnabled())
    await fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const dialog = modal(container)
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled()
    await fireEvent.input(within(dialog).getByPlaceholderText('Value'), { target: { value: '42' } })
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeEnabled()
    dialog.dispatchEvent(new Event('cancel'))
    await fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(within(dialog).getByPlaceholderText('Value')).toHaveValue('1000000')
    expect((fetchAPI as Mock).mock.calls.filter(([, method]) => method === 'PUT')).toHaveLength(0)
  })
  it('validates numeric comparisons and nonempty messages before any write', async () => {
    const { container } = renderPage()
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Add Trigger' })).toBeEnabled())
    await fireEvent.click(screen.getByRole('button', { name: 'Add Trigger' }))
    const dialog = modal(container)
    await fireEvent.change(within(dialog).getByRole('combobox', { name: 'Select a Channel' }), {
      target: { value: 'c1' },
    })
    await fireEvent.input(within(dialog).getByPlaceholderText('Value'), { target: { value: 'invalid number' } })
    expect(within(dialog).getByRole('button', { name: 'Add' })).toBeDisabled()
    expect(within(dialog).getByPlaceholderText('Value')).toHaveAttribute('aria-invalid', 'true')
    await fireEvent.input(within(dialog).getByPlaceholderText('Value'), { target: { value: '42' } })
    await fireEvent.input(within(dialog).getByLabelText(/Message/), { target: { value: ' ' } })
    expect(within(dialog).getByRole('button', { name: 'Add' })).toBeDisabled()
    expect((fetchAPI as Mock).mock.calls.filter(([, method]) => method === 'POST')).toHaveLength(0)
  })
  it('registers modal edits with the global navigation and beforeunload guards', async () => {
    const { container } = renderPage(true)
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Add Trigger' })).toBeEnabled())
    await fireEvent.click(screen.getByRole('button', { name: 'Add Trigger' }))
    const dialog = modal(container)
    await fireEvent.input(within(dialog).getByPlaceholderText('Value'), { target: { value: '42' } })
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    await fireEvent.click(screen.getByRole('link', { name: 'Other page' }))
    expect(screen.getByRole('dialog', { name: 'Leave without saving?' })).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Stay on this page' }))
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    const clean = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(clean)
    expect(clean.defaultPrevented).toBe(false)
  })
})
