import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../../../../../testUtils.js'

vi.mock('../../../../../../src/utils/api.js', () => ({
  fetchAPI: vi.fn(),
  getAPIUrl: vi.fn(),
  getUrlWithActualParams: vi.fn((s: string) => s),
}))

import { fetchAPI } from '../../../../../../src/utils/api.js'
import { setWebSocketLogsMessages, webSocketLogsMessages } from '../../../../../../src/utils/websocket.js'
import { ServerLogsList } from '../../../../../../src/pages/dashboard/guilds/servers/logs/ServerLogsList.js'

afterEach(() => cleanup())

function jsonResponse(ok: boolean, body: unknown) {
  return { ok, json: async () => body }
}

function logsBody(total: number, count = total) {
  return {
    logs: Array.from({ length: count }, (_, i) => ({
      id: i,
      serverID: 's1',
      type: 'player_ready',
      data: { ply: { name: `Player${i}` } },
      createdAt: '2024-01-01T00:00:00.000Z',
    })),
    query: { limit: 25, offset: 0, sort: 'createdAt', orderBy: 'DESC', total },
  }
}

function renderPage() {
  return renderWithProviders(() => <ServerLogsList />, {
    path: '/dashboard/guilds/:guildID/config/servers/:serverID/logs',
    history: historyAt('/dashboard/guilds/g1/config/servers/s1/logs'),
  })
}

function setPremium(isPremium: boolean) {
  window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium }))
}

describe('pages/dashboard/guilds/servers/logs/ServerLogsList.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setPremium(true)
    setWebSocketLogsMessages([])
    vi.mocked(fetchAPI).mockReset()
  })

  it('shows a loading indicator before the first fetch resolves', () => {
    let resolveFetch: (v: unknown) => void = () => {}
    vi.mocked(fetchAPI).mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve
      }) as never,
    )
    const { container } = renderPage()
    expect(container.querySelector('.loading')).toBeInTheDocument()
    resolveFetch(jsonResponse(true, logsBody(0)))
  })

  it('fetches and renders logs with the correct query string', async () => {
    vi.mocked(fetchAPI).mockResolvedValue(jsonResponse(true, logsBody(2)) as never)
    renderPage()
    await vi.waitFor(() => expect(screen.getByText('Player0')).toBeInTheDocument())
    expect(fetchAPI).toHaveBeenCalledWith(
      '/users/:discordID/guilds/:guildID/servers/:serverID/logs?offset=0&limit=25&sort=createdAt&orderBy=DESC',
      'GET',
    )
  })

  it('keeps a failed request inside the table and allows retry without leaving the page', async () => {
    vi.mocked(fetchAPI)
      .mockResolvedValueOnce(jsonResponse(false, {}) as never)
      .mockResolvedValueOnce(jsonResponse(true, logsBody(1)) as never)
    const { container } = renderPage()
    await vi.waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Unable to load event history. Try again.'),
    )
    expect(container.querySelector('tbody > tr > td [role=alert]')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await vi.waitFor(() => expect(screen.getByText('Player0')).toBeInTheDocument())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('renders live websocket log messages when on the first page', async () => {
    vi.mocked(fetchAPI).mockResolvedValue(jsonResponse(true, logsBody(0)) as never)
    renderPage()
    await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalled())
    setWebSocketLogsMessages([{ type: 'player_ready', data: { ply: { name: 'LiveBob' } } }])
    await vi.waitFor(() => expect(screen.getByText('LiveBob')).toBeInTheDocument())
  })

  it('resets websocket log messages on mount', async () => {
    setWebSocketLogsMessages([{ type: 'player_ready', data: { ply: { name: 'Stale' } } }])
    vi.mocked(fetchAPI).mockResolvedValue(jsonResponse(true, logsBody(0)) as never)
    renderPage()
    expect(webSocketLogsMessages()).toEqual([])
  })

  it('hides live websocket messages and resets them once paginated past the first page', async () => {
    vi.mocked(fetchAPI).mockResolvedValue(jsonResponse(true, logsBody(100)) as never)
    const { container } = renderPage()
    await vi.waitFor(() => expect(screen.getByText('Player0')).toBeInTheDocument())
    setWebSocketLogsMessages([{ type: 'player_ready', data: { ply: { name: 'LiveBob' } } }])
    await vi.waitFor(() => expect(screen.getByText('LiveBob')).toBeInTheDocument())

    const nextBtn = container.querySelector('svg[data-icon="chevron-right"]')!.closest('button')!
    await fireEvent.click(nextBtn)

    await vi.waitFor(() => expect(webSocketLogsMessages()).toEqual([]))
    expect(screen.queryByText('LiveBob')).not.toBeInTheDocument()
  })

  it('preserves the pagination window acknowledged by the API without local truncation', async () => {
    setPremium(false)
    vi.mocked(fetchAPI).mockResolvedValue(jsonResponse(true, logsBody(600, 3)) as never)
    renderPage()
    await vi.waitFor(() => expect(screen.getByText('Player0')).toBeInTheDocument())
    // The service now owns the allowed window and acknowledged total.
    expect(screen.getByText('1 / 24')).toBeInTheDocument()
  })

  it('does not truncate for premium users even when the server reports more than 500', async () => {
    setPremium(true)
    vi.mocked(fetchAPI).mockResolvedValue(jsonResponse(true, logsBody(600, 3)) as never)
    renderPage()
    await vi.waitFor(() => expect(screen.getByText('Player0')).toBeInTheDocument())
    // total pages = ceil(600/25) = 24
    expect(screen.getByText('1 / 24')).toBeInTheDocument()
  })

  it('does not truncate for non-premium users when the total is already under 500', async () => {
    setPremium(false)
    vi.mocked(fetchAPI).mockResolvedValue(jsonResponse(true, logsBody(10)) as never)
    renderPage()
    await vi.waitFor(() => expect(screen.getByText('Player0')).toBeInTheDocument())
    expect(screen.getByText('1 / 1')).toBeInTheDocument()
  })
})
