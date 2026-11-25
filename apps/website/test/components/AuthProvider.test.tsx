import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { AuthProvider } from '../../src/components/AuthProvider.js'
import {
  AUTH_STORAGE_KEY,
  acceptAuthSession,
  authenticatedFetch,
  authStatus,
  broadcastAuthChange,
  resetAuthentication,
} from '../../src/utils/authClient.js'
import { isLogged } from '../../src/utils/event.js'
import { initWebSocket, stopWebSocket } from '../../src/utils/websocket.js'
import { renderWithProviders } from '../testUtils.js'
import { sessionFixture } from '../authFixture.js'
vi.mock('../../src/utils/websocket.js', () => ({ initWebSocket: vi.fn(), stopWebSocket: vi.fn() }))
beforeEach(() => {
  localStorage.clear()
  resetAuthentication()
  vi.mocked(initWebSocket).mockClear()
  vi.mocked(stopWebSocket).mockClear()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})
function renderProvider() {
  return renderWithProviders(
    () => {
      const [value, setValue] = createSignal('Saved')
      return (
        <AuthProvider>
          <input aria-label="Draft" value={value()} onInput={(event) => setValue(event.currentTarget.value)} />
        </AuthProvider>
      )
    },
    { session: false },
  )
}
describe('application authentication provider', () => {
  it('loads authoritative identity and starts live transport only after a valid session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(sessionFixture()))))
    renderProvider()
    expect(isLogged()).toBe(false)
    await vi.waitFor(() => expect(isLogged()).toBe(true))
    expect(initWebSocket).toHaveBeenCalled()
    expect(localStorage.getItem('accessToken')).toBeNull()
  })
  it('keeps transport startup tied to the session identity rather than profile or expiry refreshes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(sessionFixture()))))
    renderProvider()
    await vi.waitFor(() => expect(authStatus()).toBe('authenticated'))
    expect(initWebSocket).toHaveBeenCalledTimes(1)
    const current = sessionFixture()
    acceptAuthSession({
      ...current,
      user: { ...current.user, displayName: 'Updated profile' },
      session: { ...current.session, expiresAt: '2099-02-01T00:00:00.000Z' },
    })
    expect(initWebSocket).toHaveBeenCalledTimes(1)
    acceptAuthSession({ ...current, session: { ...current.session, id: 'replacement-session' } })
    expect(initWebSocket).toHaveBeenCalledTimes(2)
  })
  it('retains a typed draft and session when a foreground check fails temporarily', async () => {
    const network = vi.fn().mockResolvedValue(new Response(JSON.stringify(sessionFixture())))
    vi.stubGlobal('fetch', network)
    renderProvider()
    await vi.waitFor(() => expect(authStatus()).toBe('authenticated'))
    await fireEvent.input(screen.getByLabelText('Draft'), { target: { value: 'Unsaved changes' } })
    network.mockResolvedValue(new Response('{}', { status: 503 }))
    window.dispatchEvent(new Event('focus'))
    await vi.waitFor(() => expect(authStatus()).toBe('temporarily_unavailable'))
    expect(isLogged()).toBe(true)
    expect(screen.getByLabelText('Draft')).toHaveValue('Unsaved changes')
    expect(screen.getByText(/connection is temporarily unavailable/)).toBeInTheDocument()
  })
  it('lets the user retry a temporary check without discarding the editor', async () => {
    const network = vi.fn().mockResolvedValue(new Response(JSON.stringify(sessionFixture())))
    vi.stubGlobal('fetch', network)
    renderProvider()
    await vi.waitFor(() => expect(authStatus()).toBe('authenticated'))
    await fireEvent.input(screen.getByLabelText('Draft'), { target: { value: 'Retry this draft' } })
    network.mockResolvedValue(new Response('{}', { status: 503 }))
    window.dispatchEvent(new Event('online'))
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled())
    network.mockResolvedValue(new Response(JSON.stringify(sessionFixture())))
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await vi.waitFor(() => expect(authStatus()).toBe('authenticated'))
    expect(screen.getByLabelText('Draft')).toHaveValue('Retry this draft')
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })
  it('opens Discord authorization in a separate safe tab while retaining the current draft', async () => {
    const network = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(sessionFixture())))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'discord_reauth_required' }), { status: 403 }))
    vi.stubGlobal('fetch', network)
    renderProvider()
    await vi.waitFor(() => expect(authStatus()).toBe('authenticated'))
    await fireEvent.input(screen.getByLabelText('Draft'), { target: { value: 'Keep this editor open' } })
    await authenticatedFetch('http://localhost:5001/v3/users/u1/guilds')
    const reconnect = screen.getByRole('link', { name: 'Sign in with Discord' })
    expect(reconnect).toHaveAttribute('target', '_blank')
    expect(reconnect).toHaveAttribute('rel', 'noopener noreferrer')
    expect(reconnect).toHaveAttribute('href', expect.stringContaining('/v3/users/login?redirect='))
    expect(screen.getByLabelText('Draft')).toHaveValue('Keep this editor open')
    expect(isLogged()).toBe(true)
  })
  it('revalidates the session at the server deadline without a user navigation', async () => {
    vi.useFakeTimers()
    const first = sessionFixture({
      session: { ...sessionFixture().session, expiresAt: new Date(Date.now() + 1000).toISOString() },
    })
    const network = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(first)))
      .mockResolvedValueOnce(new Response(JSON.stringify(sessionFixture())))
    vi.stubGlobal('fetch', network)
    renderProvider()
    await vi.advanceTimersByTimeAsync(0)
    expect(authStatus()).toBe('authenticated')
    await vi.advanceTimersByTimeAsync(1100)
    expect(network).toHaveBeenCalledTimes(2)
    expect(isLogged()).toBe(true)
  })
  it('keeps the editor mounted when return from an expired delegation receives a temporary failure', async () => {
    const delegated = sessionFixture({
      session: { ...sessionFixture().session, id: 'expired-delegation', actorDiscordID: 'operator' },
    })
    const network = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(delegated)))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: 'actor_session_available' }, csrfToken: 'operator-csrf' }), {
          status: 401,
        }),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
    vi.stubGlobal('fetch', network)
    renderProvider()
    await vi.waitFor(() => expect(authStatus()).toBe('authenticated'))
    await fireEvent.input(screen.getByLabelText('Draft'), { target: { value: 'Unsaved delegated edit' } })
    window.dispatchEvent(new Event('focus'))
    await vi.waitFor(() => expect(authStatus()).toBe('temporarily_unavailable'))
    expect(screen.getByLabelText('Draft')).toHaveValue('Unsaved delegated edit')
    expect(isLogged()).toBe(true)
    expect(network.mock.calls[2][0]).toBe('http://localhost:5001/v6/auth/impersonations/end')
  })
  it('rechecks a non-secret cross-tab revocation event without requiring a live socket', async () => {
    const network = vi.fn().mockResolvedValue(new Response(JSON.stringify(sessionFixture())))
    vi.stubGlobal('fetch', network)
    renderProvider()
    await vi.waitFor(() => expect(isLogged()).toBe(true))
    network.mockResolvedValue(new Response('{}', { status: 401 }))
    broadcastAuthChange()
    const notification = localStorage.getItem(AUTH_STORAGE_KEY)!
    expect(Object.keys(JSON.parse(notification)).sort()).toEqual(['at', 'nonce'])
    window.dispatchEvent(new StorageEvent('storage', { key: AUTH_STORAGE_KEY, newValue: notification }))
    await vi.waitFor(() => expect(authStatus()).toBe('signed_out'))
    expect(stopWebSocket).toHaveBeenCalled()
    expect(isLogged()).toBe(false)
    expect(network).toHaveBeenCalledTimes(2)
  })
  it('removes listeners and closes the transport when the provider unmounts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(sessionFixture()))))
    const remove = vi.spyOn(window, 'removeEventListener')
    const view = renderProvider()
    await vi.waitFor(() => expect(isLogged()).toBe(true))
    view.unmount()
    expect(remove).toHaveBeenCalledWith('focus', expect.any(Function))
    expect(remove).toHaveBeenCalledWith('storage', expect.any(Function))
    expect(stopWebSocket).toHaveBeenCalled()
  })
})
