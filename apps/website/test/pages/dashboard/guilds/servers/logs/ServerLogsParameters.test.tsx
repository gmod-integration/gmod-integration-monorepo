import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../../../../../testUtils.js'
import { okJson, errJson } from '../testHelpers.js'

vi.mock('../../../../../../src/utils/api.js', () => ({
  fetchAPI: vi.fn(() => Promise.resolve({ ok: true, json: async () => [] })),
  getAPIUrl: vi.fn(),
  getUrlWithActualParams: vi.fn((s: string) => s),
}))

vi.mock('../../../../../../src/utils/dashboardSettings.js', () => ({ saveDashboardSettings: vi.fn() }))
const { saveDashboardSettings } = await import('../../../../../../src/utils/dashboardSettings.js')

const { fetchAPI } = await import('../../../../../../src/utils/api.js')
const { guildChannelsMutate } = await import('../../../../../../src/pages/dashboard/guilds/GuildInformations.js')
const { ServerLogsParameters } =
  await import('../../../../../../src/pages/dashboard/guilds/servers/logs/ServerLogsParameters.js')

const LOGS_CHANNEL_URL = '/users/:discordID/guilds/:guildID/servers/:serverID/logs/channels'
const HIDE_IP_URL = '/users/:discordID/guilds/:guildID/servers/:serverID/settings/log_hide_ip'
const LOG_FILE_URL = '/users/:discordID/guilds/:guildID/servers/:serverID/settings/log_include_file'

afterEach(() => cleanup())

function setupFetchAPI({
  logsChannel = {},
  hideIP = { value: false },
  logFile = { value: false },
}: { logsChannel?: unknown; hideIP?: unknown; logFile?: unknown } = {}) {
  ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
    if (endpoint === LOGS_CHANNEL_URL && method === 'GET') return Promise.resolve(okJson(logsChannel))
    if (endpoint === HIDE_IP_URL && method === 'GET') return Promise.resolve(okJson(hideIP))
    if (endpoint === LOG_FILE_URL && method === 'GET') return Promise.resolve(okJson(logFile))
    return Promise.resolve(okJson([]))
  })
}

function renderPage() {
  return renderWithProviders(() => <ServerLogsParameters />, {
    path: '/dashboard/guilds/:guildID/config/servers/:serverID/logs',
    history: historyAt('/dashboard/guilds/g1/config/servers/s1/logs'),
  })
}

async function waitForLoaded() {
  // Wait for all three independent resources (logsChannel, logHideIP, logFile) to resolve -
  // the panel title itself renders synchronously regardless of resource state, so waiting on it
  // alone doesn't actually wait for anything.
  await vi.waitFor(() => {
    expect(document.querySelectorAll('input[type="checkbox"]')).toHaveLength(2)
    expect(screen.getByText('Select Channel')).not.toBeDisabled()
  })
}

describe('pages/dashboard/guilds/servers/logs/ServerLogsParameters.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
    guildChannelsMutate([{ id: 'c1', name: 'general', type: 0, position: 0, parentID: null }])
    ;(fetchAPI as Mock).mockReset()
    setupFetchAPI()
    vi.mocked(saveDashboardSettings)
      .mockReset()
      .mockImplementation(async (_scope, settings) => ({ settings, sync: 'applied' }))
  })

  it('shows "No Logs Channel" when no channel is configured', async () => {
    renderPage()
    await waitForLoaded()
    await vi.waitFor(() => expect(screen.getByText('No Logs Channel')).toBeInTheDocument())
    const destination = screen.getByText('No Logs Channel').closest<HTMLElement>('.dashboard-panel')!
    const content = screen
      .getByRole('checkbox', { name: 'Hide IP addresses in Discord logs' })
      .closest<HTMLElement>('.dashboard-panel')!
    expect(destination).not.toBe(content)
    expect(within(destination).queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
    expect(within(content).queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
    expect(within(content).getByRole('status')).toBeInTheDocument()
  })

  it('renders the configured logs channel and a Remove Channel button', async () => {
    setupFetchAPI({ logsChannel: { channelID: 'c1' } })
    renderPage()
    await waitForLoaded()
    await vi.waitFor(() => expect(screen.getByText('#general')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Remove destination' })).toBeInTheDocument()
  })

  it('does not show Remove Channel when no channel is configured', async () => {
    renderPage()
    await waitForLoaded()
    await vi.waitFor(() => expect(screen.queryByRole('button', { name: 'Remove destination' })).not.toBeInTheDocument())
  })

  it('automatically batches both content settings into one save', async () => {
    renderPage()
    await waitForLoaded()
    const hide = screen.getByRole('checkbox', { name: 'Hide IP addresses in Discord logs' })
    const file = screen.getByRole('checkbox', { name: 'Attach event data as a file' })
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
    await fireEvent.click(hide)
    await fireEvent.click(file)
    expect(saveDashboardSettings).not.toHaveBeenCalled()
    expect((fetchAPI as Mock).mock.calls.some(([, method]) => method === 'PUT')).toBe(false)
    await vi.waitFor(() =>
      expect(saveDashboardSettings).toHaveBeenCalledWith('server', { log_hide_ip: true, log_include_file: true }),
    )
    expect(hide).toBeChecked()
    expect(file).toBeChecked()
    expect(saveDashboardSettings).toHaveBeenCalledTimes(1)
  })
  it('retains content after an autosave failure and retries while keeping inputs editable', async () => {
    renderPage()
    await waitForLoaded()
    const checkbox = screen.getByRole('checkbox', { name: 'Hide IP addresses in Discord logs' })
    vi.mocked(saveDashboardSettings).mockRejectedValueOnce(new Error('Offline'))
    await fireEvent.click(checkbox)
    await vi.waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Unable to save'))
    expect(checkbox).toBeChecked()
    let finish!: () => void
    vi.mocked(saveDashboardSettings).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ settings: { log_hide_ip: true, log_include_file: false }, sync: 'pending' })
        }),
    )
    const retry = screen.getByRole('button', { name: 'Try again' })
    await fireEvent.click(retry)
    await fireEvent.click(retry)
    expect(checkbox).toBeEnabled()
    expect(saveDashboardSettings).toHaveBeenCalledTimes(2)
    finish()
    await vi.waitFor(() => expect(screen.getByText('Saved. Synchronization is pending.')).toBeInTheDocument())
    expect(checkbox).toBeChecked()
  })
  it('shows a retryable error when content fails to load and never presents false default settings', async () => {
    ;(fetchAPI as Mock).mockImplementation((endpoint: string) =>
      Promise.resolve(endpoint === HIDE_IP_URL ? errJson() : okJson({})),
    )
    renderPage()
    await vi.waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    setupFetchAPI()
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitForLoaded()
  })

  it('opens the channel selector modal on Select Channel', async () => {
    renderPage()
    await waitForLoaded()
    const dialog = document.querySelector('#select_channel_modal') as HTMLDialogElement
    vi.spyOn(dialog, 'showModal').mockImplementation(() => {})
    ;(globalThis as Record<string, unknown>).select_channel_modal = dialog
    await fireEvent.click(screen.getByText('Select Channel'))
    expect(dialog.showModal).toHaveBeenCalled()
    delete (globalThis as Record<string, unknown>).select_channel_modal
  })

  it('sends the selected channel and mutates the resource via the channel selector callback', async () => {
    renderPage()
    await waitForLoaded()
    ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
      if (endpoint === LOGS_CHANNEL_URL && method === 'POST') return Promise.resolve(okJson({ channelID: 'c1' }))
      return Promise.resolve(okJson([]))
    })
    const select = document.querySelector('#select_channel_modal select') as HTMLSelectElement
    await fireEvent.change(select, { target: { value: 'c1' } })
    expect((fetchAPI as Mock).mock.calls.some(([, method]) => method === 'POST')).toBe(false)
    await fireEvent.click(within(select.closest('dialog')!).getByRole('button', { name: 'Save', hidden: true }))
    await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(LOGS_CHANNEL_URL, 'POST', { channelID: 'c1' }))
    await vi.waitFor(() => expect(screen.getByText('#general')).toBeInTheDocument())
  })

  it('does not mutate the channel when sending the selected channel fails', async () => {
    renderPage()
    await waitForLoaded()
    ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
      if (endpoint === LOGS_CHANNEL_URL && method === 'POST') return Promise.resolve(errJson())
      return Promise.resolve(okJson([]))
    })
    const select = document.querySelector('#select_channel_modal select') as HTMLSelectElement
    await fireEvent.change(select, { target: { value: 'c1' } })
    expect((fetchAPI as Mock).mock.calls.some(([, method]) => method === 'POST')).toBe(false)
    await fireEvent.click(within(select.closest('dialog')!).getByRole('button', { name: 'Save', hidden: true }))
    await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(LOGS_CHANNEL_URL, 'POST', { channelID: 'c1' }))
    expect(screen.queryByText('#general')).not.toBeInTheDocument()
  })

  it('removes the logs channel and clears the resource on success', async () => {
    setupFetchAPI({ logsChannel: { channelID: 'c1' } })
    renderPage()
    await waitForLoaded()
    await vi.waitFor(() => expect(screen.getByText('#general')).toBeInTheDocument())
    ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
      if (endpoint === LOGS_CHANNEL_URL && method === 'DELETE') return Promise.resolve(okJson({}))
      return Promise.resolve(okJson([]))
    })
    await fireEvent.click(screen.getByRole('button', { name: 'Remove destination' }))
    expect((fetchAPI as Mock).mock.calls.some(([, method]) => method === 'DELETE')).toBe(false)
    await fireEvent.click(
      within(document.querySelector('#remove-logs-channel')!).getByRole('button', { name: 'Remove destination' }),
    )
    await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(LOGS_CHANNEL_URL, 'DELETE'))
    await vi.waitFor(() => expect(screen.queryByText('#general')).not.toBeInTheDocument())
  })

  it('does not clear the channel when removing it fails', async () => {
    setupFetchAPI({ logsChannel: { channelID: 'c1' } })
    renderPage()
    await waitForLoaded()
    await vi.waitFor(() => expect(screen.getByText('#general')).toBeInTheDocument())
    ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
      if (endpoint === LOGS_CHANNEL_URL && method === 'DELETE') return Promise.resolve(errJson())
      return Promise.resolve(okJson([]))
    })
    await fireEvent.click(screen.getByRole('button', { name: 'Remove destination' }))
    expect((fetchAPI as Mock).mock.calls.some(([, method]) => method === 'DELETE')).toBe(false)
    await fireEvent.click(
      within(document.querySelector('#remove-logs-channel')!).getByRole('button', { name: 'Remove destination' }),
    )
    await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(LOGS_CHANNEL_URL, 'DELETE'))
    expect(screen.getByText('#general')).toBeInTheDocument()
  })
})
