import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../../../../testUtils.js'
import { errJson, okJson } from './testHelpers.js'

vi.mock('../../../../../src/utils/api.js', () => ({
  fetchAPI: vi.fn(),
  getAPIUrl: vi.fn(() => 'https://api.example.com/v3'),
  getUrlWithActualParams: vi.fn((value: string) => value),
}))
const { fetchAPI } = await import('../../../../../src/utils/api.js')
const { guildChannelsMutate } = await import('../../../../../src/pages/dashboard/guilds/GuildInformations.js')
const { ServerBugsParameters } =
  await import('../../../../../src/pages/dashboard/guilds/servers/ServerBugsParameters.js')
const { default: ServerBugs } = await import('../../../../../src/pages/dashboard/guilds/servers/ServerBugs.js')

const endpoint = '/users/:discordID/guilds/:guildID/servers/:serverID/bugs/channels'
const channelID = '111111111111111111'
const channels = [{ id: channelID, name: 'bug-reports', type: 0, position: 0, parentID: null }]
const selector = () => document.querySelector<HTMLDialogElement>('#select-bug-reports-channel')!
const removal = () => document.querySelector<HTMLDialogElement>('#remove-bug-reports-channel')!
function renderPage(history = false) {
  return renderWithProviders(() => (history ? <ServerBugs /> : <ServerBugsParameters />), {
    path: '/dashboard/guilds/:guildID/config/servers/:serverID/bugs',
    history: historyAt('/dashboard/guilds/g1/config/servers/s1/bugs'),
  })
}
afterEach(cleanup)
beforeEach(() => {
  window.localStorage.clear()
  vi.mocked(fetchAPI)
    .mockReset()
    .mockImplementation(async (path) => okJson(path === endpoint ? {} : channels) as Response)
  guildChannelsMutate(channels)
})

describe('bug report Discord destination', () => {
  it('loads and confirms its own destination without touching Lua error settings', async () => {
    renderPage()
    await vi.waitFor(() => expect(screen.getByText('No destination channel')).toBeInTheDocument())
    expect(screen.getByText('Bug reports on Discord')).toBeInTheDocument()
    expect(fetchAPI).toHaveBeenCalledWith(endpoint, 'GET')
    await fireEvent.click(screen.getByRole('button', { name: 'Select a channel' }))
    await vi.waitFor(() => expect(selector().querySelector('select')).toBeInTheDocument())
    await fireEvent.change(selector().querySelector('select')!, { target: { value: channelID } })
    expect(vi.mocked(fetchAPI).mock.calls.every(([, method]) => method === 'GET')).toBe(true)
    vi.mocked(fetchAPI).mockImplementation(
      async (path, method) => okJson(path === endpoint && method === 'POST' ? { channelID } : channels) as Response,
    )
    await fireEvent.click(within(selector()).getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(screen.getByText('#bug-reports')).toBeInTheDocument())
    expect(fetchAPI).toHaveBeenCalledWith(endpoint, 'POST', { channelID })
    expect(selector().open).toBe(false)
    expect(vi.mocked(fetchAPI).mock.calls.some(([path]) => path.includes('/errors/channels'))).toBe(false)
  })

  it('keeps failed removal retryable and clears the destination only after confirmation', async () => {
    vi.mocked(fetchAPI).mockImplementation(async (path, method) => {
      if (path === endpoint && method === 'GET') return okJson({ channelID }) as Response
      if (path === endpoint && method === 'DELETE') return errJson() as Response
      return okJson(channels) as Response
    })
    renderPage()
    await vi.waitFor(() => expect(screen.getByText('#bug-reports')).toBeInTheDocument())
    await fireEvent.click(screen.getByRole('button', { name: 'Remove destination' }))
    expect(vi.mocked(fetchAPI).mock.calls.some(([, method]) => method === 'DELETE')).toBe(false)
    await fireEvent.click(within(removal()).getByRole('button', { name: 'Remove destination' }))
    await vi.waitFor(() => expect(within(removal()).getByRole('alert')).toHaveTextContent('The action failed'))
    expect(screen.getByText('#bug-reports')).toBeInTheDocument()
    vi.mocked(fetchAPI).mockResolvedValue(okJson({}) as Response)
    await fireEvent.click(within(removal()).getByRole('button', { name: 'Remove destination' }))
    await vi.waitFor(() => expect(screen.getByText('No destination channel')).toBeInTheDocument())
    expect(removal().open).toBe(false)
    expect(fetchAPI).toHaveBeenCalledWith(endpoint, 'DELETE')
  })

  it('keeps saved bug reports and screenshot access visible when destination loading fails', async () => {
    vi.mocked(fetchAPI).mockImplementation(async (path) => {
      if (path === endpoint) return errJson() as Response
      if (path === '/users/:discordID/guilds/:guildID/servers/:serverID/bugs')
        return okJson([
          {
            id: 42,
            serverID: 's1',
            steamID64: '76561198012345678',
            description: 'A saved player report',
            status: 'open',
            importance: 'high',
            actual: 'The game crashed',
            expected: 'The game works',
            steps: 'Open the menu',
            screenshot: 'report.png',
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ]) as Response
      return okJson(channels) as Response
    })
    const { container } = renderPage(true)
    await vi.waitFor(() => expect(screen.getByText('A saved player report')).toBeInTheDocument())
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load the bug report destination.')
    await fireEvent.click(screen.getByRole('button', { name: 'Show More' }))
    expect(screen.getByText('The game crashed')).toBeInTheDocument()
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://api.example.com/v3/screenshots/report.png')
  })
})
