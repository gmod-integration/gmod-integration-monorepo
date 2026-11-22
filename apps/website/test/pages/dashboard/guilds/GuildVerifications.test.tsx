import type * as APIModule from '../../../../src/utils/api.js'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { renderWithProviders } from '../../../testUtils.js'
import { clearDialogGlobals, okJson, errJson } from './servers/testHelpers.js'

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

vi.mock('../../../../src/utils/dashboardSettings.js', () => ({ saveDashboardSettings: vi.fn() }))
const { saveDashboardSettings } = await import('../../../../src/utils/dashboardSettings.js')

const { guildRolesMutate, guildChannelsMutate } =
  await import('../../../../src/pages/dashboard/guilds/GuildInformations.js')
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
  clearDialogGlobals(
    'edit_role_modal',
    'select_channel_modal',
    'publish_verification',
    'delete_verification_message',
    'delete_verification_role',
    'check_verification_roles',
  )
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
function subordinationFor(roles: { id: string; name: string }[]) {
  return Object.fromEntries(roles.map((r) => [r.id, { name: r.name, editable: true }]))
}

function setupFetchAPI({
  verifyRoles = defaultVerifyRolesRaw(),
  guildRolesList = defaultGuildRoles(),
  channels = [] as unknown[],
  verifyMessage = {},
  lastVerify = true,
  dontMP = { value: false },
  dontJoinSupport = { value: false },
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
    ;(saveDashboardSettings as Mock).mockReset()
    setupFetchAPI()
    guildRolesMutate(defaultGuildRoles())
    guildChannelsMutate([])
  })

  it('renders stored roles with the action and real enabled state', async () => {
    const { container } = renderWithProviders(() => <GuildVerification />)
    await waitForLoaded()
    expect(within(table(container)).getByText('Give Role')).toBeInTheDocument()
    expect(within(table(container)).getByText('Remove Role')).toBeInTheDocument()
    const rows = within(table(container)).getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('Enabled')
    expect(rows[1]).toHaveTextContent('Disabled')
  })

  it('shows loading and keeps table actions unavailable while roles load', () => {
    ;(fetchAPI as Mock).mockImplementation(() => new Promise(() => {}))
    const { container } = renderWithProviders(() => <GuildVerification />)
    expect(container.querySelector('.loading-spinner')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  })

  it('renders a retryable role error without reading the failed resource', async () => {
    ;(fetchAPI as Mock).mockImplementation((url: string) =>
      Promise.resolve(url === VERIFY_ROLES_URL ? errJson() : okJson({})),
    )
    const { container } = renderWithProviders(() => <GuildVerification />)
    await vi.waitFor(() => expect(within(table(container)).getByRole('alert')).toBeInTheDocument())
    setupFetchAPI()
    await fireEvent.click(within(table(container)).getByRole('button', { name: 'Try again' }))
    await waitForLoaded()
  })

  it('requires all fields before creating a role and submits a complete object once', async () => {
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
    const { container } = renderWithProviders(() => <GuildVerification />)
    await waitForLoaded()
    await fireEvent.click(screen.getByRole('button', { name: 'Add Role' }))
    const modal = container.querySelector<HTMLDialogElement>('#edit_role_modal')!
    await vi.waitFor(() => expect(within(modal).getByLabelText(/^Role/)).not.toBeDisabled())
    expect(within(modal).getByRole('button', { name: 'Create' })).toBeDisabled()
    expect(
      within(modal)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toContain('VIP')
    expect(within(modal).queryByRole('option', { name: 'Admin' })).not.toBeInTheDocument()
    await fireEvent.change(within(modal).getByLabelText(/^Role/), { target: { value: 'r3' } })
    await fireEvent.change(within(modal).getByLabelText('Action on Verification'), { target: { value: 'false' } })
    await fireEvent.change(within(modal).getByLabelText('Active'), { target: { value: 'false' } })
    expect((fetchAPI as Mock).mock.calls.filter(([, method]) => method === 'POST')).toHaveLength(0)
    ;(fetchAPI as Mock).mockResolvedValue(okJson({ roleID: 'r3', isGiveRole: false, enabled: false }))
    await fireEvent.click(within(modal).getByRole('button', { name: 'Create' }))
    await vi.waitFor(() =>
      expect(fetchAPI).toHaveBeenCalledWith(`${VERIFY_ROLES_URL}/r3`, 'POST', { isGiveRole: false, enabled: false }),
    )
    await vi.waitFor(() => expect(modal.open).toBe(false))
    expect(within(table(container)).getByText('@VIP')).toBeInTheDocument()
  })

  it('keeps a failed role draft for retry and blocks duplicate submissions and closing while saving', async () => {
    const { container } = renderWithProviders(() => <GuildVerification />)
    await waitForLoaded()
    await fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    const modal = container.querySelector<HTMLDialogElement>('#edit_role_modal')!
    expect(within(modal).getByRole('button', { name: 'Save' })).toBeDisabled()
    await fireEvent.change(within(modal).getByLabelText('Active'), { target: { value: 'false' } })
    let resolveSave!: (value: ReturnType<typeof okJson>) => void
    ;(fetchAPI as Mock).mockImplementation(() => new Promise((resolve) => (resolveSave = resolve)))
    const save = within(modal).getByRole('button', { name: 'Save' })
    await fireEvent.click(save)
    await fireEvent.click(save)
    expect((fetchAPI as Mock).mock.calls.filter(([, method]) => method === 'PUT')).toHaveLength(1)
    expect(within(modal).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(within(modal).getByLabelText('Active')).toBeDisabled()
    resolveSave(errJson())
    await vi.waitFor(() => expect(within(modal).getByRole('alert')).toBeInTheDocument())
    expect(within(modal).getByLabelText('Active')).toHaveValue('false')
    expect(modal.open).toBe(true)
    ;(fetchAPI as Mock).mockResolvedValue(okJson({ roleID: 'r1', isGiveRole: true, enabled: false }))
    await fireEvent.click(save)
    await vi.waitFor(() => expect(modal.open).toBe(false))
    expect(within(table(container)).getAllByRole('row')[1]).toHaveTextContent('Disabled')
  })

  it('discards a role edit on Cancel and sends no request before Save', async () => {
    const { container } = renderWithProviders(() => <GuildVerification />)
    await waitForLoaded()
    const edit = screen.getAllByRole('button', { name: 'Edit' })[0]
    await fireEvent.click(edit)
    const modal = container.querySelector<HTMLDialogElement>('#edit_role_modal')!
    await fireEvent.change(within(modal).getByLabelText('Active'), { target: { value: 'false' } })
    await fireEvent.click(within(modal).getByRole('button', { name: 'Cancel' }))
    await fireEvent.click(edit)
    expect(within(modal).getByLabelText('Active')).toHaveValue('true')
    expect((fetchAPI as Mock).mock.calls.filter(([, method]) => method !== 'GET')).toHaveLength(0)
  })

  it('confirms the named role before deleting and retains it after a failed request', async () => {
    const { container } = renderWithProviders(() => <GuildVerification />)
    await waitForLoaded()
    await fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[1])
    const modal = container.querySelector<HTMLDialogElement>('#delete_verification_role')!
    expect(within(modal).getByText('Delete Moderator?')).toBeInTheDocument()
    expect((fetchAPI as Mock).mock.calls.filter(([, method]) => method === 'DELETE')).toHaveLength(0)
    ;(fetchAPI as Mock).mockResolvedValue(errJson())
    await fireEvent.click(within(modal).getByRole('button', { name: 'Delete' }))
    await vi.waitFor(() => expect(within(modal).getByRole('alert')).toBeInTheDocument())
    expect(within(table(container)).getByText('@Moderator')).toBeInTheDocument()
    ;(fetchAPI as Mock).mockResolvedValue(okJson({}))
    await fireEvent.click(within(modal).getByRole('button', { name: 'Delete' }))
    await vi.waitFor(() => expect(within(table(container)).queryByText('@Moderator')).not.toBeInTheDocument())
  })

  it('saves member preferences together only on Save and restores saved values on Cancel', async () => {
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
    const { container } = renderWithProviders(() => <GuildVerification />)
    await waitForLoaded()
    const group = screen.getByText('Member experience').closest('section')!
    const dm = container.querySelector<HTMLInputElement>('#verification-dm')!
    const support = container.querySelector<HTMLInputElement>('#verification-support')!
    expect(within(group).getByRole('button', { name: 'Save' })).toBeDisabled()
    await fireEvent.click(dm)
    await fireEvent.click(support)
    expect(saveDashboardSettings).not.toHaveBeenCalled()
    expect(dm).toBeChecked()
    expect(support).toBeChecked()
    await fireEvent.click(within(group).getByRole('button', { name: 'Cancel' }))
    expect(dm).not.toBeChecked()
    expect(support).not.toBeChecked()
    await fireEvent.click(dm)
    await fireEvent.click(support)
    ;(saveDashboardSettings as Mock).mockResolvedValue({
      settings: { verification_dont_mp: true, verification_dont_join_support: true },
      sync: 'applied',
    })
    await fireEvent.click(within(group).getByRole('button', { name: 'Save' }))
    await vi.waitFor(() =>
      expect(saveDashboardSettings).toHaveBeenCalledWith('guild', {
        verification_dont_mp: true,
        verification_dont_join_support: true,
      }),
    )
    await vi.waitFor(() => expect(within(group).getByRole('button', { name: 'Save' })).toBeDisabled())
  })

  it('keeps changed preferences on failure, permits retry and sends only changed keys', async () => {
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
    const { container } = renderWithProviders(() => <GuildVerification />)
    await waitForLoaded()
    const group = screen.getByText('Member experience').closest('section')!
    const dm = container.querySelector<HTMLInputElement>('#verification-dm')!
    await fireEvent.click(dm)
    ;(saveDashboardSettings as Mock).mockRejectedValue(new Error('network'))
    await fireEvent.click(within(group).getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(within(group).getByRole('alert')).toBeInTheDocument())
    expect(dm).toBeChecked()
    ;(saveDashboardSettings as Mock).mockResolvedValue({ settings: { verification_dont_mp: true }, sync: 'pending' })
    await fireEvent.click(within(group).getByRole('button', { name: 'Save' }))
    await vi.waitFor(() =>
      expect(saveDashboardSettings).toHaveBeenLastCalledWith('guild', { verification_dont_mp: true }),
    )
    await vi.waitFor(() => expect(within(group).getByText('Saved. Synchronization is pending.')).toBeInTheDocument())
  })

  it('keeps the member experience draft when a role edit is canceled or saved', async () => {
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
    const { container } = renderWithProviders(() => <GuildVerification />)
    await waitForLoaded()
    const preferences = screen.getByText('Member experience').closest('.dashboard-panel') as HTMLElement
    const dm = within(preferences).getByLabelText('Disable private verification reminders')
    await fireEvent.click(dm)
    const edit = screen.getAllByRole('button', { name: 'Edit' })[0]
    await fireEvent.click(edit)
    const modal = container.querySelector<HTMLDialogElement>('#edit_role_modal')!
    await fireEvent.change(within(modal).getByLabelText('Active'), { target: { value: 'false' } })
    await fireEvent.click(within(modal).getByRole('button', { name: 'Cancel' }))
    expect(dm).toBeChecked()
    expect(within(preferences).getByRole('button', { name: 'Save' })).toBeEnabled()

    await fireEvent.click(edit)
    await fireEvent.change(within(modal).getByLabelText('Active'), { target: { value: 'false' } })
    ;(fetchAPI as Mock).mockResolvedValue(okJson({ roleID: 'r1', isGiveRole: true, enabled: false }))
    await fireEvent.click(within(modal).getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(modal.open).toBe(false))
    expect(saveDashboardSettings).not.toHaveBeenCalled()
    expect(dm).toBeChecked()
    await fireEvent.click(within(preferences).getByRole('button', { name: 'Cancel' }))
    expect(dm).not.toBeChecked()
    expect(within(table(container)).getAllByRole('row')[1]).toHaveTextContent('Disabled')
  })

  it('blocks preference changes and duplicate saves while awaiting the batch response', async () => {
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
    const { container } = renderWithProviders(() => <GuildVerification />)
    await waitForLoaded()
    const group = screen.getByText('Member experience').closest('section')!
    const dm = container.querySelector<HTMLInputElement>('#verification-dm')!
    await fireEvent.click(dm)
    let resolveSave!: (value: unknown) => void
    ;(saveDashboardSettings as Mock).mockImplementation(() => new Promise((resolve) => (resolveSave = resolve)))
    const save = within(group).getByRole('button', { name: 'Save' })
    await fireEvent.click(save)
    await fireEvent.click(save)
    expect(saveDashboardSettings).toHaveBeenCalledTimes(1)
    expect(dm).toBeDisabled()
    expect(within(group).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    resolveSave({ settings: { verification_dont_mp: true }, sync: 'applied' })
    await vi.waitFor(() => expect(save).toBeDisabled())
    await vi.waitFor(() => expect(dm).not.toBeDisabled())
  })

  it('disables premium preferences for a free guild', async () => {
    const { container } = renderWithProviders(() => <GuildVerification />)
    await waitForLoaded()
    expect(container.querySelector('#verification-dm')).toBeDisabled()
    expect(container.querySelector('#verification-support')).toBeDisabled()
  })

  it('allows turning off saved premium preferences after expiry without changing the other saved preference', async () => {
    setupFetchAPI({ dontMP: { value: true }, dontJoinSupport: { value: true } })
    const { container } = renderWithProviders(() => <GuildVerification />)
    await waitForLoaded()
    const group = screen.getByText('Member experience').closest('section')!
    const dm = container.querySelector<HTMLInputElement>('#verification-dm')!
    const support = container.querySelector<HTMLInputElement>('#verification-support')!
    await vi.waitFor(() => expect(dm).toBeChecked())
    expect(dm).not.toBeDisabled()
    await fireEvent.click(dm)
    expect(support).toBeChecked()
    vi.mocked(saveDashboardSettings).mockResolvedValue({ settings: { verification_dont_mp: false }, sync: 'applied' })
    await fireEvent.click(within(group).getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(saveDashboardSettings).toHaveBeenCalledWith('guild', { verification_dont_mp: false }))
    await vi.waitFor(() => expect(within(group).getByRole('button', { name: 'Save' })).toBeDisabled())
    expect(dm).not.toBeChecked()
    expect(dm).toBeDisabled()
    expect(support).toBeChecked()
  })

  it('discards an unsaved verification rule when the dialog is cancelled with Escape', async () => {
    const { container } = renderWithProviders(() => <GuildVerification />)
    await waitForLoaded()
    await fireEvent.click(screen.getByRole('button', { name: 'Add Role' }))
    const modal = container.querySelector<HTMLDialogElement>('#edit_role_modal')!
    await vi.waitFor(() => expect(within(modal).getByLabelText(/^Role/)).not.toBeDisabled())
    await fireEvent.change(within(modal).getByLabelText(/^Role/), { target: { value: 'r3' } })
    await fireEvent.change(within(modal).getByLabelText('Active'), { target: { value: 'false' } })
    await fireEvent(modal, new Event('cancel', { cancelable: true }))
    expect(within(modal).getByLabelText(/^Role/)).toHaveValue('')
    expect(within(modal).getByLabelText('Active')).toHaveValue('true')
    expect((fetchAPI as Mock).mock.calls.filter(([, method]) => method === 'POST')).toHaveLength(0)
  })

  it('reloads the verification message after a failed request without publishing a duplicate', async () => {
    const channels = [{ id: 'c1', name: 'general', type: 0, textBased: true, position: 0, parentID: null }]
    setupFetchAPI({ channels })
    guildChannelsMutate(channels)
    const original = vi.mocked(fetchAPI).getMockImplementation()!
    ;(fetchAPI as Mock).mockImplementation((url: string, method: string) =>
      url === VERIFY_MESSAGE_URL ? Promise.resolve(errJson()) : original(url, method),
    )
    renderWithProviders(() => <GuildVerification />)
    await waitForLoaded()
    const group = screen.getByText('Verification entry point').closest('section')!
    await vi.waitFor(() => expect(within(group).getByRole('alert')).toBeInTheDocument())
    setupFetchAPI({ channels, verifyMessage: { channelID: 'c1', messageID: 'm1' } })
    await fireEvent.click(within(group).getByRole('button', { name: 'Try again' }))
    await vi.waitFor(() => expect(within(group).getByRole('link', { name: /#general/ })).toBeInTheDocument())
    expect(within(group).queryByRole('alert')).not.toBeInTheDocument()
    expect((fetchAPI as Mock).mock.calls.filter(([, method]) => method === 'POST')).toHaveLength(0)
  })

  it('shows a failed preference fetch and retries instead of editing default values', async () => {
    const original = (fetchAPI as Mock).getMockImplementation()!
    ;(fetchAPI as Mock).mockImplementation((url: string, method: string) =>
      url === DONT_MP_URL ? Promise.resolve(errJson()) : original(url, method),
    )
    const { container } = renderWithProviders(() => <GuildVerification />)
    await waitForLoaded()
    const group = screen.getByText('Member experience').closest('section')!
    await vi.waitFor(() => expect(within(group).getByRole('alert')).toBeInTheDocument())
    expect(container.querySelector('#verification-dm')).not.toBeInTheDocument()
    setupFetchAPI()
    await fireEvent.click(within(group).getByRole('button', { name: 'Try again' }))
    await vi.waitFor(() => expect(container.querySelector('#verification-dm')).toBeInTheDocument())
  })

  it('publishes only after selecting a channel and confirming the target', async () => {
    const channels = [{ id: 'c1', name: 'general', type: 0, textBased: true, position: 0, parentID: null }]
    setupFetchAPI({ channels })
    guildChannelsMutate(channels)
    const { container } = renderWithProviders(() => <GuildVerification />)
    await waitForLoaded()
    expect(screen.getByText('No verification message')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Send Verification Message' }))
    const selector = container.querySelector<HTMLDialogElement>('#select_channel_modal')!
    await vi.waitFor(() => expect(within(selector).getByRole('combobox')).not.toBeDisabled())
    await fireEvent.change(within(selector).getByRole('combobox'), { target: { value: 'c1' } })
    await fireEvent.click(within(selector).getByRole('button', { name: 'Save' }))
    const confirm = container.querySelector<HTMLDialogElement>('#publish_verification')!
    expect(within(confirm).getByText('Publish verification in #general?')).toBeInTheDocument()
    expect((fetchAPI as Mock).mock.calls.filter(([, method]) => method === 'POST')).toHaveLength(0)
    ;(fetchAPI as Mock).mockResolvedValue(okJson({ channelID: 'c1', messageID: 'm1' }))
    await fireEvent.click(within(confirm).getByRole('button', { name: 'Publish' }))
    await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(VERIFY_MESSAGE_URL, 'POST', { channelID: 'c1' }))
    await vi.waitFor(() => expect(screen.getByRole('link', { name: /#general/ })).toBeInTheDocument())
  })

  it('requires confirmation to remove a published message and keeps it visible on failure', async () => {
    const channels = [{ id: 'c1', name: 'general', type: 0, textBased: true, position: 0, parentID: null }]
    setupFetchAPI({ channels, verifyMessage: { channelID: 'c1', messageID: 'm1' } })
    guildChannelsMutate(channels)
    const { container } = renderWithProviders(() => <GuildVerification />)
    await waitForLoaded()
    await fireEvent.click(screen.getByRole('button', { name: 'Delete Verification Message' }))
    const modal = container.querySelector<HTMLDialogElement>('#delete_verification_message')!
    expect(within(modal).getByText('Delete verification in #general?')).toBeInTheDocument()
    expect((fetchAPI as Mock).mock.calls.filter(([, method]) => method === 'DELETE')).toHaveLength(0)
    ;(fetchAPI as Mock).mockResolvedValue(errJson())
    await fireEvent.click(within(modal).getByRole('button', { name: 'Delete' }))
    await vi.waitFor(() => expect(within(modal).getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('link', { name: /#general/ })).toBeInTheDocument()
    ;(fetchAPI as Mock).mockResolvedValue(okJson({}))
    await fireEvent.click(within(modal).getByRole('button', { name: 'Delete' }))
    await vi.waitFor(() => expect(screen.getByText('No verification message')).toBeInTheDocument())
  })

  it('confirms the mass role check, reports failure and permits retry', async () => {
    const { container } = renderWithProviders(() => <GuildVerification />)
    await waitForLoaded()
    const button = screen.getByRole('button', { name: 'Apply roles to existing members' })
    await fireEvent.click(button)
    const modal = container.querySelector<HTMLDialogElement>('#check_verification_roles')!
    expect(within(modal).getByText(/up to 1,000 members/)).toBeInTheDocument()
    expect((fetchAPI as Mock).mock.calls.filter(([, method]) => method === 'POST')).toHaveLength(0)
    ;(fetchAPI as Mock).mockResolvedValue(errJson())
    await fireEvent.click(within(modal).getByRole('button', { name: 'Apply roles to existing members' }))
    await vi.waitFor(() => expect(within(modal).getByRole('alert')).toBeInTheDocument())
    expect(button).not.toBeDisabled()
    ;(fetchAPI as Mock).mockResolvedValue(okJson({}))
    await fireEvent.click(within(modal).getByRole('button', { name: 'Apply roles to existing members' }))
    await vi.waitFor(() => expect(button).toBeDisabled())
  })

  it('keeps free-tier creation limited to two verification roles', async () => {
    renderWithProviders(() => <GuildVerification />)
    await waitForLoaded()
    expect(screen.getByRole('button', { name: 'Add Role' })).toBeDisabled()
    expect(screen.getByText('2 / 2 used')).toBeInTheDocument()
  })
  it('paginates verification rules while keeping bulk application a separate full-list command', async () => {
    localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
    const roles = Array.from({ length: 26 }, (_, index) => ({
      id: `r${index + 1}`,
      name: `Role ${index + 1}`,
      color: 0,
      colorHex: '#000000',
    }))
    setupFetchAPI({
      verifyRoles: roles.map((role) => ({ roleID: role.id, isGiveRole: true, enabled: true })),
      guildRolesList: roles,
    })
    guildRolesMutate(roles)
    const { container } = renderWithProviders(() => <GuildVerification />)
    await vi.waitFor(() => expect(within(table(container)).getByText('@Role 1')).toBeInTheDocument())
    expect(table(container).querySelectorAll('tbody tr')).toHaveLength(25)
    await fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(within(table(container)).getByText('@Role 26')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Pagination' }).closest('table')).toBeNull()
    expect((fetchAPI as Mock).mock.calls.filter(([, method]) => method !== 'GET')).toHaveLength(0)
    await fireEvent.click(screen.getByRole('button', { name: 'Apply roles to existing members' }))
    const confirmation = within(document.getElementById('check_verification_roles')!)
    await fireEvent.click(confirmation.getByRole('button', { name: 'Apply roles to existing members' }))
    await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(CHECK_URL, 'POST'))
    expect(within(table(container)).getByText('@Role 26')).toBeInTheDocument()
  })
})
