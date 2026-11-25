import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../../../testUtils.js'
import { setIsLogged } from '../../../../src/utils/event.js'
import { fetchAPI } from '../../../../src/utils/api.js'
import GuildsSelector from '../../../../src/pages/dashboard/guilds/GuildsSelector.js'

vi.mock('../../../../src/utils/api.js', () => ({ fetchAPI: vi.fn() }))
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})
beforeEach(() => {
  window.localStorage.clear()
  setIsLogged(true)
  vi.mocked(fetchAPI).mockReset()
})

const guilds = [
  { id: 'g1', name: 'Beta', isPremium: true, hasBot: true, isOwner: true, icon: null },
  { id: 'g2', name: 'Alpha', isPremium: true, hasBot: true, isOwner: false, icon: 'http://icon/g2.png' },
  { id: 'g3', name: 'Gamma', isPremium: false, hasBot: true, isOwner: false, icon: null },
  { id: 'g4', name: 'Delta', isPremium: false, hasBot: false, isOwner: true, icon: null },
]
const manyGuilds = () =>
  Array.from({ length: 51 }, (_, index) => ({
    id: `g${index + 1}`,
    name: `Community ${String(index + 1).padStart(3, '0')}`,
    isPremium: true,
    hasBot: true,
    isOwner: true,
    icon: null,
  }))
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })
const cards = () =>
  screen
    .queryAllByRole('link')
    .filter((link) => /^\/dashboard\/guilds\/[^/]+\/config$/.test(link.getAttribute('href') || ''))
function renderGuilds() {
  const history = historyAt('/dashboard/guilds')
  return { history, ...renderWithProviders(() => <GuildsSelector />, { path: '*', history }) }
}
function serveGuilds() {
  vi.mocked(fetchAPI).mockImplementation(async () => response(guilds))
}

async function loadedGuilds() {
  await vi.waitFor(() => expect(cards()).toHaveLength(4))
}

describe('Community selection', () => {
  it('announces loading while retaining the original page heading', () => {
    vi.mocked(fetchAPI).mockReturnValue(new Promise<Response>(() => {}))
    renderGuilds()
    expect(screen.getByRole('status')).toHaveTextContent(/Loading/)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Choose a Discord server')
  })

  it('offers retry after a request failure', async () => {
    vi.mocked(fetchAPI).mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce(response(guilds))
    renderGuilds()
    await vi.waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Unable to load your Discord servers. Try again.'),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await loadedGuilds()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it.each([response({}, 503), response({ invalid: true })])(
    'contains invalid responses without crashing the page',
    async (invalid) => {
      vi.mocked(fetchAPI).mockResolvedValue(invalid)
      renderGuilds()
      await vi.waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    },
  )

  it('redirects signed-out visitors without fetching communities', async () => {
    setIsLogged(false)
    const { history } = renderGuilds()
    await vi.waitFor(() => expect(history.get()).toBe('/login'))
    expect(fetchAPI).not.toHaveBeenCalled()
  })

  it('clears prior selections on mount and provides the create-community destination', () => {
    window.localStorage.setItem('server', JSON.stringify({ id: 's1' }))
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1' }))
    vi.mocked(fetchAPI).mockResolvedValue(response([]))
    renderGuilds()
    expect(window.localStorage.getItem('server')).toBeNull()
    expect(window.localStorage.getItem('guilds')).toBeNull()
    expect(screen.getByRole('link', { name: 'Create a Discord server' })).toHaveAttribute(
      'href',
      'discord://-/guilds/create',
    )
  })

  it('sorts communities by plan, bot presence and name while preserving identifying details', async () => {
    serveGuilds()
    renderGuilds()
    await loadedGuilds()
    expect(cards().map((card) => within(card).getByRole('heading', { level: 3 }).textContent)).toEqual([
      'Alpha',
      'Beta',
      'Gamma',
      'Delta',
    ])
    const beta = screen.getByRole('link', { name: /Beta/ })
    expect(beta).toHaveTextContent('Owner')
    expect(within(beta).getByRole('img', { name: 'Beta' })).toHaveAttribute(
      'src',
      expect.stringContaining('defaultGuild'),
    )
    const alpha = screen.getByRole('link', { name: /Alpha/ })
    expect(alpha).toHaveTextContent('Admin')
    expect(within(alpha).getByRole('img', { name: 'Alpha' })).toHaveAttribute('src', 'http://icon/g2.png')
    expect(screen.getByRole('link', { name: /Delta/ })).toHaveTextContent('Add Bot')
  })

  it('explains when the account has no available communities', async () => {
    vi.mocked(fetchAPI).mockResolvedValue(response([]))
    renderGuilds()
    await vi.waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('No communities match this account’s dashboard access.'),
    )
    expect(screen.getByRole('dialog', { name: 'Get dashboard access' })).toHaveAttribute('open')
  })

  it('lets an excluded user close the procedure, re-open it, and recheck after rights are granted', async () => {
    vi.mocked(fetchAPI).mockResolvedValueOnce(response([])).mockResolvedValueOnce(response(guilds))
    renderGuilds()
    const help = await screen.findByRole('dialog', { name: 'Get dashboard access' })
    expect(within(help).getByRole('link', { name: 'Open Account' })).toHaveAttribute('href', '/account')
    await fireEvent.click(within(help).getAllByRole('button', { name: 'Close' }).at(-1)!)
    expect(help).not.toHaveAttribute('open')
    await fireEvent.click(screen.getByRole('button', { name: 'How to get access' }))
    expect(help).toHaveAttribute('open')
    await fireEvent.click(within(help).getByRole('button', { name: 'Recheck access' }))
    await loadedGuilds()
    expect(help).not.toHaveAttribute('open')
    expect(vi.mocked(fetchAPI).mock.calls.every((call) => call[1] === 'GET')).toBe(true)
  })

  it('does not open an access warning for a failed lookup or an empty search result', async () => {
    vi.mocked(fetchAPI).mockResolvedValueOnce(response({}, 503)).mockResolvedValueOnce(response(guilds))
    renderGuilds()
    await screen.findByRole('alert')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await loadedGuilds()
    await fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'unknown community' } })
    expect(screen.getByRole('status')).toHaveTextContent('No results match your search')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('filters communities by name without changing selection or fetching again', async () => {
    serveGuilds()
    renderGuilds()
    await loadedGuilds()
    await fireEvent.input(screen.getByRole('searchbox', { name: 'Search communities' }), { target: { value: 'bEtA' } })
    expect(cards()).toHaveLength(1)
    expect(screen.getByRole('link', { name: /Beta/ })).toBeInTheDocument()
    expect(window.localStorage.getItem('guilds')).toBeNull()
    expect(fetchAPI).toHaveBeenCalledTimes(1)
    await fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'unknown' } })
    expect(screen.getByRole('status')).toHaveTextContent('No results match your search.')
  })

  it('searches the full community list and resets paging when a search changes', async () => {
    vi.mocked(fetchAPI).mockResolvedValue(response(manyGuilds()))
    renderGuilds()
    await vi.waitFor(() => expect(cards()).toHaveLength(25))
    expect(screen.queryByRole('link', { name: /Community 026/ })).not.toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByRole('link', { name: /Community 026/ })).toBeInTheDocument()
    await fireEvent.input(screen.getByRole('searchbox', { name: 'Search communities' }), {
      target: { value: 'community' },
    })
    expect(screen.getByRole('link', { name: /Community 001/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Page 1 of 3' })).toBeInTheDocument()
    await fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'Community 051' } })
    expect(cards()).toHaveLength(1)
    expect(screen.getByRole('link', { name: /Community 051/ })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument()
    expect(fetchAPI).toHaveBeenCalledTimes(1)
    expect(window.localStorage.getItem('guilds')).toBeNull()
  })

  it('preserves community selection and link navigation on later pages', async () => {
    const large = manyGuilds()
    vi.mocked(fetchAPI).mockResolvedValue(response(large))
    const { history } = renderGuilds()
    await vi.waitFor(() => expect(cards()).toHaveLength(25))
    await fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await fireEvent.click(screen.getByRole('link', { name: /Community 026/ }))
    expect(JSON.parse(window.localStorage.getItem('guilds')!)).toEqual(large[25])
    await vi.waitFor(() => expect(history.get()).toBe('/dashboard/guilds/g26/config'))
  })

  it('stores a selected community and navigates to its configuration', async () => {
    serveGuilds()
    const { history } = renderGuilds()
    await loadedGuilds()
    fireEvent.click(screen.getByRole('link', { name: /Beta/ }))
    expect(JSON.parse(window.localStorage.getItem('guilds')!)).toEqual(guilds[0])
    await vi.waitFor(() => expect(history.get()).toBe('/dashboard/guilds/g1/config'))
  })

  it('opens a scoped Discord invite and refreshes once after the popup closes', async () => {
    serveGuilds()
    const { history } = renderGuilds()
    await loadedGuilds()
    vi.useFakeTimers()
    let closed = false
    const popup = {
      get closed() {
        return closed
      },
    } as Window
    const open = vi.spyOn(window, 'open').mockReturnValue(popup)
    fireEvent.click(screen.getByRole('link', { name: /Delta/ }))
    const invite = new URL(String(open.mock.calls[0][0]))
    expect(invite.origin).toBe('https://discord.com')
    expect(invite.pathname).toBe('/oauth2/authorize')
    expect(invite.searchParams.get('guild_id')).toBe('g4')
    expect(invite.searchParams.get('client_id')).toBe('test-discord-client-id')
    expect(invite.searchParams.get('scope')).toBe('bot')
    expect(history.get()).toBe('/dashboard/guilds')
    expect(window.localStorage.getItem('guilds')).toBeNull()
    await vi.advanceTimersByTimeAsync(500)
    expect(fetchAPI).toHaveBeenCalledTimes(1)
    closed = true
    await vi.advanceTimersByTimeAsync(500)
    expect(fetchAPI).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1000)
    expect(fetchAPI).toHaveBeenCalledTimes(2)
  })

  it('explains a blocked popup without starting a polling interval', async () => {
    serveGuilds()
    renderGuilds()
    await loadedGuilds()
    vi.useFakeTimers()
    vi.spyOn(window, 'open').mockReturnValue(null)
    const interval = vi.spyOn(window, 'setInterval')
    fireEvent.click(screen.getByRole('link', { name: /Delta/ }))
    expect(screen.getByRole('alert')).toHaveTextContent('Allow pop-ups for this site to invite the bot.')
    expect(interval).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2000)
    expect(fetchAPI).toHaveBeenCalledTimes(1)
  })

  it('clears active invite polling when the component unmounts', async () => {
    serveGuilds()
    const { unmount } = renderGuilds()
    await loadedGuilds()
    vi.useFakeTimers()
    vi.spyOn(window, 'open').mockReturnValue({ closed: false } as Window)
    const clear = vi.spyOn(window, 'clearInterval')
    fireEvent.click(screen.getByRole('link', { name: /Delta/ }))
    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(clear).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(2000)
    expect(fetchAPI).toHaveBeenCalledTimes(1)
  })
})
