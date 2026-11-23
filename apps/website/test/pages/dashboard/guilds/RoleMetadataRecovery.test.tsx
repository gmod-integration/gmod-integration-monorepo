import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../../../testUtils.js'

vi.mock('../../../../src/utils/api.js', () => ({
  fetchAPI: vi.fn(async (endpoint: string) => ({
    ok: true,
    json: async () => (endpoint.includes('/bot/roles/subordination') ? {} : []),
  })),
  getAPIUrl: () => '',
  getUrlWithActualParams: (value: string) => value,
}))
vi.mock('../../../../src/utils/dashboardSettings.js', () => ({ saveDashboardSettings: vi.fn() }))
const { fetchAPI } = await import('../../../../src/utils/api.js')
const { guildRoles, guildRolesMutate, guildChannelsMutate, guildRolesRefetch } =
  await import('../../../../src/pages/dashboard/guilds/GuildInformations.js')
const GuildAutoRoles = (await import('../../../../src/pages/dashboard/guilds/GuildAutoRoles.js')).default
const GuildVerifications = (await import('../../../../src/pages/dashboard/guilds/GuildVerifications.js')).default
const ServerRoles = (await import('../../../../src/pages/dashboard/guilds/servers/ServerRoles.js')).default
const ServerTeam = (await import('../../../../src/pages/dashboard/guilds/servers/ServerTeam.js')).default

const metadataURL = '/users/:discordID/guilds/:guildID/roles'
const roles = [
  { id: 'r1', name: 'Admin', color: 111, colorHex: '#111111', position: 0 },
  { id: 'r2', name: 'VIP', color: 222, colorHex: '#222222', position: 1 },
]
const response = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response
let metadataFails = false
const metadataReads = () => vi.mocked(fetchAPI).mock.calls.filter(([url]) => url === metadataURL)
const pages = [
  { name: 'automatic roles', Page: GuildAutoRoles, path: '/dashboard/guilds/g1/config/auto-role', add: 'Add Role' },
  {
    name: 'verification roles',
    Page: GuildVerifications,
    path: '/dashboard/guilds/g1/config/verification',
    add: 'Add Role',
  },
  {
    name: 'role mappings',
    Page: ServerRoles,
    path: '/dashboard/guilds/g1/config/servers/s1/roles',
    add: 'Add role mapping',
  },
  {
    name: 'team mappings',
    Page: ServerTeam,
    path: '/dashboard/guilds/g1/config/servers/s1/teams',
    add: 'Add Team Role',
  },
]

beforeEach(async () => {
  localStorage.clear()
  localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
  metadataFails = false
  vi.mocked(fetchAPI)
    .mockReset()
    .mockImplementation(async (url, method) => {
      if (method !== 'GET') throw new Error('Recovery must not write configuration')
      if (url === metadataURL) return response(roles, !metadataFails)
      if (url.includes('/bot/roles/subordination')) return response({ r1: { name: 'Admin', editable: true } })
      if (url.endsWith('/auto-roles')) return response([{ roleID: 'r1' }])
      if (url.endsWith('/verifications/roles')) return response([{ roleID: 'r1', isGiveRole: true, enabled: true }])
      if (url.endsWith('/verifications/check')) return response(false)
      if (url.endsWith('/verifications')) return response({})
      if (url.endsWith('/servers/:serverID/roles'))
        return response([{ roleID: 'r1', userGroup: 'admins', enable: true }])
      if (url.endsWith('/servers/:serverID/teams'))
        return response([{ id: 1, roleID: 'r1', teamName: 'Police', enable: true }])
      if (url.includes('/settings/'))
        return response({ value: url.endsWith('/sync_role_direction') ? 'gmod-to-discord' : false })
      return response([])
    })
  guildRolesMutate(roles)
  guildChannelsMutate([])
  await guildRolesRefetch()
})
afterEach(cleanup)

async function failMetadata() {
  metadataFails = true
  await Promise.resolve(guildRolesRefetch()).catch(() => {})
  await vi.waitFor(() => expect(guildRoles.error).toBeTruthy())
}

describe('recovering Discord role metadata independently of saved rules', () => {
  it.each(pages)('offers metadata retry on $name while retaining saved rows', async ({ Page, path, add }) => {
    await failMetadata()
    renderWithProviders(() => <Page />, { path: '*', history: historyAt(path) })
    const table = screen.getByRole('table')
    await vi.waitFor(() => expect(within(table).getByRole('button', { name: /delete/i })).toBeEnabled())
    const row = table.querySelector('tbody tr')!
    expect(screen.getByRole('button', { name: add })).toBeDisabled()
    const card = within(table.closest('section')!)
    expect(card.getByRole('alert')).toHaveTextContent('Unable to load this content.')
    const before = metadataReads().length
    metadataFails = false
    await fireEvent.click(card.getByRole('button', { name: 'Try again' }))
    await vi.waitFor(() => expect(screen.getByRole('button', { name: add })).toBeEnabled())
    expect(metadataReads()).toHaveLength(before + 1)
    expect(table.querySelector('tbody tr')).toBe(row)
    expect(within(table).getByText('@Admin')).toBeInTheDocument()
    expect(vi.mocked(fetchAPI).mock.calls.every(([, method]) => method === 'GET')).toBe(true)
  })

  it('recovers role metadata inside an open mapping editor without clearing its draft', async () => {
    renderWithProviders(() => <ServerRoles />, {
      path: '*',
      history: historyAt('/dashboard/guilds/g1/config/servers/s1/roles'),
    })
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Add role mapping' })).toBeEnabled())
    await fireEvent.click(screen.getByRole('button', { name: 'Add role mapping' }))
    const dialog = document.getElementById('edit_role_modal')!
    const role = document.getElementById('roles-role') as HTMLSelectElement
    const group = document.getElementById('roles-mapping') as HTMLInputElement
    await fireEvent.change(role, { target: { value: 'r2' } })
    await fireEvent.input(group, { target: { value: 'keep_this_vip_group' } })
    await failMetadata()
    expect(within(dialog).getByRole('button', { name: 'Create' })).toBeDisabled()
    metadataFails = false
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Try again' }))
    await vi.waitFor(() => expect(within(dialog).getByRole('button', { name: 'Create' })).toBeEnabled())
    expect(group).toHaveValue('keep_this_vip_group')
    expect(role).toHaveValue('r2')
    expect(dialog).toHaveAttribute('open')
    expect(vi.mocked(fetchAPI).mock.calls.every(([, method]) => method === 'GET')).toBe(true)
    const previous = vi.mocked(fetchAPI).getMockImplementation()!
    vi.mocked(fetchAPI).mockImplementation(async (url, method, body) => {
      if (method === 'POST')
        return response({ serverID: 's1', roleID: 'r2', userGroup: 'keep_this_vip_group', enable: false })
      return previous(url, method, body)
    })
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }))
    await vi.waitFor(() =>
      expect(fetchAPI).toHaveBeenCalledWith('/users/:discordID/guilds/:guildID/servers/:serverID/roles/r2', 'POST', {
        userGroup: 'keep_this_vip_group',
        enable: false,
      }),
    )
    await vi.waitFor(() => expect(dialog).not.toHaveAttribute('open'))
  })

  it('retains the automatic-role dialog choice while metadata is unavailable and restored', async () => {
    renderWithProviders(() => <GuildAutoRoles />, {
      path: '*',
      history: historyAt('/dashboard/guilds/g1/config/auto-role'),
    })
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Add Role' })).toBeEnabled())
    await fireEvent.click(screen.getByRole('button', { name: 'Add Role' }))
    const dialog = document.getElementById('select_role_modal')!
    const select = () => document.getElementById('select_role_modal-role') as HTMLSelectElement
    await vi.waitFor(() => expect(select()).toBeEnabled())
    await fireEvent.change(select(), { target: { value: 'r2' } })
    await failMetadata()
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled()
    metadataFails = false
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Try again' }))
    await vi.waitFor(() => expect(within(dialog).getByRole('button', { name: 'Save' })).toBeEnabled())
    expect(select()).toHaveValue('r2')
    expect(dialog).toHaveAttribute('open')
    expect(vi.mocked(fetchAPI).mock.calls.every(([, method]) => method === 'GET')).toBe(true)
  })
})
