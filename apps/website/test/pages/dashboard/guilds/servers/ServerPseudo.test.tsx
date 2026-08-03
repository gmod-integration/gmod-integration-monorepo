import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../../../../testUtils.js'
import ServerPseudo from '../../../../../src/pages/dashboard/guilds/servers/ServerPseudo.js'
import { fetchAPI } from '../../../../../src/utils/api.js'
import { okJson, errJson, stubDialogGlobal, clearDialogGlobals } from './testHelpers.js'

vi.mock('../../../../../src/utils/api.js', () => ({
  fetchAPI: vi.fn(),
  getAPIUrl: vi.fn(),
  getUrlWithActualParams: vi.fn((s: string) => s),
}))

afterEach(() => {
  cleanup()
  clearDialogGlobals('edit_role_modal', 'edit_format')
})

const PSEUDO_DIRECTION_URL = '/users/:discordID/guilds/:guildID/servers/:serverID/settings/sync_pseudo_direction'
const PSEUDO_FORMAT_URL = '/users/:discordID/guilds/:guildID/servers/:serverID/settings/pseudoFormat'
const PSEUDO_ROLES_URL = '/users/:discordID/guilds/:guildID/servers/:serverID/pseudo'

function defaultRoles() {
  return [
    { id: 1, role: 'admin', name: 'Admin', prefix: 'A', enabled: true },
    { id: 2, role: 'mod', name: 'Moderator', prefix: 'M', enabled: false },
  ]
}

function setupFetchAPI({
  direction = { value: 'gmod-to-discord' },
  format = { value: '{plyName}' },
  roles = defaultRoles(),
}: { direction?: unknown; format?: unknown; roles?: unknown } = {}) {
  ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
    if (endpoint === PSEUDO_DIRECTION_URL && method === 'GET') return Promise.resolve(okJson(direction))
    if (endpoint === PSEUDO_FORMAT_URL && method === 'GET') return Promise.resolve(okJson(format))
    if (endpoint === PSEUDO_ROLES_URL && method === 'GET') return Promise.resolve(okJson(roles))
    return Promise.resolve(okJson({}))
  })
}

function renderPage() {
  return renderWithProviders(() => <ServerPseudo />, {
    path: '/dashboard/guilds/:guildID/config/servers/:serverID/pseudo',
    history: historyAt('/dashboard/guilds/g1/config/servers/s1/pseudo'),
  })
}

async function waitForLoaded() {
  await vi.waitFor(() => expect(screen.getByText('Admin')).toBeInTheDocument())
}

describe('pages/dashboard/guilds/servers/ServerPseudo.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: false }))
    ;(fetchAPI as Mock).mockReset()
    setupFetchAPI()
  })

  it('renders the loaded role list with enabled/disabled markers', async () => {
    renderPage()
    await waitForLoaded()
    expect(screen.getByText('Moderator')).toBeInTheDocument()
    const rows = screen.getAllByRole('row').slice(1) // skip header row
    expect(rows[0].querySelector('.fa-check')).toBeInTheDocument()
    expect(rows[1].querySelector('.fa-times')).toBeInTheDocument()
  })

  it('shows a loading spinner for the role table while pseudoRoles is loading', () => {
    ;(fetchAPI as Mock).mockImplementation(() => new Promise(() => {}))
    const { container } = renderPage()
    expect(container.querySelector('.loading-spinner')).toBeInTheDocument()
  })

  it('computes the format preview by substituting every placeholder', async () => {
    setupFetchAPI({ format: { value: '{plyName}-{plySteamID64}-{rolePrefix}-{roleName}' } })
    renderPage()
    await waitForLoaded()
    await vi.waitFor(() => {
      const previews = screen.getAllByDisplayValue('John Doe-76500000000000000-A-Admin')
      expect(previews.length).toBeGreaterThan(0)
    })
  })

  describe('pseudo direction selector', () => {
    it('marks the option matching the fetched direction as selected', async () => {
      // The 'both' option is disabled unless the guild is premium (see ServerPseudo.tsx's
      // `disabled={!premium()}` on that <option>) - a disabled option can't actually become the
      // select's displayed value in a real browser, so this needs a premium guild to test it.
      window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
      setupFetchAPI({ direction: { value: 'both' } })
      renderPage()
      await waitForLoaded()
      const select = screen.getByDisplayValue('Both Ways') as HTMLSelectElement
      expect(select.value).toBe('both')
    })

    it('disables the select while pseudoDirection is loading', () => {
      ;(fetchAPI as Mock).mockImplementation((endpoint: string) => {
        if (endpoint === PSEUDO_DIRECTION_URL) return new Promise(() => {})
        return Promise.resolve(okJson({}))
      })
      renderPage()
      const selects = screen.getAllByRole('combobox')
      const directionSelect = selects.find((el) => el.className.includes('w-full max-w-xs')) as HTMLSelectElement
      expect(directionSelect).toBeDisabled()
    })

    it('sends the new direction on change and mutates the resource on success', async () => {
      // 'both' is disabled unless premium (see the note on the previous test).
      window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
      renderPage()
      await waitForLoaded()
      const updated = { value: 'both' }
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === PSEUDO_DIRECTION_URL && method === 'PUT') return Promise.resolve(okJson(updated))
        return Promise.resolve(okJson({}))
      })
      const select = screen.getAllByRole('combobox').find((el) => el.className.includes('w-full max-w-xs')) as HTMLSelectElement
      await fireEvent.change(select, { target: { value: 'both' } })
      await vi.waitFor(() =>
        expect(fetchAPI).toHaveBeenCalledWith(PSEUDO_DIRECTION_URL, 'PUT', { value: 'both' }),
      )
      await vi.waitFor(() => expect((screen.getByDisplayValue('Both Ways') as HTMLSelectElement).value).toBe('both'))
    })

    it('does not mutate when the direction update request fails', async () => {
      renderPage()
      await waitForLoaded()
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === PSEUDO_DIRECTION_URL && method === 'PUT') return Promise.resolve(errJson())
        if (endpoint === PSEUDO_DIRECTION_URL && method === 'GET') return Promise.resolve(okJson({ value: 'gmod-to-discord' }))
        return Promise.resolve(okJson({}))
      })
      const select = screen.getAllByRole('combobox').find((el) => el.className.includes('w-full max-w-xs')) as HTMLSelectElement
      const callsBeforeChange = (fetchAPI as Mock).mock.calls.length
      await fireEvent.change(select, { target: { value: 'disable' } })
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(PSEUDO_DIRECTION_URL, 'PUT', { value: 'disable' }))
      // `fireEvent.change` sets the <select>'s live DOM value directly (like a real browser
      // would), independent of Solid's reactive `selected` bindings - since those only re-run
      // when their tracked resource signal changes, and mutate is never called here (the PUT
      // failed), there's no reactive update to assert on for "did the UI revert" the way there
      // would be for a controlled `value=` binding. The meaningful, source-accurate assertion is
      // that the failed PUT is the only call it triggers - no follow-up GET/PUT from a success path.
      expect((fetchAPI as Mock).mock.calls.length).toBe(callsBeforeChange + 1)
    })
  })

  describe('edit format modal', () => {
    it('updates the format and closes the modal on save', async () => {
      const { container } = renderPage()
      await waitForLoaded()
      stubDialogGlobal(container, 'edit_format')
      const updatedFormat = { value: '{plyName} new' }
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === PSEUDO_FORMAT_URL && method === 'PUT') return Promise.resolve(okJson(updatedFormat))
        return Promise.resolve(okJson({}))
      })

      const formatInput = screen.getByDisplayValue('{plyName}') as HTMLInputElement
      await fireEvent.input(formatInput, { target: { value: '{plyName} new' } })
      const saveBtn = within(container.querySelector('#edit_format') as HTMLElement).getByText('Save')
      await fireEvent.click(saveBtn)

      await vi.waitFor(() =>
        expect(fetchAPI).toHaveBeenCalledWith(PSEUDO_FORMAT_URL, 'PUT', { value: '{plyName} new' }),
      )
    })

    it('opens via the Edit Format button', async () => {
      const { container } = renderPage()
      await waitForLoaded()
      stubDialogGlobal(container, 'edit_format')
      await fireEvent.click(screen.getByRole('button', { name: 'Edit Format' }))
      expect(container.querySelector('#edit_format')?.hasAttribute('open')).toBe(true)
    })
  })

  describe('role management', () => {
    it('adds a role and appends it to the list', async () => {
      renderPage()
      await waitForLoaded()
      const newRole = { id: 3, role: 'vip', name: 'VIP', prefix: 'V', enabled: true }
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === PSEUDO_ROLES_URL && method === 'POST') return Promise.resolve(okJson(newRole))
        return Promise.resolve(okJson({}))
      })
      await fireEvent.click(screen.getByText('Add Role'))
      await vi.waitFor(() => expect(screen.getByText('VIP')).toBeInTheDocument())
    })

    it('opens the edit-role modal with the selected role and saves the edit', async () => {
      const { container } = renderPage()
      await waitForLoaded()
      stubDialogGlobal(container, 'edit_role_modal')

      const editIcons = container.querySelectorAll('.fa-edit')
      await fireEvent.click(editIcons[0])

      const modal = container.querySelector('#edit_role_modal') as HTMLElement
      const nameInput = within(modal).getAllByRole('textbox')[1] as HTMLInputElement
      expect(nameInput.value).toBe('Admin')

      const updatedRole = { id: 1, role: 'admin', name: 'Admin Renamed', prefix: 'A', enabled: true }
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${PSEUDO_ROLES_URL}/1` && method === 'PUT') return Promise.resolve(okJson(updatedRole))
        return Promise.resolve(okJson({}))
      })
      await fireEvent.input(nameInput, { target: { value: 'Admin Renamed' } })
      const saveBtn = within(modal).getByText('Save')
      await fireEvent.click(saveBtn)

      await vi.waitFor(() => expect(screen.getByText('Admin Renamed')).toBeInTheDocument())
    })

    it('edits role, prefix and active fields in the modal', async () => {
      const { container } = renderPage()
      await waitForLoaded()
      stubDialogGlobal(container, 'edit_role_modal')
      const editIcons = container.querySelectorAll('.fa-edit')
      await fireEvent.click(editIcons[0])

      const modal = container.querySelector('#edit_role_modal') as HTMLElement
      const [roleInput, , prefixInput] = within(modal).getAllByRole('textbox') as HTMLInputElement[]
      await fireEvent.input(roleInput, { target: { value: 'superadmin' } })
      await fireEvent.input(prefixInput, { target: { value: 'SA' } })
      const activeSelect = within(modal).getByRole('combobox') as HTMLSelectElement
      await fireEvent.change(activeSelect, { target: { value: 'false' } })

      const updated = { id: 1, role: 'superadmin', name: 'Admin', prefix: 'SA', enabled: false }
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${PSEUDO_ROLES_URL}/1` && method === 'PUT') return Promise.resolve(okJson(updated))
        return Promise.resolve(okJson({}))
      })
      await fireEvent.click(within(modal).getByText('Save'))
      await vi.waitFor(() =>
        expect(fetchAPI).toHaveBeenCalledWith(`${PSEUDO_ROLES_URL}/1`, 'PUT', {
          id: 1,
          role: 'superadmin',
          name: 'Admin',
          prefix: 'SA',
          enabled: false,
        }),
      )
    })

    it('deletes a role and removes it from the list', async () => {
      const { container } = renderPage()
      await waitForLoaded()
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${PSEUDO_ROLES_URL}/2` && method === 'DELETE') return Promise.resolve(okJson({ id: 2 }))
        return Promise.resolve(okJson({}))
      })
      const deleteIcons = container.querySelectorAll('.fa-trash')
      await fireEvent.click(deleteIcons[1])
      await vi.waitFor(() => expect(screen.queryByText('Moderator')).not.toBeInTheDocument())
      expect(screen.getByText('Admin')).toBeInTheDocument()
    })

    it('does not update the list when adding a role fails', async () => {
      renderPage()
      await waitForLoaded()
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === PSEUDO_ROLES_URL && method === 'POST') return Promise.resolve(errJson())
        return Promise.resolve(okJson({}))
      })
      await fireEvent.click(screen.getByText('Add Role'))
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(PSEUDO_ROLES_URL, 'POST', expect.anything()))
      expect(screen.getAllByRole('row')).toHaveLength(3) // header + 2 unchanged rows
    })

    it('does not update the list when editing a role fails', async () => {
      const { container } = renderPage()
      await waitForLoaded()
      stubDialogGlobal(container, 'edit_role_modal')
      const editIcons = container.querySelectorAll('.fa-edit')
      await fireEvent.click(editIcons[0])
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${PSEUDO_ROLES_URL}/1` && method === 'PUT') return Promise.resolve(errJson())
        return Promise.resolve(okJson({}))
      })
      const modal = container.querySelector('#edit_role_modal') as HTMLElement
      await fireEvent.click(within(modal).getByText('Save'))
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(`${PSEUDO_ROLES_URL}/1`, 'PUT', expect.anything()))
      expect(screen.getByText('Admin')).toBeInTheDocument()
    })

    it('does not remove the row when deleting a role fails', async () => {
      const { container } = renderPage()
      await waitForLoaded()
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${PSEUDO_ROLES_URL}/2` && method === 'DELETE') return Promise.resolve(errJson())
        return Promise.resolve(okJson({}))
      })
      const deleteIcons = container.querySelectorAll('.fa-trash')
      await fireEvent.click(deleteIcons[1])
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(`${PSEUDO_ROLES_URL}/2`, 'DELETE'))
      expect(screen.getByText('Moderator')).toBeInTheDocument()
    })

    it('disables the input fields in the role modal while pseudoRoles is loading', () => {
      ;(fetchAPI as Mock).mockImplementation((endpoint: string) => {
        if (endpoint === PSEUDO_ROLES_URL) return new Promise(() => {})
        return Promise.resolve(okJson({}))
      })
      const { container } = renderPage()
      const modal = container.querySelector('#edit_role_modal') as HTMLElement
      const inputs = within(modal).getAllByRole('textbox', { hidden: true }) as HTMLInputElement[]
      inputs.forEach((input) => expect(input).toBeDisabled())
    })
  })

  describe('premium gating for role customization', () => {
    it('shows Add Role directly when premium', async () => {
      window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
      renderPage()
      await waitForLoaded()
      expect(screen.getByText('Add Role')).toBeInTheDocument()
    })

    it('shows the premium upsell instead of Add Role when free and at the 3-role limit', async () => {
      window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: false }))
      setupFetchAPI({
        roles: [
          { id: 1, role: 'a', name: 'A', prefix: '', enabled: true },
          { id: 2, role: 'b', name: 'B', prefix: '', enabled: true },
          { id: 3, role: 'c', name: 'C', prefix: '', enabled: true },
        ],
      })
      renderPage()
      await vi.waitFor(() => expect(screen.getByText('A')).toBeInTheDocument())
      expect(screen.queryByText('Add Role')).not.toBeInTheDocument()
      expect(
        screen.getByText('Limited to 3 roles customization for free users.'),
      ).toBeInTheDocument()
    })
  })
})
