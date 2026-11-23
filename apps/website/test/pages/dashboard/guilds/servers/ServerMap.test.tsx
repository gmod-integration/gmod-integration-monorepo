import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
import type { ServerMapSnapshot } from '@gmod/schema/server/ServerMapSchema.js'
import ServerMap from '../../../../../src/pages/dashboard/guilds/servers/ServerMap.js'
import { fetchAPI } from '../../../../../src/utils/api.js'
import { setThemeMode } from '../../../../../src/utils/theme.js'
import { historyAt, renderWithProviders } from '../../../../testUtils.js'

vi.mock('../../../../../src/utils/api.js', () => ({ fetchAPI: vi.fn() }))

const snapshot = (overrides: Partial<ServerMapSnapshot> = {}): ServerMapSnapshot => ({
  serverID: 'server-one',
  map: 'gm_construct',
  gameMode: 'sandbox',
  players: 4,
  maxPlayers: 32,
  updatedAt: new Date().toISOString(),
  online: true,
  ...overrides,
})
const ok = (body: unknown) => ({ ok: true, json: async () => body }) as Response
const viewer = () => document.querySelector<HTMLIFrameElement>('iframe')
const viewerUrl = () => new URL(viewer()!.src)
const ready = () => vi.waitFor(() => expect(viewer()).toBeInTheDocument())
const renderPage = (path = '/dashboard/guilds/guild-one/config/servers/server-one/map') => {
  const history = historyAt(path)
  return {
    history,
    ...renderWithProviders(() => <ServerMap />, {
      history,
      path: '/dashboard/guilds/:guildID/config/servers/:serverID/map',
    }),
  }
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('guilds', JSON.stringify({ id: 'stale-guild' }))
  localStorage.setItem('server', JSON.stringify({ id: 'stale-server', map: 'gm_flatgrass' }))
  setThemeMode('light')
  vi.mocked(fetchAPI).mockReset()
  vi.mocked(fetchAPI).mockImplementation(async () => ok(snapshot()))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('server Map', () => {
  it('loads the route-scoped server map and ignores arbitrary map query parameters and stale stored scope', async () => {
    renderPage('/dashboard/guilds/guild-one/config/servers/server-one/map?map=gm_flatgrass')
    await ready()
    expect(fetchAPI).toHaveBeenCalledExactlyOnceWith(
      '/users/:discordID/guilds/guild-one/servers/server-one/map',
      'GET',
      undefined,
      { signal: expect.any(AbortSignal) },
    )
    expect(viewerUrl().origin).toBe('https://map-forge.linv.dev')
    expect(viewerUrl().pathname).toBe('/api/embed/gm_construct')
    expect(viewerUrl().searchParams.get('view')).toBe('3d')
    expect(viewerUrl().searchParams.get('labels')).toBe('1')
    expect(viewer()).toHaveAttribute('allow', 'fullscreen')
    expect(viewer()).toHaveAttribute('allowfullscreen')
    expect(viewer()).toHaveAttribute('width', '100%')
    expect(Number(viewer()!.getAttribute('height'))).toBeGreaterThanOrEqual(480)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Player directory' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open in Map Forge' })).toHaveAttribute('href', viewer()!.src)
    expect(screen.queryByText('4 / 32')).not.toBeInTheDocument()
    expect(screen.queryByText('Recent server data')).not.toBeInTheDocument()
    expect(screen.queryByText('Reported map')).not.toBeInTheDocument()
    expect(screen.queryByText('Game Mode')).not.toBeInTheDocument()
    expect(screen.queryByText('Last server update')).not.toBeInTheDocument()
    expect(document.querySelector('time')).not.toBeInTheDocument()
  })

  it('shows no map rather than opening a default when the server has not reported one', async () => {
    vi.mocked(fetchAPI).mockResolvedValue(ok(snapshot({ map: null, updatedAt: null, players: null, maxPlayers: null })))
    renderPage()
    await vi.waitFor(() =>
      expect(screen.getByText('No valid map has been reported by this server yet.')).toBeInTheDocument(),
    )
    expect(viewer()).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Open in Map Forge' })).not.toBeInTheDocument()
    expect(screen.queryByText('— / —')).not.toBeInTheDocument()
  })

  it('preserves a previously reported map without rendering server status or timestamps', async () => {
    const updatedAt = new Date(Date.now() - 600_000).toISOString()
    vi.mocked(fetchAPI).mockResolvedValue(ok(snapshot({ updatedAt })))
    renderPage()
    await ready()
    expect(viewerUrl().pathname).toBe('/api/embed/gm_construct')
    expect(screen.queryByText('Last known server data')).not.toBeInTheDocument()
    expect(screen.queryByText('Recent server data')).not.toBeInTheDocument()
    expect(document.querySelector('time')).not.toBeInTheDocument()
  })

  it('retries a failed endpoint without showing an unrelated map', async () => {
    vi.mocked(fetchAPI)
      .mockResolvedValueOnce({ ok: false } as Response)
      .mockResolvedValueOnce(ok(snapshot()))
    renderPage()
    await vi.waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(viewer()).not.toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await ready()
    expect(fetchAPI).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('refuses a snapshot from a different server', async () => {
    vi.mocked(fetchAPI).mockResolvedValue(ok(snapshot({ serverID: 'another-server' })))
    renderPage()
    await vi.waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(viewer()).not.toBeInTheDocument()
  })

  it('preserves the iframe and camera when automatic refresh still names the same map', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    vi.mocked(fetchAPI)
      .mockResolvedValueOnce(ok(snapshot()))
      .mockResolvedValueOnce(ok(snapshot({ players: 8 })))
    renderPage()
    await ready()
    const originalViewer = viewer()
    await vi.advanceTimersByTimeAsync(15_000)
    expect(fetchAPI).toHaveBeenCalledTimes(2)
    expect(viewer()).toBe(originalViewer)
    expect(screen.queryByText('8 / 32')).not.toBeInTheDocument()
  })

  it('replaces the iframe when the server changes map', async () => {
    vi.mocked(fetchAPI)
      .mockResolvedValueOnce(ok(snapshot()))
      .mockResolvedValueOnce(ok(snapshot({ map: 'gm_flatgrass' })))
    renderPage()
    await ready()
    const originalViewer = viewer()
    await fireEvent.click(screen.getByRole('button', { name: 'Reload map' }))
    await vi.waitFor(() => expect(viewerUrl().pathname).toBe('/api/embed/gm_flatgrass'))
    expect(viewer()).not.toBe(originalViewer)
    expect(originalViewer).not.toBeInTheDocument()
  })

  it('reloads the current iframe after refreshing the server map', async () => {
    renderPage()
    await ready()
    const originalViewer = viewer()
    const originalUrl = viewer()!.src
    await fireEvent.click(screen.getByRole('button', { name: 'Reload map' }))
    await vi.waitFor(() => expect(viewer()).not.toBe(originalViewer))
    expect(viewer()).toHaveAttribute('src', originalUrl)
    expect(fetchAPI).toHaveBeenCalledTimes(2)
  })

  it('syncs the viewer and external link to the site theme', async () => {
    renderPage()
    await ready()
    expect(viewerUrl().searchParams.get('theme')).toBe('light')
    setThemeMode('dark')
    expect(viewerUrl().searchParams.get('theme')).toBe('dark')
    expect(screen.getByRole('link', { name: 'Open in Map Forge' })).toHaveAttribute('href', viewer()!.src)
  })

  it('hides the previous server while the new route loads and aborts the previous request', async () => {
    let resolveNext!: (response: Response) => void
    vi.mocked(fetchAPI)
      .mockResolvedValueOnce(ok(snapshot()))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveNext = resolve
          }),
      )
    const { history } = renderPage()
    await ready()
    const originalSignal = vi.mocked(fetchAPI).mock.calls[0][3]!.signal!
    history.set({ value: '/dashboard/guilds/guild-two/config/servers/server-two/map', replace: true })
    await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledTimes(2))
    expect(viewer()).not.toBeInTheDocument()
    expect(originalSignal.aborted).toBe(true)
    expect(vi.mocked(fetchAPI).mock.calls[1][0]).toBe('/users/:discordID/guilds/guild-two/servers/server-two/map')
    resolveNext(ok(snapshot({ serverID: 'server-two', map: 'gm_flatgrass' })))
    await ready()
    expect(viewerUrl().pathname).toBe('/api/embed/gm_flatgrass')
    expect(screen.getByRole('link', { name: 'Open in Map Forge' })).toHaveAttribute('href', viewer()!.src)
  })

  it('polls the server periodically and stops polling after unmount', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const { unmount } = renderPage()
    await ready()
    await vi.advanceTimersByTimeAsync(15_000)
    expect(fetchAPI).toHaveBeenCalledTimes(2)
    const signal = vi.mocked(fetchAPI).mock.calls.at(-1)![3]!.signal!
    unmount()
    expect(signal.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(fetchAPI).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })
})
