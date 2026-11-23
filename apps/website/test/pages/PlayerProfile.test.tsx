import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import type { PlayerProfileResponse, PlayerProfileServer } from '@gmod/schema/user/PlayerProfileSchema.js'
import PlayerProfile from '../../src/pages/PlayerProfile.js'
import { setIsLogged } from '../../src/utils/event.js'
import { setAuthSession, setAuthStatus } from '../../src/utils/authClient.js'
import { historyAt, renderWithProviders } from '../testUtils.js'

const STEAM = '76561198000000001'
const OTHER_STEAM = '76561198000000002'
const DISCORD = '333650866747867137'
const joined = '2026-10-01T10:00:00.000Z'
const active = '2026-11-22T15:30:00.000Z'

function server(index = 1, overrides: Partial<PlayerProfileServer> = {}): PlayerProfileServer {
  return {
    id: `s${index}`,
    name: `Server ${index}`,
    image: '',
    public: true,
    gameMode: 'sandbox',
    map: 'gm_construct',
    online: true,
    playerName: 'Ely in game',
    rank: 'member',
    totalTime: 7_200,
    kills: 12,
    deaths: 3,
    connections: 20,
    firstJoinedAt: joined,
    lastSeenAt: active,
    ...overrides,
  }
}

function profile(overrides: Partial<PlayerProfileResponse> = {}): PlayerProfileResponse {
  return {
    player: { steamID64: STEAM, discordID: DISCORD, name: 'Ely', avatarURL: null, trustLevel: 0, registeredAt: joined },
    summary: {
      servers: 1,
      totalTime: 7_200,
      kills: 12,
      deaths: 3,
      connections: 20,
      firstJoinedAt: joined,
      lastSeenAt: active,
    },
    servers: [server()],
    pagination: { total: 1, limit: 10, offset: 0 },
    moderation: {
      warnings: [],
      bans: [],
      warningsPagination: { total: 0, limit: 10, offset: 0 },
      bansPagination: { total: 0, limit: 10, offset: 0 },
    },
    ...overrides,
  }
}

const ok = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })
const ready = (name = 'Ely') => vi.waitFor(() => expect(screen.getByRole('heading', { name })).toBeInTheDocument())
const lastURL = (mock: ReturnType<typeof vi.fn>) => new URL(String(mock.mock.calls.at(-1)![0]))

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('discordID', '123456789012345678')
  setIsLogged(true)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('player profile', () => {
  it('shows and copies both platform identifiers and links the linked Discord account', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok(profile())),
    )
    renderWithProviders(() => <PlayerProfile />)
    await ready()
    expect(screen.getByText(STEAM)).toBeInTheDocument()
    expect(screen.getByText(DISCORD)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Discord profile' })).toHaveAttribute(
      'href',
      `https://discord.com/users/${DISCORD}`,
    )
    await fireEvent.click(screen.getByRole('button', { name: 'Copy Steam ID' }))
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(STEAM))
    await fireEvent.click(screen.getByRole('button', { name: 'Copy Discord ID' }))
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(DISCORD))
  })

  it('explains a missing Discord link without inventing an identity or profile link', async () => {
    const value = profile()
    value.player.discordID = null
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok(value)),
    )
    renderWithProviders(() => <PlayerProfile />)
    await ready()
    expect(screen.getByText('No linked Discord account')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Open Discord profile' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copy Discord ID' })).not.toBeInTheDocument()
  })

  it.each([
    ['/players/:steamID64', `/players/${DISCORD}`, `/players/${DISCORD}`],
    ['/players/discord/:discordID', '/players/discord/12345678901234567', '/players/discord/12345678901234567'],
    ['/players/steam/:steamID64', `/players/steam/${STEAM}`, `/players/steam/${STEAM}`],
  ])('loads both generic identifiers and explicit platform routes through %s', async (path, address, endpoint) => {
    const fetchMock = vi.fn(async () => ok(profile()))
    vi.stubGlobal('fetch', fetchMock)
    renderWithProviders(() => <PlayerProfile />, { path, history: historyAt(address) })
    await ready()
    expect(lastURL(fetchMock).pathname).toBe(`/v3/users/123456789012345678${endpoint}`)
  })

  it('validates player lookup and opens the requested Discord or Steam identifier', async () => {
    const fetchMock = vi.fn(async () => ok(profile()))
    vi.stubGlobal('fetch', fetchMock)
    const history = historyAt(`/players/${STEAM}`)
    renderWithProviders(() => <PlayerProfile />, { path: '/players/:steamID64', history })
    await ready()
    const input = screen.getByRole('textbox', { name: 'Find a player' })
    await fireEvent.input(input, { target: { value: '../not-an-id' } })
    await fireEvent.submit(input.closest('form')!)
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Enter an ID containing 17 to 20 digits.')
    expect(history.get()).toBe(`/players/${STEAM}`)
    await fireEvent.input(input, { target: { value: `  ${DISCORD}  ` } })
    await fireEvent.submit(input.closest('form')!)
    await vi.waitFor(() => expect(lastURL(fetchMock).pathname.endsWith(`/players/${DISCORD}`)).toBe(true))
    expect(history.get()).toBe(`/players/${DISCORD}`)
    expect(input).toHaveValue(DISCORD)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('loads the linked player and presents recorded server statistics', async () => {
    const fetchMock = vi.fn(async () => ok(profile()))
    vi.stubGlobal('fetch', fetchMock)
    renderWithProviders(() => <PlayerProfile />)
    await ready()

    expect(lastURL(fetchMock).pathname).toBe('/v3/users/123456789012345678/player-profile')
    expect(lastURL(fetchMock).searchParams.get('limit')).toBe('10')
    expect(lastURL(fetchMock).searchParams.get('offset')).toBe('0')
    expect(screen.queryByRole('meter')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Steam profile' })).toHaveAttribute(
      'href',
      `https://steamcommunity.com/profiles/${STEAM}`,
    )
    const card = screen.getByRole('article')
    expect(within(card).getByText('2 h 0 min')).toBeInTheDocument()
    expect(within(card).getByText('Ely in game')).toBeInTheDocument()
    expect(within(card).getByText('member')).toBeInTheDocument()
    expect(within(card).getByText('12')).toBeInTheDocument()
    expect(within(card).getByText('3')).toBeInTheDocument()
    expect(within(card).getByText('20')).toBeInTheDocument()
    expect(within(card).getByText('Server online')).toBeInTheDocument()
    expect(within(card).getByText('Public server')).toBeInTheDocument()
    expect(within(card).getByText('Last recorded activity').nextElementSibling?.querySelector('time')).toHaveAttribute(
      'datetime',
      active,
    )
    expect(screen.getByRole('region', { name: 'Activity overview' })).toHaveTextContent('2 h 0 min')
  })

  it.each([0, 75, null])('hides the trust factor when the response contains %s', async (trustLevel) => {
    const value = profile()
    value.player.trustLevel = trustLevel
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok(value)),
    )
    const { container } = renderWithProviders(() => <PlayerProfile />)
    await ready()

    expect(screen.queryByRole('meter')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Trust level' })).not.toBeInTheDocument()
    expect(screen.queryByText('Current trust score recorded by Gmod Integration.')).not.toBeInTheDocument()
    expect(container.querySelector('.player-profile-trust')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Ely' })).toContainElement(screen.getByText(STEAM))
  })

  it('loads another player from the route with their recorded server state', async () => {
    const value = profile()
    value.player.trustLevel = null
    value.player.registeredAt = null
    value.servers = [server(1, { public: false, online: false, gameMode: null, map: null })]
    const fetchMock = vi.fn(async () => ok(value))
    vi.stubGlobal('fetch', fetchMock)
    renderWithProviders(() => <PlayerProfile />, {
      path: '/players/:steamID64',
      history: historyAt(`/players/${STEAM}`),
    })
    await ready()

    expect(lastURL(fetchMock).pathname).toBe(`/v3/users/123456789012345678/players/${STEAM}`)
    expect(screen.queryByRole('meter')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Trust level' })).not.toBeInTheDocument()
    expect(screen.queryByText('Profile created')).not.toBeInTheDocument()
    expect(screen.getByText('Server offline')).toBeInTheDocument()
    expect(screen.getByText('Private server')).toBeInTheDocument()
  })

  it('directs an account without a linked Steam identity to account settings', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'steam_not_linked' }), { status: 404 })),
    )
    renderWithProviders(() => <PlayerProfile />)
    await vi.waitFor(() => expect(screen.getByRole('heading', { name: 'Link your Steam account' })).toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'Manage account' })).toHaveAttribute('href', '/account')
    expect(screen.queryByRole('meter')).not.toBeInTheDocument()
  })

  it.each([
    ['/players/:steamID64', '/players/not-a-steam-id'],
    ['/players/steam/:steamID64', '/players/steam/222222222222222222'],
  ])('rejects invalid identities in %s without a request', async (path, initialPath) => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderWithProviders(() => <PlayerProfile />, {
      path,
      history: historyAt(initialPath),
    })
    await vi.waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Player profile not found' })).toBeInTheDocument(),
    )
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Browse servers' })).toHaveAttribute('href', '/servers')
  })

  it('shows no statistics when an otherwise valid player has no visible servers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        ok(
          profile({
            servers: [],
            summary: {
              servers: 0,
              totalTime: 0,
              kills: 0,
              deaths: 0,
              connections: 0,
              firstJoinedAt: null,
              lastSeenAt: null,
            },
            pagination: { total: 0, limit: 10, offset: 0 },
          }),
        ),
      ),
    )
    renderWithProviders(() => <PlayerProfile />)
    await ready()
    expect(screen.getByText('No recorded statistics are available on servers visible to you.')).toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Activity overview' })).toHaveTextContent('0 s')
  })

  it.each(['network', 'http', 'invalid-data'])('offers a retry after a %s failure', async (failure) => {
    const fetchMock = vi.fn()
    if (failure === 'network') fetchMock.mockRejectedValueOnce(new Error('Offline'))
    else if (failure === 'http') fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }))
    else fetchMock.mockResolvedValueOnce(ok({ player: 'invalid' }))
    fetchMock.mockImplementation(async () => ok(profile()))
    vi.stubGlobal('fetch', fetchMock)
    renderWithProviders(() => <PlayerProfile />)
    await vi.waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Unable to load this player profile.'))
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await ready()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('paginates server cards without replacing the aggregate totals with page totals', async () => {
    const rows = Array.from({ length: 23 }, (_, index) => server(index + 1))
    const fetchMock = vi.fn(async (input: string) => {
      const offset = Number(new URL(input).searchParams.get('offset'))
      return ok(
        profile({
          servers: rows.slice(offset, offset + 10),
          summary: { ...profile().summary, servers: 23, totalTime: 72_000 },
          pagination: { total: 23, limit: 10, offset },
        }),
      )
    })
    vi.stubGlobal('fetch', fetchMock)
    renderWithProviders(() => <PlayerProfile />)
    await ready()
    expect(screen.getAllByRole('article')).toHaveLength(10)
    expect(screen.getByRole('region', { name: 'Activity overview' })).toHaveTextContent('20 h 0 min')
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await vi.waitFor(() => expect(screen.getByRole('heading', { name: 'Server 11' })).toBeInTheDocument())
    expect(lastURL(fetchMock).searchParams.get('offset')).toBe('10')
    expect(screen.getByText('Showing 11–20 of 23 servers')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Last page' }))
    await vi.waitFor(() => expect(screen.getByRole('heading', { name: 'Server 21' })).toBeInTheDocument())
    expect(screen.getAllByRole('article')).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Back to the first page' }))
    await vi.waitFor(() => expect(screen.getByRole('heading', { name: 'Server 1' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
  })

  it('hides stale data during loading and resets pagination when the route changes', async () => {
    let resolveOther!: (response: Response) => void
    const fetchMock = vi.fn(async (input: string) => {
      const url = new URL(input)
      if (url.pathname.endsWith(OTHER_STEAM))
        return new Promise<Response>((resolve) => {
          resolveOther = resolve
        })
      const offset = Number(url.searchParams.get('offset'))
      return ok(profile({ servers: [server(offset + 1)], pagination: { total: 20, limit: 10, offset } }))
    })
    vi.stubGlobal('fetch', fetchMock)
    const history = historyAt(`/players/${STEAM}`)
    renderWithProviders(() => <PlayerProfile />, { path: '/players/:steamID64', history })
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await vi.waitFor(() => expect(screen.getByRole('heading', { name: 'Server 11' })).toBeInTheDocument())
    history.set({ value: `/players/${OTHER_STEAM}` })
    await vi.waitFor(() => expect(lastURL(fetchMock).pathname).toContain(OTHER_STEAM))
    expect(lastURL(fetchMock).searchParams.get('offset')).toBe('0')
    expect(screen.queryByRole('heading', { name: 'Ely' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Loading player profile…')
    const other = profile()
    other.player = { ...other.player, name: 'Another player', steamID64: OTHER_STEAM }
    resolveOther(ok(other))
    await ready('Another player')
    history.set({ value: `/players/${STEAM}` })
    await ready()
    expect(lastURL(fetchMock).searchParams.get('offset')).toBe('0')
  })

  it('waits for authentication before requesting a player profile', async () => {
    const fetchMock = vi.fn(async () => ok(profile()))
    vi.stubGlobal('fetch', fetchMock)
    setAuthSession(undefined)
    setAuthStatus('checking')
    setIsLogged(false)
    renderWithProviders(() => <PlayerProfile />, { session: false })
    expect(screen.getByRole('status')).toHaveTextContent('Loading player profile…')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('formats the profile in the selected French locale', async () => {
    localStorage.setItem('locale', 'fr')
    const value = profile()
    value.summary.kills = 12_345
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok(value)),
    )
    renderWithProviders(() => <PlayerProfile />)
    await ready()
    expect(screen.getByRole('heading', { name: 'Profil joueur' })).toBeInTheDocument()
    expect(screen.queryByRole('meter')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Niveau de confiance' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Modération enregistrée' })).toBeInTheDocument()
    expect(screen.getByText('Aucun avertissement enregistré sur les serveurs visibles pour vous.')).toBeInTheDocument()
    expect(screen.getAllByText('Dernière activité enregistrée')).toHaveLength(2)
    expect(
      within(screen.getByRole('region', { name: 'Aperçu de l’activité' })).getByText(
        new Intl.NumberFormat('fr').format(12_345).replace(/\s/g, ' '),
      ),
    ).toBeInTheDocument()
  })

  it('shows recorded reasons as text, per-server attribution and permanent, active and expired bans', async () => {
    const value = profile()
    const reason = '<script>Unsafe player content</script>'
    value.moderation = {
      warnings: [{ id: 1, serverID: 's1', serverName: 'Warning server', reason, createdAt: joined }],
      warningsPagination: { total: 1, limit: 10, offset: 0 },
      bans: [
        {
          id: 2,
          serverID: 's2',
          serverName: 'Permanent ban server',
          reason: 'Repeated abuse',
          createdAt: joined,
          durationMinutes: 0,
          expiresAt: null,
          active: true,
        },
        {
          id: 3,
          serverID: 's3',
          serverName: 'Temporary ban server',
          reason: 'Spam',
          createdAt: joined,
          durationMinutes: 60,
          expiresAt: active,
          active: false,
        },
      ],
      bansPagination: { total: 2, limit: 10, offset: 0 },
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok(value)),
    )
    const { container } = renderWithProviders(() => <PlayerProfile />)
    await ready()
    const moderation = screen.getByRole('region', { name: 'Recorded moderation' })
    expect(moderation).toHaveTextContent('Other players can only see public servers.')
    expect(within(moderation).getByText(reason)).toBeInTheDocument()
    expect(container.querySelector('script')).not.toBeInTheDocument()
    const warnings = within(moderation).getByRole('region', { name: /^Warnings/ })
    expect(warnings).toHaveTextContent('Warning server')
    expect(warnings.querySelector('time')).toHaveAttribute('datetime', joined)
    const bans = within(moderation).getByRole('region', { name: /^Bans/ })
    expect(bans).toHaveTextContent('Permanent ban server')
    expect(within(bans).getByText('Permanent')).toBeInTheDocument()
    expect(within(bans).getByText('Active')).toBeInTheDocument()
    expect(within(bans).getByText('Expired')).toBeInTheDocument()
    expect(within(bans).getByText('1 h 0 min')).toBeInTheDocument()
    expect(bans.querySelector(`time[datetime="${active}"]`)).toBeInTheDocument()
  })

  it('paginates warnings, bans and statistics independently and resets them when switching players', async () => {
    const fetchMock = vi.fn(async (input: string) => {
      const query = new URL(input).searchParams
      const warningOffset = Number(query.get('warningOffset'))
      const banOffset = Number(query.get('banOffset'))
      const offset = Number(query.get('offset'))
      const value = profile()
      value.pagination = { total: 23, limit: 10, offset }
      value.servers = [server(offset + 1)]
      value.moderation = {
        warnings: [
          {
            id: warningOffset + 1,
            serverID: 's1',
            serverName: `Warning server ${warningOffset + 1}`,
            reason: 'Warning',
            createdAt: joined,
          },
        ],
        warningsPagination: { total: 23, limit: 10, offset: warningOffset },
        bans: [
          {
            id: banOffset + 1,
            serverID: 's1',
            serverName: `Ban server ${banOffset + 1}`,
            reason: 'Ban',
            createdAt: joined,
            durationMinutes: 0,
            expiresAt: null,
            active: true,
          },
        ],
        bansPagination: { total: 12, limit: 10, offset: banOffset },
      }
      return ok(value)
    })
    vi.stubGlobal('fetch', fetchMock)
    const history = historyAt(`/players/${STEAM}`)
    renderWithProviders(() => <PlayerProfile />, { path: '/players/:steamID64', history })
    await ready()
    const warningSection = () => screen.getByRole('region', { name: /^Warnings/ })
    const banSection = () => screen.getByRole('region', { name: /^Bans/ })
    await fireEvent.click(within(warningSection()).getByRole('button', { name: 'Next page' }))
    await vi.waitFor(() => expect(screen.getByText('Warning server 11')).toBeInTheDocument())
    expect(lastURL(fetchMock).searchParams.get('warningOffset')).toBe('10')
    expect(lastURL(fetchMock).searchParams.get('banOffset')).toBe('0')
    expect(lastURL(fetchMock).searchParams.get('offset')).toBe('0')
    await fireEvent.click(within(banSection()).getByRole('button', { name: 'Next page' }))
    await vi.waitFor(() => expect(screen.getByText('Ban server 11')).toBeInTheDocument())
    expect(lastURL(fetchMock).searchParams.get('warningOffset')).toBe('10')
    expect(lastURL(fetchMock).searchParams.get('banOffset')).toBe('10')
    expect(within(banSection()).getByRole('button', { name: 'Next page' })).toBeDisabled()
    const statistics = screen.getByRole('region', { name: 'Statistics by server' })
    await fireEvent.click(within(statistics).getByRole('button', { name: 'Next page' }))
    await vi.waitFor(() => expect(screen.getByRole('heading', { name: 'Server 11' })).toBeInTheDocument())
    expect(lastURL(fetchMock).searchParams.get('offset')).toBe('10')
    expect(lastURL(fetchMock).searchParams.get('warningOffset')).toBe('10')
    expect(lastURL(fetchMock).searchParams.get('banOffset')).toBe('10')
    history.set({ value: `/players/${OTHER_STEAM}` })
    await vi.waitFor(() => expect(lastURL(fetchMock).pathname.endsWith(OTHER_STEAM)).toBe(true))
    await vi.waitFor(() => expect(screen.getByText('Warning server 1')).toBeInTheDocument())
    for (const parameter of ['offset', 'warningOffset', 'banOffset'])
      expect(lastURL(fetchMock).searchParams.get(parameter)).toBe('0')
  })
})
