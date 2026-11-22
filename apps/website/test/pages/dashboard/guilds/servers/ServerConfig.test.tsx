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
function save(container: HTMLElement, name: string) {
  return within(section(container, name)).getByRole('button', { name: 'Save', hidden: true })
}
function cancel(container: HTMLElement, name: string) {
  return within(section(container, name)).getByRole('button', { name: 'Cancel', hidden: true })
}
async function ready(container: HTMLElement) {
  await vi.waitFor(() =>
    expect(row(container, 'Block Discord-banned players').querySelector('input')).not.toBeDisabled(),
  )
}
const writes = () => (fetchAPI as Mock).mock.calls.filter(([, method]) => method !== 'GET')

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

describe('server configuration section drafts', () => {
  it('shows thematic settings, their defaults and explicit section-saving guidance', async () => {
    const { container } = renderPage()
    await ready(container)
    expect(screen.getByText('In-game addon settings')).toBeInTheDocument()
    expect(screen.getByText('GWSockets')).toBeInTheDocument()
    expect(screen.getByText('Changes apply only when you save this section.')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'General' })).toContainElement(row(container, 'Addon Language'))
    expect(screen.getByRole('region', { name: 'Access and verification' })).toContainElement(
      row(container, 'Account-linking time limit (seconds)'),
    )
    expect(container.querySelectorAll('.settings-row')).toHaveLength(16)
    expect(row(container, 'Log Timestamp Format').querySelector('input')).toHaveValue('%H:%M:%S')
    for (const name of ['general', 'access', 'moderation', 'administration', 'advanced'])
      expect(save(container, name)).toBeDisabled()
    const general = screen.getByRole('region', { name: 'General' })
    const access = screen.getByRole('region', { name: 'Access and verification' })
    expect(general.parentElement).toBe(access.parentElement)
    expect(general).not.toContainElement(access)
    expect(general.querySelector('.dashboard-panel-footer')).toContainElement(save(container, 'general'))
    expect(screen.getByRole('region', { name: 'Advanced settings' })).toContainElement(
      row(container, 'Required Garry’s Mod client branch'),
    )
  })

  it('disables every control type while loading and does not expose a default as editable after a failed read', async () => {
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
    expect(save(second.container, 'moderation')).toBeDisabled()
  })

  it('recovers a failed configuration read with retry', async () => {
    vi.mocked(fetchAPI).mockResolvedValueOnce(errJson() as Response)
    const { container } = renderPage()
    await vi.waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    mockFetch()
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await ready(container)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('searches translated descriptions, filters categories and resets an empty search', async () => {
    const { container } = renderPage()
    await ready(container)
    const search = screen.getByRole('searchbox', { name: 'Search settings' })
    await fireEvent.input(search, { target: { value: 'automatic material downloading' } })
    expect(container.querySelectorAll('.settings-row')).toHaveLength(1)
    expect(row(container, 'Redownload Materials')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Advanced settings' })).toContainElement(
      row(container, 'Redownload Materials'),
    )
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

  it('keeps bool, select and text edits local until their own section is saved', async () => {
    const { container } = renderPage()
    await ready(container)
    const timeout = within(row(container, 'Timeout synchronization (unavailable)')).getByRole('checkbox')
    await fireEvent.click(timeout)
    await fireEvent.input(within(row(container, 'Support Link')).getByRole('textbox'), {
      target: { value: 'https://new.example' },
    })
    await fireEvent.change(within(row(container, 'Addon Language')).getByRole('combobox'), { target: { value: 'fr' } })
    await new Promise((resolve) => setTimeout(resolve, 550))
    expect(writes()).toHaveLength(0)
    expect(saveDashboardSettings).not.toHaveBeenCalled()
    expect(save(container, 'general')).not.toBeDisabled()
    expect(save(container, 'moderation')).not.toBeDisabled()
    await fireEvent.click(save(container, 'general'))
    await vi.waitFor(() =>
      expect(saveDashboardSettings).toHaveBeenCalledWith('server', {
        ig_supportLink: 'https://new.example',
        ig_language: 'fr',
      }),
    )
    expect(saveDashboardSettings).toHaveBeenCalledTimes(1)
    expect(save(container, 'general')).toBeDisabled()
    expect(save(container, 'moderation')).not.toBeDisabled()
    expect(timeout).toBeChecked()
    await fireEvent.click(save(container, 'moderation'))
    await vi.waitFor(() => expect(saveDashboardSettings).toHaveBeenLastCalledWith('server', { ig_syncTimeout: true }))
    expect(save(container, 'moderation')).toBeDisabled()
  })

  it('cancels only its section back to the last confirmed values without writing', async () => {
    const { container } = renderPage()
    await ready(container)
    const input = within(row(container, 'Support Link')).getByRole('textbox')
    await fireEvent.input(input, { target: { value: 'https://draft.example' } })
    await fireEvent.click(within(row(container, 'Timeout synchronization (unavailable)')).getByRole('checkbox'))
    await fireEvent.click(cancel(container, 'general'))
    expect(input).toHaveValue('https://support.example.com')
    expect(save(container, 'general')).toBeDisabled()
    expect(save(container, 'moderation')).not.toBeDisabled()
    expect(saveDashboardSettings).not.toHaveBeenCalled()
  })

  it('keeps section drafts when hidden by search or category changes', async () => {
    const { container } = renderPage()
    await ready(container)
    await fireEvent.input(within(row(container, 'Support Link')).getByRole('textbox'), {
      target: { value: 'https://draft.example' },
    })
    await fireEvent.click(screen.getByRole('button', { name: /Moderation/ }))
    expect(container.querySelector('#ig_supportLink')).not.toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: /General/ }))
    expect(within(row(container, 'Support Link')).getByRole('textbox')).toHaveValue('https://draft.example')
    await fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'nothing-matches' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }))
    expect(within(row(container, 'Support Link')).getByRole('textbox')).toHaveValue('https://draft.example')
    expect(saveDashboardSettings).not.toHaveBeenCalled()
  })

  it('keeps a failed draft for correction and retries the same complete section without false success', async () => {
    const { container } = renderPage()
    await ready(container)
    const input = within(row(container, 'Support Link')).getByRole('textbox')
    await fireEvent.input(input, { target: { value: 'https://draft.example' } })
    vi.mocked(saveDashboardSettings).mockRejectedValueOnce(new Error('Offline'))
    await fireEvent.click(save(container, 'general'))
    await vi.waitFor(() => expect(within(section(container, 'general')).getByRole('alert')).toBeInTheDocument())
    expect(input).toHaveValue('https://draft.example')
    expect(save(container, 'general')).not.toBeDisabled()
    expect(within(section(container, 'general')).queryByText('Changes saved.')).not.toBeInTheDocument()
    await fireEvent.click(save(container, 'general'))
    await vi.waitFor(() => expect(save(container, 'general')).toBeDisabled())
    expect(saveDashboardSettings).toHaveBeenCalledTimes(2)
    expect(
      vi
        .mocked(saveDashboardSettings)
        .mock.calls.every(([, values]) => values.ig_supportLink === 'https://draft.example'),
    ).toBe(true)
  })

  it('blocks duplicate submissions and locks only the section being saved', async () => {
    const { container } = renderPage()
    await ready(container)
    const input = within(row(container, 'Support Link')).getByRole('textbox')
    await fireEvent.input(input, { target: { value: 'https://draft.example' } })
    let finish!: (value: Awaited<ReturnType<typeof saveDashboardSettings>>) => void
    vi.mocked(saveDashboardSettings).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    await fireEvent.click(save(container, 'general'))
    await fireEvent.click(save(container, 'general'))
    expect(saveDashboardSettings).toHaveBeenCalledTimes(1)
    expect(input).toBeDisabled()
    expect(cancel(container, 'general')).toBeDisabled()
    expect(within(row(container, 'Timeout synchronization (unavailable)')).getByRole('checkbox')).not.toBeDisabled()
    finish({ settings: { ig_supportLink: 'https://accepted.example' }, sync: 'applied' })
    await vi.waitFor(() => expect(input).not.toBeDisabled())
    expect(input).toHaveValue('https://accepted.example')
    expect(save(container, 'general')).toBeDisabled()
    await fireEvent.input(input, { target: { value: 'https://another.example' } })
    await fireEvent.click(cancel(container, 'general'))
    expect(input).toHaveValue('https://accepted.example')
  })

  it('distinguishes a stored section waiting for synchronization from a failed save', async () => {
    const { container } = renderPage()
    await ready(container)
    vi.mocked(saveDashboardSettings).mockResolvedValueOnce({ settings: { ig_syncTimeout: true }, sync: 'pending' })
    await fireEvent.click(within(row(container, 'Timeout synchronization (unavailable)')).getByRole('checkbox'))
    await fireEvent.click(save(container, 'moderation'))
    await vi.waitFor(() =>
      expect(
        within(section(container, 'moderation')).getByText('Saved. Synchronization is pending.'),
      ).toBeInTheDocument(),
    )
    expect(save(container, 'moderation')).toBeDisabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it.each(['invalid-url', 'javascript:alert(1)'])(
    'rejects invalid or unsupported support URLs before a request: %s',
    async (value) => {
      const { container } = renderPage()
      await ready(container)
      const input = within(row(container, 'Support Link')).getByRole('textbox')
      await fireEvent.input(input, { target: { value } })
      expect(input).toHaveAttribute('aria-invalid', 'true')
      expect(within(row(container, 'Support Link')).getByRole('alert')).toBeInTheDocument()
      expect(save(container, 'general')).toBeDisabled()
      await fireEvent.click(save(container, 'general'))
      expect(saveDashboardSettings).not.toHaveBeenCalled()
      await fireEvent.input(input, { target: { value: '' } })
      expect(save(container, 'general')).not.toBeDisabled()
    },
  )

  it.each(['', '-1', '1.5'])('requires a non-negative integer kick delay: %s', async (value) => {
    const { container } = renderPage()
    await ready(container)
    const input = within(row(container, 'Account-linking time limit (seconds)')).getByRole('spinbutton')
    await fireEvent.input(input, { target: { value } })
    expect(save(container, 'access')).toBeDisabled()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(saveDashboardSettings).not.toHaveBeenCalled()
  })

  it('saves numeric delays as numbers and treats typing the unchanged number as clean', async () => {
    const { container } = renderPage()
    await ready(container)
    const input = within(row(container, 'Account-linking time limit (seconds)')).getByRole('spinbutton')
    await fireEvent.input(input, { target: { value: '120' } })
    expect(save(container, 'access')).toBeDisabled()
    await fireEvent.input(input, { target: { value: '0' } })
    await fireEvent.click(save(container, 'access'))
    await vi.waitFor(() =>
      expect(saveDashboardSettings).toHaveBeenCalledWith('server', { ig_verifyOnReadyKickTime: 0 }),
    )
  })

  it('keeps rank additions local, rejects blank and duplicate names, then saves a normalized object', async () => {
    const { container } = renderPage()
    await ready(container)
    const ranks = row(container, 'Game administrator groups')
    expect(
      within(ranks)
        .getAllByRole('textbox')
        .map((input) => (input as HTMLInputElement).value),
    ).toEqual(['mod', 'superadmin'])
    await fireEvent.click(within(ranks).getByRole('button', { name: 'Add rank' }))
    expect(save(container, 'administration')).toBeDisabled()
    const inputs = within(ranks).getAllByRole('textbox')
    await fireEvent.input(inputs[2], { target: { value: 'mod' } })
    expect(save(container, 'administration')).toBeDisabled()
    await fireEvent.input(inputs[2], { target: { value: ' admin ' } })
    expect(saveDashboardSettings).not.toHaveBeenCalled()
    await fireEvent.click(save(container, 'administration'))
    await vi.waitFor(() =>
      expect(saveDashboardSettings).toHaveBeenCalledWith('server', {
        ig_adminRank: { mod: true, superadmin: true, admin: true },
      }),
    )
    expect(
      within(ranks)
        .getAllByRole('textbox')
        .map((input) => (input as HTMLInputElement).value),
    ).toEqual(['admin', 'mod', 'superadmin'])
  })

  it('restores removed ranks on cancellation without persisting their deletion', async () => {
    const { container } = renderPage()
    await ready(container)
    const ranks = row(container, 'Game administrator groups')
    await fireEvent.click(within(ranks).getAllByRole('button', { name: 'Remove' })[0])
    expect(within(ranks).getAllByRole('textbox')).toHaveLength(1)
    await fireEvent.click(cancel(container, 'administration'))
    expect(within(ranks).getAllByRole('textbox')).toHaveLength(2)
    expect(saveDashboardSettings).not.toHaveBeenCalled()
  })

  it.each(['{"owner":true}', '[object Object]', '{broken', null])(
    'normalizes a legacy rank value without mutating the response fixture: %s',
    async (ranks) => {
      const fixture = { ...settings(), ig_adminRank: ranks }
      mockFetch(fixture)
      const { container } = renderPage()
      await ready(container)
      const values = within(row(container, 'Game administrator groups'))
        .getAllByRole('textbox')
        .map((input) => (input as HTMLInputElement).value)
      expect(values).toEqual(ranks === '{"owner":true}' ? ['owner'] : ['superadmin'])
      expect(fixture.ig_adminRank).toBe(ranks)
    },
  )

  it('does not send an unfinished draft when the page is unmounted', async () => {
    const { container, unmount } = renderPage()
    await ready(container)
    await fireEvent.input(within(row(container, 'Support Link')).getByRole('textbox'), {
      target: { value: 'https://draft.example' },
    })
    unmount()
    expect(saveDashboardSettings).not.toHaveBeenCalled()
    expect(writes()).toHaveLength(0)
  })

  it('exposes hidden dirty sections to the navigation guard and unregisters them on unmount', async () => {
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
    expect(entries.every((entry) => !entry.dirty())).toBe(true)
    await fireEvent.input(within(row(container, 'Support Link')).getByRole('textbox'), {
      target: { value: 'https://unsaved.example' },
    })
    await fireEvent.click(screen.getByRole('button', { name: /Moderation/ }))
    expect(entries.filter((entry) => entry.dirty())).toHaveLength(1)
    entries.find((entry) => entry.dirty())!.discard()
    expect(entries.every((entry) => !entry.dirty())).toBe(true)
    unmount()
    expect(unregister).toHaveBeenCalledTimes(entries.length)
  })
})
