import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { acceptAuthSession, authStatus, resetAuthentication } from '../../src/utils/authClient.js'
import { setIsLogged } from '../../src/utils/event.js'
import { ACCESS_REFRESH_EVENT } from '../../src/utils/accessEvents.js'
import {
  initWebSocket,
  stopWebSocket,
  sendWebSocketMessage,
  webSocketSignal,
  webSocketLogsMessages,
  setWebSocketLogsMessages,
  webSocketServerStatus,
  websocket,
} from '../../src/utils/websocket.js'

class FakeWebSocket {
  static OPEN = 1
  static CONNECTING = 0
  static instances: FakeWebSocket[] = []
  readyState = 0
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: ((event: { code: number }) => void) | null = null
  onerror: (() => void) | null = null
  close = vi.fn(() => {
    this.readyState = 3
  })
  send = vi.fn()
  constructor(public url: string) {
    FakeWebSocket.instances.push(this)
  }
}
const session = {
  authenticated: true as const,
  user: {
    id: 'd1',
    username: 'Bob',
    globalName: 'Bob',
    displayName: 'Bob',
    discriminator: '',
    avatarURL: '',
    displayAvatarURL: '',
  },
  session: { id: 'session1', expiresAt: '2099-01-01T00:00:00.000Z', absoluteExpiresAt: '2099-01-01T00:00:00.000Z' },
  csrfToken: 'csrf',
}
beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('WebSocket', FakeWebSocket)
  FakeWebSocket.instances = []
  resetAuthentication()
  setWebSocketLogsMessages([])
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockImplementation(
        async (url: string) =>
          new Response(
            JSON.stringify(
              url.endsWith('/session')
                ? session
                : { ticket: 'single-use-ticket', expiresAt: '2099-01-01T00:00:00.000Z' },
            ),
          ),
      ),
  )
})
afterEach(() => {
  stopWebSocket()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
async function connect() {
  acceptAuthSession(session)
  await initWebSocket()
  return FakeWebSocket.instances[0]
}
const emit = (ws: FakeWebSocket, data: unknown) => ws.onmessage?.({ data: JSON.stringify(data) })
const serverStatus = (connected = true) => ({
  action: 'server_status',
  serverID: 's1',
  isWebSocketConnected: connected,
  lastRequest: new Date().toISOString(),
  version: '1.2.3',
  versionComparator: 0,
})

describe('cookie authenticated WebSocket transport', () => {
  it('uses a short ticket and never puts persistent credentials in the URL', () => {
    localStorage.setItem('accessToken', 'persistent-secret')
    localStorage.setItem('server', JSON.stringify({ id: 's1' }))
    const value = new URL(websocket(['extra=1', 'token=injected'], 'ticket'))
    expect(value.searchParams.get('ticket')).toBe('ticket')
    expect(value.searchParams.get('serverID')).toBe('s1')
    expect(value.searchParams.get('extra')).toBe('1')
    expect(value.searchParams.has('token')).toBe(false)
    expect(value.searchParams.has('discordID')).toBe(false)
  })
  it('does not connect while signed out', async () => {
    await initWebSocket()
    expect(FakeWebSocket.instances).toHaveLength(0)
  })
  it('deduplicates connecting sockets and requests a CSRF-protected ticket', async () => {
    acceptAuthSession(session)
    await Promise.all([initWebSocket(), initWebSocket()])
    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(vi.mocked(fetch).mock.calls).toHaveLength(1)
    const request = vi.mocked(fetch).mock.calls[0][1]!
    expect(request.credentials).toBe('include')
    expect(new Headers(request.headers).get('X-CSRF-Token')).toBe('csrf')
  })
  it('closes the previous transport when explicitly reconnecting', async () => {
    const previous = await connect()
    await initWebSocket(true)
    expect(previous.close).toHaveBeenCalledOnce()
    expect(FakeWebSocket.instances).toHaveLength(2)
  })
  it('replaces a pending ticket when the account changes and ignores its late acknowledgement', async () => {
    let finish!: (value: Response) => void
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<Response>((resolve) => {
              finish = resolve
            }),
        )
        .mockResolvedValueOnce(new Response(JSON.stringify({ ticket: 'new-account-ticket' }))),
    )
    acceptAuthSession(session)
    const previous = initWebSocket()
    acceptAuthSession({ ...session, session: { ...session.session, id: 'new-account-session' } })
    await initWebSocket()
    finish(new Response(JSON.stringify({ ticket: 'old-account-ticket' })))
    await previous
    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(new URL(FakeWebSocket.instances[0].url).searchParams.get('ticket')).toBe('new-account-ticket')
  })
  it('reconnects a closed transport with a fresh ticket after a network interruption', async () => {
    vi.useFakeTimers()
    const old = await connect()
    old.readyState = 3
    old.onclose?.({ code: 1006 })
    expect(webSocketSignal()).toBeNull()
    await vi.advanceTimersByTimeAsync(1600)
    expect(FakeWebSocket.instances).toHaveLength(2)
    expect(vi.mocked(fetch).mock.calls).toHaveLength(2)
  })
  it('preserves pending backoff across repeated initializations and same-session refreshes', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const ws = await connect()
    ws.readyState = 3
    await ws.onclose?.({ code: 1006 })
    await Promise.all([initWebSocket(), initWebSocket()])
    acceptAuthSession({ ...session, csrfToken: 'refreshed-csrf' })
    await initWebSocket()
    expect(fetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(999)
    expect(fetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(FakeWebSocket.instances).toHaveLength(2)
  })
  it('increases backoff when connections open but immediately fail backend verification', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    let ws = await connect()
    for (const [index, delay] of [1000, 2000, 4000, 8000].entries()) {
      ws.readyState = FakeWebSocket.OPEN
      ws.onopen?.()
      await vi.advanceTimersByTimeAsync(100)
      ws.readyState = 3
      await ws.onclose?.({ code: 1013 })
      await vi.advanceTimersByTimeAsync(delay - 1)
      expect(fetch).toHaveBeenCalledTimes(index + 1)
      await vi.advanceTimersByTimeAsync(1)
      expect(fetch).toHaveBeenCalledTimes(index + 2)
      ws = FakeWebSocket.instances[index + 1]
    }
  })
  it('resets backoff after the replacement connection stays open', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const previous = await connect()
    previous.readyState = 3
    await previous.onclose?.({ code: 1006 })
    await vi.advanceTimersByTimeAsync(1000)
    const ws = FakeWebSocket.instances[1]
    ws.readyState = FakeWebSocket.OPEN
    ws.onopen?.()
    await vi.advanceTimersByTimeAsync(10_000)
    ws.readyState = 3
    await ws.onclose?.({ code: 1006 })
    await vi.advanceTimersByTimeAsync(999)
    expect(fetch).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetch).toHaveBeenCalledTimes(3)
  })
  it.each(['explicit reconnect', 'account change'])('replaces a pending retry after an %s', async (reason) => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const previous = await connect()
    previous.readyState = 3
    await previous.onclose?.({ code: 1006 })
    if (reason === 'account change') {
      acceptAuthSession({ ...session, session: { ...session.session, id: 'replacement-session' } })
    }
    await initWebSocket(reason === 'explicit reconnect')
    expect(fetch).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(500)
    const ws = FakeWebSocket.instances[1]
    ws.readyState = 3
    await ws.onclose?.({ code: 1006 })
    await vi.advanceTimersByTimeAsync(999)
    expect(fetch).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetch).toHaveBeenCalledTimes(3)
  })
  it('clears the last verified addon status immediately when the dashboard disconnects', async () => {
    vi.useFakeTimers()
    localStorage.setItem('server', JSON.stringify({ id: 's1' }))
    const ws = await connect()
    ws.readyState = FakeWebSocket.OPEN
    ws.onopen?.()
    emit(ws, serverStatus())
    expect(webSocketServerStatus().isWebSocketConnected).toBe(true)
    ws.readyState = 3
    await ws.onclose?.({ code: 1006 })
    expect(webSocketServerStatus().serverID).toBe('')
    expect(webSocketServerStatus().lastRequest.getTime()).toBe(0)
    expect(webSocketServerStatus().isWebSocketConnected).toBe(false)
    await vi.advanceTimersByTimeAsync(1600)
    const replacement = FakeWebSocket.instances[1]
    expect(webSocketServerStatus().serverID).toBe('')
    emit(replacement, serverStatus(false))
    expect(webSocketServerStatus().serverID).toBe('s1')
    expect(webSocketServerStatus().isWebSocketConnected).toBe(false)
  })
  it('clears addon status when stopping or changing the application session', async () => {
    localStorage.setItem('server', JSON.stringify({ id: 's1' }))
    const ws = await connect()
    emit(ws, serverStatus())
    acceptAuthSession({ ...session, session: { ...session.session, id: 'support-session' } })
    await initWebSocket()
    expect(ws.close).toHaveBeenCalledOnce()
    expect(webSocketServerStatus().serverID).toBe('')
    emit(FakeWebSocket.instances[1], serverStatus())
    stopWebSocket()
    expect(webSocketServerStatus().serverID).toBe('')
    expect(webSocketServerStatus().lastRequest.getTime()).toBe(0)
  })
  it('ignores queued updates and closes from an older socket after replacement', async () => {
    localStorage.setItem('server', JSON.stringify({ id: 's1' }))
    const previous = await connect()
    const lateMessage = previous.onmessage!
    const lateClose = previous.onclose!
    previous.readyState = 3
    await initWebSocket()
    const replacement = FakeWebSocket.instances[1]
    emit(replacement, serverStatus())
    lateMessage({ data: JSON.stringify(serverStatus(false)) })
    await lateClose({ code: 4003 })
    expect(webSocketSignal()).toBe(replacement)
    expect(webSocketServerStatus().isWebSocketConnected).toBe(true)
    expect(authStatus()).toBe('authenticated')
  })
  it('invalidates cached status after losing access to the selected server', async () => {
    localStorage.setItem('server', JSON.stringify({ id: 's1' }))
    const ws = await connect()
    emit(ws, serverStatus())
    emit(ws, { action: 'error', error: 'forbidden', serverID: 's1' })
    expect(webSocketServerStatus().serverID).toBe('')
  })
  it('stops pending reconnection and ignores old callbacks at logout', async () => {
    vi.useFakeTimers()
    const old = await connect()
    old.onclose?.({ code: 1006 })
    stopWebSocket()
    setIsLogged(false)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(webSocketSignal()).toBeNull()
  })
  it('stops reconnecting on a Discord authorization failure while preserving the application session', async () => {
    vi.useFakeTimers()
    const old = await connect()
    old.onclose?.({ code: 4003 })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(authStatus()).toBe('reauth_required')
    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(webSocketSignal()).toBeNull()
  })
  it('does not loop ticket requests when Discord authorization is required', async () => {
    vi.useFakeTimers()
    acceptAuthSession(session)
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: { code: 'discord_reauth_required' } }), { status: 403 }),
        ),
    )
    await initWebSocket()
    await vi.advanceTimersByTimeAsync(60_000)
    await initWebSocket()
    expect(authStatus()).toBe('reauth_required')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(FakeWebSocket.instances).toHaveLength(0)
  })
  it('only sends while OPEN and never throws on a closed transport', async () => {
    const ws = await connect()
    expect(sendWebSocketMessage('ping', {})).toBe(false)
    ws.readyState = FakeWebSocket.OPEN
    expect(sendWebSocketMessage('ping', { x: 1 })).toBe(true)
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ action: 'ping', data: { x: 1 } }))
    ws.readyState = 3
    expect(sendWebSocketMessage('ping', {})).toBe(false)
  })
  it('refreshes access when the transport opens and tolerates an error until close', async () => {
    const refresh = vi.fn()
    window.addEventListener(ACCESS_REFRESH_EVENT, refresh)
    try {
      const ws = await connect()
      ws.readyState = FakeWebSocket.OPEN
      ws.onopen?.()
      expect(refresh).toHaveBeenCalledOnce()
      expect(refresh.mock.calls[0][0].detail).toEqual({ reason: 'background' })
      emit(ws, { action: 'access_changed' })
      expect(refresh).toHaveBeenCalledTimes(2)
      expect(refresh.mock.calls[1][0].detail).toEqual({ reason: 'invalidate' })
      expect(() => ws.onerror?.()).not.toThrow()
      const lateOpen = ws.onopen!
      stopWebSocket()
      lateOpen()
      expect(ws.close).toHaveBeenCalledTimes(2)
    } finally {
      window.removeEventListener(ACCESS_REFRESH_EVENT, refresh)
    }
  })
  it('checks a policy close against the application session before ending reconnection', async () => {
    vi.useFakeTimers()
    const ws = await connect()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })))
    ws.readyState = 3
    await ws.onclose?.({ code: 1008 })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(authStatus()).toBe('signed_out')
    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:5001/v6/auth/session',
      expect.objectContaining({ credentials: 'include' }),
    )
  })
  it('ignores a delayed policy-close session check after explicit replacement', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const previous = await connect()
    let finish!: (value: Response) => void
    const network = vi.fn().mockImplementation((url: string) =>
      url.endsWith('/session')
        ? new Promise<Response>((resolve) => {
            finish = resolve
          })
        : Promise.resolve(new Response(JSON.stringify({ ticket: 'replacement-ticket' }))),
    )
    vi.stubGlobal('fetch', network)
    previous.readyState = 3
    const pendingClose = previous.onclose?.({ code: 1008 })
    await initWebSocket(true)
    const ws = FakeWebSocket.instances[1]
    finish(new Response(JSON.stringify(session)))
    await pendingClose
    expect(network).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(500)
    ws.readyState = 3
    await ws.onclose?.({ code: 1006 })
    await vi.advanceTimersByTimeAsync(999)
    expect(network).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(network).toHaveBeenCalledTimes(3)
  })
  it('rejects a malformed ticket and obtains a fresh one after bounded backoff', async () => {
    vi.useFakeTimers()
    acceptAuthSession(session)
    const network = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ticket: '' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ticket: 'valid-retry-ticket' })))
    vi.stubGlobal('fetch', network)
    await initWebSocket()
    expect(FakeWebSocket.instances).toHaveLength(0)
    await initWebSocket()
    expect(network).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1600)
    expect(network).toHaveBeenCalledTimes(2)
    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(new URL(FakeWebSocket.instances[0].url).searchParams.get('ticket')).toBe('valid-retry-ticket')
  })
  it('filters live updates by server and tolerates malformed messages', async () => {
    localStorage.setItem('server', JSON.stringify({ id: 's1' }))
    const ws = await connect()
    emit(ws, { action: 'server_logs', serverID: 'other', data: 'no' })
    emit(ws, { action: 'server_logs', serverID: 's1', data: 'first' })
    emit(ws, { action: 'server_logs', serverID: 's1', data: 'second' })
    expect(webSocketLogsMessages()).toEqual(['second', 'first'])
    emit(ws, serverStatus())
    expect(webSocketServerStatus().lastRequest).toBeInstanceOf(Date)
    expect(() => ws.onmessage?.({ data: '{bad' })).not.toThrow()
  })
})
