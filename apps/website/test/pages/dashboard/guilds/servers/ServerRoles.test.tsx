import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../../../../testUtils.js'
import { okJson, errJson } from './testHelpers.js'

vi.mock('../../../../../src/utils/api.js', () => ({
  fetchAPI: vi.fn((endpoint: string) =>
    Promise.resolve({ ok: true, json: async () => (endpoint.includes('/bot/roles/subordination') ? {} : []) }),
  ),
  getAPIUrl: vi.fn(),
  getUrlWithActualParams: vi.fn((value: string) => value),
}))
vi.mock('../../../../../src/utils/dashboardSettings.js', () => ({ saveDashboardSettings: vi.fn() }))
const { fetchAPI } = await import('../../../../../src/utils/api.js')
const { saveDashboardSettings } = await import('../../../../../src/utils/dashboardSettings.js')
const { guildRolesMutate, guildChannelsMutate } =
  await import('../../../../../src/pages/dashboard/guilds/GuildInformations.js')
const Page = (await import('../../../../../src/pages/dashboard/guilds/servers/ServerRoles.js')).default
const URL = '/users/:discordID/guilds/:guildID/servers/:serverID/roles'
const guildRoles = [
  { id: 'r1', name: 'Admin', color: 111, colorHex: '#111111' },
  { id: 'r2', name: 'Moderator', color: 222, colorHex: '#222222' },
  { id: 'r3', name: 'VIP', color: 333, colorHex: '#333333' },
]
const rows = () => [
  { serverID: 's1', roleID: 'r1', userGroup: 'admins', enable: true },
  { serverID: 's1', roleID: 'r2', userGroup: 'mods', enable: false },
]
let write: (endpoint: string, method: string, body: unknown) => unknown
let loadFailure = false
function setup() {
  ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string, body: unknown) => {
    if (method !== 'GET') return Promise.resolve(write(endpoint, method, body))
    if (endpoint.includes('/bot/roles/subordination'))
      return Promise.resolve(
        okJson(Object.fromEntries(guildRoles.map((role) => [role.id, { name: role.name, editable: true }]))),
      )
    if (endpoint === URL) return Promise.resolve(loadFailure ? errJson() : okJson(rows()))
    return Promise.resolve(okJson({ value: 'gmod-to-discord' }))
  })
}
function renderPage() {
  return renderWithProviders(() => <Page />, {
    path: '/dashboard/guilds/:guildID/config/servers/:serverID/roles',
    history: historyAt('/dashboard/guilds/g1/config/servers/s1/roles'),
  })
}
async function loaded() {
  await vi.waitFor(() => expect(screen.getByText('@Admin')).toBeInTheDocument())
}
const modal = () => within(document.getElementById('edit_role_modal')!)
const input = (id: string) => document.getElementById(id) as HTMLInputElement
const writes = () => (fetchAPI as Mock).mock.calls.filter(([, method]) => method !== 'GET')
async function createDraft() {
  await fireEvent.click(screen.getByRole('button', { name: 'Add role mapping' }))
  await fireEvent.change(input('roles-role'), { target: { value: 'r3' } })
  await fireEvent.input(input('roles-mapping'), { target: { value: 'vip' } })
  await fireEvent.click(input('roles-enabled'))
}
afterEach(cleanup)
describe('ServerRoles unified editing', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
    vi.clearAllMocks()
    write = () => okJson({})
    loadFailure = false
    setup()
    ;(saveDashboardSettings as Mock).mockImplementation(async (_scope, settings) => ({ settings, sync: 'applied' }))
    guildRolesMutate(guildRoles)
    guildChannelsMutate([])
  })
  it('renders loaded mappings, statuses and the role names', async () => {
    renderPage()
    await loaded()
    expect(screen.getByText('@Moderator')).toBeInTheDocument()
    expect(screen.getByText('admins')).toBeInTheDocument()
    const table = screen.getByRole('table')
    expect(table.querySelectorAll('tbody tr')).toHaveLength(2)
    expect(table.querySelector('svg[data-icon="check"]')).toBeInTheDocument()
    expect(table.querySelector('svg[data-icon="x"]')).toBeInTheDocument()
  })
  it('creates one complete mapping only after explicit confirmation', async () => {
    renderPage()
    await loaded()
    await createDraft()
    expect(writes()).toHaveLength(0)
    expect(screen.queryByText('@VIP')).not.toBeInTheDocument()
    write = () => okJson({ serverID: 's1', roleID: 'r3', userGroup: 'vip', enable: true })
    await fireEvent.click(modal().getByRole('button', { name: 'Create' }))
    await vi.waitFor(() =>
      expect(fetchAPI).toHaveBeenCalledWith(URL + '/r3', 'POST', { userGroup: 'vip', enable: true }),
    )
    await vi.waitFor(() => expect(screen.getByText('@VIP')).toBeInTheDocument())
    expect(writes()).toHaveLength(1)
    await vi.waitFor(() => expect(document.getElementById('edit_role_modal')).not.toHaveAttribute('open'))
  })
  it('requires a role and mapping before Create and discards a cancelled creation', async () => {
    renderPage()
    await loaded()
    await fireEvent.click(screen.getByRole('button', { name: 'Add role mapping' }))
    expect(modal().getByRole('button', { name: 'Create' })).toBeDisabled()
    await fireEvent.change(input('roles-role'), { target: { value: 'r3' } })
    expect(modal().getByRole('button', { name: 'Create' })).toBeDisabled()
    await fireEvent.input(input('roles-mapping'), { target: { value: 'draft' } })
    await fireEvent.click(modal().getByRole('button', { name: 'Cancel' }))
    expect(writes()).toHaveLength(0)
    await fireEvent.click(screen.getByRole('button', { name: 'Add role mapping' }))
    expect(input('roles-mapping')).toHaveValue('')
    expect(input('roles-role')).toHaveValue('')
  })
  it('edits a copy and Cancel leaves the saved row unchanged', async () => {
    renderPage()
    await loaded()
    await fireEvent.click(screen.getAllByRole('button', { name: 'Edit role mapping' })[0])
    expect(input('roles-role')).toBeDisabled()
    expect(input('roles-mapping')).toHaveValue('admins')
    await fireEvent.input(input('roles-mapping'), { target: { value: 'draft' } })
    await fireEvent.click(modal().getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('admins')).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
    await fireEvent.click(screen.getAllByRole('button', { name: 'Edit role mapping' })[0])
    expect(input('roles-mapping')).toHaveValue('admins')
  })
  it('keeps a failed edit open with its values and retries successfully', async () => {
    renderPage()
    await loaded()
    await fireEvent.click(screen.getAllByRole('button', { name: 'Edit role mapping' })[0])
    await fireEvent.input(input('roles-mapping'), { target: { value: 'superadmins' } })
    write = () => errJson()
    await fireEvent.click(modal().getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(modal().getByRole('alert')).toBeInTheDocument())
    expect(document.getElementById('edit_role_modal')).toHaveAttribute('open')
    expect(screen.getByText('admins')).toBeInTheDocument()
    expect(input('roles-mapping')).toHaveValue('superadmins')
    write = () => okJson({ ...rows()[0], userGroup: 'superadmins' })
    await fireEvent.click(modal().getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(screen.getByText('superadmins')).toBeInTheDocument())
    expect(fetchAPI).toHaveBeenLastCalledWith(URL + '/r1', 'PUT', { userGroup: 'superadmins', enable: true })
  })
  it('locks the whole form and prevents duplicate requests while saving', async () => {
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
    expect(button).toBeDisabled()
    expect(modal().getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(input('roles-mapping')).toBeDisabled()
    await fireEvent.click(button)
    expect(writes()).toHaveLength(1)
    resolve(okJson({ serverID: 's1', roleID: 'r3', userGroup: 'vip', enable: true }))
    await vi.waitFor(() => expect(screen.getByText('@VIP')).toBeInTheDocument())
  })
  it('names the deletion target, cancels without a request and removes only after confirmation', async () => {
    renderPage()
    await loaded()
    await fireEvent.click(screen.getAllByRole('button', { name: 'Delete role mapping' })[1])
    const confirmation = within(document.getElementById('delete-role-sync')!)
    expect(
      confirmation.getByText(
        'Moderator — mods — Delete this mapping and stop synchronizing it. This does not delete the Discord role or the game user group.',
      ),
    ).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
    await fireEvent.click(confirmation.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('@Moderator')).toBeInTheDocument()
    await fireEvent.click(screen.getAllByRole('button', { name: 'Delete role mapping' })[1])
    await fireEvent.click(confirmation.getByRole('button', { name: 'Delete' }))
    await vi.waitFor(() => expect(screen.queryByText('@Moderator')).not.toBeInTheDocument())
    expect(fetchAPI).toHaveBeenCalledWith(URL + '/r2', 'DELETE')
    expect(screen.getByText('@Admin')).toBeInTheDocument()
  })
  it('keeps the targeted row and confirmation visible after a deletion error', async () => {
    renderPage()
    await loaded()
    write = () => errJson()
    await fireEvent.click(screen.getAllByRole('button', { name: 'Delete role mapping' })[1])
    const dialog = document.getElementById('delete-role-sync')!
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await vi.waitFor(() => expect(within(dialog).getByRole('alert')).toBeInTheDocument())
    expect(dialog).toHaveAttribute('open')
    expect(screen.getByText('@Moderator')).toBeInTheDocument()
  })
  it('shows a recoverable list error and prevents adding when the saved data is unknown', async () => {
    loadFailure = true
    renderPage()
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Add role mapping' })).toBeDisabled()
    loadFailure = false
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await loaded()
    expect(screen.getByRole('button', { name: 'Add role mapping' })).not.toBeDisabled()
  })
  it('keeps direction changes local, cancels them and saves explicitly with the accepted baseline', async () => {
    renderPage()
    await loaded()
    const select = input('server-roles-direction')
    const group = within(select.closest('.dashboard-panel')!)
    await fireEvent.change(select, { target: { value: 'both' } })
    expect(saveDashboardSettings).not.toHaveBeenCalled()
    await fireEvent.click(group.getByRole('button', { name: 'Cancel' }))
    expect(select).toHaveValue('gmod-to-discord')
    await fireEvent.change(select, { target: { value: 'both' } })
    await fireEvent.click(group.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() =>
      expect(saveDashboardSettings).toHaveBeenCalledWith('server', { sync_role_direction: 'both' }),
    )
    await vi.waitFor(() => expect(group.getByRole('button', { name: 'Save' })).toBeDisabled())
    expect(select).toHaveValue('both')
    expect(group.getByRole('status')).toBeInTheDocument()
  })
  it('retains a failed direction draft for retry and reports a pending synchronization honestly', async () => {
    renderPage()
    await loaded()
    const select = input('server-roles-direction')
    const group = within(select.closest('.dashboard-panel')!)
    await fireEvent.change(select, { target: { value: 'both' } })
    ;(saveDashboardSettings as Mock).mockRejectedValueOnce(new Error('offline'))
    await fireEvent.click(group.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(group.getByRole('alert')).toBeInTheDocument())
    expect(select).toHaveValue('both')
    ;(saveDashboardSettings as Mock).mockResolvedValueOnce({
      settings: { sync_role_direction: 'both' },
      sync: 'pending',
    })
    await fireEvent.click(group.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(group.getByText('Saved. Synchronization is pending.')).toBeInTheDocument())
  })
  it('only offers unsynchronized roles when creating and gates paid directions for free guilds', async () => {
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: false }))
    renderPage()
    await loaded()
    await fireEvent.click(screen.getByRole('button', { name: 'Add role mapping' }))
    const select = input('roles-role')
    expect(within(select).queryByRole('option', { name: 'Admin' })).not.toBeInTheDocument()
    expect(within(select).getByRole('option', { name: 'VIP' })).toBeInTheDocument()
    expect(
      within(input('server-roles-direction')).getByRole('option', { name: 'Both directions', hidden: true }),
    ).toBeDisabled()
  })
})
