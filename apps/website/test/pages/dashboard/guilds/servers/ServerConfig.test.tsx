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
const settings = () => ({
  ig_syncBan: true,
  ig_supportLink: 'https://support.example.com',
  ig_verifyOnReadyKickTime: 120,
  ig_clientBranch: 'dev',
  ig_adminRank: { superadmin: true, mod: true },
})
function mockFetch(values: unknown = settings()) {
  ;(fetchAPI as Mock).mockImplementation((path: string) =>
    Promise.resolve(path === CONFIG_URL ? okJson({ settings: values }) : okJson([])),
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
  it('groups settings in four peer cards without per-card save and cancel buttons', async () => {
    const { container } = renderPage()
    await ready(container)
    expect(screen.getByText('In-game addon settings')).toBeInTheDocument()
    expect(screen.getByText('GWSockets')).toBeInTheDocument()
    expect(screen.queryByText('Changes are saved automatically.')).not.toBeInTheDocument()
    const general = screen.getByRole('region', { name: 'General and administration' })
    const access = screen.getByRole('region', { name: 'Access and verification' })
    expect(general).toContainElement(row(container, 'Addon Language'))
    expect(general).toContainElement(row(container, 'Game administrator groups'))
    expect(general.parentElement).toBe(access.parentElement)
    expect(container.querySelectorAll('.settings-card-grid > .dashboard-panel')).toHaveLength(4)
    expect(container.querySelectorAll('.settings-row')).toHaveLength(16)
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
    vi.mocked(fetchAPI).mockResolvedValue(errJson() as Response)
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

  it('searches descriptions, filters categories and resets an empty search without saving', async () => {
    const { container } = renderPage()
    await ready(container)
    const search = screen.getByRole('searchbox', { name: 'Search settings' })
    await fireEvent.input(search, { target: { value: 'automatic material downloading' } })
    expect(container.querySelectorAll('.settings-row')).toHaveLength(1)
    expect(row(container, 'Redownload Materials')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: /Moderation/ }))
    expect(screen.getByText('No settings match your search in this category.')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }))
    expect(search).toHaveValue('')
    expect(container.querySelectorAll('.settings-row')).toHaveLength(16)
    expect(saveDashboardSettings).not.toHaveBeenCalled()
  })

  it('matches French labels without requiring accents', async () => {
    localStorage.setItem('locale', 'fr')
    const { container } = renderPage()
    await vi.waitFor(() => expect(container.querySelector('#ig_forcePlayerLink')).not.toBeDisabled())
    await fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'verifier la liaison' } })
    expect(container.querySelectorAll('.settings-row')).toHaveLength(1)
    expect(row(container, 'Vérifier la liaison avant l’entrée en jeu')).toBeInTheDocument()
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

  it('still saves edits when their card becomes hidden by a category or search filter', async () => {
    const { container } = renderPage()
    await ready(container)
    vi.useFakeTimers()
    await fireEvent.input(within(row(container, 'Support Link')).getByRole('textbox'), {
      target: { value: 'https://draft.example' },
    })
    await fireEvent.click(screen.getByRole('button', { name: /Moderation/ }))
    expect(container.querySelector('#ig_supportLink')).not.toBeInTheDocument()
    await autosave()
    expect(saveDashboardSettings).toHaveBeenCalledWith('server', { ig_supportLink: 'https://draft.example' })
    await fireEvent.click(screen.getByRole('button', { name: /General and administration/ }))
    expect(within(row(container, 'Support Link')).getByRole('textbox')).toHaveValue('https://draft.example')
    await fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'nothing-matches' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }))
    expect(within(row(container, 'Support Link')).getByRole('textbox')).toHaveValue('https://draft.example')
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

  it('keeps pending hidden edits registered until saved and unregisters forms on unmount', async () => {
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
    await fireEvent.click(screen.getByRole('button', { name: /Moderation/ }))
    expect(entries.filter((entry) => entry.dirty())).toHaveLength(1)
    await autosave()
    expect(entries.every((entry) => !entry.dirty())).toBe(true)
    unmount()
    expect(unregister).toHaveBeenCalledTimes(entries.length)
  })
})
