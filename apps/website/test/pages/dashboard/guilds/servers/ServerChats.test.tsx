import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../../../../testUtils.js'
import { okJson, errJson } from './testHelpers.js'

vi.mock('../../../../../src/utils/api.js', () => ({
  fetchAPI: vi.fn(() => Promise.resolve({ ok: true, json: async () => [] })),
  getAPIUrl: vi.fn(),
  getUrlWithActualParams: vi.fn((value: string) => value),
}))
vi.mock('../../../../../src/utils/dashboardSettings.js', () => ({ saveDashboardSettings: vi.fn() }))
const { fetchAPI } = await import('../../../../../src/utils/api.js')
const { saveDashboardSettings } = await import('../../../../../src/utils/dashboardSettings.js')
const { guildChannelsMutate } = await import('../../../../../src/pages/dashboard/guilds/GuildInformations.js')
const Page = (await import('../../../../../src/pages/dashboard/guilds/servers/ServerChats.js')).default
const URL = '/users/:discordID/guilds/:guildID/servers/:serverID/chats'
const SETTING = '/users/:discordID/guilds/:guildID/servers/:serverID/settings/'
const filter = () => ({
  id: 1,
  element: 'message',
  operator: 'contain',
  trigger: 'hello',
  action: 'relay',
  active: true,
})
const channels = [
  { id: 'c1', name: 'general', type: 0, position: 0, parentID: null },
  { id: 'c2', name: 'relay', type: 0, position: 1, parentID: null },
]
let failure: string | undefined
let storedChannel: object
let write: (endpoint: string, method: string, body: unknown) => unknown
function renderPage() {
  return renderWithProviders(() => <Page />, {
    path: '/dashboard/guilds/:guildID/config/servers/:serverID/chats',
    history: historyAt('/dashboard/guilds/g1/config/servers/s1/chats'),
  })
}
const input = (id: string) => document.getElementById(id) as HTMLInputElement
const modal = () => within(document.getElementById('edit_rule_modal')!)
const destinationSelect = () => screen.getByRole('combobox', { name: 'Select a Channel' }) as HTMLSelectElement
const group = (control: Element) => within(control.closest('.dashboard-panel')!)
const writes = () => (fetchAPI as Mock).mock.calls.filter(([, method]) => method !== 'GET')
async function loaded() {
  await vi.waitFor(() => {
    expect(screen.getByText('hello')).toBeInTheDocument()
    expect(input('chat-direction')).not.toBeDisabled()
    expect(destinationSelect()).not.toBeDisabled()
  })
}
async function createDraft() {
  await fireEvent.click(screen.getByRole('button', { name: 'Add Rule' }))
  await fireEvent.change(input('chat-rule-element'), { target: { value: 'userGroup' } })
  await fireEvent.change(input('chat-rule-operator'), { target: { value: 'equal' } })
  await fireEvent.input(input('chat-rule-trigger'), { target: { value: 'admins' } })
  await fireEvent.change(input('chat-rule-action'), { target: { value: 'relay' } })
  await fireEvent.click(input('chat-rule-active'))
}
afterEach(cleanup)
describe('ServerChats unified editing', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
    vi.clearAllMocks()
    failure = undefined
    storedChannel = { channel: 'c1' }
    write = () => okJson({})
    ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string, body: unknown) => {
      if (method !== 'GET') return Promise.resolve(write(endpoint, method, body))
      if (endpoint === failure) return Promise.resolve(errJson())
      if (endpoint === URL) return Promise.resolve(okJson(storedChannel))
      if (endpoint === URL + '/filters') return Promise.resolve(okJson([filter()]))
      if (endpoint === SETTING + 'syncChatDirection') return Promise.resolve(okJson({ value: 'gmodToDiscord' }))
      if (endpoint === SETTING + 'sync_chat_prevent_ping') return Promise.resolve(okJson({ value: false }))
      if (endpoint === SETTING + 'chat_sync_relay_all') return Promise.resolve(okJson({ value: true }))
      return Promise.resolve(okJson([]))
    })
    ;(saveDashboardSettings as Mock).mockImplementation(async (_scope, settings) => ({ settings, sync: 'applied' }))
    guildChannelsMutate(channels)
  })
  it('renders the saved channel and filter values', async () => {
    renderPage()
    await loaded()
    expect(group(destinationSelect()).getByText('#general')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByText('Contains')).toBeInTheDocument()
    expect(input('chat-default-behavior')).toHaveValue('true')
    expect(input('chat-prevent-ping')).not.toBeChecked()
  })
  it('edits the destination inline and Cancel keeps the saved channel', async () => {
    renderPage()
    await loaded()
    const select = destinationSelect()
    const actions = group(select)
    await fireEvent.change(select, { target: { value: 'c2' } })
    expect(writes()).toHaveLength(0)
    expect(group(destinationSelect()).getByText('#general')).toBeInTheDocument()
    await fireEvent.click(actions.getByRole('button', { name: 'Cancel' }))
    expect(select).toHaveValue('c1')
    expect(document.getElementById('select_channel_modal')).not.toBeInTheDocument()
  })
  it('applies a valid destination only on Save', async () => {
    storedChannel = {}
    renderPage()
    await loaded()
    const select = destinationSelect()
    const actions = group(select)
    expect(actions.getByRole('button', { name: 'Save' })).toBeDisabled()
    await fireEvent.change(select, { target: { value: 'c2' } })
    expect(writes()).toHaveLength(0)
    write = () => okJson({ channel: 'c2' })
    await fireEvent.click(actions.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(URL, 'POST', { channelID: 'c2' }))
    await vi.waitFor(() => expect(group(destinationSelect()).getByText('#relay')).toBeInTheDocument())
    expect(select).toHaveValue('c2')
    expect(actions.getByRole('button', { name: 'Save' })).toBeDisabled()
  })
  it('preserves the destination draft and saved channel on failure', async () => {
    renderPage()
    await loaded()
    write = () => errJson()
    const select = destinationSelect()
    const actions = group(select)
    await fireEvent.change(select, { target: { value: 'c2' } })
    await fireEvent.click(actions.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(actions.getByRole('alert')).toBeInTheDocument())
    expect(select).toHaveValue('c2')
    expect(group(destinationSelect()).getByText('#general')).toBeInTheDocument()
    await fireEvent.click(actions.getByRole('button', { name: 'Cancel' }))
    expect(select).toHaveValue('c1')
  })
  it('confirms removal of the named channel and leaves it present after a failed request', async () => {
    renderPage()
    await loaded()
    await fireEvent.click(screen.getByRole('button', { name: 'Remove destination' }))
    const confirm = within(document.getElementById('remove-chat-channel')!)
    expect(
      confirm.getByText(
        '#general — Stop relaying chat through this destination. The Discord channel and filter rules are kept.',
      ),
    ).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
    write = () => errJson()
    await fireEvent.click(confirm.getByRole('button', { name: 'Remove destination' }))
    await vi.waitFor(() => expect(confirm.getByRole('alert')).toBeInTheDocument())
    expect(screen.getAllByText('#general').length).toBeGreaterThan(0)
    write = () => okJson({})
    await fireEvent.click(confirm.getByRole('button', { name: 'Remove destination' }))
    await vi.waitFor(() => expect(screen.getByText('No chat destination configured')).toBeInTheDocument())
    expect(fetchAPI).toHaveBeenCalledWith(URL, 'DELETE')
  })
  it('groups direction and anti-ping into a local draft with one atomic Save', async () => {
    renderPage()
    await loaded()
    const select = input('chat-direction')
    const actions = group(select)
    await fireEvent.change(select, { target: { value: 'both' } })
    await fireEvent.click(input('chat-prevent-ping'))
    expect(saveDashboardSettings).not.toHaveBeenCalled()
    expect(writes()).toHaveLength(0)
    await fireEvent.click(actions.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() =>
      expect(saveDashboardSettings).toHaveBeenCalledWith('server', {
        syncChatDirection: 'both',
        sync_chat_prevent_ping: true,
      }),
    )
    await vi.waitFor(() => expect(actions.getByRole('status')).toBeInTheDocument())
    expect(select).toHaveValue('both')
    expect(input('chat-prevent-ping')).toBeChecked()
    expect(saveDashboardSettings).toHaveBeenCalledTimes(1)
    expect(actions.getByRole('button', { name: 'Save' })).toBeDisabled()
  })
  it('cancels all behavior fields together and retains them after a failed save', async () => {
    renderPage()
    await loaded()
    const select = input('chat-direction')
    const actions = group(select)
    await fireEvent.change(select, { target: { value: 'both' } })
    await fireEvent.click(input('chat-prevent-ping'))
    await fireEvent.click(actions.getByRole('button', { name: 'Cancel' }))
    expect(select).toHaveValue('gmodToDiscord')
    expect(input('chat-prevent-ping')).not.toBeChecked()
    await fireEvent.click(input('chat-prevent-ping'))
    ;(saveDashboardSettings as Mock).mockRejectedValueOnce(new Error('offline'))
    await fireEvent.click(actions.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(actions.getByRole('alert')).toBeInTheDocument())
    expect(input('chat-prevent-ping')).toBeChecked()
    ;(saveDashboardSettings as Mock).mockResolvedValueOnce({
      settings: { sync_chat_prevent_ping: true },
      sync: 'pending',
    })
    await fireEvent.click(actions.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(actions.getByText('Saved. Synchronization is pending.')).toBeInTheDocument())
  })
  it('saves the default behavior separately and explicitly', async () => {
    renderPage()
    await loaded()
    const select = input('chat-default-behavior')
    const panel = within(select.closest('.dashboard-panel')!)
    await fireEvent.change(select, { target: { value: 'false' } })
    expect(saveDashboardSettings).not.toHaveBeenCalled()
    await fireEvent.click(panel.getByRole('button', { name: 'Cancel' }))
    expect(select).toHaveValue('true')
    await fireEvent.change(select, { target: { value: 'false' } })
    await fireEvent.click(panel.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(saveDashboardSettings).toHaveBeenCalledWith('server', { chat_sync_relay_all: false }))
    await vi.waitFor(() => expect(panel.getByRole('status')).toBeInTheDocument())
    expect(select).toHaveValue('false')
  })
  it('saves and cancels each card without applying or discarding the other card drafts', async () => {
    renderPage()
    await loaded()
    const destination = destinationSelect()
    const direction = input('chat-direction')
    const defaults = input('chat-default-behavior')
    const destinationCard = group(destination)
    const behaviorCard = group(direction)
    const defaultCard = group(defaults)
    expect(destination.closest('.dashboard-panel')).not.toBe(direction.closest('.dashboard-panel'))
    expect(direction.closest('.dashboard-panel')).not.toBe(defaults.closest('.dashboard-panel'))
    await fireEvent.change(destination, { target: { value: 'c2' } })
    await fireEvent.change(direction, { target: { value: 'both' } })
    await fireEvent.click(input('chat-prevent-ping'))
    await fireEvent.change(defaults, { target: { value: 'false' } })

    write = () => okJson({ channel: 'c2' })
    await fireEvent.click(destinationCard.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(destinationCard.getByRole('button', { name: 'Save' })).toBeDisabled())
    expect(fetchAPI).toHaveBeenCalledWith(URL, 'POST', { channelID: 'c2' })
    expect(saveDashboardSettings).not.toHaveBeenCalled()
    expect(direction).toHaveValue('both')
    expect(input('chat-prevent-ping')).toBeChecked()
    expect(defaults).toHaveValue('false')
    expect(behaviorCard.getByRole('button', { name: 'Save' })).not.toBeDisabled()
    expect(defaultCard.getByRole('button', { name: 'Save' })).not.toBeDisabled()

    await fireEvent.click(behaviorCard.getByRole('button', { name: 'Cancel' }))
    expect(direction).toHaveValue('gmodToDiscord')
    expect(input('chat-prevent-ping')).not.toBeChecked()
    expect(destination).toHaveValue('c2')
    expect(defaults).toHaveValue('false')
    expect(defaultCard.getByRole('button', { name: 'Save' })).not.toBeDisabled()
    await fireEvent.click(defaultCard.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() =>
      expect(saveDashboardSettings).toHaveBeenCalledExactlyOnceWith('server', { chat_sync_relay_all: false }),
    )
  })
  it('requires a trigger and creates exactly one complete filter on Create', async () => {
    renderPage()
    await loaded()
    await fireEvent.click(screen.getByRole('button', { name: 'Add Rule' }))
    expect(modal().getByRole('button', { name: 'Create' })).toBeDisabled()
    await fireEvent.click(modal().getByRole('button', { name: 'Cancel' }))
    await createDraft()
    expect(writes()).toHaveLength(0)
    write = () =>
      okJson({ id: 2, element: 'userGroup', operator: 'equal', trigger: 'admins', action: 'relay', active: true })
    await fireEvent.click(modal().getByRole('button', { name: 'Create' }))
    await vi.waitFor(() =>
      expect(fetchAPI).toHaveBeenCalledWith(URL + '/filters', 'POST', {
        element: 'userGroup',
        operator: 'equal',
        trigger: 'admins',
        action: 'relay',
        active: true,
      }),
    )
    await vi.waitFor(() => expect(screen.getByText('admins')).toBeInTheDocument())
    expect(writes()).toHaveLength(1)
  })
  it('discards filter drafts on Cancel without creating or mutating a saved row', async () => {
    renderPage()
    await loaded()
    await createDraft()
    await fireEvent.click(modal().getByRole('button', { name: 'Cancel' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Add Rule' }))
    expect(input('chat-rule-trigger')).toHaveValue('')
    await fireEvent.click(modal().getByRole('button', { name: 'Cancel' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(input('chat-rule-trigger')).toHaveValue('hello')
    await fireEvent.input(input('chat-rule-trigger'), { target: { value: 'unsaved' } })
    await fireEvent.click(modal().getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('hello')).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
  })
  it('keeps a failed filter edit open with the draft and allows retry', async () => {
    renderPage()
    await loaded()
    await fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await fireEvent.input(input('chat-rule-trigger'), { target: { value: 'bye' } })
    write = () => errJson()
    await fireEvent.click(modal().getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(modal().getByRole('alert')).toBeInTheDocument())
    expect(screen.getByText('hello')).toBeInTheDocument()
    expect(input('chat-rule-trigger')).toHaveValue('bye')
    write = () => okJson({ ...filter(), trigger: 'bye' })
    await fireEvent.click(modal().getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(screen.getByText('bye')).toBeInTheDocument())
    expect(fetchAPI).toHaveBeenCalledWith(URL + '/filters/1', 'PUT', {
      element: 'message',
      operator: 'contain',
      trigger: 'bye',
      action: 'relay',
      active: true,
    })
  })
  it('locks filter creation and prevents duplicate submissions while pending', async () => {
    renderPage()
    await loaded()
    await createDraft()
    let resolve!: (response: unknown) => void
    write = () =>
      new Promise((result) => {
        resolve = result
      })
    const button = modal().getByRole('button', { name: 'Create' })
    await fireEvent.click(button)
    await fireEvent.click(button)
    expect(button).toBeDisabled()
    expect(modal().getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(input('chat-rule-trigger')).toBeDisabled()
    expect(writes()).toHaveLength(1)
    resolve(
      okJson({ id: 2, element: 'userGroup', operator: 'equal', trigger: 'admins', action: 'relay', active: true }),
    )
    await vi.waitFor(() => expect(screen.getByText('admins')).toBeInTheDocument())
  })
  it('only deletes a filter after confirmation of its target', async () => {
    renderPage()
    await loaded()
    await fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const confirm = within(document.getElementById('remove-chat-filter')!)
    expect(
      confirm.getByText(
        'Message Contains hello — Delete this filter rule. Messages that matched it will follow the remaining rules and default behavior.',
      ),
    ).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
    await fireEvent.click(confirm.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('hello')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await fireEvent.click(confirm.getByRole('button', { name: 'Delete' }))
    await vi.waitFor(() => expect(screen.queryByText('hello')).not.toBeInTheDocument())
    expect(fetchAPI).toHaveBeenCalledWith(URL + '/filters/1', 'DELETE')
  })
  it('disables a failed settings section until a successful retry', async () => {
    failure = SETTING + 'sync_chat_prevent_ping'
    renderPage()
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument())
    expect(input('chat-direction')).toBeDisabled()
    expect(input('chat-prevent-ping')).toBeDisabled()
    failure = undefined
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await loaded()
  })
  it('blocks paid activation while keeping existing filter cleanup available', async () => {
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: false }))
    renderPage()
    await loaded()
    expect(screen.getByRole('button', { name: 'Add Rule' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled()
    expect(input('chat-default-behavior')).toBeDisabled()
    expect(input('chat-direction').querySelector('option[value="both"]')).toBeDisabled()
  })
  it('allows a free community to deactivate an existing filter while keeping its paid fields read-only', async () => {
    localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: false }))
    renderPage()
    await loaded()
    await fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(input('chat-rule-trigger')).toBeDisabled()
    expect(input('chat-rule-active')).toBeEnabled()
    await fireEvent.click(input('chat-rule-active'))
    write = () => okJson({ ...filter(), active: false })
    await fireEvent.click(modal().getByRole('button', { name: 'Save' }))
    await vi.waitFor(() =>
      expect(fetchAPI).toHaveBeenCalledWith(URL + '/filters/1', 'PUT', {
        element: 'message',
        operator: 'contain',
        trigger: 'hello',
        action: 'relay',
        active: false,
      }),
    )
  })
  it('paginates filter rules while keeping the independent relay draft intact', async () => {
    const manyRows = Array.from({ length: 26 }, (_, index) => ({
      ...filter(),
      id: index + 1,
      trigger: `message-${index + 1}`,
    }))
    const original = (fetchAPI as Mock).getMockImplementation()!
    ;(fetchAPI as Mock).mockImplementation((endpoint, method, body) =>
      endpoint === URL + '/filters' && method === 'GET'
        ? Promise.resolve(okJson(manyRows))
        : original(endpoint, method, body),
    )
    renderPage()
    await vi.waitFor(() => expect(screen.getByText('message-1')).toBeInTheDocument())
    await fireEvent.change(input('chat-direction'), { target: { value: 'both' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByText('message-26')).toBeInTheDocument()
    expect(input('chat-direction')).toHaveValue('both')
    await fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(input('chat-rule-trigger')).toHaveValue('message-26')
    await fireEvent.click(modal().getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('message-26')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Previous page' }))
    expect(screen.getByText('message-1')).toBeInTheDocument()
    expect(input('chat-direction')).toHaveValue('both')
    expect(writes()).toHaveLength(0)
    expect(saveDashboardSettings).not.toHaveBeenCalled()
  })
})
