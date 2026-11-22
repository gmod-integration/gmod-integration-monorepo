import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../testUtils.js'
import { authStatus, resetAuthentication } from '../../src/utils/authClient.js'
import { isLogged } from '../../src/utils/event.js'
import { sessionFixture } from '../authFixture.js'
import Login from '../../src/pages/Login.js'

beforeEach(() => {
  localStorage.clear()
  resetAuthentication()
  window.history.replaceState(null, '', '/login')
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
function renderLogin(path = '/login') {
  const history = historyAt(path)
  renderWithProviders(() => <Login />, { path: '/login', history, session: false })
  return history
}
describe('cookie session login', () => {
  it('restores identity from the server without a bearer callback or local token', async () => {
    const network = vi.fn().mockResolvedValue(json(sessionFixture()))
    vi.stubGlobal('fetch', network)
    const history = renderLogin()
    await vi.waitFor(() => expect(history.get()).toBe('/dashboard/guilds'))
    expect(isLogged()).toBe(true)
    expect(localStorage.getItem('accessToken')).toBeNull()
    expect(localStorage.getItem('expirationDate')).toBeNull()
    expect(network).toHaveBeenCalledWith(
      'http://localhost:5001/v6/auth/session',
      expect.objectContaining({ credentials: 'include', cache: 'no-store' }),
    )
  })
  it('preserves an internal destination after sign-in', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(sessionFixture())))
    const history = renderLogin('/login?redirect=%2Fdashboard%2Fguilds%2Fg1')
    await vi.waitFor(() => expect(history.get()).toBe('/dashboard/guilds/g1'))
  })
  it('does not navigate to an external or protocol-relative destination', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(sessionFixture())))
    const history = renderLogin('/login?redirect=https%3A%2F%2Fevil.example')
    await vi.waitFor(() => expect(history.get()).toBe('/dashboard/guilds'))
  })
  it('ignores an unsolicited URL bearer and converts only the pre-existing browser token', async () => {
    const path = '/login?accessToken=legacy-secret&discordID=u1&expirationDate=123'
    window.history.replaceState(null, '', path)
    localStorage.setItem('accessToken', 'existing-browser-token')
    const network = vi.fn().mockResolvedValueOnce(json({}, 401)).mockResolvedValueOnce(json(sessionFixture()))
    vi.stubGlobal('fetch', network)
    const history = renderLogin(path)
    expect(window.location.href).not.toContain('legacy-secret')
    expect(window.location.href).not.toContain('expirationDate')
    await vi.waitFor(() => expect(history.get()).toBe('/dashboard/guilds'))
    expect(network).toHaveBeenNthCalledWith(
      2,
      'http://localhost:5001/v6/auth/legacy-session',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ token: 'existing-browser-token' }),
      }),
    )
    expect(localStorage.getItem('accessToken')).toBeNull()
  })
  it('never submits an attacker supplied URL token for legacy conversion', async () => {
    const network = vi.fn().mockResolvedValue(json({}, 401))
    vi.stubGlobal('fetch', network)
    renderLogin('/login?accessToken=attacker-token&discordID=attacker')
    await vi.waitFor(() => expect(authStatus()).toBe('signed_out'))
    expect(network).toHaveBeenCalledTimes(1)
    expect(network.mock.calls[0][0]).toBe('http://localhost:5001/v6/auth/session')
    expect(JSON.stringify(network.mock.calls)).not.toContain('attacker-token')
  })
  it('preserves credentials and offers retry on a provider outage instead of forcing OAuth', async () => {
    localStorage.setItem('accessToken', 'old-secret')
    localStorage.setItem('guilds', JSON.stringify({ id: 'g1' }))
    const network = vi.fn().mockResolvedValue(json({}, 503))
    vi.stubGlobal('fetch', network)
    const history = renderLogin()
    await vi.waitFor(() => expect(authStatus()).toBe('temporarily_unavailable'))
    expect(history.get()).toBe('/login')
    expect(window.location.hostname).toBe('localhost')
    expect(localStorage.getItem('accessToken')).toBe('old-secret')
    expect(localStorage.getItem('guilds')).toBe(JSON.stringify({ id: 'g1' }))
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    network.mockResolvedValue(json(sessionFixture()))
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await vi.waitFor(() => expect(history.get()).toBe('/dashboard/guilds'))
    expect(isLogged()).toBe(true)
    expect(localStorage.getItem('accessToken')).toBeNull()
  })
  it('does not restart OAuth automatically after authorization was declined', () => {
    const network = vi.fn()
    vi.stubGlobal('fetch', network)
    const history = renderLogin('/login?error=oauth_denied')
    expect(history.get()).toBe('/login?error=oauth_denied')
    expect(network).not.toHaveBeenCalled()
    expect(screen.getByText(/sign-in was not completed/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in with Discord' })).toHaveAttribute(
      'href',
      expect.stringContaining('/v3/users/login'),
    )
  })
  it('starts OAuth only after a definitive signed-out result and preserves a safe destination', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({}, 401)))
    renderLogin('/login?redirect=%2Faccount')
    await vi.waitFor(() =>
      expect(window.location.href).toBe('http://localhost:5001/v3/users/login?redirect=%2Faccount'),
    )
    expect(isLogged()).toBe(false)
  })
})
