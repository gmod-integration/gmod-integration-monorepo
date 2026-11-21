import type * as APIModule from '../../../../src/utils/api.js'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { renderWithProviders } from '../../../testUtils.js'
import { stubDialogGlobal, clearDialogGlobals, okJson, errJson } from './servers/testHelpers.js'

vi.mock('../../../../src/utils/api.js', async (importActual) => {
  const actual = await importActual<typeof APIModule>()
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

const { guildRolesMutate, guildChannelsMutate, guildRolesRefetch, guildRoles } =
  await import('../../../../src/pages/dashboard/guilds/GuildInformations.js')
const { fetchAPI } = await import('../../../../src/utils/api.js')
const GuildAutoRoles = (await import('../../../../src/pages/dashboard/guilds/GuildAutoRoles.js')).default

const AUTO_ROLES_URL = '/users/:discordID/guilds/:guildID/auto-roles'
const SUBORDINATION_URL_PART = '/bot/roles/subordination'
const GUILD_ROLES_URL = '/users/:discordID/guilds/:guildID/roles'

afterEach(() => {
  cleanup()
  clearDialogGlobals('select_role_modal', 'delete_auto_role')
  vi.restoreAllMocks()
})

function defaultGuildRoles() {
  return [
    { id: 'r1', name: 'Admin', color: 111, colorHex: '#111111' },
    { id: 'r2', name: 'Moderator', color: 222, colorHex: '#222222' },
    { id: 'r3', name: 'VIP', color: 333, colorHex: '#333333' },
  ]
}

function defaultAutoRolesRaw() {
  return [{ roleID: 'r1' }, { roleID: 'r2' }]
}

// All roles editable by default so MissingRolePermission's warning banner (which also renders a
// DiscordRole per flagged role) stays empty and doesn't add extra "@RoleName" text to the DOM.
function subordinationFor(roles: { id: string; name: string }[]) {
  return Object.fromEntries(roles.map((r) => [r.id, { name: r.name, editable: true }]))
}

function setupFetchAPI({
  autoRoles = defaultAutoRolesRaw(),
  guildRolesList = defaultGuildRoles(),
}: { autoRoles?: unknown; guildRolesList?: { id: string; name: string }[] } = {}) {
  ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
    if (endpoint.includes(SUBORDINATION_URL_PART)) return Promise.resolve(okJson(subordinationFor(guildRolesList)))
    if (endpoint === AUTO_ROLES_URL && method === 'GET') return Promise.resolve(okJson(autoRoles))
    if (endpoint === GUILD_ROLES_URL && method === 'GET') return Promise.resolve(okJson(guildRolesList))
    return Promise.resolve(okJson([]))
  })
}

async function waitForLoaded() {
  await vi.waitFor(() => expect(screen.getByText('@Admin')).toBeInTheDocument())
}

describe('pages/dashboard/guilds/GuildAutoRoles.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: false }))
    ;(fetchAPI as Mock).mockReset()
    setupFetchAPI()
    guildRolesMutate(defaultGuildRoles())
    guildChannelsMutate([])
  })

  it('renders the loaded auto-role table using DiscordRole to resolve names', async () => {
    renderWithProviders(() => <GuildAutoRoles />)
    await waitForLoaded()
    expect(screen.getByText('@Moderator')).toBeInTheDocument()
    expect(screen.queryByText('@VIP')).not.toBeInTheDocument()
  })

  it('shows a loading spinner for the table while autoRoles is loading', () => {
    ;(fetchAPI as Mock).mockImplementation((endpoint: string) => {
      if (endpoint === AUTO_ROLES_URL) return new Promise(() => {})
      if (endpoint.includes(SUBORDINATION_URL_PART)) return Promise.resolve(okJson({}))
      return Promise.resolve(okJson([]))
    })
    const { container } = renderWithProviders(() => <GuildAutoRoles />)
    expect(container.querySelector('.loading-spinner')).toBeInTheDocument()
  })

  it('shows a retryable error when the auto-roles GET responds with a non-ok status', async () => {
    ;(fetchAPI as Mock).mockImplementation((endpoint: string) => {
      if (endpoint === AUTO_ROLES_URL) return Promise.resolve(errJson())
      if (endpoint.includes(SUBORDINATION_URL_PART)) return Promise.resolve(okJson({}))
      return Promise.resolve(okJson([]))
    })
    renderWithProviders(() => <GuildAutoRoles />)
    await vi.waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Unable to load roles.'))
  })

  it('shows the failed-to-load message when the auto-roles fetch rejects', async () => {
    ;(fetchAPI as Mock).mockImplementation((endpoint: string) => {
      if (endpoint === AUTO_ROLES_URL) return Promise.reject(new Error('network down'))
      if (endpoint.includes(SUBORDINATION_URL_PART)) return Promise.resolve(okJson({}))
      return Promise.resolve(okJson([]))
    })
    renderWithProviders(() => <GuildAutoRoles />)
    await vi.waitFor(() => expect(screen.getByText('Unable to load roles.')).toBeInTheDocument())
  })

  describe('delete auto role', () => {
    it('deletes a role and removes it from the list on success', async () => {
      const { container } = renderWithProviders(() => <GuildAutoRoles />)
      await waitForLoaded()
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${AUTO_ROLES_URL}/r2` && method === 'DELETE') return Promise.resolve(okJson({ roleID: 'r2' }))
        return Promise.resolve(okJson({}))
      })
      const deleteIcons = container.querySelectorAll('svg[data-icon="trash-2"]')
      await fireEvent.click(deleteIcons[1])
      const confirmation = container.querySelector<HTMLDialogElement>('#delete_auto_role')!
      expect(within(confirmation).getByText('Delete Moderator?')).toBeInTheDocument()
      expect((fetchAPI as Mock).mock.calls.filter(([, method]) => method === 'DELETE')).toHaveLength(0)
      await fireEvent.click(within(confirmation).getByRole('button', { name: 'Delete' }))
      await vi.waitFor(() => expect(screen.queryByText('@Moderator')).not.toBeInTheDocument())
      expect(screen.getByText('@Admin')).toBeInTheDocument()
    })

    it('does not remove the row when deleting a role fails', async () => {
      const { container } = renderWithProviders(() => <GuildAutoRoles />)
      await waitForLoaded()
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${AUTO_ROLES_URL}/r2` && method === 'DELETE') return Promise.resolve(errJson())
        return Promise.resolve(okJson({}))
      })
      const deleteIcons = container.querySelectorAll('svg[data-icon="trash-2"]')
      await fireEvent.click(deleteIcons[1])
      const confirmation = container.querySelector<HTMLDialogElement>('#delete_auto_role')!
      expect(within(confirmation).getByText('Delete Moderator?')).toBeInTheDocument()
      expect((fetchAPI as Mock).mock.calls.filter(([, method]) => method === 'DELETE')).toHaveLength(0)
      await fireEvent.click(within(confirmation).getByRole('button', { name: 'Delete' }))
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(`${AUTO_ROLES_URL}/r2`, 'DELETE'))
      expect(screen.getByText('@Moderator')).toBeInTheDocument()
    })
  })

  describe('select role modal (add role)', () => {
    it('lists only guild roles not already in autoRoles, and adds the chosen one only after Save', async () => {
      const { container } = renderWithProviders(() => <GuildAutoRoles />)
      await waitForLoaded()
      stubDialogGlobal(container, 'select_role_modal')
      await fireEvent.click(screen.getByText('Add Role'))
      expect(fetchAPI).toHaveBeenCalledWith(GUILD_ROLES_URL, 'GET')

      const modal = container.querySelector('#select_role_modal') as HTMLElement
      // Add Role triggers guildRolesRefetch() without awaiting it, so guildRoles briefly goes
      // back into a loading state (showing the modal's "Loading..." fallback) before settling.
      await vi.waitFor(() => expect(within(modal).queryByText('Loading...')).not.toBeInTheDocument())
      const optionTexts = within(modal)
        .getAllByRole('option', { hidden: true })
        .map((o) => o.textContent)
      expect(optionTexts).toContain('VIP')
      expect(optionTexts).not.toContain('Admin')
      expect(optionTexts).not.toContain('Moderator')

      const newRole = { roleID: 'r3', enabled: true }
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${AUTO_ROLES_URL}/r3` && method === 'POST') return Promise.resolve(okJson(newRole))
        return Promise.resolve(okJson({}))
      })
      const select = within(modal).getByRole('combobox', { hidden: true }) as HTMLSelectElement
      await fireEvent.change(select, { target: { value: 'r3' } })
      expect((fetchAPI as Mock).mock.calls.filter(([, method]) => method === 'POST')).toHaveLength(0)
      await fireEvent.click(within(modal).getByRole('button', { name: 'Save', hidden: true }))
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(`${AUTO_ROLES_URL}/r3`, 'POST'))
      await vi.waitFor(() => expect(screen.getByText('@VIP')).toBeInTheDocument())
    })

    it('does not add a role when the create request fails', async () => {
      const { container } = renderWithProviders(() => <GuildAutoRoles />)
      await waitForLoaded()
      stubDialogGlobal(container, 'select_role_modal')
      ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
        if (endpoint === `${AUTO_ROLES_URL}/r3` && method === 'POST') return Promise.resolve(errJson())
        return Promise.resolve(okJson({}))
      })
      const modal = container.querySelector('#select_role_modal') as HTMLElement
      const select = within(modal).getByRole('combobox', { hidden: true }) as HTMLSelectElement
      await fireEvent.change(select, { target: { value: 'r3' } })
      expect((fetchAPI as Mock).mock.calls.filter(([, method]) => method === 'POST')).toHaveLength(0)
      await fireEvent.click(within(modal).getByRole('button', { name: 'Save', hidden: true }))
      await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(`${AUTO_ROLES_URL}/r3`, 'POST'))
      expect(screen.queryByText('@VIP')).not.toBeInTheDocument()
    })

    it('shows the loading fallback while guildRoles is (re)loading', async () => {
      let resolveFetch: (value: unknown) => void = () => {}
      ;(fetchAPI as Mock).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve
          }),
      )
      const refetchPromise = guildRolesRefetch()
      const { container } = renderWithProviders(() => <GuildAutoRoles />)
      const modal = container.querySelector('#select_role_modal') as HTMLElement
      expect(within(modal).getByText('Loading...')).toBeInTheDocument()

      resolveFetch(okJson(defaultGuildRoles()))
      await refetchPromise
      await vi.waitFor(() => expect(guildRoles.loading).toBe(false))
    })
  })

  it('treats every stored role as active and offers no unsupported activation editor', async () => {
    const { container } = renderWithProviders(() => <GuildAutoRoles />)
    await waitForLoaded()
    expect(within(container.querySelector('table')!).getAllByText('Enabled')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.getByText('Every role listed here is automatically assigned to new members.')).toBeInTheDocument()
    expect((fetchAPI as Mock).mock.calls.filter(([, method]) => method === 'PUT')).toHaveLength(0)
  })

  describe('premium gating for Add Role', () => {
    it('shows Add Role directly when premium, even at the free limit', async () => {
      window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
      setupFetchAPI({
        autoRoles: [{ roleID: 'r1' }, { roleID: 'r2', enabled: true }, { roleID: 'r3', enabled: true }],
      })
      renderWithProviders(() => <GuildAutoRoles />)
      await waitForLoaded()
      expect(screen.getByText('Add Role')).toBeInTheDocument()
    })

    it('shows the premium upsell instead of Add Role when free and at the 3-role limit', async () => {
      setupFetchAPI({
        autoRoles: [{ roleID: 'r1' }, { roleID: 'r2', enabled: true }, { roleID: 'r3', enabled: true }],
      })
      renderWithProviders(() => <GuildAutoRoles />)
      await waitForLoaded()
      expect(screen.queryByText('Add Role')).not.toBeInTheDocument()
      expect(screen.getByText('Limited to 3 auto roles for free users.')).toBeInTheDocument()
    })

    it('shows Add Role when free and under the 3-role limit', async () => {
      renderWithProviders(() => <GuildAutoRoles />)
      await waitForLoaded()
      expect(screen.getByText('Add Role')).toBeInTheDocument()
    })
  })
})
