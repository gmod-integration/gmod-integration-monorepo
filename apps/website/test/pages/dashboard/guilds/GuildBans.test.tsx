import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, screen } from '@solidjs/testing-library'
import { renderWithProviders } from '../../../testUtils.js'
import GuildBans from '../../../../src/pages/dashboard/guilds/GuildBans.js'
import { fetchAPI } from '../../../../src/utils/api.js'
import { okJson, errJson } from './servers/testHelpers.js'

vi.mock('../../../../src/utils/api.js', () => ({
  fetchAPI: vi.fn(),
  getAPIUrl: vi.fn(),
  getUrlWithActualParams: vi.fn((s: string) => s),
}))

const BANS_URL = '/users/:discordID/guilds/:guildID/bans'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function defaultBansRaw() {
  return {
    gmodBans: [
      {
        id: 1,
        userSteamID64: '765',
        adminSteamID64: '111',
        reason: 'cheating',
        linkedDiscordID: 'd1',
        discordAlsoBanned: true,
      },
      {
        id: 2,
        userSteamID64: '766',
        adminSteamID64: '111',
        reason: 'griefing',
        linkedDiscordID: null,
        discordAlsoBanned: false,
      },
    ],
    discordBans: [
      { id: 'd1', tag: 'Cheater#0001', reason: 'cheating', linkedSteamID64: '765', gmodAlsoBanned: true },
      { id: 'd2', tag: 'Rando#0002', reason: null, linkedSteamID64: null, gmodAlsoBanned: false },
    ],
  }
}

function setupFetchAPI(body: unknown = defaultBansRaw()) {
  ;(fetchAPI as Mock).mockImplementation((endpoint: string, method: string) => {
    if (endpoint === BANS_URL && method === 'GET') return Promise.resolve(okJson(body))
    return Promise.resolve(okJson({}))
  })
}

async function waitForLoaded() {
  await vi.waitFor(() => expect(screen.getByText('765')).toBeInTheDocument())
}

describe('pages/dashboard/guilds/GuildBans.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: false }))
    ;(fetchAPI as Mock).mockReset()
    setupFetchAPI()
  })

  it('renders both GMod and Discord ban lists', async () => {
    renderWithProviders(() => <GuildBans />)
    await waitForLoaded()

    expect(screen.getByText('766')).toBeInTheDocument()
    expect(screen.getByText('Cheater#0001')).toBeInTheDocument()
    expect(screen.getByText('Rando#0002')).toBeInTheDocument()
  })

  it('flags a GMod ban whose linked account is also banned on Discord', async () => {
    const { container } = renderWithProviders(() => <GuildBans />)
    await waitForLoaded()

    const rows = container.querySelectorAll('tbody tr')
    // First GMod row (765) is cross-flagged, second (766) is not.
    expect(rows[0].querySelector('.fa-discord')).toBeInTheDocument()
    expect(rows[1].querySelector('.fa-discord')).not.toBeInTheDocument()
  })

  it('flags a Discord ban whose linked account is also banned on GMod', async () => {
    const { container } = renderWithProviders(() => <GuildBans />)
    await waitForLoaded()
    await vi.waitFor(() => expect(screen.getByText('Cheater#0001')).toBeInTheDocument())

    const discordTable = container.querySelectorAll('table')[1]
    const rows = discordTable.querySelectorAll('tbody tr')
    expect(rows[0].querySelector('.fa-gamepad')).toBeInTheDocument()
    expect(rows[1].querySelector('.fa-gamepad')).not.toBeInTheDocument()
  })

  it('shows loading spinners while bans is loading', () => {
    ;(fetchAPI as Mock).mockReturnValue(new Promise(() => {}))
    const { container } = renderWithProviders(() => <GuildBans />)
    expect(container.querySelectorAll('.loading-spinner').length).toBeGreaterThan(0)
  })

  it('shows empty-state messages when the request is not ok (fetchBans swallows it to an empty result)', async () => {
    ;(fetchAPI as Mock).mockResolvedValue(errJson())
    renderWithProviders(() => <GuildBans />)
    await vi.waitFor(() => expect(screen.getByText('No GMod bans found.')).toBeInTheDocument())
    expect(screen.getByText('No Discord bans found.')).toBeInTheDocument()
  })

  it('shows a failure message when the resource itself rejects', async () => {
    ;(fetchAPI as Mock).mockRejectedValue(new Error('network down'))
    renderWithProviders(() => <GuildBans />)
    await vi.waitFor(() => expect(screen.getAllByText('Failed to load bans').length).toBeGreaterThan(0))
  })

  it('shows empty-state messages when there are no bans', async () => {
    setupFetchAPI({ gmodBans: [], discordBans: [] })
    renderWithProviders(() => <GuildBans />)
    await vi.waitFor(() => expect(screen.getByText('No GMod bans found.')).toBeInTheDocument())
    expect(screen.getByText('No Discord bans found.')).toBeInTheDocument()
  })
})
