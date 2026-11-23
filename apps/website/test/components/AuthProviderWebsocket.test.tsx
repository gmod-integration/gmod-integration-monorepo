import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { MemoryRouter, Route } from '@solidjs/router'
import { createSignal } from 'solid-js'
import { AuthProvider } from '../../src/components/AuthProvider.js'
import { I18nProvider } from '../../src/i18n.js'
import { resetAuthentication } from '../../src/utils/authClient.js'
import { stopWebSocket } from '../../src/utils/websocket.js'
import { sessionFixture } from '../authFixture.js'

class FakeWebSocket {
  static OPEN = 1
  static CONNECTING = 0
  static instances: FakeWebSocket[] = []
  readyState = FakeWebSocket.CONNECTING
  onopen: (() => void) | null = null
  onclose: ((event: { code: number }) => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  close = vi.fn(() => {
    this.readyState = 3
  })
  send = vi.fn()
  constructor(public url: string) {
    FakeWebSocket.instances.push(this)
  }
}

const ticketReads = (network: ReturnType<typeof vi.fn>) =>
  network.mock.calls.filter(([url]) => String(url).endsWith('/ws-ticket'))

function mountProvider() {
  return render(() => (
    <MemoryRouter root={(props) => <I18nProvider>{props.children}</I18nProvider>}>
      <Route
        path="/"
        component={() => {
          const [draft, setDraft] = createSignal('Saved')
          return (
            <AuthProvider>
              <input aria-label="Draft" value={draft()} onInput={(event) => setDraft(event.currentTarget.value)} />
            </AuthProvider>
          )
        }}
      />
    </MemoryRouter>
  ))
}

function closeSocket(socket: FakeWebSocket, code = 1006) {
  socket.readyState = 3
  socket.onclose?.({ code })
}

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  stopWebSocket()
  resetAuthentication()
  FakeWebSocket.instances = []
  vi.stubGlobal('WebSocket', FakeWebSocket)
  vi.spyOn(Math, 'random').mockReturnValue(0)
})
afterEach(() => {
  cleanup()
  stopWebSocket()
  resetAuthentication()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('authentication provider with the real WebSocket lifecycle', () => {
  it('keeps socket-close reconnection behind the backoff instead of reacting immediately to its signal', async () => {
    const network = vi
      .fn()
      .mockImplementation(
        async (url: string) =>
          new Response(JSON.stringify(url.endsWith('/session') ? sessionFixture() : { ticket: 'one-use-ticket' })),
      )
    vi.stubGlobal('fetch', network)
    mountProvider()
    await vi.advanceTimersByTimeAsync(0)
    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(ticketReads(network)).toHaveLength(1)
    await fireEvent.input(screen.getByLabelText('Draft'), { target: { value: 'Keep this editor' } })

    closeSocket(FakeWebSocket.instances[0])
    await vi.advanceTimersByTimeAsync(0)
    expect(ticketReads(network)).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(999)
    expect(ticketReads(network)).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(ticketReads(network)).toHaveLength(2)
    expect(FakeWebSocket.instances).toHaveLength(2)
    expect(screen.getByLabelText('Draft')).toHaveValue('Keep this editor')
  })
})
