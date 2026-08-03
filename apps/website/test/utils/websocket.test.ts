import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setIsLogged } from '../../src/utils/event.js'

class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  url: string
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: ((error: unknown) => void) | null = null
  close = vi.fn()
  send = vi.fn()
  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }
}

vi.stubGlobal('WebSocket', FakeWebSocket)

const {
  initWebSocket,
  sendWebSocketMessage,
  webSocketSignal,
  setWebSocketSignal,
  webSocketLogsMessages,
  setWebSocketLogsMessages,
  webSocketServerStatus,
  websocket,
} = await import('../../src/utils/websocket.js')

describe('utils/websocket.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
    FakeWebSocket.instances.length = 0
    setIsLogged(false)
    // These are module-level singleton signals, so they have to be reset by hand between tests
    // or `initWebSocket`'s "already connected" guard makes every test after the first a no-op,
    // and stale log entries would leak across tests.
    setWebSocketSignal(null)
    setWebSocketLogsMessages([])
  })

  afterEach(() => {
    const logSpy = vi.spyOn(console, 'log')
    logSpy.mockRestore()
  })

  describe('websocket()', () => {
    it('builds the base URL from localStorage-backed params plus any extra query params', () => {
      window.localStorage.setItem('accessToken', 'tok1')
      window.localStorage.setItem('discordID', 'd1')
      window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1' }))
      window.localStorage.setItem('server', JSON.stringify({ id: 's1' }))
      const url = websocket(['extra=1'])
      expect(url).toBe('ws://localhost:5002?action=main&token=tok1&discordID=d1&guildID=g1&serverID=s1&extra=1')
    })
  })

  describe('initWebSocket', () => {
    it('does nothing when the user is not logged in', () => {
      setIsLogged(false)
      const cleanup = initWebSocket()
      expect(cleanup).toBeUndefined()
      expect(FakeWebSocket.instances).toHaveLength(0)
    })

    it('does not open a second socket when one already exists and forceClose is false', () => {
      setIsLogged(true)
      initWebSocket()
      expect(FakeWebSocket.instances).toHaveLength(1)
      initWebSocket()
      expect(FakeWebSocket.instances).toHaveLength(1)
    })

    it('opens a new socket when forceClose is true even if one already exists', () => {
      setIsLogged(true)
      initWebSocket()
      expect(FakeWebSocket.instances).toHaveLength(1)
      initWebSocket(true)
      expect(FakeWebSocket.instances).toHaveLength(2)
    })

    it('logs on open/close and errors on error', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      setIsLogged(true)
      initWebSocket()
      const ws = FakeWebSocket.instances[0]
      ws.onopen?.()
      ws.onclose?.()
      ws.onerror?.(new Error('boom'))
      expect(logSpy).toHaveBeenCalledWith('WebSocket connection opened')
      expect(logSpy).toHaveBeenCalledWith('WebSocket connection closed')
      expect(errorSpy).toHaveBeenCalledWith('WebSocket error:', expect.any(Error))
      logSpy.mockRestore()
      errorSpy.mockRestore()
    })

    it('the returned cleanup function closes the socket', () => {
      setIsLogged(true)
      const cleanup = initWebSocket()
      const ws = FakeWebSocket.instances[0]
      cleanup?.()
      expect(ws.close).toHaveBeenCalled()
    })

    describe('onmessage', () => {
      function emit(data: unknown) {
        FakeWebSocket.instances[0].onmessage?.({ data: JSON.stringify(data) })
      }

      it('ignores a message with no action', () => {
        setIsLogged(true)
        initWebSocket()
        emit({})
        expect(webSocketLogsMessages()).toEqual([])
      })

      it('ignores server_logs for a different serverID', () => {
        window.localStorage.setItem('server', JSON.stringify({ id: 's1' }))
        setIsLogged(true)
        initWebSocket()
        emit({ action: 'server_logs', serverID: 'other', data: { line: 'x' } })
        expect(webSocketLogsMessages()).toEqual([])
      })

      it('prepends server_logs data for the current serverID', () => {
        window.localStorage.setItem('server', JSON.stringify({ id: 's1' }))
        setIsLogged(true)
        initWebSocket()
        emit({ action: 'server_logs', serverID: 's1', data: { line: 'first' } })
        emit({ action: 'server_logs', serverID: 's1', data: { line: 'second' } })
        expect(webSocketLogsMessages()).toEqual([{ line: 'second' }, { line: 'first' }])
      })

      it('ignores server_status for a different serverID', () => {
        window.localStorage.setItem('server', JSON.stringify({ id: 's1' }))
        setIsLogged(true)
        initWebSocket()
        const before = webSocketServerStatus()
        emit({ action: 'server_status', serverID: 'other', lastRequest: new Date().toISOString() })
        expect(webSocketServerStatus()).toBe(before)
      })

      it('updates server_status for the current serverID, parsing lastRequest into a Date', () => {
        window.localStorage.setItem('server', JSON.stringify({ id: 's1' }))
        setIsLogged(true)
        initWebSocket()
        emit({
          action: 'server_status',
          serverID: 's1',
          isWebSocketConnected: true,
          version: '1.2.3',
          versionComparator: 0,
          lastRequest: '2026-01-01T00:00:00.000Z',
        })
        const status = webSocketServerStatus()
        expect(status.isWebSocketConnected).toBe(true)
        expect(status.version).toBe('1.2.3')
        expect(status.lastRequest).toBeInstanceOf(Date)
        expect(status.lastRequest.toISOString()).toBe('2026-01-01T00:00:00.000Z')
      })

      it('ignores an unrecognized action', () => {
        setIsLogged(true)
        initWebSocket()
        expect(() => emit({ action: 'not-a-real-action' })).not.toThrow()
      })
    })
  })

  describe('sendWebSocketMessage', () => {
    it('does nothing when there is no active socket', () => {
      expect(webSocketSignal()).toBeNull()
      expect(() => sendWebSocketMessage('ping', { x: 1 })).not.toThrow()
    })

    it('sends a JSON-encoded action+data payload over the active socket', () => {
      setIsLogged(true)
      initWebSocket()
      sendWebSocketMessage('ping', { x: 1 })
      const ws = FakeWebSocket.instances[0]
      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ action: 'ping', data: { x: 1 } }))
    })
  })
})
