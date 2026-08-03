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
const ServerTeam = (await import('../../../../../src/pages/dashboard/guilds/servers/ServerTeam.js')).default

const TEAMS_URL = '/users/:discordID/guilds/:guildID/servers/:serverID/teams'
const SUBORDINATION_URL_PART = '/bot/roles/subordination'

function defaultGuildRoles() {
  return [
    { id: 'r1', name: 'Admin', color: 111, colorHex: '#111111' },
    { id: 'r2', name: 'Moderator', color: 222, colorHex: '#222222' },
    { id: 'r3', name: 'VIP', color: 333, colorHex: '#333333' },
  ]
}

// Fresh objects every call - editRole()/the modal mutate fields of the exact object passed to
// setSelectRole in place, so a shared module-level fixture would leak mutations across tests
// (okJson returns its payload by reference).
function defaultTeams() {
  return [
    { id: 1, serverID: 's1', roleID: 'r1', teamName: 'Red Team', enable: true },
    { id: 2, serverID: 's1', roleID: 'r2', teamName: 'Blue Team', enable: false },
  ]
}

function subordinationFor(roles: { id: string }[]) {
  return Object.fromEntries(roles.map((r) => [r.id, { name: r.name, editable: true }]))
}

function setupFetchAPI({
  teams = defaultTeams(),
  guildRolesList = defaultGuildRoles(),
}: { teams?: unknown; guildRolesList?: { id: string; name: string }[] } = {}) {
  ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
    if (endpoint.includes(SUBORDINATION_URL_PART)) return Promise.resolve(okJson(subordinationFor(guildRolesList)))
    if (endpoint === TEAMS_URL && method === 'GET') return Promise.resolve(okJson(teams))
    return Promise.resolve(okJson([]))
  })
}

function renderPage() {
  return renderWithProviders(() => <ServerTeam />, {
    path: '/dashboard/guilds/:guildID/config/servers/:serverID/teams',
    history: historyAt('/dashboard/guilds/g1/config/servers/s1/teams'),
  })
}

async function waitForLoaded() {
  await vi.waitFor(() => expect(screen.getByText('@Admin')).toBeInTheDocument())
}

afterEach(() => {
  cleanup()
  clearDialogGlobals('select_role_modal', 'edit_role_modal')
})

describe('pages/dashboard/guilds/servers/ServerTeam.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: false }))
    ;(fetchAPI as Mock).mockReset()
    setupFetchAPI()
    guildRolesMutate(defaultGuildRoles())
    guildChannelsMutate([])
  })

  it('renders the panel title and description', async () => {
    renderPage()
    await waitForLoaded()
    expect(screen.getByText('Team Role')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Add temporary roles to your Discord members when they join a specific team in your game server.',
      ),
    ).toBeInTheDocument()
  })

  it('renders the loaded team role table using DiscordRole and TextValue', async () => {
    renderPage()
    await waitForLoaded()
    expect(screen.getByText('@Moderator')).toBeInTheDocument()
    expect(screen.getByText('Red Team')).toBeInTheDocument()
    expect(screen.getByText('Blue Team')).toBeInTheDocument()
    const rows = screen.getAllByRole('row').slice(1) // skip header row
    expect(rows[0].querySelector('.fa-check')).toBeInTheDocument()
    expect(rows[1].querySelector('.fa-times')).toBeInTheDocument()
  })

  it('shows a loading spinner for the table while rolesSync is loading', () => {
    ;(fetchAPI as Mock).mockImplementation((endpoint: string) => {
      if (endpoint === TEAMS_URL) return new Promise(() => {})
      if (endpoint.includes(SUBORDINATION_URL_PART)) return Promise.resolve(okJson({}))
      return Promise.resolve(okJson([]))
    })
    const { container } = renderPage()
    expect(container.querySelector('.loading-spinner')).toBeInTheDocument()
  })

  describe('add team role (select role modal)', () => {
    it('lists every guild role (no filtering) and adds the chosen one on change', async () => {
      const { container } = renderPage()
      await waitForLoaded()
      stubDialogGlobal(container, 'select_role_modal')
      await fireEvent.click(screen.getByText('Add Team Role'))

      const modal = container.querySelector('#select_role_modal') as HTMLElement
      const optionTexts = within(modal)
        .getAllByRole('option', { hidden: true })
        .map((o) => o.textContent)
      // Unlike ServerRoles.tsx, ServerTeam.tsx's select_role_modal doesn't filter out roles that
      // already have a team assigned - every guild role is listed every time.
      expect(optionTexts).toEqual(expect.arrayContaining(['Admin', 'Moderator', 'VIP']))

      const newTeam = { id: 3, serverID: 's1', roleID: 'r3', teamName: '', enable: true }
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${TEAMS_URL}/r3` && method === 'POST') return Promise.resolve(okJson(newTeam))
        return Promise.resolve(okJson([]))
      })
      const select = within(modal).getByRole('combobox', { hidden: true }) as HTMLSelectElement
      await fireEvent.change(select, { target: { value: 'r3' } })
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(`${TEAMS_URL}/r3`, 'POST'))
      await vi.waitFor(() => expect(screen.getByText('@VIP')).toBeInTheDocument())
    })

    it('does not add a team role when the create request fails', async () => {
      const { container } = renderPage()
      await waitForLoaded()
      stubDialogGlobal(container, 'select_role_modal')
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${TEAMS_URL}/r3` && method === 'POST') return Promise.resolve(errJson())
        return Promise.resolve(okJson([]))
      })
      const modal = container.querySelector('#select_role_modal') as HTMLElement
      const select = within(modal).getByRole('combobox', { hidden: true }) as HTMLSelectElement
      await fireEvent.change(select, { target: { value: 'r3' } })
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(`${TEAMS_URL}/r3`, 'POST'))
      expect(screen.queryByText('@VIP')).not.toBeInTheDocument()
    })
  })

  describe('edit team role modal', () => {
    it('opens with the selected role and saves the edited team name', async () => {
      const { container } = renderPage()
      await waitForLoaded()
      stubDialogGlobal(container, 'edit_role_modal')
      const editIcons = container.querySelectorAll('.fa-edit')
      await fireEvent.click(editIcons[0])

      const modal = container.querySelector('#edit_role_modal') as HTMLElement
      const teamNameInput = within(modal).getByRole('textbox') as HTMLInputElement
      expect(teamNameInput.value).toBe('Red Team')

      const updated = { id: 1, serverID: 's1', roleID: 'r1', teamName: 'Crimson Team', enable: true }
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${TEAMS_URL}/1` && method === 'PUT') return Promise.resolve(okJson(updated))
        return Promise.resolve(okJson([]))
      })
      await fireEvent.input(teamNameInput, { target: { value: 'Crimson Team' } })
      await fireEvent.click(within(modal).getByText('Save'))

      await vi.waitFor(() =>
        expect(fetchAPI).toHaveBeenCalledWith(`${TEAMS_URL}/1`, 'PUT', {
          id: 1,
          serverID: 's1',
          roleID: 'r1',
          teamName: 'Crimson Team',
          enable: true,
        }),
      )
      await vi.waitFor(() => expect(screen.getByText('Crimson Team')).toBeInTheDocument())
    })

    it('toggles the enable field in the modal', async () => {
      const { container } = renderPage()
      await waitForLoaded()
      stubDialogGlobal(container, 'edit_role_modal')
      const editIcons = container.querySelectorAll('.fa-edit')
      await fireEvent.click(editIcons[0]) // Red Team row, enable: true

      const modal = container.querySelector('#edit_role_modal') as HTMLElement
      const selects = within(modal).getAllByRole('combobox') as HTMLSelectElement[]
      const enableSelect = selects.find((s) => !s.disabled) as HTMLSelectElement
      expect(enableSelect.value).toBe('true')
      await fireEvent.change(enableSelect, { target: { value: 'false' } })

      const updated = { id: 1, serverID: 's1', roleID: 'r1', teamName: 'Red Team', enable: false }
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${TEAMS_URL}/1` && method === 'PUT') return Promise.resolve(okJson(updated))
        return Promise.resolve(okJson([]))
      })
      await fireEvent.click(within(modal).getByText('Save'))
      await vi.waitFor(() =>
        expect(fetchAPI).toHaveBeenCalledWith(`${TEAMS_URL}/1`, 'PUT', {
          id: 1,
          serverID: 's1',
          roleID: 'r1',
          teamName: 'Red Team',
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
        if (endpoint === `${TEAMS_URL}/1` && method === 'PUT') return Promise.resolve(errJson())
        return Promise.resolve(okJson([]))
      })
      const modal = container.querySelector('#edit_role_modal') as HTMLElement
      await fireEvent.click(within(modal).getByText('Save'))
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(`${TEAMS_URL}/1`, 'PUT', expect.anything()))
      expect(screen.getByText('Red Team')).toBeInTheDocument()
    })
  })

  describe('delete team role', () => {
    it('deletes a team role and removes it from the list on success', async () => {
      const { container } = renderPage()
      await waitForLoaded()
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${TEAMS_URL}/2` && method === 'DELETE') return Promise.resolve(okJson({ id: 2 }))
        return Promise.resolve(okJson([]))
      })
      const deleteIcons = container.querySelectorAll('.fa-trash')
      await fireEvent.click(deleteIcons[1])
      await vi.waitFor(() => expect(screen.queryByText('Blue Team')).not.toBeInTheDocument())
      expect(screen.getByText('Red Team')).toBeInTheDocument()
    })

    it('does not remove the row when deleting fails', async () => {
      const { container } = renderPage()
      await waitForLoaded()
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${TEAMS_URL}/2` && method === 'DELETE') return Promise.resolve(errJson())
        return Promise.resolve(okJson([]))
      })
      const deleteIcons = container.querySelectorAll('.fa-trash')
      await fireEvent.click(deleteIcons[1])
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(`${TEAMS_URL}/2`, 'DELETE'))
      expect(screen.getByText('Blue Team')).toBeInTheDocument()
    })
  })

  describe('premium gating for Add Team Role', () => {
    it('enables the Add Team Role button when premium', async () => {
      window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
      renderPage()
      await waitForLoaded()
      expect(screen.getByText('Add Team Role')).not.toBeDisabled()
    })

    it('disables the Add Team Role button when not premium', async () => {
      renderPage()
      await waitForLoaded()
      expect(screen.getByText('Add Team Role')).toBeDisabled()
    })
  })
})
