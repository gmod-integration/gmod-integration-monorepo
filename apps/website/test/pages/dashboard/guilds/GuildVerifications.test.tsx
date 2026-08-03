import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { renderWithProviders } from '../../../testUtils.js'
import { stubDialogGlobal, clearDialogGlobals, okJson, errJson } from './servers/testHelpers.js'

vi.mock('../../../../src/utils/api.js', async (importActual) => {
  const actual = await importActual<typeof import('../../../../src/utils/api.js')>()
  return {
    ...actual,
    // GuildInformations.tsx's module-level guildRoles/guildChannels resources, and
    // MissingRolePermission's subordination resource, all go through this same fetchAPI mock at
    // import time - the default has to satisfy their shapes too.
    fetchAPI: vi.fn((endpoint: string) => {
      if (endpoint.includes('/bot/roles/subordination')) return Promise.resolve(okJson({}))
      return Promise.resolve(okJson([]))
    }),
  }
})

const { guildRolesMutate, guildChannelsMutate } = await import(
  '../../../../src/pages/dashboard/guilds/GuildInformations.js'
)
const { fetchAPI } = await import('../../../../src/utils/api.js')
const GuildVerification = (await import('../../../../src/pages/dashboard/guilds/GuildVerifications.js')).default

const VERIFY_ROLES_URL = '/users/:discordID/guilds/:guildID/verifications/roles'
const VERIFY_MESSAGE_URL = '/users/:discordID/guilds/:guildID/verifications'
const DONT_MP_URL = '/users/:discordID/guilds/:guildID/settings/verification_dont_mp'
const DONT_JOIN_SUPPORT_URL = '/users/:discordID/guilds/:guildID/settings/verification_dont_join_support'
const CHECK_URL = '/users/:discordID/guilds/:guildID/verifications/check'
const GUILD_ROLES_URL = '/users/:discordID/guilds/:guildID/roles'
const CHANNELS_URL = '/users/:discordID/guilds/:guildID/channels'
const SUBORDINATION_URL_PART = '/bot/roles/subordination'

/**
 * The edit-role modal's action/active <select> options ("Give Role"/"Remove Role"/"Yes"/"No") are
 * always present in the DOM (just visually hidden via the native <dialog>), so plain
 * `screen.getByText(...)` queries for those same strings in the verify-role table are ambiguous.
 * Scope table-row assertions to the actual <table> to avoid matching the modal's static options.
 */
function table(container: HTMLElement) {
  return container.querySelector('table') as HTMLElement
}

afterEach(() => {
  cleanup()
  clearDialogGlobals('select_role_modal', 'edit_role_modal', 'select_channel_modal')
  vi.restoreAllMocks()
})

function defaultGuildRoles() {
  return [
    { id: 'r1', name: 'Admin', color: 111, colorHex: '#111111' },
    { id: 'r2', name: 'Moderator', color: 222, colorHex: '#222222' },
    { id: 'r3', name: 'VIP', color: 333, colorHex: '#333333' },
  ]
}

function defaultVerifyRolesRaw() {
  return [
    { roleID: 'r1', isGiveRole: true, enabled: true },
    { roleID: 'r2', isGiveRole: false, enabled: false },
  ]
}

// All roles editable by default so MissingRolePermission's warning banner stays empty and doesn't
// add extra "@RoleName" text to the DOM.
function subordinationFor(roles: { id: string }[]) {
  return Object.fromEntries(roles.map((r) => [r.id, { name: r.name, editable: true }]))
}

function setupFetchAPI({
  verifyRoles = defaultVerifyRolesRaw(),
  guildRolesList = defaultGuildRoles(),
  channels = [] as unknown[],
  verifyMessage = {},
  lastVerify = {},
  dontMP = {},
  dontJoinSupport = {},
}: {
  verifyRoles?: unknown
  guildRolesList?: { id: string; name: string }[]
  channels?: unknown[]
  verifyMessage?: unknown
  lastVerify?: unknown
  dontMP?: unknown
  dontJoinSupport?: unknown
} = {}) {
  ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
    if (endpoint.includes(SUBORDINATION_URL_PART)) return Promise.resolve(okJson(subordinationFor(guildRolesList)))
    if (endpoint === VERIFY_ROLES_URL && method === 'GET') return Promise.resolve(okJson(verifyRoles))
    if (endpoint === GUILD_ROLES_URL && method === 'GET') return Promise.resolve(okJson(guildRolesList))
    if (endpoint === CHANNELS_URL && method === 'GET') return Promise.resolve(okJson(channels))
    if (endpoint === VERIFY_MESSAGE_URL && method === 'GET') return Promise.resolve(okJson(verifyMessage))
    if (endpoint === CHECK_URL && method === 'GET') return Promise.resolve(okJson(lastVerify))
    if (endpoint === DONT_MP_URL && method === 'GET') return Promise.resolve(okJson(dontMP))
    if (endpoint === DONT_JOIN_SUPPORT_URL && method === 'GET') return Promise.resolve(okJson(dontJoinSupport))
    return Promise.resolve(okJson([]))
  })
}

async function waitForLoaded() {
  await vi.waitFor(() => expect(screen.getByText('@Admin')).toBeInTheDocument())
}

describe('pages/dashboard/guilds/GuildVerifications.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: false }))
    ;(fetchAPI as Mock).mockReset()
    setupFetchAPI()
    guildRolesMutate(defaultGuildRoles())
    guildChannelsMutate([])
  })

  it('renders the loaded verify-role table with role, action and active markers', async () => {
    const { container } = renderWithProviders(() => <GuildVerification />)
    await waitForLoaded()
    expect(within(table(container)).getByText('Give Role')).toBeInTheDocument()
    expect(within(table(container)).getByText('@Moderator')).toBeInTheDocument()
    expect(within(table(container)).getByText('Remove Role')).toBeInTheDocument()
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows[0].querySelector('.fa-check')).toBeInTheDocument()
    expect(rows[1].querySelector('.fa-times')).toBeInTheDocument()
  })

  it('shows a loading spinner and hides the table body while verifyRoles is loading', () => {
    ;(fetchAPI as Mock).mockImplementation((endpoint: string) => {
      if (endpoint === VERIFY_ROLES_URL) return new Promise(() => {})
      if (endpoint.includes(SUBORDINATION_URL_PART)) return Promise.resolve(okJson({}))
      return Promise.resolve(okJson([]))
    })
    const { container } = renderWithProviders(() => <GuildVerification />)
    expect(container.querySelector('.loading-spinner')).toBeInTheDocument()
    expect(screen.queryAllByRole('row')).toHaveLength(1) // header row only, tbody For is gated
  })

  it('renders an empty list (not an error) when the verify-roles GET responds with a non-ok status', async () => {
    ;(fetchAPI as Mock).mockImplementation((endpoint: string) => {
      if (endpoint === VERIFY_ROLES_URL) return Promise.resolve(errJson())
      if (endpoint.includes(SUBORDINATION_URL_PART)) return Promise.resolve(okJson({}))
      return Promise.resolve(okJson([]))
    })
    renderWithProviders(() => <GuildVerification />)
    await vi.waitFor(() => expect(screen.queryAllByRole('row')).toHaveLength(1)) // header row only
    expect(screen.queryByText('Failed to load the links')).not.toBeInTheDocument()
  })

  it('shows the failed-to-load message (and does not crash) when the verify-roles fetch rejects', async () => {
    ;(fetchAPI as Mock).mockImplementation((endpoint: string) => {
      if (endpoint === VERIFY_ROLES_URL) return Promise.reject(new Error('network down'))
      if (endpoint.includes(SUBORDINATION_URL_PART)) return Promise.resolve(okJson({}))
      return Promise.resolve(okJson([]))
    })
    renderWithProviders(() => <GuildVerification />)
    await vi.waitFor(() => expect(screen.getByText('Failed to load the links')).toBeInTheDocument())
    // The select-role modal and the Add Role upsell button both read verifyRoles() unguarded
    // elsewhere in the file - confirm the whole page still rendered instead of crashing.
    expect(screen.getByText('Verification Roles')).toBeInTheDocument()
  })

  describe('verification message', () => {
    it('shows "No verification message" and the Send button when there is none', async () => {
      renderWithProviders(() => <GuildVerification />)
      await waitForLoaded()
      expect(screen.getByText('No verification message')).toBeInTheDocument()
      expect(screen.getByText('Send Verification Message')).toBeInTheDocument()
      expect(screen.queryByText('Delete Verification Message')).not.toBeInTheDocument()
    })

    it('renders the DiscordMessage link and the Delete button when a message exists', async () => {
      const channels = [{ id: 'c1', name: 'general', type: 0, textBased: true }]
      guildChannelsMutate(channels)
      setupFetchAPI({ verifyMessage: { messageID: 'm1', channelID: 'c1' }, channels })
      renderWithProviders(() => <GuildVerification />)
      await waitForLoaded()
      expect(screen.getByText(/#general/)).toBeInTheDocument()
      expect(screen.getByText('Delete Verification Message')).toBeInTheDocument()
      expect(screen.queryByText('Send Verification Message')).not.toBeInTheDocument()
      expect(screen.queryByText('No verification message')).not.toBeInTheDocument()
    })

    it('sends a verification message for the selected channel and shows it once created', async () => {
      const channels = [{ id: 'c1', name: 'general', type: 0, textBased: true }]
      guildChannelsMutate(channels)
      setupFetchAPI({ channels })
      const { container } = renderWithProviders(() => <GuildVerification />)
      await waitForLoaded()
      stubDialogGlobal(container, 'select_channel_modal')
      await fireEvent.click(screen.getByText('Send Verification Message'))

      const created = { messageID: 'm1', channelID: 'c1' }
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === VERIFY_MESSAGE_URL && method === 'POST') return Promise.resolve(okJson(created))
        if (endpoint === CHANNELS_URL && method === 'GET') return Promise.resolve(okJson(channels))
        return Promise.resolve(okJson([]))
      })
      const modal = container.querySelector('#select_channel_modal') as HTMLElement
      // Clicking "Send Verification Message" also fires guildChannelsRefetch() (unawaited), which
      // briefly puts guildChannels back into a loading state (showing ChannelSelector's "Loading..."
      // fallback) before it resolves via the mock above.
      await vi.waitFor(() => expect(within(modal).queryByText('Loading...')).not.toBeInTheDocument())
      const select = within(modal).getByRole('combobox') as HTMLSelectElement
      await fireEvent.change(select, { target: { value: 'c1' } })

      await vi.waitFor(() =>
        expect(fetchAPI).toHaveBeenCalledWith(VERIFY_MESSAGE_URL, 'POST', { channelID: 'c1' }),
      )
      await vi.waitFor(() => expect(screen.getByText(/#general/)).toBeInTheDocument())
    })

    it('does not create a verification message when the POST fails', async () => {
      const channels = [{ id: 'c1', name: 'general', type: 0, textBased: true }]
      guildChannelsMutate(channels)
      setupFetchAPI({ channels })
      const { container } = renderWithProviders(() => <GuildVerification />)
      await waitForLoaded()
      stubDialogGlobal(container, 'select_channel_modal')
      await fireEvent.click(screen.getByText('Send Verification Message'))

      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === VERIFY_MESSAGE_URL && method === 'POST') return Promise.resolve(errJson())
        if (endpoint === CHANNELS_URL && method === 'GET') return Promise.resolve(okJson(channels))
        return Promise.resolve(okJson([]))
      })
      const modal = container.querySelector('#select_channel_modal') as HTMLElement
      await vi.waitFor(() => expect(within(modal).queryByText('Loading...')).not.toBeInTheDocument())
      const select = within(modal).getByRole('combobox') as HTMLSelectElement
      await fireEvent.change(select, { target: { value: 'c1' } })

      await vi.waitFor(() =>
        expect(fetchAPI).toHaveBeenCalledWith(VERIFY_MESSAGE_URL, 'POST', { channelID: 'c1' }),
      )
      expect(screen.getByText('No verification message')).toBeInTheDocument()
    })

    it('deletes the verification message and falls back to "No verification message"', async () => {
      const channels = [{ id: 'c1', name: 'general', type: 0, textBased: true }]
      setupFetchAPI({ verifyMessage: { messageID: 'm1', channelID: 'c1' }, channels })
      guildChannelsMutate(channels)
      renderWithProviders(() => <GuildVerification />)
      await waitForLoaded()
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === VERIFY_MESSAGE_URL && method === 'DELETE') return Promise.resolve(okJson({}))
        return Promise.resolve(okJson([]))
      })
      await fireEvent.click(screen.getByText('Delete Verification Message'))
      await vi.waitFor(() => expect(screen.getByText('No verification message')).toBeInTheDocument())
      expect(screen.getByText('Send Verification Message')).toBeInTheDocument()
    })

    it('keeps the message shown when deletion fails', async () => {
      const channels = [{ id: 'c1', name: 'general', type: 0, textBased: true }]
      setupFetchAPI({ verifyMessage: { messageID: 'm1', channelID: 'c1' }, channels })
      guildChannelsMutate(channels)
      renderWithProviders(() => <GuildVerification />)
      await waitForLoaded()
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === VERIFY_MESSAGE_URL && method === 'DELETE') return Promise.resolve(errJson())
        return Promise.resolve(okJson([]))
      })
      await fireEvent.click(screen.getByText('Delete Verification Message'))
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(VERIFY_MESSAGE_URL, 'DELETE'))
      expect(screen.getByText(/#general/)).toBeInTheDocument()
    })
  })

  it('falls back to {} (not a crash) when verifyMessage/dontMP/dontJoinSupport/lastVerify all respond non-ok', async () => {
    ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
      if (endpoint.includes(SUBORDINATION_URL_PART)) return Promise.resolve(okJson(subordinationFor(defaultGuildRoles())))
      if (endpoint === VERIFY_ROLES_URL && method === 'GET') return Promise.resolve(okJson(defaultVerifyRolesRaw()))
      if (endpoint === GUILD_ROLES_URL && method === 'GET') return Promise.resolve(okJson(defaultGuildRoles()))
      if (method === 'GET' && [VERIFY_MESSAGE_URL, DONT_MP_URL, DONT_JOIN_SUPPORT_URL, CHECK_URL].includes(endpoint)) {
        return Promise.resolve(errJson())
      }
      return Promise.resolve(okJson([]))
    })
    renderWithProviders(() => <GuildVerification />)
    await waitForLoaded()
    expect(screen.getByText('No verification message')).toBeInTheDocument()
    expect(screen.getByText('Check All Roles')).not.toHaveClass('btn-disabled')
    const toggles = screen.getAllByRole('checkbox') as HTMLInputElement[]
    toggles.forEach((toggle) => expect(toggle.checked).toBe(false))
  })

  describe('check all roles', () => {
    it('disables the button while lastVerify is loading', () => {
      ;(fetchAPI as Mock).mockImplementation((endpoint: string) => {
        if (endpoint === CHECK_URL) return new Promise(() => {})
        if (endpoint.includes(SUBORDINATION_URL_PART)) return Promise.resolve(okJson({}))
        return Promise.resolve(okJson([]))
      })
      renderWithProviders(() => <GuildVerification />)
      expect(screen.getByText('Check All Roles')).toHaveClass('btn-disabled')
    })

    it('disables the button after a successful check (lastVerify becomes false)', async () => {
      renderWithProviders(() => <GuildVerification />)
      await waitForLoaded()
      expect(screen.getByText('Check All Roles')).not.toHaveClass('btn-disabled')
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === CHECK_URL && method === 'POST') return Promise.resolve(okJson({}))
        return Promise.resolve(okJson([]))
      })
      await fireEvent.click(screen.getByText('Check All Roles'))
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(CHECK_URL, 'POST'))
      await vi.waitFor(() => expect(screen.getByText('Check All Roles')).toHaveClass('btn-disabled'))
    })

    it('leaves the button enabled when the check request fails', async () => {
      renderWithProviders(() => <GuildVerification />)
      await waitForLoaded()
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === CHECK_URL && method === 'POST') return Promise.resolve(errJson())
        return Promise.resolve(okJson([]))
      })
      await fireEvent.click(screen.getByText('Check All Roles'))
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(CHECK_URL, 'POST'))
      expect(screen.getByText('Check All Roles')).not.toHaveClass('btn-disabled')
    })
  })

  describe('"don\'t send DM" / "don\'t join support guild" premium toggles', () => {
    it('disables both toggles for a free-tier guild', async () => {
      renderWithProviders(() => <GuildVerification />)
      await waitForLoaded()
      const toggles = screen.getAllByRole('checkbox') as HTMLInputElement[]
      toggles.forEach((toggle) => expect(toggle).toBeDisabled())
    })

    it('saves the new value and reflects it once the PUT succeeds (premium)', async () => {
      window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
      renderWithProviders(() => <GuildVerification />)
      await waitForLoaded()
      const [dontMPToggle] = screen.getAllByRole('checkbox') as HTMLInputElement[]
      expect(dontMPToggle).not.toBeDisabled()
      expect(dontMPToggle.checked).toBe(false)

      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === DONT_MP_URL && method === 'PUT') return Promise.resolve(okJson({}))
        return Promise.resolve(okJson([]))
      })
      await fireEvent.click(dontMPToggle)
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(DONT_MP_URL, 'PUT', { value: true }))
      await vi.waitFor(() => expect(dontMPToggle.checked).toBe(true))
    })

    it('reverts the toggle to its previous value when the PUT fails (premium)', async () => {
      window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
      setupFetchAPI({ dontJoinSupport: { value: false } })
      renderWithProviders(() => <GuildVerification />)
      await waitForLoaded()
      const toggles = screen.getAllByRole('checkbox') as HTMLInputElement[]
      const dontJoinSupportToggle = toggles[1]
      expect(dontJoinSupportToggle.checked).toBe(false)

      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === DONT_JOIN_SUPPORT_URL && method === 'PUT') return Promise.resolve(errJson())
        return Promise.resolve(okJson([]))
      })
      await fireEvent.click(dontJoinSupportToggle)
      await vi.waitFor(() =>
        expect(fetchAPI).toHaveBeenCalledWith(DONT_JOIN_SUPPORT_URL, 'PUT', { value: true }),
      )
      expect(dontJoinSupportToggle.checked).toBe(false)
    })

    it('reverts the "don\'t send DM" toggle when its PUT fails (premium)', async () => {
      window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
      setupFetchAPI({ dontMP: { value: false } })
      renderWithProviders(() => <GuildVerification />)
      await waitForLoaded()
      const [dontMPToggle] = screen.getAllByRole('checkbox') as HTMLInputElement[]
      expect(dontMPToggle.checked).toBe(false)

      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === DONT_MP_URL && method === 'PUT') return Promise.resolve(errJson())
        return Promise.resolve(okJson([]))
      })
      await fireEvent.click(dontMPToggle)
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(DONT_MP_URL, 'PUT', { value: true }))
      expect(dontMPToggle.checked).toBe(false)
    })

    it('saves the "don\'t join support guild" toggle when its PUT succeeds (premium)', async () => {
      window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
      renderWithProviders(() => <GuildVerification />)
      await waitForLoaded()
      const toggles = screen.getAllByRole('checkbox') as HTMLInputElement[]
      const dontJoinSupportToggle = toggles[1]
      expect(dontJoinSupportToggle.checked).toBe(false)

      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === DONT_JOIN_SUPPORT_URL && method === 'PUT') return Promise.resolve(okJson({}))
        return Promise.resolve(okJson([]))
      })
      await fireEvent.click(dontJoinSupportToggle)
      await vi.waitFor(() =>
        expect(fetchAPI).toHaveBeenCalledWith(DONT_JOIN_SUPPORT_URL, 'PUT', { value: true }),
      )
      await vi.waitFor(() => expect(dontJoinSupportToggle.checked).toBe(true))
    })
  })

  describe('delete verify role', () => {
    it('deletes a role and removes it from the list on success', async () => {
      const { container } = renderWithProviders(() => <GuildVerification />)
      await waitForLoaded()
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${VERIFY_ROLES_URL}/r2` && method === 'DELETE') return Promise.resolve(okJson({ roleID: 'r2' }))
        return Promise.resolve(okJson([]))
      })
      const deleteIcons = container.querySelectorAll('.fa-trash')
      await fireEvent.click(deleteIcons[1])
      await vi.waitFor(() => expect(screen.queryByText('@Moderator')).not.toBeInTheDocument())
      expect(screen.getByText('@Admin')).toBeInTheDocument()
    })

    it('does not remove the row when deleting a role fails', async () => {
      const { container } = renderWithProviders(() => <GuildVerification />)
      await waitForLoaded()
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${VERIFY_ROLES_URL}/r2` && method === 'DELETE') return Promise.resolve(errJson())
        return Promise.resolve(okJson([]))
      })
      const deleteIcons = container.querySelectorAll('.fa-trash')
      await fireEvent.click(deleteIcons[1])
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(`${VERIFY_ROLES_URL}/r2`, 'DELETE'))
      expect(screen.getByText('@Moderator')).toBeInTheDocument()
    })
  })

  describe('select role modal (add role)', () => {
    it('lists only guild roles not already verified, and adds the chosen one on change', async () => {
      // Free tier is at the 2-role limit with the default fixture, which hides "Add Role" behind
      // the premium upsell (covered separately below) - go premium here so it's clickable.
      window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
      const { container } = renderWithProviders(() => <GuildVerification />)
      await waitForLoaded()
      stubDialogGlobal(container, 'select_role_modal')
      await fireEvent.click(screen.getByText('Add Role'))
      expect(fetchAPI).toHaveBeenCalledWith(GUILD_ROLES_URL, 'GET')

      const modal = container.querySelector('#select_role_modal') as HTMLElement
      await vi.waitFor(() => expect(within(modal).queryByText('Loading...')).not.toBeInTheDocument())
      const optionTexts = within(modal)
        .getAllByRole('option', { hidden: true })
        .map((o) => o.textContent)
      expect(optionTexts).toContain('VIP')
      expect(optionTexts).not.toContain('Admin')
      expect(optionTexts).not.toContain('Moderator')

      const newRole = { roleID: 'r3', isGiveRole: true, enabled: true }
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${VERIFY_ROLES_URL}/r3` && method === 'POST') return Promise.resolve(okJson(newRole))
        return Promise.resolve(okJson([]))
      })
      const select = within(modal).getByRole('combobox', { hidden: true }) as HTMLSelectElement
      await fireEvent.change(select, { target: { value: 'r3' } })
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(`${VERIFY_ROLES_URL}/r3`, 'POST'))
      await vi.waitFor(() => expect(screen.getByText('@VIP')).toBeInTheDocument())
    })

    it('does not add a role when the create request fails', async () => {
      const { container } = renderWithProviders(() => <GuildVerification />)
      await waitForLoaded()
      stubDialogGlobal(container, 'select_role_modal')
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${VERIFY_ROLES_URL}/r3` && method === 'POST') return Promise.resolve(errJson())
        return Promise.resolve(okJson([]))
      })
      const modal = container.querySelector('#select_role_modal') as HTMLElement
      const select = within(modal).getByRole('combobox', { hidden: true }) as HTMLSelectElement
      await fireEvent.change(select, { target: { value: 'r3' } })
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(`${VERIFY_ROLES_URL}/r3`, 'POST'))
      expect(screen.queryByText('@VIP')).not.toBeInTheDocument()
    })

    it('shows the loading fallback while verifyRoles is loading', () => {
      ;(fetchAPI as Mock).mockImplementation((endpoint: string) => {
        if (endpoint === VERIFY_ROLES_URL) return new Promise(() => {})
        if (endpoint.includes(SUBORDINATION_URL_PART)) return Promise.resolve(okJson({}))
        return Promise.resolve(okJson([]))
      })
      const { container } = renderWithProviders(() => <GuildVerification />)
      const modal = container.querySelector('#select_role_modal') as HTMLElement
      expect(within(modal).getByText('Loading...')).toBeInTheDocument()
    })
  })

  describe('edit role modal', () => {
    it('is empty while guildRoles/verifyRoles are loading (whole body gated)', () => {
      ;(fetchAPI as Mock).mockImplementation((endpoint: string) => {
        if (endpoint === VERIFY_ROLES_URL) return new Promise(() => {})
        if (endpoint.includes(SUBORDINATION_URL_PART)) return Promise.resolve(okJson({}))
        return Promise.resolve(okJson([]))
      })
      const { container } = renderWithProviders(() => <GuildVerification />)
      const modal = container.querySelector('#edit_role_modal') as HTMLElement
      expect(within(modal).queryByText('Save')).not.toBeInTheDocument()
    })

    it('opens with the selected role and saves edits to action and active', async () => {
      const { container } = renderWithProviders(() => <GuildVerification />)
      await waitForLoaded()
      stubDialogGlobal(container, 'edit_role_modal')

      const editIcons = container.querySelectorAll('.fa-edit')
      await fireEvent.click(editIcons[0])

      const modal = container.querySelector('#edit_role_modal') as HTMLElement
      // There's no accessible name to disambiguate the three <select> elements in this modal, so
      // find the disabled role-name select by its disabled state (like GuildAutoRoles.test.tsx).
      const selects = within(modal).getAllByRole('combobox', { hidden: true }) as HTMLSelectElement[]
      const nameSelect = selects.find((s) => s.disabled)!
      expect(nameSelect.textContent).toContain('Admin')

      const [actionSelect, activeSelect] = selects.filter((s) => !s.disabled)
      expect(actionSelect.value).toBe('true') // isGiveRole: true -> "Give Role"
      expect(activeSelect.value).toBe('true') // enabled: true

      await fireEvent.change(actionSelect, { target: { value: 'false' } })
      await fireEvent.change(activeSelect, { target: { value: 'false' } })

      const updated = { roleID: 'r1', isGiveRole: false, enabled: false }
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${VERIFY_ROLES_URL}/r1` && method === 'PUT') return Promise.resolve(okJson(updated))
        return Promise.resolve(okJson([]))
      })
      await fireEvent.click(within(modal).getByText('Save'))

      await vi.waitFor(() =>
        expect(fetchAPI).toHaveBeenCalledWith(`${VERIFY_ROLES_URL}/r1`, 'PUT', {
          isGiveRole: false,
          enabled: false,
        }),
      )
      await vi.waitFor(() => expect(within(table(container)).getAllByText('Remove Role')).toHaveLength(2))
      const rows = screen.getAllByRole('row').slice(1)
      expect(rows[0].querySelector('.fa-times')).toBeInTheDocument()
    })

    it('does not update the list when editing a role fails', async () => {
      const { container } = renderWithProviders(() => <GuildVerification />)
      await waitForLoaded()
      stubDialogGlobal(container, 'edit_role_modal')
      const editIcons = container.querySelectorAll('.fa-edit')
      await fireEvent.click(editIcons[0])
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${VERIFY_ROLES_URL}/r1` && method === 'PUT') return Promise.resolve(errJson())
        return Promise.resolve(okJson([]))
      })
      const modal = container.querySelector('#edit_role_modal') as HTMLElement
      await fireEvent.click(within(modal).getByText('Save'))
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(`${VERIFY_ROLES_URL}/r1`, 'PUT', expect.anything()))
      expect(within(table(container)).getByText('Give Role')).toBeInTheDocument()
    })
  })

  describe('premium gating for Add Role', () => {
    it('shows Add Role directly when premium, even at the 2-role limit', async () => {
      window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
      renderWithProviders(() => <GuildVerification />)
      await waitForLoaded()
      expect(screen.getByText('Add Role')).toBeInTheDocument()
    })

    it('shows the premium upsell instead of Add Role when free and at the 2-role limit', async () => {
      renderWithProviders(() => <GuildVerification />)
      await waitForLoaded()
      expect(screen.queryByText('Add Role')).not.toBeInTheDocument()
      expect(screen.getByText('Limited to 2 roles for free users.')).toBeInTheDocument()
    })

    it('shows Add Role when free and under the 2-role limit', async () => {
      setupFetchAPI({ verifyRoles: [defaultVerifyRolesRaw()[0]] })
      renderWithProviders(() => <GuildVerification />)
      await waitForLoaded()
      expect(screen.getByText('Add Role')).toBeInTheDocument()
    })
  })

  describe('MissingRolePermission banner integration', () => {
    it('shows the warning banner for a verify role the bot cannot manage', async () => {
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint.includes(SUBORDINATION_URL_PART)) {
          // r1 is missing from the subordination map entirely -> flagged as unmanageable.
          return Promise.resolve(okJson({ r2: { name: 'Moderator', editable: true } }))
        }
        if (endpoint === VERIFY_ROLES_URL && method === 'GET') return Promise.resolve(okJson(defaultVerifyRolesRaw()))
        if (endpoint === GUILD_ROLES_URL && method === 'GET') return Promise.resolve(okJson(defaultGuildRoles()))
        return Promise.resolve(okJson([]))
      })
      renderWithProviders(() => <GuildVerification />)
      // Both the warning banner and the verify-role table render "@Admin" here, so waitForLoaded's
      // single-match query would be ambiguous - wait for the banner text itself instead.
      await vi.waitFor(() => expect(screen.getByText(/does not have the permission/)).toBeInTheDocument())
    })
  })
})
