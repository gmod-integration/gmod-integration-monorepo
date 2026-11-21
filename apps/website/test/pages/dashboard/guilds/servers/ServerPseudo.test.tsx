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
const Page = (await import('../../../../../src/pages/dashboard/guilds/servers/ServerPseudo.js')).default
const URL = '/users/:discordID/guilds/:guildID/servers/:serverID/pseudo'
const SETTING = '/users/:discordID/guilds/:guildID/servers/:serverID/settings/'
const rows = () => [
  { id: 1, enabled: true, role: 'admins', name: 'Admin', prefix: '[A]' },
  { id: 2, enabled: false, role: 'mods', name: 'Moderator', prefix: '[M]' },
]
let failure: string | undefined
let write: (endpoint: string, method: string, body: unknown) => unknown
function renderPage() {
  return renderWithProviders(() => <Page />, {
    path: '/dashboard/guilds/:guildID/config/servers/:serverID/pseudo',
    history: historyAt('/dashboard/guilds/g1/config/servers/s1/pseudo'),
  })
}
const input = (id: string) => document.getElementById(id) as HTMLInputElement
const modal = () => within(document.getElementById('edit_role_modal')!)
const writes = () => (fetchAPI as Mock).mock.calls.filter(([, method]) => method !== 'GET')
async function loaded() {
  await vi.waitFor(() => {
    expect(screen.getByText('admins')).toBeInTheDocument()
    expect(input('pseudo-format')).toHaveValue('{rolePrefix} {plyName}')
  })
}
async function createDraft() {
  await fireEvent.click(screen.getByRole('button', { name: 'Add Role' }))
  await fireEvent.input(input('pseudo-role-group'), { target: { value: 'vip' } })
  await fireEvent.input(input('pseudo-role-name'), { target: { value: 'VIP' } })
  await fireEvent.input(input('pseudo-role-prefix'), { target: { value: '[V]' } })
  await fireEvent.click(input('pseudo-role-active'))
}
afterEach(cleanup)
describe('ServerPseudo unified editing', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
    vi.clearAllMocks()
    failure = undefined
    write = () => okJson({})
    ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string, body: unknown) => {
      if (method !== 'GET') return Promise.resolve(write(endpoint, method, body))
      if (endpoint === failure) return Promise.resolve(errJson())
      if (endpoint === URL) return Promise.resolve(okJson(rows()))
      if (endpoint === SETTING + 'sync_pseudo_direction') return Promise.resolve(okJson({ value: 'gmod-to-discord' }))
      if (endpoint === SETTING + 'pseudoFormat') return Promise.resolve(okJson({ value: '{rolePrefix} {plyName}' }))
      return Promise.resolve(okJson([]))
    })
    ;(saveDashboardSettings as Mock).mockImplementation(async (_scope, settings) => ({ settings, sync: 'applied' }))
  })
  it('renders the saved rules and keeps the format preview beside its draft', async () => {
    renderPage()
    await loaded()
    expect(screen.getByText('mods')).toBeInTheDocument()
    expect(input('pseudo-format-preview')).toHaveValue('A John Doe')
    expect(input('pseudo-format-preview')).toHaveAttribute('readonly')
    expect(document.getElementById('edit_format')).not.toBeInTheDocument()
  })
  it('groups direction and format into one local draft and Cancel restores both', async () => {
    renderPage()
    await loaded()
    const group = within(input('pseudo-format').closest('.settings-group')!)
    await fireEvent.change(input('server-pseudo-direction'), { target: { value: 'both' } })
    await fireEvent.input(input('pseudo-format'), { target: { value: '[{roleName}] {plyName}' } })
    expect(input('pseudo-format-preview')).toHaveValue('[Admin] John Doe')
    expect(saveDashboardSettings).not.toHaveBeenCalled()
    expect(writes()).toHaveLength(0)
    await fireEvent.click(group.getByRole('button', { name: 'Cancel' }))
    expect(input('server-pseudo-direction')).toHaveValue('gmod-to-discord')
    expect(input('pseudo-format')).toHaveValue('{rolePrefix} {plyName}')
  })
  it('saves the whole settings section atomically and preserves the accepted baseline', async () => {
    renderPage()
    await loaded()
    const group = within(input('pseudo-format').closest('.settings-group')!)
    await fireEvent.change(input('server-pseudo-direction'), { target: { value: 'both' } })
    await fireEvent.input(input('pseudo-format'), { target: { value: '{plyName}' } })
    await fireEvent.click(group.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() =>
      expect(saveDashboardSettings).toHaveBeenCalledWith('server', {
        sync_pseudo_direction: 'both',
        pseudoFormat: '{plyName}',
      }),
    )
    await vi.waitFor(() => expect(group.getByRole('status')).toBeInTheDocument())
    expect(input('server-pseudo-direction')).toHaveValue('both')
    expect(input('pseudo-format')).toHaveValue('{plyName}')
    expect(group.getByRole('button', { name: 'Save' })).toBeDisabled()
  })
  it('validates the enabled format and keeps a failed settings draft available to retry', async () => {
    renderPage()
    await loaded()
    const group = within(input('pseudo-format').closest('.settings-group')!)
    await fireEvent.input(input('pseudo-format'), { target: { value: ' ' } })
    expect(group.getByRole('button', { name: 'Save' })).toBeDisabled()
    await fireEvent.input(input('pseudo-format'), { target: { value: '{plyName}' } })
    ;(saveDashboardSettings as Mock).mockRejectedValueOnce(new Error('offline'))
    await fireEvent.click(group.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(group.getByRole('alert')).toBeInTheDocument())
    expect(input('pseudo-format')).toHaveValue('{plyName}')
    ;(saveDashboardSettings as Mock).mockResolvedValueOnce({ settings: { pseudoFormat: '{plyName}' }, sync: 'pending' })
    await fireEvent.click(group.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(group.getByText('Saved. Synchronization is pending.')).toBeInTheDocument())
  })
  it('requires the group and creates a complete rule only on Create', async () => {
    renderPage()
    await loaded()
    await fireEvent.click(screen.getByRole('button', { name: 'Add Role' }))
    expect(modal().getByRole('button', { name: 'Create' })).toBeDisabled()
    await fireEvent.input(input('pseudo-role-name'), { target: { value: 'VIP' } })
    expect(modal().getByRole('button', { name: 'Create' })).toBeDisabled()
    await fireEvent.click(modal().getByRole('button', { name: 'Cancel' }))
    await createDraft()
    expect(writes()).toHaveLength(0)
    expect(screen.queryByText('vip')).not.toBeInTheDocument()
    write = () => okJson({ id: 3, enabled: true, role: 'vip', name: 'VIP', prefix: '[V]' })
    await fireEvent.click(modal().getByRole('button', { name: 'Create' }))
    await vi.waitFor(() =>
      expect(fetchAPI).toHaveBeenCalledWith(URL, 'POST', { enabled: true, role: 'vip', name: 'VIP', prefix: '[V]' }),
    )
    await vi.waitFor(() => expect(screen.getByText('vip')).toBeInTheDocument())
    expect(writes()).toHaveLength(1)
  })
  it('discards creation and edit drafts without changing the list', async () => {
    renderPage()
    await loaded()
    await createDraft()
    await fireEvent.click(modal().getByRole('button', { name: 'Cancel' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Add Role' }))
    expect(input('pseudo-role-group')).toHaveValue('')
    await fireEvent.click(modal().getByRole('button', { name: 'Cancel' }))
    await fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    await fireEvent.input(input('pseudo-role-group'), { target: { value: 'draft' } })
    await fireEvent.click(modal().getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('admins')).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
    await fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    expect(input('pseudo-role-group')).toHaveValue('admins')
  })
  it('keeps a failed rule open, then saves all edited values on retry', async () => {
    renderPage()
    await loaded()
    await fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    await fireEvent.input(input('pseudo-role-name'), { target: { value: 'Super Admin' } })
    write = () => errJson()
    await fireEvent.click(modal().getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(modal().getByRole('alert')).toBeInTheDocument())
    expect(document.getElementById('edit_role_modal')).toHaveAttribute('open')
    expect(screen.getByText('Admin')).toBeInTheDocument()
    write = () => okJson({ ...rows()[0], name: 'Super Admin' })
    await fireEvent.click(modal().getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(screen.getByText('Super Admin')).toBeInTheDocument())
    expect(fetchAPI).toHaveBeenLastCalledWith(URL + '/1', 'PUT', {
      enabled: true,
      role: 'admins',
      name: 'Super Admin',
      prefix: '[A]',
    })
  })
  it('confirms a named deletion and preserves the row when the request fails', async () => {
    renderPage()
    await loaded()
    await fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[1])
    const dialog = document.getElementById('delete-pseudo-rule')!
    const confirm = within(dialog)
    expect(confirm.getByText('mods — Moderator [M]')).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
    write = () => errJson()
    await fireEvent.click(confirm.getByRole('button', { name: 'Delete' }))
    await vi.waitFor(() => expect(confirm.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByText('mods')).toBeInTheDocument()
    expect(dialog).toHaveAttribute('open')
    write = () => okJson({})
    await fireEvent.click(confirm.getByRole('button', { name: 'Delete' }))
    await vi.waitFor(() => expect(screen.queryByText('mods')).not.toBeInTheDocument())
    expect(fetchAPI).toHaveBeenCalledWith(URL + '/2', 'DELETE')
    expect(screen.getByText('admins')).toBeInTheDocument()
  })
  it('disables settings when one part cannot load and allows a retry', async () => {
    failure = SETTING + 'pseudoFormat'
    renderPage()
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument())
    expect(input('pseudo-format')).toBeDisabled()
    expect(input('server-pseudo-direction')).toBeDisabled()
    failure = undefined
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await loaded()
    expect(input('pseudo-format')).not.toBeDisabled()
  })
  it('keeps paid direction choices disabled on a free guild', async () => {
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: false }))
    renderPage()
    await loaded()
    const options = input('server-pseudo-direction').querySelectorAll('option')
    expect(options[2]).toBeDisabled()
    expect(options[3]).toBeDisabled()
  })
})
