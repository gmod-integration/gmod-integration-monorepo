import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../../../../testUtils.js'
import ServerConfig from '../../../../../src/pages/dashboard/guilds/servers/ServerConfig.js'
import { fetchAPI } from '../../../../../src/utils/api.js'
import { saveDashboardSettings } from '../../../../../src/utils/dashboardSettings.js'
import { DraftRegistryContext, type DraftEntry } from '../../../../../src/hooks/draftRegistry.js'
import { okJson, errJson } from './testHelpers.js'

vi.mock('../../../../../src/utils/api.js', () => ({
  fetchAPI: vi.fn(),
  getAPIUrl: vi.fn(),
  getUrlWithActualParams: vi.fn((path: string) => path),
}))
vi.mock('../../../../../src/utils/dashboardSettings.js', () => ({ saveDashboardSettings: vi.fn() }))

const CONFIG_URL = '/users/:discordID/guilds/:guildID/servers/:serverID/config'
const ROLES_URL = '/users/:discordID/guilds/:guildID/roles'
const WHITELIST_ROLE = '1051881514020917408'
const OTHER_ROLE = '1051881514020917409'
const discordRoles = [
  { id: WHITELIST_ROLE, name: 'Server whitelist' },
  { id: OTHER_ROLE, name: 'Verified players' },
]
const settings = () => ({
  ig_syncBan: true,
  ig_supportLink: 'https://support.example.com',
  ig_verifyOnReadyKickTime: 120,
  ig_clientBranch: 'dev',
  ig_adminRank: { superadmin: true, mod: true },
})
function mockFetch(values: unknown = settings(), roles: unknown = []) {
  ;(fetchAPI as Mock).mockImplementation((path: string) =>
    Promise.resolve(path === CONFIG_URL ? okJson({ settings: values }) : okJson(roles)),
  )
}
function renderPage() {
  return renderWithProviders(() => <ServerConfig />, {
    path: '/dashboard/guilds/:guildID/config/servers/:serverID/config',
    history: historyAt('/dashboard/guilds/g1/config/servers/s1/config'),
  })
}
function row(container: HTMLElement, label: string) {
  const value = Array.from(container.querySelectorAll<HTMLElement>('.settings-row')).find(
    (entry) => entry.querySelector('.settings-row-title')?.textContent === label,
  )
  if (!value) throw new Error(`Missing setting ${label}`)
  return value
}
function section(container: HTMLElement, name: string) {
  return container.querySelector<HTMLElement>(`#config-${name}`)!
}
async function ready(container: HTMLElement) {
  await vi.waitFor(() =>
    expect(row(container, 'Block Discord-banned players').querySelector('input')).not.toBeDisabled(),
  )
}
const autosave = () => vi.advanceTimersByTimeAsync(450)

beforeEach(() => {
  localStorage.clear()
  vi.mocked(fetchAPI).mockReset()
  vi.mocked(saveDashboardSettings)
    .mockReset()
    .mockImplementation(async (_scope, values) => ({ settings: values, sync: 'applied' }))
  mockFetch()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('server configuration autosave', () => {
  it('shows four settings cards directly without search filters or per-card save and cancel buttons', async () => {
    const { container } = renderPage()
    await ready(container)
    expect(screen.queryByText('In-game addon settings')).not.toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /All settings/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reset filters' })).not.toBeInTheDocument()
    expect(screen.getByText('GWSockets')).toBeInTheDocument()
    expect(screen.queryByText('Changes are saved automatically.')).not.toBeInTheDocument()
    const general = screen.getByRole('region', { name: 'General and administration' })
    const access = screen.getByRole('region', { name: 'Access and verification' })
    expect(general).toContainElement(row(container, 'Addon Language'))
    expect(general).toContainElement(row(container, 'Game administrator groups'))
    expect(general.parentElement).toBe(access.parentElement)
    expect(container.querySelectorAll('.settings-card-grid > .dashboard-panel')).toHaveLength(4)
    expect(container.querySelectorAll('.settings-row')).toHaveLength(17)
    expect(row(container, 'Log Timestamp Format').querySelector('input')).toHaveValue('%H:%M:%S')
    expect(screen.queryByRole('button', { name: 'Save', hidden: true })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel', hidden: true })).not.toBeInTheDocument()
    expect(saveDashboardSettings).not.toHaveBeenCalled()
  })

  it('keeps all controls unavailable during loading and after a failed initial read', async () => {
    vi.mocked(fetchAPI).mockImplementation(() => new Promise(() => {}))
    const first = renderPage()
    expect(row(first.container, 'Block Discord-banned players').querySelector('input')).toBeDisabled()
    expect(row(first.container, 'Support Link').querySelector('input')).toBeDisabled()
    expect(row(first.container, 'Required Garry’s Mod client branch').querySelector('select')).toBeDisabled()
    expect(
      within(row(first.container, 'Game administrator groups')).getByRole('button', { name: 'Add rank' }),
    ).toBeDisabled()
    first.unmount()
    vi.mocked(fetchAPI).mockImplementation(async (path) =>
      path === CONFIG_URL ? (errJson() as Response) : (okJson([]) as Response),
    )
    const second = renderPage()
    await vi.waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(row(second.container, 'Block Discord-banned players').querySelector('input')).toBeDisabled()
    expect(saveDashboardSettings).not.toHaveBeenCalled()
  })

  it('recovers a failed configuration read with retry', async () => {
    vi.mocked(fetchAPI).mockResolvedValueOnce(errJson() as Response)
    const { container } = renderPage()
    await vi.waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    mockFetch()
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await ready(container)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(saveDashboardSettings).not.toHaveBeenCalled()
  })

  it('renders the setting labels in French without changing their saved values', async () => {
    localStorage.setItem('locale', 'fr')
    const { container } = renderPage()
    await vi.waitFor(() => expect(container.querySelector('#ig_forcePlayerLink')).not.toBeDisabled())
    expect(container.querySelectorAll('.settings-row')).toHaveLength(17)
    expect(row(container, 'Vérifier la liaison avant l’entrée en jeu')).toBeInTheDocument()
    expect(row(container, 'Mode whitelist')).toBeInTheDocument()
    expect(row(container, 'Rôle de whitelist du serveur')).toBeInTheDocument()
    expect(saveDashboardSettings).not.toHaveBeenCalled()
  })

  it('automatically saves toggles, select choices and batched text changes', async () => {
    const { container } = renderPage()
    await ready(container)
    vi.useFakeTimers()
    await fireEvent.click(within(row(container, 'Timeout synchronization (unavailable)')).getByRole('checkbox'))
    await fireEvent.input(within(row(container, 'Support Link')).getByRole('textbox'), {
      target: { value: 'https://new.example' },
    })
    await fireEvent.change(within(row(container, 'Addon Language')).getByRole('combobox'), { target: { value: 'fr' } })
    expect(saveDashboardSettings).not.toHaveBeenCalled()
    await autosave()
    expect(saveDashboardSettings).toHaveBeenCalledWith('server', {
      ig_supportLink: 'https://new.example',
      ig_language: 'fr',
    })
    expect(saveDashboardSettings).toHaveBeenCalledWith('server', { ig_syncTimeout: true })
    expect(saveDashboardSettings).toHaveBeenCalledTimes(2)
  })

  it('preserves a failed value and retries only when requested without looping', async () => {
    const { container } = renderPage()
    await ready(container)
    vi.useFakeTimers()
    vi.mocked(saveDashboardSettings).mockRejectedValueOnce(new Error('Offline'))
    const input = within(row(container, 'Support Link')).getByRole('textbox')
    await fireEvent.input(input, { target: { value: 'https://draft.example' } })
    await autosave()
    expect(within(section(container, 'general')).getByRole('alert')).toBeInTheDocument()
    expect(input).toHaveValue('https://draft.example')
    await vi.advanceTimersByTimeAsync(2000)
    expect(saveDashboardSettings).toHaveBeenCalledTimes(1)
    await fireEvent.click(within(section(container, 'general')).getByRole('button', { name: 'Try again' }))
    await autosave()
    expect(saveDashboardSettings).toHaveBeenCalledTimes(2)
    expect(within(section(container, 'general')).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('queues changes typed during an in-flight request without disabling the input or losing edits', async () => {
    const { container } = renderPage()
    await ready(container)
    vi.useFakeTimers()
    let finish!: (value: Awaited<ReturnType<typeof saveDashboardSettings>>) => void
    vi.mocked(saveDashboardSettings).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const input = within(row(container, 'Support Link')).getByRole('textbox')
    await fireEvent.input(input, { target: { value: 'https://first.example' } })
    await autosave()
    expect(saveDashboardSettings).toHaveBeenCalledTimes(1)
    expect(input).not.toBeDisabled()
    await fireEvent.input(input, { target: { value: 'https://second.example' } })
    await autosave()
    expect(saveDashboardSettings).toHaveBeenCalledTimes(1)
    finish({ settings: { ig_supportLink: 'https://first.example' }, sync: 'applied' })
    await autosave()
    expect(input).toHaveValue('https://second.example')
    expect(saveDashboardSettings).toHaveBeenCalledTimes(2)
    expect(saveDashboardSettings).toHaveBeenLastCalledWith('server', { ig_supportLink: 'https://second.example' })
  })

  it('distinguishes accepted storage pending addon synchronization from a failed save', async () => {
    const { container } = renderPage()
    await ready(container)
    vi.useFakeTimers()
    vi.mocked(saveDashboardSettings).mockResolvedValueOnce({ settings: { ig_syncTimeout: true }, sync: 'pending' })
    await fireEvent.click(within(row(container, 'Timeout synchronization (unavailable)')).getByRole('checkbox'))
    await autosave()
    expect(within(section(container, 'moderation')).getByText('Saved. Synchronization is pending.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it.each(['invalid-url', 'javascript:alert(1)'])(
    'keeps an invalid support URL local until corrected: %s',
    async (value) => {
      const { container } = renderPage()
      await ready(container)
      vi.useFakeTimers()
      const input = within(row(container, 'Support Link')).getByRole('textbox')
      await fireEvent.input(input, { target: { value } })
      await autosave()
      expect(input).toHaveAttribute('aria-invalid', 'true')
      expect(within(row(container, 'Support Link')).getByRole('alert')).toBeInTheDocument()
      expect(saveDashboardSettings).not.toHaveBeenCalled()
      await fireEvent.input(input, { target: { value: '' } })
      await autosave()
      expect(saveDashboardSettings).toHaveBeenCalledWith('server', { ig_supportLink: '' })
    },
  )

  it.each(['', '-1', '1.5'])('does not save an invalid kick delay: %s', async (value) => {
    const { container } = renderPage()
    await ready(container)
    vi.useFakeTimers()
    const input = within(row(container, 'Account-linking time limit (seconds)')).getByRole('spinbutton')
    await fireEvent.input(input, { target: { value } })
    await autosave()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(saveDashboardSettings).not.toHaveBeenCalled()
  })

  it('saves numeric delays as numbers without writing unchanged values', async () => {
    const { container } = renderPage()
    await ready(container)
    vi.useFakeTimers()
    const input = within(row(container, 'Account-linking time limit (seconds)')).getByRole('spinbutton')
    await fireEvent.input(input, { target: { value: '120' } })
    await autosave()
    expect(saveDashboardSettings).not.toHaveBeenCalled()
    await fireEvent.input(input, { target: { value: '0' } })
    await autosave()
    expect(saveDashboardSettings).toHaveBeenCalledWith('server', { ig_verifyOnReadyKickTime: 0 })
  })

  it('holds invalid rank rows locally, then automatically saves the normalized complete rank map', async () => {
    const { container } = renderPage()
    await ready(container)
    vi.useFakeTimers()
    const ranks = row(container, 'Game administrator groups')
    expect(
      within(ranks)
        .getAllByRole('textbox')
        .map((input) => (input as HTMLInputElement).value),
    ).toEqual(['mod', 'superadmin'])
    await fireEvent.click(within(ranks).getByRole('button', { name: 'Add rank' }))
    await autosave()
    expect(saveDashboardSettings).not.toHaveBeenCalled()
    const inputs = within(ranks).getAllByRole('textbox')
    await fireEvent.input(inputs[2], { target: { value: 'mod' } })
    await autosave()
    expect(saveDashboardSettings).not.toHaveBeenCalled()
    await fireEvent.input(inputs[2], { target: { value: ' admin ' } })
    await autosave()
    expect(saveDashboardSettings).toHaveBeenCalledWith('server', {
      ig_adminRank: { mod: true, superadmin: true, admin: true },
    })
    expect(
      within(ranks)
        .getAllByRole('textbox')
        .map((input) => (input as HTMLInputElement).value),
    ).toEqual(['admin', 'mod', 'superadmin'])
  })

  it('automatically persists a removed administrator rank', async () => {
    const { container } = renderPage()
    await ready(container)
    vi.useFakeTimers()
    const ranks = row(container, 'Game administrator groups')
    await fireEvent.click(within(ranks).getAllByRole('button', { name: 'Remove' })[0])
    await autosave()
    expect(within(ranks).getAllByRole('textbox')).toHaveLength(1)
    expect(saveDashboardSettings).toHaveBeenCalledWith('server', { ig_adminRank: { superadmin: true } })
  })

  it.each(['{"owner":true}', '[object Object]', '{broken', null])(
    'normalizes legacy rank values without writing or mutating the fixture: %s',
    async (ranks) => {
      const fixture = { ...settings(), ig_adminRank: ranks }
      mockFetch(fixture)
      const { container } = renderPage()
      await ready(container)
      expect(
        within(row(container, 'Game administrator groups'))
          .getAllByRole('textbox')
          .map((input) => (input as HTMLInputElement).value),
      ).toEqual(ranks === '{"owner":true}' ? ['owner'] : ['superadmin'])
      expect(fixture.ig_adminRank).toBe(ranks)
      expect(saveDashboardSettings).not.toHaveBeenCalled()
    },
  )

  it('cancels a queued write when unmounted', async () => {
    const { container, unmount } = renderPage()
    await ready(container)
    vi.useFakeTimers()
    await fireEvent.input(within(row(container, 'Support Link')).getByRole('textbox'), {
      target: { value: 'https://draft.example' },
    })
    unmount()
    await autosave()
    expect(saveDashboardSettings).not.toHaveBeenCalled()
  })

  it('keeps pending edits registered until saved and unregisters forms on unmount', async () => {
    const entries: DraftEntry[] = []
    const unregister = vi.fn()
    const { container, unmount } = renderWithProviders(
      () => (
        <DraftRegistryContext.Provider
          value={{
            register: (entry) => {
              entries.push(entry)
              return unregister
            },
          }}
        >
          <ServerConfig />
        </DraftRegistryContext.Provider>
      ),
      {
        path: '/dashboard/guilds/:guildID/config/servers/:serverID/config',
        history: historyAt('/dashboard/guilds/g1/config/servers/s1/config'),
      },
    )
    await ready(container)
    vi.useFakeTimers()
    expect(entries.every((entry) => !entry.dirty())).toBe(true)
    await fireEvent.input(within(row(container, 'Support Link')).getByRole('textbox'), {
      target: { value: 'https://unsaved.example' },
    })
    expect(entries.filter((entry) => entry.dirty())).toHaveLength(1)
    await autosave()
    expect(entries.every((entry) => !entry.dirty())).toBe(true)
    unmount()
    expect(unregister).toHaveBeenCalledTimes(entries.length)
  })
})

describe('server whitelist role', () => {
  it('defaults to no role, explains independent grants and batches the role with whitelist mode', async () => {
    mockFetch(settings(), discordRoles)
    const { container } = renderPage()
    await ready(container)
    const roleRow = row(container, 'Server whitelist')
    const select = within(roleRow).getByRole('combobox')
    await vi.waitFor(() =>
      expect(within(select).getByRole('option', { name: '@Server whitelist' })).toBeInTheDocument(),
    )
    expect(select).toHaveValue('')
    expect(within(select).getByRole('option', { name: 'No Discord role' })).toBeInTheDocument()
    expect(roleRow.previousElementSibling).toBe(row(container, 'Whitelist mode'))
    expect(roleRow).toHaveTextContent('linked Steam and Discord accounts')
    expect(roleRow).toHaveTextContent('Manual access granted in Players works independently.')
    expect(roleRow).toHaveTextContent('while whitelist mode is on')
    expect(saveDashboardSettings).not.toHaveBeenCalled()
    vi.useFakeTimers()
    await fireEvent.change(select, { target: { value: WHITELIST_ROLE } })
    await fireEvent.click(within(row(container, 'Whitelist mode')).getByRole('checkbox'))
    await autosave()
    expect(saveDashboardSettings).toHaveBeenCalledExactlyOnceWith('server', {
      ig_maintenance: true,
      maintenance_whitelist_role: WHITELIST_ROLE,
    })
  })

  it('hydrates the saved role without writing it and permits removing it', async () => {
    mockFetch({ ...settings(), maintenance_whitelist_role: WHITELIST_ROLE }, discordRoles)
    const { container } = renderPage()
    await ready(container)
    const select = within(row(container, 'Server whitelist')).getByRole('combobox')
    await vi.waitFor(() =>
      expect(within(select).getByRole('option', { name: '@Server whitelist' })).toBeInTheDocument(),
    )
    expect(select).toHaveValue(WHITELIST_ROLE)
    expect(saveDashboardSettings).not.toHaveBeenCalled()
    vi.useFakeTimers()
    await fireEvent.change(select, { target: { value: '' } })
    await autosave()
    expect(saveDashboardSettings).toHaveBeenCalledExactlyOnceWith('server', { maintenance_whitelist_role: '' })
  })

  it('keeps unrelated settings usable while roles load and populates the selector without writing', async () => {
    let finish!: (value: Response) => void
    vi.mocked(fetchAPI).mockImplementation(async (path) =>
      path === ROLES_URL
        ? new Promise<Response>((resolve) => {
            finish = resolve
          })
        : (okJson({ settings: settings() }) as Response),
    )
    const { container } = renderPage()
    await ready(container)
    const roleRow = row(container, 'Server whitelist')
    const select = within(roleRow).getByRole('combobox')
    expect(select).toBeDisabled()
    expect(roleRow).toHaveTextContent('Loading Discord roles…')
    expect(within(row(container, 'Whitelist mode')).getByRole('checkbox')).not.toBeDisabled()
    finish(okJson(discordRoles) as Response)
    await vi.waitFor(() => expect(select).not.toBeDisabled())
    expect(select).toHaveValue('')
    expect(within(select).getByRole('option', { name: '@Verified players' })).toHaveValue(OTHER_ROLE)
    expect(saveDashboardSettings).not.toHaveBeenCalled()
  })

  it.each([null, [{ id: 'invalid', name: 'Invalid' }], [{ id: WHITELIST_ROLE, name: 2 }]])(
    'rejects malformed roles and retries without discarding the group draft: %j',
    async (payload) => {
      mockFetch(settings(), payload)
      const { container } = renderPage()
      await ready(container)
      const roleRow = row(container, 'Server whitelist')
      await vi.waitFor(() => expect(within(roleRow).getByRole('alert')).toBeInTheDocument())
      const select = within(roleRow).getByRole('combobox')
      expect(select).toBeDisabled()
      vi.useFakeTimers()
      const support = within(row(container, 'Support Link')).getByRole('textbox')
      await fireEvent.input(support, { target: { value: 'https://draft.example' } })
      mockFetch(settings(), discordRoles)
      await fireEvent.click(within(roleRow).getByRole('button', { name: 'Try again' }))
      await vi.waitFor(() => expect(select).not.toBeDisabled())
      expect(support).toHaveValue('https://draft.example')
      expect(select).toHaveValue('')
      expect(saveDashboardSettings).not.toHaveBeenCalled()
      await autosave()
      expect(saveDashboardSettings).toHaveBeenCalledExactlyOnceWith('server', {
        ig_supportLink: 'https://draft.example',
      })
    },
  )

  it('preserves a deleted role until explicitly cleared without blocking other general settings', async () => {
    mockFetch({ ...settings(), maintenance_whitelist_role: WHITELIST_ROLE }, [discordRoles[1]])
    const { container } = renderPage()
    await ready(container)
    const select = within(row(container, 'Server whitelist')).getByRole('combobox')
    expect(select).toHaveValue(WHITELIST_ROLE)
    expect(within(select).getByRole('option', { name: `Unavailable role (${WHITELIST_ROLE})` })).toBeDisabled()
    expect(select).not.toBeDisabled()
    expect(saveDashboardSettings).not.toHaveBeenCalled()
    vi.useFakeTimers()
    await fireEvent.input(within(row(container, 'Support Link')).getByRole('textbox'), {
      target: { value: 'https://other.example' },
    })
    await autosave()
    expect(saveDashboardSettings).toHaveBeenLastCalledWith('server', { ig_supportLink: 'https://other.example' })
    expect(select).toHaveValue(WHITELIST_ROLE)
    await fireEvent.change(select, { target: { value: '' } })
    await autosave()
    expect(saveDashboardSettings).toHaveBeenLastCalledWith('server', { maintenance_whitelist_role: '' })
  })

  it('holds an invalid saved role locally until it is cleared', async () => {
    mockFetch({ ...settings(), maintenance_whitelist_role: '1234567890123456' }, discordRoles)
    const { container } = renderPage()
    await ready(container)
    const roleRow = row(container, 'Server whitelist')
    const select = within(roleRow).getByRole('combobox')
    vi.useFakeTimers()
    await fireEvent.click(within(row(container, 'Whitelist mode')).getByRole('checkbox'))
    await autosave()
    expect(select).toHaveAttribute('aria-invalid', 'true')
    expect(within(roleRow).getByRole('alert')).toHaveTextContent('Choose an available Discord role or no role.')
    expect(saveDashboardSettings).not.toHaveBeenCalled()
    await fireEvent.change(select, { target: { value: '' } })
    await autosave()
    expect(saveDashboardSettings).toHaveBeenCalledExactlyOnceWith('server', {
      ig_maintenance: true,
      maintenance_whitelist_role: '',
    })
  })

  it.each(['loading', 'failed'])('permits clearing a saved role when the Discord lookup is %s', async (state) => {
    vi.mocked(fetchAPI).mockImplementation(async (path) =>
      path === ROLES_URL
        ? state === 'loading'
          ? new Promise<Response>(() => {})
          : (errJson() as Response)
        : (okJson({ settings: { ...settings(), maintenance_whitelist_role: WHITELIST_ROLE } }) as Response),
    )
    const { container } = renderPage()
    await ready(container)
    const roleRow = row(container, 'Server whitelist')
    const select = within(roleRow).getByRole('combobox')
    if (state === 'failed') await vi.waitFor(() => expect(within(roleRow).getByRole('alert')).toBeInTheDocument())
    expect(select).toHaveValue(WHITELIST_ROLE)
    expect(select).not.toBeDisabled()
    vi.useFakeTimers()
    await fireEvent.change(select, { target: { value: '' } })
    await autosave()
    expect(saveDashboardSettings).toHaveBeenCalledExactlyOnceWith('server', { maintenance_whitelist_role: '' })
    expect(select).toHaveValue('')
    expect(select).toBeDisabled()
  })

  it('preserves the selected role after a failed autosave until an explicit retry', async () => {
    mockFetch(settings(), discordRoles)
    const { container } = renderPage()
    await ready(container)
    const select = within(row(container, 'Server whitelist')).getByRole('combobox')
    vi.useFakeTimers()
    vi.mocked(saveDashboardSettings).mockRejectedValueOnce(new Error('Offline'))
    await fireEvent.change(select, { target: { value: WHITELIST_ROLE } })
    await autosave()
    expect(within(section(container, 'general')).getByRole('alert')).toBeInTheDocument()
    expect(select).toHaveValue(WHITELIST_ROLE)
    await vi.advanceTimersByTimeAsync(2000)
    expect(saveDashboardSettings).toHaveBeenCalledTimes(1)
    await fireEvent.click(within(section(container, 'general')).getByRole('button', { name: 'Try again' }))
    await autosave()
    expect(saveDashboardSettings).toHaveBeenLastCalledWith('server', { maintenance_whitelist_role: WHITELIST_ROLE })
    expect(saveDashboardSettings).toHaveBeenCalledTimes(2)
    expect(select).toHaveValue(WHITELIST_ROLE)
    expect(within(section(container, 'general')).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps a role selected during an in-flight autosave and submits it after the first acknowledgement', async () => {
    mockFetch(settings(), discordRoles)
    const { container } = renderPage()
    await ready(container)
    vi.useFakeTimers()
    let finish!: (value: Awaited<ReturnType<typeof saveDashboardSettings>>) => void
    vi.mocked(saveDashboardSettings).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const select = within(row(container, 'Server whitelist')).getByRole('combobox')
    await fireEvent.change(select, { target: { value: WHITELIST_ROLE } })
    await autosave()
    expect(select).not.toBeDisabled()
    await fireEvent.change(select, { target: { value: OTHER_ROLE } })
    await autosave()
    expect(saveDashboardSettings).toHaveBeenCalledTimes(1)
    finish({ settings: { maintenance_whitelist_role: WHITELIST_ROLE }, sync: 'applied' })
    await autosave()
    expect(select).toHaveValue(OTHER_ROLE)
    expect(saveDashboardSettings).toHaveBeenCalledTimes(2)
    expect(saveDashboardSettings).toHaveBeenLastCalledWith('server', { maintenance_whitelist_role: OTHER_ROLE })
  })
})
