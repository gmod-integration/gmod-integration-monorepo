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
const Page = (await import('../../../../../src/pages/dashboard/guilds/servers/ServerTeam.js')).default
const URL = '/users/:discordID/guilds/:guildID/servers/:serverID/teams'
const guildRoles = [
  { id: 'r1', name: 'Admin', color: 111, colorHex: '#111111' },
  { id: 'r2', name: 'Moderator', color: 222, colorHex: '#222222' },
  { id: 'r3', name: 'VIP', color: 333, colorHex: '#333333' },
]
const rows = () => [
  { id: 1, serverID: 's1', roleID: 'r1', teamName: 'admins', enable: true },
  { id: 2, serverID: 's1', roleID: 'r2', teamName: 'mods', enable: false },
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
    path: '/dashboard/guilds/:guildID/config/servers/:serverID/teams',
    history: historyAt('/dashboard/guilds/g1/config/servers/s1/teams'),
  })
}
async function loaded() {
  await vi.waitFor(() => expect(screen.getByText('@Admin')).toBeInTheDocument())
}
const modal = () => within(document.getElementById('edit_role_modal')!)
const input = (id: string) => document.getElementById(id) as HTMLInputElement
const writes = () => (fetchAPI as Mock).mock.calls.filter(([, method]) => method !== 'GET')
async function createDraft() {
  await fireEvent.click(screen.getByRole('button', { name: 'Add Team Role' }))
  await fireEvent.change(input('teams-role'), { target: { value: 'r3' } })
  await fireEvent.input(input('teams-mapping'), { target: { value: 'vip' } })
  await fireEvent.click(input('teams-enabled'))
}
afterEach(cleanup)
describe('ServerTeam unified editing', () => {
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
    expect(within(table).getByText('Enabled')).toBeInTheDocument()
    expect(within(table).getByText('Disabled')).toBeInTheDocument()
  })
  it('creates one complete mapping only after explicit confirmation', async () => {
    renderPage()
    await loaded()
    await createDraft()
    expect(writes()).toHaveLength(0)
    expect(screen.queryByText('@VIP')).not.toBeInTheDocument()
    write = () => okJson({ id: 3, serverID: 's1', roleID: 'r3', teamName: 'vip', enable: true })
    await fireEvent.click(modal().getByRole('button', { name: 'Create' }))
    await vi.waitFor(() =>
      expect(fetchAPI).toHaveBeenCalledWith(URL + '/r3', 'POST', { teamName: 'vip', enable: true }),
    )
    await vi.waitFor(() => expect(screen.getByText('@VIP')).toBeInTheDocument())
    expect(writes()).toHaveLength(1)
    await vi.waitFor(() => expect(document.getElementById('edit_role_modal')).not.toHaveAttribute('open'))
  })
  it('requires a role and mapping before Create and discards a cancelled creation', async () => {
    renderPage()
    await loaded()
    await fireEvent.click(screen.getByRole('button', { name: 'Add Team Role' }))
    expect(modal().getByRole('button', { name: 'Create' })).toBeDisabled()
    await fireEvent.change(input('teams-role'), { target: { value: 'r3' } })
    expect(modal().getByRole('button', { name: 'Create' })).toBeDisabled()
    await fireEvent.input(input('teams-mapping'), { target: { value: 'draft' } })
    await fireEvent.click(modal().getByRole('button', { name: 'Cancel' }))
    expect(writes()).toHaveLength(0)
    await fireEvent.click(screen.getByRole('button', { name: 'Add Team Role' }))
    expect(input('teams-mapping')).toHaveValue('')
    expect(input('teams-role')).toHaveValue('')
  })
  it('edits a copy and Cancel leaves the saved row unchanged', async () => {
    renderPage()
    await loaded()
    await fireEvent.click(screen.getAllByRole('button', { name: 'Edit team role mapping' })[0])
    expect(input('teams-role')).toBeDisabled()
    expect(input('teams-mapping')).toHaveValue('admins')
    await fireEvent.input(input('teams-mapping'), { target: { value: 'draft' } })
    await fireEvent.click(modal().getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('admins')).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
    await fireEvent.click(screen.getAllByRole('button', { name: 'Edit team role mapping' })[0])
    expect(input('teams-mapping')).toHaveValue('admins')
  })
  it('keeps a failed edit open with its values and retries successfully', async () => {
    renderPage()
    await loaded()
    await fireEvent.click(screen.getAllByRole('button', { name: 'Edit team role mapping' })[0])
    await fireEvent.input(input('teams-mapping'), { target: { value: 'superadmins' } })
    write = () => errJson()
    await fireEvent.click(modal().getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(modal().getByRole('alert')).toBeInTheDocument())
    expect(document.getElementById('edit_role_modal')).toHaveAttribute('open')
    expect(screen.getByText('admins')).toBeInTheDocument()
    expect(input('teams-mapping')).toHaveValue('superadmins')
    write = () => okJson({ ...rows()[0], teamName: 'superadmins' })
    await fireEvent.click(modal().getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(screen.getByText('superadmins')).toBeInTheDocument())
    expect(fetchAPI).toHaveBeenLastCalledWith(URL + '/1', 'PUT', { teamName: 'superadmins', enable: true })
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
    expect(input('teams-mapping')).toBeDisabled()
    await fireEvent.click(button)
    expect(writes()).toHaveLength(1)
    resolve(okJson({ id: 3, serverID: 's1', roleID: 'r3', teamName: 'vip', enable: true }))
    await vi.waitFor(() => expect(screen.getByText('@VIP')).toBeInTheDocument())
  })
  it('names the deletion target, cancels without a request and removes only after confirmation', async () => {
    renderPage()
    await loaded()
    await fireEvent.click(screen.getAllByRole('button', { name: 'Delete team role mapping' })[1])
    const confirmation = within(document.getElementById('delete-role-sync')!)
    expect(
      confirmation.getByText(
        'Moderator — mods — Delete this team-to-role mapping. The Discord role and the team in game are kept.',
      ),
    ).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
    await fireEvent.click(confirmation.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('@Moderator')).toBeInTheDocument()
    await fireEvent.click(screen.getAllByRole('button', { name: 'Delete team role mapping' })[1])
    await fireEvent.click(confirmation.getByRole('button', { name: 'Delete' }))
    await vi.waitFor(() => expect(screen.queryByText('@Moderator')).not.toBeInTheDocument())
    expect(fetchAPI).toHaveBeenCalledWith(URL + '/2', 'DELETE')
    expect(screen.getByText('@Admin')).toBeInTheDocument()
  })
  it('keeps the targeted row and confirmation visible after a deletion error', async () => {
    renderPage()
    await loaded()
    write = () => errJson()
    await fireEvent.click(screen.getAllByRole('button', { name: 'Delete team role mapping' })[1])
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
    expect(screen.getByRole('button', { name: 'Add Team Role' })).toBeDisabled()
    loadFailure = false
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await loaded()
    expect(screen.getByRole('button', { name: 'Add Team Role' })).not.toBeDisabled()
  })
  it('disables creation for a free guild', async () => {
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: false }))
    renderPage()
    await loaded()
    expect(screen.getByRole('button', { name: 'Add Team Role' })).toBeDisabled()
    expect(writes()).toHaveLength(0)
  })
  it('keeps an expired team mapping readable and allows disabling it without a paid entitlement', async () => {
    localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: false }))
    renderPage()
    await loaded()
    expect(screen.getByRole('button', { name: 'Add Team Role' })).toBeDisabled()
    expect(screen.getAllByRole('button', { name: 'Delete team role mapping' })[0]).toBeEnabled()
    await fireEvent.click(screen.getAllByRole('button', { name: 'Edit team role mapping' })[0])
    expect(input('teams-mapping')).toBeDisabled()
    expect(input('teams-enabled')).toBeEnabled()
    await fireEvent.click(input('teams-enabled'))
    write = () => okJson({ ...rows()[0], enable: false })
    await fireEvent.click(modal().getByRole('button', { name: 'Save' }))
    await vi.waitFor(() =>
      expect(fetchAPI).toHaveBeenCalledWith(URL + '/1', 'PUT', { teamName: 'admins', enable: false }),
    )
  })
  it('paginates team mappings and deletes the targeted row from the last page', async () => {
    const manyRows = Array.from({ length: 26 }, (_, index) => ({
      id: index + 1,
      serverID: 's1',
      roleID: 'r1',
      teamName: `team-${index + 1}`,
      enable: true,
    }))
    const original = (fetchAPI as Mock).getMockImplementation()!
    ;(fetchAPI as Mock).mockImplementation((endpoint, method, body) =>
      endpoint === URL && method === 'GET' ? Promise.resolve(okJson(manyRows)) : original(endpoint, method, body),
    )
    renderPage()
    await vi.waitFor(() => expect(screen.getByText('team-1')).toBeInTheDocument())
    expect(screen.getByRole('table').querySelectorAll('tbody tr')).toHaveLength(25)
    await fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByText('team-26')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Delete team role mapping' }))
    await fireEvent.click(within(document.getElementById('delete-role-sync')!).getByRole('button', { name: 'Delete' }))
    await vi.waitFor(() => expect(screen.getByText('team-1')).toBeInTheDocument())
    expect(fetchAPI).toHaveBeenCalledWith(URL + '/26', 'DELETE')
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument()
  })
})
