import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../../../../../testUtils.js'
import { okJson, errJson } from '../testHelpers.js'

vi.mock('../../../../../../src/utils/api.js', () => ({
  fetchAPI: vi.fn(() => Promise.resolve({ ok: true, json: async () => [] })),
  getAPIUrl: vi.fn(),
  getUrlWithActualParams: vi.fn((s: string) => s),
}))

const { fetchAPI } = await import('../../../../../../src/utils/api.js')
const { guildChannelsMutate } = await import('../../../../../../src/pages/dashboard/guilds/GuildInformations.js')
const { ServerScreenshotsParameters } = await import(
  '../../../../../../src/pages/dashboard/guilds/servers/screenshots/ServerScreenshotsParameters.js'
)

const SCREENSHOT_CHANNEL_URL = '/users/:discordID/guilds/:guildID/servers/:serverID/screenshots/channel'

afterEach(() => cleanup())

function setupFetchAPI(screenshotChannel: unknown = {}) {
  ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
    if (endpoint === SCREENSHOT_CHANNEL_URL && method === 'GET') return Promise.resolve(okJson(screenshotChannel))
    return Promise.resolve(okJson([]))
  })
}

function renderPage() {
  return renderWithProviders(() => <ServerScreenshotsParameters />, {
    path: '/dashboard/guilds/:guildID/config/servers/:serverID/screenshots',
    history: historyAt('/dashboard/guilds/g1/config/servers/s1/screenshots'),
  })
}

async function waitForLoaded() {
  await vi.waitFor(() => expect(screen.getByText('Select Channel')).not.toBeDisabled())
}

describe('pages/dashboard/guilds/servers/screenshots/ServerScreenshotsParameters.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
    guildChannelsMutate([{ id: 'c1', name: 'general', type: 0, position: 0, parentID: null }])
    ;(fetchAPI as Mock).mockReset()
    setupFetchAPI()
  })

  it('shows "No channel selected" when no channel is configured', async () => {
    renderPage()
    await waitForLoaded()
    expect(screen.getByText('No channel selected')).toBeInTheDocument()
  })

  it('renders the configured channel and a Delete Channel button', async () => {
    setupFetchAPI({ channelID: 'c1' })
    renderPage()
    await waitForLoaded()
    expect(screen.getByText('#general')).toBeInTheDocument()
    expect(screen.getByText('Delete Channel')).toBeInTheDocument()
  })

  it('does not show Delete Channel when no channel is configured', async () => {
    renderPage()
    await waitForLoaded()
    expect(screen.queryByText('Delete Channel')).not.toBeInTheDocument()
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
      if (endpoint === SCREENSHOT_CHANNEL_URL && method === 'POST') return Promise.resolve(okJson({ channelID: 'c1' }))
      return Promise.resolve(okJson([]))
    })
    const select = document.querySelector('#select_channel_modal select') as HTMLSelectElement
    await fireEvent.change(select, { target: { value: 'c1' } })
    await vi.waitFor(() =>
      expect(fetchAPI).toHaveBeenCalledWith(SCREENSHOT_CHANNEL_URL, 'POST', { channelID: 'c1' }),
    )
    await vi.waitFor(() => expect(screen.getByText('#general')).toBeInTheDocument())
  })

  it('does not mutate the channel when sending the selected channel fails', async () => {
    renderPage()
    await waitForLoaded()
    ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
      if (endpoint === SCREENSHOT_CHANNEL_URL && method === 'POST') return Promise.resolve(errJson())
      return Promise.resolve(okJson([]))
    })
    const select = document.querySelector('#select_channel_modal select') as HTMLSelectElement
    await fireEvent.change(select, { target: { value: 'c1' } })
    await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(SCREENSHOT_CHANNEL_URL, 'POST', { channelID: 'c1' }))
    expect(screen.queryByText('#general')).not.toBeInTheDocument()
  })

  it('removes the screenshots channel and clears the resource on success', async () => {
    setupFetchAPI({ channelID: 'c1' })
    renderPage()
    await waitForLoaded()
    await vi.waitFor(() => expect(screen.getByText('#general')).toBeInTheDocument())
    ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
      if (endpoint === SCREENSHOT_CHANNEL_URL && method === 'DELETE') return Promise.resolve(okJson({}))
      return Promise.resolve(okJson([]))
    })
    await fireEvent.click(screen.getByText('Delete Channel'))
    await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(SCREENSHOT_CHANNEL_URL, 'DELETE'))
    await vi.waitFor(() => expect(screen.queryByText('#general')).not.toBeInTheDocument())
  })

  it('does not clear the channel when removing it fails', async () => {
    setupFetchAPI({ channelID: 'c1' })
    renderPage()
    await waitForLoaded()
    await vi.waitFor(() => expect(screen.getByText('#general')).toBeInTheDocument())
    ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
      if (endpoint === SCREENSHOT_CHANNEL_URL && method === 'DELETE') return Promise.resolve(errJson())
      return Promise.resolve(okJson([]))
    })
    await fireEvent.click(screen.getByText('Delete Channel'))
    await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(SCREENSHOT_CHANNEL_URL, 'DELETE'))
    expect(screen.getByText('#general')).toBeInTheDocument()
  })
})
