import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../../../../../testUtils.js'
import { okJson, errJson } from '../testHelpers.js'

vi.mock('../../../../../../src/utils/api.js', () => ({
  fetchAPI: vi.fn(() => Promise.resolve({ ok: true, json: async () => [] })),
  getAPIUrl: vi.fn(),
  getUrlWithActualParams: vi.fn((s: string) => s),
}))

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
  })

  it('shows "No Logs Channel" when no channel is configured', async () => {
    renderPage()
    await waitForLoaded()
    await vi.waitFor(() => expect(screen.getByText('No Logs Channel')).toBeInTheDocument())
  })

  it('renders the configured logs channel and a Remove Channel button', async () => {
    setupFetchAPI({ logsChannel: { channelID: 'c1' } })
    renderPage()
    await waitForLoaded()
    await vi.waitFor(() => expect(screen.getByText('#general')).toBeInTheDocument())
    expect(screen.getByText('Remove Channel')).toBeInTheDocument()
  })

  it('does not show Remove Channel when no channel is configured', async () => {
    renderPage()
    await waitForLoaded()
    await vi.waitFor(() => expect(screen.queryByText('Remove Channel')).not.toBeInTheDocument())
  })

  it('toggles the hide-IP checkbox and updates on success', async () => {
    renderPage()
    await waitForLoaded()
    const checkbox = screen.getByRole('checkbox', { name: 'Hide IP in discord logs:' }) as HTMLInputElement
    expect(checkbox.checked).toBe(false)
    ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
      if (endpoint === HIDE_IP_URL && method === 'PUT') return Promise.resolve(okJson({ value: true }))
      return Promise.resolve(okJson([]))
    })
    await fireEvent.click(checkbox)
    await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(HIDE_IP_URL, 'PUT', { value: true }))
    await vi.waitFor(() => expect(checkbox.checked).toBe(true))
  })

  it('toggles the attach-log-file checkbox and updates on success', async () => {
    renderPage()
    await waitForLoaded()
    const checkbox = screen.getByRole('checkbox', { name: 'Attach log information file:' }) as HTMLInputElement
    expect(checkbox.checked).toBe(false)
    ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
      if (endpoint === LOG_FILE_URL && method === 'PUT') return Promise.resolve(okJson({ value: true }))
      return Promise.resolve(okJson([]))
    })
    await fireEvent.click(checkbox)
    await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(LOG_FILE_URL, 'PUT', { value: true }))
    await vi.waitFor(() => expect(checkbox.checked).toBe(true))
  })

  it.each([
    [HIDE_IP_URL, 'Hide IP in discord logs:'],
    [LOG_FILE_URL, 'Attach log information file:'],
  ])('blocks duplicate changes, restores failed values and allows retry for %s', async (url, label) => {
    renderPage()
    await waitForLoaded()
    const checkbox = screen.getByRole('checkbox', { name: label })
    let finish!: (value: ReturnType<typeof errJson>) => void
    ;(fetchAPI as Mock).mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
    await fireEvent.click(checkbox)
    expect(checkbox).toBeDisabled()
    expect(checkbox).toHaveAttribute('aria-busy', 'true')
    await fireEvent.click(checkbox)
    expect(
      (fetchAPI as Mock).mock.calls.filter(([endpoint, method]) => endpoint === url && method === 'PUT'),
    ).toHaveLength(1)
    finish(errJson())
    await vi.waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Unable to save'))
    expect(checkbox).not.toBeChecked()
    expect(checkbox).not.toBeDisabled()
    ;(fetchAPI as Mock).mockResolvedValueOnce(okJson({ value: true }))
    await fireEvent.click(checkbox)
    await vi.waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument())
    expect(checkbox).toBeChecked()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
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
    await fireEvent.click(screen.getByText('Remove Channel'))
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
    await fireEvent.click(screen.getByText('Remove Channel'))
    await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(LOGS_CHANNEL_URL, 'DELETE'))
    expect(screen.getByText('#general')).toBeInTheDocument()
  })
})
