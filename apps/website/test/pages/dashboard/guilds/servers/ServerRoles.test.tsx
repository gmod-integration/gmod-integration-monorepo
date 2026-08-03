import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../../../../testUtils.js'
import { okJson, errJson, stubDialogGlobal, clearDialogGlobals } from './testHelpers.js'

vi.mock('../../../../../src/utils/api.js', () => ({
  // GuildInformations.tsx's module-level guildRoles/guildChannels resources, and
  // MissingRolePermission's subordination resource, all fire their fetches at import time (before
  // any beforeEach runs) - the mock factory needs a working default from the start, matching
  // GuildAutoRoles.test.tsx.
  fetchAPI: vi.fn((endpoint: string) => {
    if (endpoint.includes('/bot/roles/subordination')) return Promise.resolve({ ok: true, json: async () => ({}) })
    return Promise.resolve({ ok: true, json: async () => [] })
  }),
  getAPIUrl: vi.fn(),
  getUrlWithActualParams: vi.fn((s: string) => s),
}))

const { guildRolesMutate, guildChannelsMutate } = await import(
  '../../../../../src/pages/dashboard/guilds/GuildInformations.js'
)
const { fetchAPI } = await import('../../../../../src/utils/api.js')
const ServerRoles = (await import('../../../../../src/pages/dashboard/guilds/servers/ServerRoles.js')).default

const PSEUDO_DIRECTION_URL = '/users/:discordID/guilds/:guildID/servers/:serverID/settings/sync_role_direction'
const ROLES_SYNC_URL = '/users/:discordID/guilds/:guildID/servers/:serverID/roles'
const SUBORDINATION_URL_PART = '/bot/roles/subordination'

function defaultGuildRoles() {
  return [
    { id: 'r1', name: 'Admin', color: 111, colorHex: '#111111' },
    { id: 'r2', name: 'Moderator', color: 222, colorHex: '#222222' },
    { id: 'r3', name: 'VIP', color: 333, colorHex: '#333333' },
  ]
}

// Fresh objects every call - editRole()/the modal mutate fields of the exact object passed to
// setSelectRole in place (see ServerRoles.tsx's onInput/onChange handlers), so a shared
// module-level fixture would leak mutations across tests (okJson returns its payload by reference).
function defaultRolesSync() {
  return [
    { serverID: 's1', roleID: 'r1', userGroup: 'admins', enable: true },
    { serverID: 's1', roleID: 'r2', userGroup: 'mods', enable: false },
  ]
}

// All roles editable by default so MissingRolePermission's warning banner stays empty and doesn't
// add extra "@RoleName" text to the DOM.
function subordinationFor(roles: { id: string }[]) {
  return Object.fromEntries(roles.map((r) => [r.id, { name: r.name, editable: true }]))
}

function setupFetchAPI({
  direction = { value: 'gmod-to-discord' },
  rolesSync = defaultRolesSync(),
  guildRolesList = defaultGuildRoles(),
}: { direction?: unknown; rolesSync?: unknown; guildRolesList?: { id: string; name: string }[] } = {}) {
  ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
    if (endpoint.includes(SUBORDINATION_URL_PART)) return Promise.resolve(okJson(subordinationFor(guildRolesList)))
    if (endpoint === PSEUDO_DIRECTION_URL && method === 'GET') return Promise.resolve(okJson(direction))
    if (endpoint === ROLES_SYNC_URL && method === 'GET') return Promise.resolve(okJson(rolesSync))
    return Promise.resolve(okJson([]))
  })
}

function renderPage() {
  return renderWithProviders(() => <ServerRoles />, {
    path: '/dashboard/guilds/:guildID/config/servers/:serverID/roles',
    history: historyAt('/dashboard/guilds/g1/config/servers/s1/roles'),
  })
}

async function waitForLoaded() {
  await vi.waitFor(() => expect(screen.getByText('@Admin')).toBeInTheDocument())
}

function directionSelect() {
  return screen.getAllByRole('combobox').find((el) => el.className.includes('w-full max-w-xs')) as HTMLSelectElement
}

afterEach(() => {
  cleanup()
  clearDialogGlobals('select_role_modal', 'edit_role_modal')
})

describe('pages/dashboard/guilds/servers/ServerRoles.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: false }))
    ;(fetchAPI as Mock).mockReset()
    setupFetchAPI()
    guildRolesMutate(defaultGuildRoles())
    guildChannelsMutate([])
  })

  it('renders the panel titles, description and the websocket notice', async () => {
    renderPage()
    await waitForLoaded()
    expect(screen.getByText('Server Roles')).toBeInTheDocument()
    expect(
      screen.getByText('Manage role synchronization between your Discord server and game server.'),
    ).toBeInTheDocument()
    expect(screen.getByText('GWSocket')).toBeInTheDocument()
  })

  it('renders the loaded role sync table using DiscordRole and TextValue', async () => {
    renderPage()
    await waitForLoaded()
    expect(screen.getByText('@Moderator')).toBeInTheDocument()
    expect(screen.getByText('admins')).toBeInTheDocument()
    expect(screen.getByText('mods')).toBeInTheDocument()
    const rows = screen.getAllByRole('row').slice(1) // skip header row
    expect(rows[0].querySelector('.fa-check')).toBeInTheDocument()
    expect(rows[1].querySelector('.fa-times')).toBeInTheDocument()
  })

  it('shows a loading spinner for the role sync table while rolesSync is loading', () => {
    ;(fetchAPI as Mock).mockImplementation((endpoint: string) => {
      if (endpoint === ROLES_SYNC_URL) return new Promise(() => {})
      if (endpoint.includes(SUBORDINATION_URL_PART)) return Promise.resolve(okJson({}))
      return Promise.resolve(okJson([]))
    })
    const { container } = renderPage()
    expect(container.querySelector('.loading-spinner')).toBeInTheDocument()
  })

  describe('roles synchronization direction selector', () => {
    it('marks the option matching the fetched direction as selected', async () => {
      renderPage()
      await waitForLoaded()
      const select = screen.getByDisplayValue('Server to Discord') as HTMLSelectElement
      expect(select.value).toBe('gmod-to-discord')
    })

    it('disables the select while pseudoDirection is loading', () => {
      ;(fetchAPI as Mock).mockImplementation((endpoint: string) => {
        if (endpoint === PSEUDO_DIRECTION_URL) return new Promise(() => {})
        if (endpoint.includes(SUBORDINATION_URL_PART)) return Promise.resolve(okJson({}))
        return Promise.resolve(okJson([]))
      })
      renderPage()
      expect(directionSelect()).toBeDisabled()
    })

    it('sends the new direction on change and mutates the resource on success', async () => {
      // 'both' is disabled unless premium (see `disabled={!premium()}` on that <option> in
      // ServerRoles.tsx) - a disabled option can't become the select's displayed value in a real
      // browser, so this needs a premium guild (see the equivalent note in ServerPseudo.test.tsx).
      window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
      renderPage()
      await waitForLoaded()
      const updated = { value: 'both' }
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === PSEUDO_DIRECTION_URL && method === 'PUT') return Promise.resolve(okJson(updated))
        return Promise.resolve(okJson([]))
      })
      await fireEvent.change(directionSelect(), { target: { value: 'both' } })
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(PSEUDO_DIRECTION_URL, 'PUT', { value: 'both' }))
      await vi.waitFor(() => expect(screen.getByDisplayValue('Both Directions')).toBeInTheDocument())
    })

    it('does not mutate the direction when the update request fails', async () => {
      renderPage()
      await waitForLoaded()
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === PSEUDO_DIRECTION_URL && method === 'PUT') return Promise.resolve(errJson())
        return Promise.resolve(okJson([]))
      })
      const callsBefore = (fetchAPI as Mock).mock.calls.length
      await fireEvent.change(directionSelect(), { target: { value: 'both' } })
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(PSEUDO_DIRECTION_URL, 'PUT', { value: 'both' }))
      expect((fetchAPI as Mock).mock.calls.length).toBe(callsBefore + 1)
    })
  })

  describe('add role sync (select role modal)', () => {
    it('lists only guild roles not already synced, and adds the chosen one on change', async () => {
      const { container } = renderPage()
      await waitForLoaded()
      stubDialogGlobal(container, 'select_role_modal')
      await fireEvent.click(screen.getByText('Add Role Sync'))

      const modal = container.querySelector('#select_role_modal') as HTMLElement
      const optionTexts = within(modal)
        .getAllByRole('option', { hidden: true })
        .map((o) => o.textContent)
      expect(optionTexts).toContain('VIP')
      expect(optionTexts).not.toContain('Admin')
      expect(optionTexts).not.toContain('Moderator')

      const newRole = { serverID: 's1', roleID: 'r3', userGroup: '', enable: true }
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${ROLES_SYNC_URL}/r3` && method === 'POST') return Promise.resolve(okJson(newRole))
        return Promise.resolve(okJson([]))
      })
      const select = within(modal).getByRole('combobox', { hidden: true }) as HTMLSelectElement
      await fireEvent.change(select, { target: { value: 'r3' } })
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(`${ROLES_SYNC_URL}/r3`, 'POST'))
      await vi.waitFor(() => expect(screen.getByText('@VIP')).toBeInTheDocument())
    })

    it('does not add a role when the create request fails', async () => {
      const { container } = renderPage()
      await waitForLoaded()
      stubDialogGlobal(container, 'select_role_modal')
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${ROLES_SYNC_URL}/r3` && method === 'POST') return Promise.resolve(errJson())
        return Promise.resolve(okJson([]))
      })
      const modal = container.querySelector('#select_role_modal') as HTMLElement
      const select = within(modal).getByRole('combobox', { hidden: true }) as HTMLSelectElement
      await fireEvent.change(select, { target: { value: 'r3' } })
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(`${ROLES_SYNC_URL}/r3`, 'POST'))
      expect(screen.queryByText('@VIP')).not.toBeInTheDocument()
    })
  })

  describe('edit role sync modal', () => {
    it('opens with the selected role and saves the edited user group', async () => {
      const { container } = renderPage()
      await waitForLoaded()
      stubDialogGlobal(container, 'edit_role_modal')
      const editIcons = container.querySelectorAll('.fa-edit')
      await fireEvent.click(editIcons[0])

      const modal = container.querySelector('#edit_role_modal') as HTMLElement
      const userGroupInput = within(modal).getByRole('textbox') as HTMLInputElement
      expect(userGroupInput.value).toBe('admins')

      const updated = { serverID: 's1', roleID: 'r1', userGroup: 'superadmins', enable: true }
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${ROLES_SYNC_URL}/r1` && method === 'PUT') return Promise.resolve(okJson(updated))
        return Promise.resolve(okJson([]))
      })
      await fireEvent.input(userGroupInput, { target: { value: 'superadmins' } })
      await fireEvent.click(within(modal).getByText('Save Changes'))

      await vi.waitFor(() =>
        expect(fetchAPI).toHaveBeenCalledWith(`${ROLES_SYNC_URL}/r1`, 'PUT', {
          serverID: 's1',
          roleID: 'r1',
          userGroup: 'superadmins',
          enable: true,
        }),
      )
      await vi.waitFor(() => expect(screen.getByText('superadmins')).toBeInTheDocument())
    })

    it('toggles the enable field in the modal', async () => {
      const { container } = renderPage()
      await waitForLoaded()
      stubDialogGlobal(container, 'edit_role_modal')
      const editIcons = container.querySelectorAll('.fa-edit')
      await fireEvent.click(editIcons[0]) // Admin row, enable: true

      const modal = container.querySelector('#edit_role_modal') as HTMLElement
      const selects = within(modal).getAllByRole('combobox') as HTMLSelectElement[]
      const enableSelect = selects.find((s) => !s.disabled) as HTMLSelectElement
      expect(enableSelect.value).toBe('true')
      await fireEvent.change(enableSelect, { target: { value: 'false' } })

      const updated = { serverID: 's1', roleID: 'r1', userGroup: 'admins', enable: false }
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${ROLES_SYNC_URL}/r1` && method === 'PUT') return Promise.resolve(okJson(updated))
        return Promise.resolve(okJson([]))
      })
      await fireEvent.click(within(modal).getByText('Save Changes'))
      await vi.waitFor(() =>
        expect(fetchAPI).toHaveBeenCalledWith(`${ROLES_SYNC_URL}/r1`, 'PUT', {
          serverID: 's1',
          roleID: 'r1',
          userGroup: 'admins',
          enable: false,
        }),
      )
    })

    it('does not update the list when editing fails', async () => {
      const { container } = renderPage()
      await waitForLoaded()
      stubDialogGlobal(container, 'edit_role_modal')
      const editIcons = container.querySelectorAll('.fa-edit')
      await fireEvent.click(editIcons[0])
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${ROLES_SYNC_URL}/r1` && method === 'PUT') return Promise.resolve(errJson())
        return Promise.resolve(okJson([]))
      })
      const modal = container.querySelector('#edit_role_modal') as HTMLElement
      await fireEvent.click(within(modal).getByText('Save Changes'))
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(`${ROLES_SYNC_URL}/r1`, 'PUT', expect.anything()))
      expect(screen.getByText('admins')).toBeInTheDocument()
    })
  })

  describe('delete role sync', () => {
    it('deletes a role sync and removes it from the list on success', async () => {
      const { container } = renderPage()
      await waitForLoaded()
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${ROLES_SYNC_URL}/r2` && method === 'DELETE') return Promise.resolve(okJson({ roleID: 'r2' }))
        return Promise.resolve(okJson([]))
      })
      const deleteIcons = container.querySelectorAll('.fa-trash')
      await fireEvent.click(deleteIcons[1])
      await vi.waitFor(() => expect(screen.queryByText('@Moderator')).not.toBeInTheDocument())
      expect(screen.getByText('@Admin')).toBeInTheDocument()
    })

    it('does not remove the row when deleting fails', async () => {
      const { container } = renderPage()
      await waitForLoaded()
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${ROLES_SYNC_URL}/r2` && method === 'DELETE') return Promise.resolve(errJson())
        return Promise.resolve(okJson([]))
      })
      const deleteIcons = container.querySelectorAll('.fa-trash')
      await fireEvent.click(deleteIcons[1])
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(`${ROLES_SYNC_URL}/r2`, 'DELETE'))
      expect(screen.getByText('@Moderator')).toBeInTheDocument()
    })
  })

  describe('premium gating for Add Role Sync', () => {
    it('shows Add Role Sync directly when premium, even at the free limit', async () => {
      window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
      setupFetchAPI({
        rolesSync: [
          { serverID: 's1', roleID: 'r1', userGroup: 'a', enable: true },
          { serverID: 's1', roleID: 'r2', userGroup: 'b', enable: true },
        ],
      })
      renderPage()
      await waitForLoaded()
      expect(screen.getByText('Add Role Sync')).toBeInTheDocument()
    })

    it('shows the premium upsell instead of Add Role Sync when free and at the 3-role limit', async () => {
      setupFetchAPI({
        rolesSync: [
          { serverID: 's1', roleID: 'r1', userGroup: 'a', enable: true },
          { serverID: 's1', roleID: 'r2', userGroup: 'b', enable: true },
          { serverID: 's1', roleID: 'r3', userGroup: 'c', enable: true },
        ],
      })
      renderPage()
      await waitForLoaded()
      expect(screen.queryByText('Add Role Sync')).not.toBeInTheDocument()
      expect(screen.getByText('Limited to 3 synchronized roles for free users')).toBeInTheDocument()
    })

    it('shows Add Role Sync when free and under the 3-role limit', async () => {
      renderPage()
      await waitForLoaded()
      expect(screen.getByText('Add Role Sync')).toBeInTheDocument()
    })
  })
})
