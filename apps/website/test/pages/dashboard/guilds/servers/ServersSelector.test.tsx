import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../../../../testUtils.js'

vi.mock('../../../../../src/utils/api.js', () => ({
  fetchAPI: vi.fn(),
  getAPIUrl: vi.fn(),
  getUrlWithActualParams: vi.fn((s: string) => s),
}))

const { fetchAPI } = await import('../../../../../src/utils/api.js')
const ServerList = (await import('../../../../../src/pages/dashboard/guilds/servers/ServersSelector.js')).default

afterEach(() => cleanup())

function okJson(data: unknown, ok = true) {
  return { ok, json: async () => data }
}

const servers = [
  { id: 's1', name: 'Alpha', ip: '1.2.3.4', port: 27015, image: 'https://cdn/alpha.png' },
  { id: 's2', name: 'Beta', ip: '5.6.7.8', port: 27016 },
]

function renderList(path = '/dashboard/guilds/g1/config/servers') {
  const history = historyAt(path)
  renderWithProviders(() => <ServerList />, {
    path: '/dashboard/guilds/:guildID/config/servers',
    history,
  })
  return history
}

describe('pages/dashboard/guilds/servers/ServersSelector.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
    ;(fetchAPI as any).mockReset()
  })

  it('shows a loading indicator while servers are being fetched', () => {
    ;(fetchAPI as any).mockReturnValue(new Promise(() => {}))
    renderList()
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('shows the shared quota for a loaded free guild', async () => {
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: false }))
    ;(fetchAPI as any).mockResolvedValue(okJson([]))
    renderList()
    await vi.waitFor(() => expect(screen.getByText('0 / 1 used')).toBeInTheDocument())
    expect(screen.queryByRole('link', { name: 'View Premium plans' })).not.toBeInTheDocument()
  })

  it('renders each server card with name, address, and image, falling back to the default image', async () => {
    ;(fetchAPI as any).mockResolvedValue(okJson(servers))
    renderList()
    await vi.waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument())

    expect(screen.getByText('Your game servers')).toBeInTheDocument()
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('1.2.3.4:27015')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.getByText('5.6.7.8:27016')).toBeInTheDocument()

    const alphaImg = screen.getByAltText('Alpha') as HTMLImageElement
    expect(alphaImg.src).toBe('https://cdn/alpha.png')
    const betaImg = screen.getByAltText('Beta') as HTMLImageElement
    expect(betaImg.src).toContain('defaultServer')

    expect(screen.getAllByText('Configure server')).toHaveLength(2)
  })

  it('filters server cards by name or address while preserving server creation limits', async () => {
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: false }))
    vi.mocked(fetchAPI).mockResolvedValue(okJson(servers) as Response)
    renderList()
    await vi.waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument())
    await fireEvent.input(screen.getByRole('searchbox', { name: 'Search servers' }), { target: { value: '5.6.7.8' } })
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add server' })).toBeDisabled()
    await fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'unknown' } })
    expect(screen.getByRole('status')).toHaveTextContent('No results match your search.')
    expect(fetchAPI).toHaveBeenCalledTimes(1)
  })

  it('paginates servers while searching the complete list and preserving full-list creation limits', async () => {
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: false }))
    const many = Array.from({ length: 51 }, (_, index) => ({
      id: `s${index + 1}`,
      name: `Host ${String(index + 1).padStart(3, '0')}`,
      ip: `10.0.0.${index + 1}`,
      port: 27015,
    }))
    vi.mocked(fetchAPI).mockResolvedValue(okJson(many) as Response)
    renderList()
    await vi.waitFor(() => expect(screen.getByRole('heading', { name: 'Host 001' })).toBeInTheDocument())
    expect(screen.getAllByText('Configure server')).toHaveLength(25)
    expect(screen.getByText('51 / 1 used')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByRole('heading', { name: 'Host 026' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Host 001' })).not.toBeInTheDocument()
    await fireEvent.input(screen.getByRole('searchbox', { name: 'Search servers' }), { target: { value: 'Host' } })
    expect(screen.getByRole('button', { name: 'Page 1 of 3' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Host 001' })).toBeInTheDocument()
    await fireEvent.input(screen.getByRole('searchbox'), { target: { value: '10.0.0.51' } })
    expect(screen.getAllByText('Configure server')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'Host 051' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add server' })).toBeDisabled()
    expect(screen.getByText('51 / 1 used')).toBeInTheDocument()
    expect(fetchAPI).toHaveBeenCalledTimes(1)
  })

  it('sets the selected server in localStorage and links to its config page when a card is clicked', async () => {
    ;(fetchAPI as any).mockResolvedValue(okJson(servers))
    const history = renderList()
    await vi.waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument())

    const link = screen.getByText('Alpha').closest('a') as HTMLAnchorElement
    expect(link).toHaveAttribute('href', '/dashboard/guilds/:guildID/config/servers/s1')
    fireEvent.click(link)

    expect(JSON.parse(window.localStorage.getItem('server') || '{}')).toEqual(servers[0])
    await vi.waitFor(() => expect(history.get()).toBe('/dashboard/guilds/:guildID/config/servers/s1'))
  })

  it('disables the create-server button for a free guild once it already has a server', async () => {
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: false }))
    ;(fetchAPI as any).mockResolvedValue(okJson([servers[0]]))
    renderList()
    await vi.waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument())
    expect(screen.getByText('Add server')).toHaveClass('btn-disabled')
    expect(screen.getByRole('button', { name: 'Add server' })).toBeDisabled()
  })

  it('leaves the create-server button enabled for a free guild with no servers yet', async () => {
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: false }))
    ;(fetchAPI as any).mockResolvedValue(okJson([]))
    renderList()
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Add server' })).toBeEnabled())
    expect(screen.getByText('Add server')).not.toHaveClass('btn-disabled')
    expect(screen.getByRole('status')).toHaveTextContent('No servers yet. Connect your first server to get started.')
  })

  it('leaves the create-server button enabled for a premium guild regardless of server count', async () => {
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
    ;(fetchAPI as any).mockResolvedValue(okJson([servers[0]]))
    renderList()
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Add server' })).toBeEnabled())
    expect(screen.getByText('Add server')).not.toHaveClass('btn-disabled')
  })

  it('creates a server, stores it, and navigates to its config page on success', async () => {
    ;(fetchAPI as any).mockImplementation(async (endpoint: string, method: string) => {
      if (method === 'POST') return okJson({ id: 'new1', name: 'New', ip: '9.9.9.9', port: 1 })
      return okJson([])
    })
    const history = renderList()
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Add server' })).toBeEnabled())

    fireEvent.click(screen.getByText('Add server'))

    await vi.waitFor(() => expect(history.get()).toBe('/dashboard/guilds/:guildID/config/servers/new1'))
    expect(fetchAPI).toHaveBeenCalledWith('/users/:discordID/guilds/:guildID/servers', 'POST')
    expect(JSON.parse(window.localStorage.getItem('server') || '{}')).toEqual({
      id: 'new1',
      name: 'New',
      ip: '9.9.9.9',
      port: 1,
    })
  })

  it('prevents duplicate creation while the first request is still pending', async () => {
    let resolveCreation!: (response: Response) => void
    const creating = new Promise<Response>((resolve) => {
      resolveCreation = resolve
    })
    vi.mocked(fetchAPI).mockImplementation((_endpoint: string, method: string) =>
      method === 'POST' ? creating : Promise.resolve(okJson([]) as Response),
    )
    const history = renderList()
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Add server' })).toBeEnabled())
    const button = screen.getByRole('button', { name: 'Add server' })
    fireEvent.click(button)
    fireEvent.click(button)

    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(vi.mocked(fetchAPI).mock.calls.filter(([, method]) => method === 'POST')).toHaveLength(1)

    resolveCreation(okJson({ id: 'one-server', name: 'Only one server' }) as Response)
    await vi.waitFor(() => expect(history.get()).toBe('/dashboard/guilds/:guildID/config/servers/one-server'))
  })

  it('shows an error and preserves the selection and location when creating a server fails', async () => {
    ;(fetchAPI as any).mockImplementation(async (endpoint: string, method: string) => {
      if (method === 'POST') return okJson({}, false)
      return okJson([])
    })
    const history = renderList()
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Add server' })).toBeEnabled())

    fireEvent.click(screen.getByText('Add server'))

    await vi.waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('The server could not be created. Please try again.'),
    )
    expect(fetchAPI).toHaveBeenCalledWith('/users/:discordID/guilds/:guildID/servers', 'POST')
    expect(screen.getByRole('button', { name: 'Add server' })).toBeEnabled()
    expect(history.get()).toBe('/dashboard/guilds/g1/config/servers')
    expect(window.localStorage.getItem('server')).toBeNull()
  })

  it.each(['network', 'http', 'invalid payload'])(
    'recovers from a %s server-list failure without exposing creation before the list is known',
    async (failure) => {
      const mock = vi.mocked(fetchAPI)
      if (failure === 'network') mock.mockRejectedValueOnce(new Error('offline'))
      else if (failure === 'http') mock.mockResolvedValueOnce(okJson({}, false) as Response)
      else mock.mockResolvedValueOnce(okJson({ invalid: true }) as Response)
      mock.mockResolvedValue(okJson(servers) as Response)
      renderList()

      await vi.waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Your servers could not be loaded.'))
      expect(screen.queryByRole('button', { name: 'Add server' })).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
      await vi.waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument())
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    },
  )

  it('rejects a malformed created server without replacing a previous selection', async () => {
    window.localStorage.setItem('server', JSON.stringify({ id: 'previous-server' }))
    vi.mocked(fetchAPI).mockImplementation(
      async (_endpoint: string, method: string) =>
        (method === 'POST' ? okJson({ name: 'Missing identifier' }) : okJson([])) as Response,
    )
    const history = renderList()
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Add server' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Add server' }))

    await vi.waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('The server could not be created.'))
    expect(history.get()).toBe('/dashboard/guilds/g1/config/servers')
    expect(JSON.parse(window.localStorage.getItem('server')!)).toEqual({ id: 'previous-server' })
  })
})
