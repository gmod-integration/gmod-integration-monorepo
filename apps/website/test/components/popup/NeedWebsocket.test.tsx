import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../../testUtils.js'
import { NeedWebsocket } from '../../../src/components/popup/NeedWebsocket.js'
import {
  requestServerStatus,
  setWebSocketServerStatus,
  setWebSocketSignal,
  stopWebSocket,
} from '../../../src/utils/websocket.js'

const status = (serverID = 's1', connected = false) => ({
  serverID,
  isWebSocketConnected: connected,
  lastRequest: new Date(),
  version: '1.0.0',
  versionComparator: 0,
  action: 'server_status',
})
function transport(readyState: number = WebSocket.OPEN) {
  return { readyState, send: vi.fn(), close: vi.fn() }
}
function renderNotice() {
  const history = historyAt('/dashboard/guilds/g1/config/servers/s1/roles')
  return {
    history,
    ...renderWithProviders(() => <NeedWebsocket />, {
      path: '/dashboard/guilds/:guildID/config/servers/:serverID/roles',
      history,
    }),
  }
}
beforeEach(() => {
  localStorage.clear()
  stopWebSocket()
})
afterEach(() => {
  cleanup()
  stopWebSocket()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('components/popup/NeedWebsocket.tsx', () => {
  it('explains the mandatory addon dependency without claiming the module is missing', () => {
    renderNotice()
    const link = screen.getByRole('link', { name: 'GWSockets' })
    expect(link).toHaveAttribute('href', 'https://docs.gmod-integration.com/getting-started/installation#dll')
    const notice = screen.getByRole('note')
    expect(notice).toHaveTextContent('GWSockets is required')
    expect(notice).toHaveTextContent('garrysmod/lua/bin')
    expect(notice).toHaveTextContent('operating system and architecture, then restart the server')
    expect(notice).toHaveTextContent('the addon is unusable')
    expect(notice).not.toHaveTextContent('Local addon configuration remains available')
    expect(notice).not.toHaveTextContent(/is missing|not installed/)
  })

  it('does not hide guidance just because the browser transport is open or another server is connected', () => {
    setWebSocketSignal(transport() as unknown as WebSocket)
    setWebSocketServerStatus(status('another-server', true))
    renderNotice()
    expect(screen.getByRole('note')).toBeInTheDocument()
    setWebSocketServerStatus(status('s1', false))
    expect(screen.getByRole('note')).toBeInTheDocument()
  })

  it('hides guidance after confirmation for the selected server and restores it when the server disconnects', () => {
    setWebSocketSignal(transport() as unknown as WebSocket)
    renderNotice()
    expect(screen.getByRole('note')).toBeInTheDocument()
    setWebSocketServerStatus(status('s1', true))
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
    setWebSocketServerStatus(status('s1', false))
    expect(screen.getByRole('note')).toBeInTheDocument()
  })

  it('keeps guidance visible without an open browser connection even when an old status says connected', () => {
    setWebSocketServerStatus(status('s1', true))
    renderNotice()
    expect(screen.getByRole('note')).toBeInTheDocument()
    setWebSocketSignal(transport(WebSocket.CONNECTING) as unknown as WebSocket)
    expect(screen.getByRole('note')).toBeInTheDocument()
    setWebSocketSignal(transport() as unknown as WebSocket)
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
    setWebSocketSignal(null)
    expect(screen.getByRole('note')).toBeInTheDocument()
  })

  it('checks server changes immediately rather than trusting the previous server confirmation', async () => {
    const ws = transport()
    setWebSocketSignal(ws as unknown as WebSocket)
    setWebSocketServerStatus(status('s1', true))
    const { history } = renderNotice()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
    history.set({ value: '/dashboard/guilds/g1/config/servers/s2/roles', replace: true })
    await vi.waitFor(() => expect(screen.getByRole('note')).toBeInTheDocument())
    expect(ws.send.mock.calls.map(([value]) => JSON.parse(value).data.serverID)).toEqual(['s1', 's2'])
    setWebSocketServerStatus(status('s2', true))
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('polls while hidden to detect disconnects, shares requests and cleans up after unmount', () => {
    vi.useFakeTimers()
    const ws = transport()
    setWebSocketSignal(ws as unknown as WebSocket)
    setWebSocketServerStatus(status('s1', true))
    const { unmount } = renderNotice()
    expect(ws.send).toHaveBeenCalledOnce()
    expect(requestServerStatus('s1')).toBe(false)
    vi.advanceTimersByTime(2_000)
    expect(ws.send).toHaveBeenCalledTimes(2)
    unmount()
    vi.advanceTimersByTime(4_000)
    expect(ws.send).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })
})
