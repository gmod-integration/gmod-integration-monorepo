import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../../../../../testUtils.js'
import { okJson, errJson, stubDialogGlobal, clearDialogGlobals } from '../testHelpers.js'

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

afterEach(() => {
  cleanup()
  clearDialogGlobals('edit_log_trigger')
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

function renderPage() {
  return renderWithProviders(() => <ServerLogsTriggers />, {
    path: '/dashboard/guilds/:guildID/config/servers/:serverID/logs',
    history: historyAt('/dashboard/guilds/g1/config/servers/s1/logs'),
  })
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
    const m = within(modal(container))
    expect(m.getByText('Add Trigger')).toBeInTheDocument()
    const saveBtn = m.getByText('Add')
    expect(saveBtn).toBeDisabled()
  })

  it('enables Save once a channel is selected, and creates a new trigger on click', async () => {
    const { container } = renderPage()
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Add Trigger' })).not.toBeDisabled())
    const m = within(modal(container))
    // Find the channel selector specifically: it's the <select> right after the "Channel" label.
    const channelFieldset = m.getByText('Channel').closest('.fieldset') as HTMLElement
    const select = channelFieldset.querySelector('select') as HTMLSelectElement
    await fireEvent.change(select, { target: { value: 'c1' } })

    const newTrigger = trigger({ id: 5, channelID: 'c1' })
    ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
      if (endpoint === TRIGGERS_URL && method === 'POST') return Promise.resolve(okJson(newTrigger))
      return Promise.resolve(okJson([]))
    })

    const saveBtn = m.getByText('Add')
    await vi.waitFor(() => expect(saveBtn).not.toBeDisabled())
    stubDialogGlobal(container, 'edit_log_trigger')
    await fireEvent.click(saveBtn)

    await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(TRIGGERS_URL, 'POST', expect.objectContaining({ channelID: 'c1' })))
    await vi.waitFor(() => expect(container.querySelectorAll('tbody tr')).toHaveLength(1))
  })

  it('logs an error and does not add a row when creating a trigger fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = renderPage()
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Add Trigger' })).not.toBeDisabled())
    const m = within(modal(container))
    const channelFieldset = m.getByText('Channel').closest('.fieldset') as HTMLElement
    const select = channelFieldset.querySelector('select') as HTMLSelectElement
    await fireEvent.change(select, { target: { value: 'c1' } })

    ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
      if (endpoint === TRIGGERS_URL && method === 'POST') return Promise.resolve(errJson())
      return Promise.resolve(okJson([]))
    })
    const saveBtn = m.getByText('Add')
    await vi.waitFor(() => expect(saveBtn).not.toBeDisabled())
    stubDialogGlobal(container, 'edit_log_trigger')
    await fireEvent.click(saveBtn)

    await vi.waitFor(() => expect(errorSpy).toHaveBeenCalled())
    expect(container.querySelectorAll('tbody tr')).toHaveLength(0)
    errorSpy.mockRestore()
  })

  it('opens with "Edit Trigger" title and the trigger fields prefilled when the edit icon is clicked', async () => {
    ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
      if (endpoint === TRIGGERS_URL && method === 'GET') return Promise.resolve(okJson([trigger()]))
      return Promise.resolve(okJson([]))
    })
    const { container } = renderPage()
    await vi.waitFor(() => expect(container.querySelectorAll('tbody tr')).toHaveLength(1))
    stubDialogGlobal(container, 'edit_log_trigger')
    await fireEvent.click(container.querySelector('tbody .fa-edit') as HTMLElement)

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
    stubDialogGlobal(container, 'edit_log_trigger')
    await fireEvent.click(container.querySelectorAll('tbody .fa-edit')[0] as HTMLElement)

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

  it('logs an error and keeps the old row when saving an edited trigger fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
      if (endpoint === TRIGGERS_URL && method === 'GET') return Promise.resolve(okJson([trigger()]))
      return Promise.resolve(okJson([]))
    })
    const { container } = renderPage()
    await vi.waitFor(() => expect(container.querySelectorAll('tbody tr')).toHaveLength(1))
    stubDialogGlobal(container, 'edit_log_trigger')
    await fireEvent.click(container.querySelector('tbody .fa-edit') as HTMLElement)

    const m = within(modal(container))
    ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
      if (endpoint === `${TRIGGERS_URL}/1` && method === 'PUT') return Promise.resolve(errJson())
      return Promise.resolve(okJson([]))
    })
    await fireEvent.click(m.getByText('Save'))
    await vi.waitFor(() => expect(errorSpy).toHaveBeenCalled())
    expect(within(container.querySelector('tbody tr') as HTMLElement).getByText('1000000')).toBeInTheDocument()
    errorSpy.mockRestore()
  })

  it('changes the log_type, compare, operator and message fields via their selects/inputs', async () => {
    const { container } = renderPage()
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Add Trigger' })).not.toBeDisabled())
    const m = within(modal(container))

    const triggerFieldset = m.getByText('Trigger').closest('.fieldset') as HTMLElement
    const triggerSelect = triggerFieldset.querySelector('select') as HTMLSelectElement
    await fireEvent.change(triggerSelect, { target: { value: 'ch_atm_send_money' } })

    const compareFieldset = m.getByText('Compare').closest('.fieldset') as HTMLElement
    const compareSelect = compareFieldset.querySelector('select') as HTMLSelectElement
    await fireEvent.change(compareSelect, { target: { value: 'amount' } })

    const operatorFieldset = m.getByText('Operator').closest('.fieldset') as HTMLElement
    const operatorSelect = operatorFieldset.querySelector('select') as HTMLSelectElement
    await fireEvent.change(operatorSelect, { target: { value: 'lessThan' } })

    const messageTextarea = modal(container).querySelector('textarea') as HTMLTextAreaElement
    await fireEvent.input(messageTextarea, { target: { value: 'Custom message' } })

    expect(messageTextarea.value).toBe('Custom message')
    // None of these throw and the modal keeps functioning - functional assertion via a
    // subsequent create carrying the edited fields through.
    const channelFieldset = m.getByText('Channel').closest('.fieldset') as HTMLElement
    const channelSelect = channelFieldset.querySelector('select') as HTMLSelectElement
    await fireEvent.change(channelSelect, { target: { value: 'c2' } })

    ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
      if (endpoint === TRIGGERS_URL && method === 'POST') return Promise.resolve(okJson(trigger({ id: 9 })))
      return Promise.resolve(okJson([]))
    })
    stubDialogGlobal(container, 'edit_log_trigger')
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
    await vi.waitFor(() => expect(container.querySelectorAll('tbody tr')).toHaveLength(1))
    stubDialogGlobal(container, 'edit_log_trigger')
    // Open+edit first, to move state away from the default example trigger.
    await fireEvent.click(container.querySelector('tbody .fa-edit') as HTMLElement)
    const m1 = within(modal(container))
    expect(m1.getByText('Edit Trigger')).toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: 'Add Trigger' }))
    const m2 = within(modal(container))
    expect(m2.getByText('Add Trigger')).toBeInTheDocument()
    expect((m2.getByPlaceholderText('Value') as HTMLInputElement).value).toBe('1000000')
  })
})
