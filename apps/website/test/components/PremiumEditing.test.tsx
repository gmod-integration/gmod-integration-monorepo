import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@solidjs/testing-library'
import { MemoryRouter, Route } from '@solidjs/router'
import { createSignal, type Component } from 'solid-js'
import { AccessProvider, type DashboardAccessSnapshot } from '../../src/components/AccessProvider.js'
import { I18nProvider } from '../../src/i18n.js'
import GuildLinks from '../../src/pages/dashboard/guilds/GuildLinks.js'
import GuildVerifications from '../../src/pages/dashboard/guilds/GuildVerifications.js'
import GuildAutoRoles from '../../src/pages/dashboard/guilds/GuildAutoRoles.js'
import ServerRoles from '../../src/pages/dashboard/guilds/servers/ServerRoles.js'
import ServerStatus from '../../src/pages/dashboard/guilds/servers/status/ServerStatus.js'
import { guildRolesMutate } from '../../src/pages/dashboard/guilds/GuildInformations.js'
import { fetchAPI } from '../../src/utils/api.js'
import { historyAt } from '../testUtils.js'

vi.mock('../../src/utils/api.js', () => ({
  fetchAPI: vi.fn(async () => ({ ok: true, json: async () => [] })),
  getAPIUrl: () => '',
  getUrlWithActualParams: (path: string) => path,
}))

const snapshot = (premium: boolean, overrides: Partial<DashboardAccessSnapshot> = {}): DashboardAccessSnapshot => ({
  guildID: 'g1',
  premium,
  customBot: false,
  state: 'ready',
  sources: [],
  revision: String(premium),
  validUntil: '2099-01-01T00:00:00.000Z',
  usages: {},
  ...overrides,
})
const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body })
const roles = [1, 2, 3, 4, 5].map((id) => ({ id: `r${id}`, name: `Role ${id}`, color: 0, colorHex: '#000000' }))
const statusButtons = [1, 2, 3].map((id) => ({
  id,
  name: `Button ${id}`,
  emoji: '',
  url: 'https://example.com',
  enable: false,
}))
const statusConfiguration = {
  settings: { show_player_list_status: false, status_player_list_format: '{name}', show_status_chart: false },
  buttons: statusButtons,
}

function renderPage(Page: Component, path: string) {
  const [access, setAccess] = createSignal(snapshot(true))
  render(() => (
    <MemoryRouter
      history={historyAt(path)}
      root={(props) => (
        <I18nProvider>
          <AccessProvider snapshot={access()}>{props.children}</AccessProvider>
        </I18nProvider>
      )}
    >
      <Route path={path} component={Page} />
    </MemoryRouter>
  ))
  return setAccess
}
const modal = (id: string) => within(document.getElementById(id)!)
const mutations = () => (fetchAPI as Mock).mock.calls.filter(([, method]) => method !== 'GET')
const quotaNotice = 'You have reached the limit for this feature.'

beforeEach(() => {
  localStorage.clear()
  ;(fetchAPI as Mock).mockReset().mockImplementation(async (path: string, method: string) => {
    if (path.endsWith('/status/preview'))
      return json({
        bot: { name: 'Preview', avatarUrl: null },
        online: true,
        embeds: [{ title: 'Status', color: 0, fields: [], timestamp: '2026-11-21T12:00:00.000Z', imageUrl: null }],
        buttonRows: [],
      })
    if (method !== 'GET') return json({})
    if (path.endsWith('/links'))
      return json([
        { id: 1, alias: 'Website', url: 'https://example.com', active: true },
        { id: 2, alias: 'Docs', url: 'https://docs.example.com', active: false },
      ])
    if (path.endsWith('/verifications/roles'))
      return json(roles.slice(0, 2).map((role) => ({ roleID: role.id, isGiveRole: true, enabled: true })))
    if (path.endsWith('/auto-roles')) return json(roles.slice(0, 3).map((role) => ({ roleID: role.id })))
    if (path.endsWith('/bot/roles/subordination')) return json({})
    if (path.includes('/servers/') && path.endsWith('/roles'))
      return json(roles.slice(0, 4).map((role) => ({ roleID: role.id, userGroup: `Group ${role.id}`, enable: true })))
    if (path.endsWith('/roles')) return json(roles)
    if (path.endsWith('/settings/sync_role_direction')) return json({ value: 'gmod-to-discord' })
    if (path.includes('/settings/')) return json({ value: false })
    if (path.endsWith('/verifications/check')) return json(true)
    if (path.endsWith('/verifications') || path.endsWith('/status')) return json({})
    return json([])
  })
  guildRolesMutate(roles)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({ configuration: statusConfiguration, revision: 'a'.repeat(64) })),
  )
  vi.spyOn(window, 'matchMedia').mockReturnValue(
    Object.assign(new EventTarget(), { matches: true, media: '(min-width: 1280px)' }) as MediaQueryList,
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Premium changes during editing', () => {
  it('blocks link creation after a downgrade without discarding the modal draft', async () => {
    const setAccess = renderPage(GuildLinks, '/dashboard/guilds/g1/config/links')
    await vi.waitFor(() => expect(screen.getByText('Website')).toBeInTheDocument())
    await fireEvent.click(screen.getByRole('button', { name: 'Add Link' }))
    const editor = modal('edit_select_link')
    await fireEvent.input(editor.getByLabelText(/^Alias/), { target: { value: 'Draft link' } })
    await fireEvent.input(editor.getByLabelText(/^URL/), { target: { value: 'https://draft.example.com' } })
    const create = editor.getByRole('button', { name: 'Create' })
    expect(create).toBeEnabled()
    setAccess(snapshot(false))
    expect(create).toBeDisabled()
    expect(editor.getByText(quotaNotice)).toBeInTheDocument()
    expect(editor.getByLabelText(/^Alias/)).toHaveValue('Draft link')
    expect(editor.getByLabelText(/^URL/)).toHaveValue('https://draft.example.com')
    expect(editor.getByRole('button', { name: 'Cancel' })).toBeEnabled()
    await fireEvent.click(create)
    expect(mutations()).toHaveLength(0)
    setAccess(snapshot(true))
    expect(create).toBeEnabled()
  })

  it('blocks verification-role creation when the free quota becomes applicable', async () => {
    const setAccess = renderPage(GuildVerifications, '/dashboard/guilds/g1/config/verifications')
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Add Role' })).toBeEnabled())
    await fireEvent.click(screen.getByRole('button', { name: 'Add Role' }))
    const editor = modal('edit_role_modal')
    const role = editor.getByLabelText(/^Role/)
    await vi.waitFor(() => expect(role).toBeEnabled())
    await fireEvent.change(role, { target: { value: 'r3' } })
    const create = editor.getByRole('button', { name: 'Create' })
    expect(create).toBeEnabled()
    setAccess(snapshot(false))
    expect(create).toBeDisabled()
    expect(role).toHaveValue('r3')
    expect(editor.getByText(quotaNotice)).toBeInTheDocument()
    setAccess(snapshot(true))
    expect(create).toBeEnabled()
    expect(mutations()).toHaveLength(0)
  })

  it('preserves an autorole selection while confirmation is blocked by a downgrade', async () => {
    const setAccess = renderPage(GuildAutoRoles, '/dashboard/guilds/g1/config/auto-roles')
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Add Role' })).toBeEnabled())
    await fireEvent.click(screen.getByRole('button', { name: 'Add Role' }))
    const editor = modal('select_role_modal')
    const role = await editor.findByRole('combobox')
    await vi.waitFor(() => expect(role).toBeEnabled())
    await fireEvent.change(role, { target: { value: 'r4' } })
    const save = editor.getByRole('button', { name: 'Save' })
    expect(save).toBeEnabled()
    setAccess(snapshot(false))
    expect(save).toBeDisabled()
    expect(role).toHaveValue('r4')
    expect(editor.getByText(quotaNotice)).toBeInTheDocument()
    setAccess(snapshot(true))
    expect(save).toBeEnabled()
    expect(mutations()).toHaveLength(0)
  })

  it('explains a reached role quota inside the open modal and preserves its fields', async () => {
    const setAccess = renderPage(ServerRoles, '/dashboard/guilds/g1/config/servers/s1/roles')
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Add role mapping' })).toBeEnabled())
    await fireEvent.click(screen.getByRole('button', { name: 'Add role mapping' }))
    const editor = modal('edit_role_modal')
    await fireEvent.change(editor.getByRole('combobox'), { target: { value: 'r5' } })
    await fireEvent.input(editor.getByLabelText('Game user group'), { target: { value: 'New group' } })
    const create = editor.getByRole('button', { name: 'Create' })
    expect(create).toBeEnabled()
    setAccess(snapshot(false))
    expect(create).toBeDisabled()
    expect(editor.getByText(quotaNotice)).toBeInTheDocument()
    expect(editor.getByRole('combobox')).toHaveValue('r5')
    expect(editor.getByLabelText('Game user group')).toHaveValue('New group')
    setAccess(snapshot(true))
    expect(create).toBeEnabled()
    expect(mutations()).toHaveLength(0)
  })

  it('blocks applying a fourth status button after a downgrade and preserves the staged button', async () => {
    const setAccess = renderPage(ServerStatus, '/dashboard/guilds/g1/config/servers/s1/status')
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Add Button' })).toBeEnabled())
    await fireEvent.click(screen.getByRole('button', { name: 'Add Button' }))
    const editor = modal('edit_status_button')
    await fireEvent.input(editor.getByLabelText('Button label'), { target: { value: 'New button' } })
    await fireEvent.input(editor.getByLabelText('URL'), { target: { value: 'https://draft.example.com' } })
    const apply = editor.getByRole('button', { name: 'Apply to draft' })
    expect(apply).toBeEnabled()
    setAccess(snapshot(false))
    expect(apply).toBeDisabled()
    expect(editor.getByText(quotaNotice)).toBeInTheDocument()
    expect(editor.getByLabelText('Button label')).toHaveValue('New button')
    setAccess(snapshot(true))
    expect(apply).toBeEnabled()
  })

  it('explains expired access without requesting an upgrade for an unsaved paid chart', async () => {
    const setAccess = renderPage(ServerStatus, '/dashboard/guilds/g1/config/servers/s1/status')
    const chart = () => screen.getByRole('checkbox', { name: /Show player activity chart/ })
    await vi.waitFor(() => expect(chart()).toBeEnabled())
    await fireEvent.click(chart())
    const save = screen.getByRole('button', { name: 'Save status configuration' })
    expect(save).toBeEnabled()
    setAccess(snapshot(true, { validUntil: '2000-01-01T00:00:00.000Z' }))
    expect(save).toBeDisabled()
    expect(chart()).toBeChecked()
    const actions = within(save.closest('.ui-form-actions')!)
    expect(actions.getByText(/Access could not be verified/)).toBeInTheDocument()
    expect(actions.queryByText('This feature requires Premium.')).not.toBeInTheDocument()
    expect(actions.getByRole('button', { name: 'Cancel' })).toBeEnabled()
  })

  it('holds newly applied buttons for access revalidation while retaining the aggregate draft', async () => {
    const setAccess = renderPage(ServerStatus, '/dashboard/guilds/g1/config/servers/s1/status')
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Add Button' })).toBeEnabled())
    await fireEvent.click(screen.getByRole('button', { name: 'Add Button' }))
    const editor = modal('edit_status_button')
    await fireEvent.input(editor.getByLabelText('Button label'), { target: { value: 'Draft button' } })
    await fireEvent.input(editor.getByLabelText('URL'), { target: { value: 'https://draft.example.com' } })
    await fireEvent.click(editor.getByRole('button', { name: 'Apply to draft' }))
    const save = screen.getByRole('button', { name: 'Save status configuration' })
    expect(save).toBeEnabled()
    setAccess(snapshot(true, { validUntil: '2000-01-01T00:00:00.000Z' }))
    expect(save).toBeDisabled()
    expect(within(save.closest('.ui-form-actions')!).getByText(/Access could not be verified/)).toBeInTheDocument()
    expect(screen.getByRole('table')).toHaveTextContent('Draft button')
    setAccess(snapshot(true))
    expect(save).toBeEnabled()
  })
})
