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

  it('shows the premium-feature notice for a free guild', async () => {
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: false }))
    ;(fetchAPI as any).mockResolvedValue(okJson([]))
    renderList()
    expect(
      screen.getByText('The free plan only allows you to manage one server.'),
    ).toBeInTheDocument()
  })

  it('renders each server card with name, address, and image, falling back to the default image', async () => {
    ;(fetchAPI as any).mockResolvedValue(okJson(servers))
    renderList()
    await vi.waitFor(() => expect(screen.getByText('Select a Server to manage')).toBeInTheDocument())

    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('1.2.3.4:27015')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.getByText('5.6.7.8:27016')).toBeInTheDocument()

    const alphaImg = screen.getByAltText('Alpha') as HTMLImageElement
    expect(alphaImg.src).toBe('https://cdn/alpha.png')
    const betaImg = screen.getByAltText('Beta') as HTMLImageElement
    expect(betaImg.src).toContain('defaultServer')

    expect(screen.getAllByText('Manage')).toHaveLength(2)
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
    await vi.waitFor(() => expect(screen.getByText('Create Server')).toBeInTheDocument())
    expect(screen.getByText('Create Server')).toHaveClass('btn-disabled')
  })

  it('leaves the create-server button enabled for a free guild with no servers yet', async () => {
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: false }))
    ;(fetchAPI as any).mockResolvedValue(okJson([]))
    renderList()
    await vi.waitFor(() => expect(screen.getByText('Create Server')).toBeInTheDocument())
    expect(screen.getByText('Create Server')).not.toHaveClass('btn-disabled')
  })

  it('leaves the create-server button enabled for a premium guild regardless of server count', async () => {
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
    ;(fetchAPI as any).mockResolvedValue(okJson([servers[0]]))
    renderList()
    await vi.waitFor(() => expect(screen.getByText('Create Server')).toBeInTheDocument())
    expect(screen.getByText('Create Server')).not.toHaveClass('btn-disabled')
  })

  it('creates a server, stores it, and navigates to its config page on success', async () => {
    ;(fetchAPI as any).mockImplementation(async (endpoint: string, method: string) => {
      if (method === 'POST') return okJson({ id: 'new1', name: 'New', ip: '9.9.9.9', port: 1 })
      return okJson([])
    })
    const history = renderList()
    await vi.waitFor(() => expect(screen.getByText('Create Server')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Create Server'))

    await vi.waitFor(() => expect(history.get()).toBe('/dashboard/guilds/:guildID/config/servers/new1'))
    expect(JSON.parse(window.localStorage.getItem('server') || '{}')).toEqual({
      id: 'new1',
      name: 'New',
      ip: '9.9.9.9',
      port: 1,
    })
  })

  it('does nothing when creating a server fails', async () => {
    ;(fetchAPI as any).mockImplementation(async (endpoint: string, method: string) => {
      if (method === 'POST') return okJson({}, false)
      return okJson([])
    })
    const history = renderList()
    await vi.waitFor(() => expect(screen.getByText('Create Server')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Create Server'))

    await new Promise((r) => setTimeout(r, 10))
    expect(history.get()).toBe('/dashboard/guilds/g1/config/servers')
    expect(window.localStorage.getItem('server')).toBeNull()
  })
})
