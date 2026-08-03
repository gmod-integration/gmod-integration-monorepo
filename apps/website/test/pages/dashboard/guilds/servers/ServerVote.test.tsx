import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../../../../testUtils.js'
import { okJson, errJson, stubDialogGlobal, clearDialogGlobals } from './testHelpers.js'

vi.mock('../../../../../src/utils/api.js', () => ({
  // GuildInformations.tsx's module-level guildChannels resource fires its fetch immediately at
  // import time (before any beforeEach runs), so the mock factory itself needs a working default
  // rather than relying on a later mockImplementation call - see GuildAutoRoles.test.tsx.
  fetchAPI: vi.fn(() => Promise.resolve({ ok: true, json: async () => [] })),
  getAPIUrl: vi.fn(),
  getUrlWithActualParams: vi.fn((s: string) => s),
}))

// GuildInformations.tsx's module-level guildChannels resource is shared across every test in this
// file (Solid resources created via createResource at module scope survive across tests) - mutate
// it directly instead of routing through fetchAPI, matching GuildAutoRoles.test.tsx's approach.
const { guildChannelsMutate } = await import('../../../../../src/pages/dashboard/guilds/GuildInformations.js')
const { fetchAPI } = await import('../../../../../src/utils/api.js')
const ServerVote = (await import('../../../../../src/pages/dashboard/guilds/servers/ServerVote.js')).default

const VOTE_URL = '/users/:discordID/guilds/:guildID/servers/:serverID/votes'

function defaultChannels() {
  return [{ id: 'c1', name: 'general', type: 0, textBased: true }]
}

function setupFetchAPI(votes: unknown = {}) {
  ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
    if (endpoint === VOTE_URL && method === 'GET') return Promise.resolve(okJson(votes))
    return Promise.resolve(okJson([]))
  })
}

function renderPage() {
  return renderWithProviders(() => <ServerVote />, {
    path: '/dashboard/guilds/:guildID/config/servers/:serverID/vote',
    history: historyAt('/dashboard/guilds/g1/config/servers/s1/vote'),
  })
}

afterEach(() => {
  cleanup()
  clearDialogGlobals('select_channel_modal')
})

describe('pages/dashboard/guilds/servers/ServerVote.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: false }))
    ;(fetchAPI as Mock).mockReset()
    setupFetchAPI()
    guildChannelsMutate(defaultChannels())
  })

  it('renders the panel title and description', async () => {
    renderPage()
    expect(screen.getByText('Vote')).toBeInTheDocument()
    expect(screen.getByText('Configure voting notifications for your server')).toBeInTheDocument()
  })

  it('shows "No channel selected" and a disabled Select Channel button while votes is loading', () => {
    ;(fetchAPI as Mock).mockImplementation(() => new Promise(() => {}))
    renderPage()
    expect(screen.getByText('No channel selected')).toBeInTheDocument()
    expect(screen.getByText('Select Channel')).toBeDisabled()
    expect(screen.queryByText('Delete Channel')).not.toBeInTheDocument()
  })

  it('shows "No channel selected" and no Delete button once loaded with no channel configured', async () => {
    renderPage()
    await vi.waitFor(() => expect(screen.getByText('Select Channel')).not.toBeDisabled())
    expect(screen.getByText('No channel selected')).toBeInTheDocument()
    expect(screen.queryByText('Delete Channel')).not.toBeInTheDocument()
  })

  it('renders gracefully with no channel when the initial votes GET is not ok', async () => {
    ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
      if (endpoint === VOTE_URL && method === 'GET') return Promise.resolve(errJson())
      return Promise.resolve(okJson([]))
    })
    renderPage()
    await vi.waitFor(() => expect(screen.getByText('Select Channel')).not.toBeDisabled())
    expect(screen.getByText('No channel selected')).toBeInTheDocument()
  })

  it('renders the configured channel and a Delete Channel button once loaded with a channel', async () => {
    setupFetchAPI({ channelID: 'c1' })
    renderPage()
    await vi.waitFor(() => expect(screen.getByText('#general')).toBeInTheDocument())
    expect(screen.queryByText('No channel selected')).not.toBeInTheDocument()
    expect(screen.getByText('Delete Channel')).toBeInTheDocument()
  })

  it('opens the channel selector modal and refetches guild channels on Select Channel click', async () => {
    const { container } = renderPage()
    await vi.waitFor(() => expect(screen.getByText('Select Channel')).not.toBeDisabled())
    const modal = stubDialogGlobal(container, 'select_channel_modal')
    await fireEvent.click(screen.getByText('Select Channel'))
    expect(modal.showModal).toHaveBeenCalled()
    expect(fetchAPI).toHaveBeenCalledWith('/users/:discordID/guilds/:guildID/channels', 'GET')
  })

  it('sends the chosen channel and mutates votes on success', async () => {
    const { container } = renderPage()
    await vi.waitFor(() => expect(screen.getByText('Select Channel')).not.toBeDisabled())
    stubDialogGlobal(container, 'select_channel_modal')
    ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
      if (endpoint === VOTE_URL && method === 'POST') return Promise.resolve(okJson({ channelID: 'c1' }))
      return Promise.resolve(okJson([]))
    })
    const modal = container.querySelector('#select_channel_modal') as HTMLElement
    const select = within(modal).getByRole('combobox', { hidden: true }) as HTMLSelectElement
    await fireEvent.change(select, { target: { value: 'c1' } })
    await vi.waitFor(() =>
      expect(fetchAPI).toHaveBeenCalledWith(VOTE_URL, 'POST', { channelID: 'c1' }),
    )
    await vi.waitFor(() => expect(screen.getByText('#general')).toBeInTheDocument())
  })

  it('does not update the channel when the send request fails', async () => {
    const { container } = renderPage()
    await vi.waitFor(() => expect(screen.getByText('Select Channel')).not.toBeDisabled())
    stubDialogGlobal(container, 'select_channel_modal')
    ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
      if (endpoint === VOTE_URL && method === 'POST') return Promise.resolve(errJson())
      return Promise.resolve(okJson([]))
    })
    const modal = container.querySelector('#select_channel_modal') as HTMLElement
    const select = within(modal).getByRole('combobox', { hidden: true }) as HTMLSelectElement
    await fireEvent.change(select, { target: { value: 'c1' } })
    await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(VOTE_URL, 'POST', { channelID: 'c1' }))
    expect(screen.getByText('No channel selected')).toBeInTheDocument()
  })

  it('removes the channel via Delete Channel and mutates votes to empty', async () => {
    setupFetchAPI({ channelID: 'c1' })
    renderPage()
    await vi.waitFor(() => expect(screen.getByText('Delete Channel')).toBeInTheDocument())
    ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
      if (endpoint === VOTE_URL && method === 'DELETE') return Promise.resolve(okJson({}))
      return Promise.resolve(okJson([]))
    })
    await fireEvent.click(screen.getByText('Delete Channel'))
    await vi.waitFor(() => expect(screen.getByText('No channel selected')).toBeInTheDocument())
    expect(screen.queryByText('Delete Channel')).not.toBeInTheDocument()
  })

  it('keeps the channel shown when the delete request fails', async () => {
    setupFetchAPI({ channelID: 'c1' })
    renderPage()
    await vi.waitFor(() => expect(screen.getByText('Delete Channel')).toBeInTheDocument())
    ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
      if (endpoint === VOTE_URL && method === 'DELETE') return Promise.resolve(errJson())
      return Promise.resolve(okJson([]))
    })
    await fireEvent.click(screen.getByText('Delete Channel'))
    await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(VOTE_URL, 'DELETE'))
    expect(screen.getByText('Delete Channel')).toBeInTheDocument()
    expect(screen.getByText('#general')).toBeInTheDocument()
  })
})
