import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
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

  it('paginates each platform independently and keeps controls outside the tables', async () => {
    const gmodBans = Array.from({ length: 55 }, (_, index) => ({
      ...defaultBansRaw().gmodBans[0],
      id: index + 1,
      userSteamID64: `steam-${index + 1}`,
      reason: `game-reason-${index + 1}`,
    }))
    const discordBans = Array.from({ length: 55 }, (_, index) => ({
      ...defaultBansRaw().discordBans[0],
      id: `discord-${index + 1}`,
      tag: `Discord user ${index + 1}`,
    }))
    setupFetchAPI({ gmodBans, discordBans })
    renderWithProviders(() => <GuildBans />)
    await vi.waitFor(() => expect(screen.getByText('steam-1')).toBeInTheDocument())
    const game = within(screen.getByRole('region', { name: 'GMod Bans' }))
    const discord = within(screen.getByRole('region', { name: 'Discord Bans' }))
    expect(game.getAllByRole('row')).toHaveLength(26)
    expect(game.getByRole('navigation', { name: 'Pagination' }).closest('table')).toBeNull()
    expect(discord.getByRole('navigation', { name: 'Pagination' }).closest('table')).toBeNull()
    await fireEvent.click(game.getByRole('button', { name: 'Next page' }))
    expect(game.queryByText('steam-1')).not.toBeInTheDocument()
    expect(game.getByText('steam-26')).toBeInTheDocument()
    expect(game.getByRole('button', { name: 'Page 2 of 3' })).toBeInTheDocument()
    expect(discord.getByText('Discord user 1')).toBeInTheDocument()
    expect(discord.getByRole('button', { name: 'Page 1 of 3' })).toBeInTheDocument()
    await fireEvent.click(discord.getByRole('button', { name: 'Next page' }))
    expect(discord.getByText('Discord user 26')).toBeInTheDocument()
    expect(game.getByText('steam-26')).toBeInTheDocument()
    await fireEvent.change(game.getByRole('combobox', { name: 'Rows per page' }), { target: { value: '50' } })
    expect(game.getByText('steam-1')).toBeInTheDocument()
    expect(game.getAllByRole('row')).toHaveLength(51)
    await fireEvent.click(game.getByRole('button', { name: 'Next page' }))
    expect(game.getAllByRole('row')).toHaveLength(6)
    expect(game.getByRole('button', { name: 'Next page' })).toBeDisabled()
    expect(fetchAPI).toHaveBeenCalledTimes(1)
  })

  it('flags a GMod ban whose linked account is also banned on Discord', async () => {
    const { container } = renderWithProviders(() => <GuildBans />)
    await waitForLoaded()

    const rows = container.querySelectorAll('tbody tr')
    // First GMod row (765) is cross-flagged, second (766) is not.
    expect(rows[0].querySelector('svg[data-icon="message-circle"]')).toBeInTheDocument()
    expect(rows[1].querySelector('svg[data-icon="message-circle"]')).not.toBeInTheDocument()
  })

  it('flags a Discord ban whose linked account is also banned on GMod', async () => {
    const { container } = renderWithProviders(() => <GuildBans />)
    await waitForLoaded()
    await vi.waitFor(() => expect(screen.getByText('Cheater#0001')).toBeInTheDocument())

    const discordTable = container.querySelectorAll('table')[1]
    const rows = discordTable.querySelectorAll('tbody tr')
    expect(rows[0].querySelector('svg[data-icon="gamepad-2"]')).toBeInTheDocument()
    expect(rows[1].querySelector('svg[data-icon="gamepad-2"]')).not.toBeInTheDocument()
  })

  it('shows loading spinners while bans is loading', () => {
    ;(fetchAPI as Mock).mockReturnValue(new Promise(() => {}))
    const { container } = renderWithProviders(() => <GuildBans />)
    expect(container.querySelectorAll('.loading-spinner').length).toBeGreaterThan(0)
  })

  it('distinguishes a failed request from empty bans and retries both tables together', async () => {
    ;(fetchAPI as Mock).mockResolvedValueOnce(errJson())
    renderWithProviders(() => <GuildBans />)
    await vi.waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(2))
    expect(screen.queryByText('No GMod bans found.')).not.toBeInTheDocument()
    expect(screen.queryByText('No Discord bans found.')).not.toBeInTheDocument()
    await fireEvent.click(screen.getAllByRole('button', { name: 'Try again' })[0])
    await waitForLoaded()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a failure message when the resource itself rejects', async () => {
    ;(fetchAPI as Mock).mockRejectedValue(new Error('network down'))
    renderWithProviders(() => <GuildBans />)
    await vi.waitFor(() => expect(screen.getAllByText('Unable to load bans. Try again.').length).toBeGreaterThan(0))
  })

  it('shows empty-state messages when there are no bans', async () => {
    setupFetchAPI({ gmodBans: [], discordBans: [] })
    renderWithProviders(() => <GuildBans />)
    await vi.waitFor(() => expect(screen.getByText('No GMod bans found.')).toBeInTheDocument())
    expect(screen.getByText('No Discord bans found.')).toBeInTheDocument()
  })
})
