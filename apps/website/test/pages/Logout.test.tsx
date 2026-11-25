import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../testUtils.js'
import { acceptAuthSession, resetAuthentication } from '../../src/utils/authClient.js'
import { isLogged } from '../../src/utils/event.js'
import { sessionFixture } from '../authFixture.js'
import Logout from '../../src/pages/Logout.js'
import { ERASURE_RECEIPT_KEY } from '../../src/utils/accountErasure.js'

beforeEach(() => {
  localStorage.clear()
  resetAuthentication()
  acceptAuthSession(sessionFixture())
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
function renderLogout() {
  const history = historyAt('/logout')
  renderWithProviders(() => <Logout />, { path: '/logout', history, session: false })
  return history
}
describe('explicit logout', () => {
  it('revokes the cookie session with CSRF, clears local state and navigates home', async () => {
    const network = vi.fn().mockResolvedValue(new Response(JSON.stringify({ revoked: true })))
    vi.stubGlobal('fetch', network)
    const history = renderLogout()
    await vi.waitFor(() => expect(history.get()).toBe('/'))
    expect(network.mock.calls[0][0]).toBe('http://localhost:5001/v6/auth/logout')
    expect(network.mock.calls[0][1].credentials).toBe('include')
    expect(new Headers(network.mock.calls[0][1].headers).get('X-CSRF-Token')).toBe('csrf-token')
    expect(isLogged()).toBe(false)
    expect(localStorage.getItem('discordUser')).toBeNull()
  })
  it('distinguishes unconfirmed server revocation while clearing local private data and preserving receipt/preferences', async () => {
    const receipt = { requestId: '00000000-0000-4000-8000-000000000001', receipt: 'a'.repeat(64) }
    localStorage.setItem(ERASURE_RECEIPT_KEY, JSON.stringify(receipt))
    localStorage.setItem('locale', 'en')
    localStorage.setItem('theme', 'dark')
    sessionStorage.setItem('private-cache', 'old')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network down')))
    const history = renderLogout()
    await vi.waitFor(() => expect(screen.getByText(/Sign-out is not confirmed/)).toBeInTheDocument())
    expect(history.get()).toBe('/logout')
    expect(isLogged()).toBe(false)
    expect(localStorage.getItem(ERASURE_RECEIPT_KEY)).toBe(JSON.stringify(receipt))
    expect(localStorage.getItem('locale')).toBe('en')
    expect(localStorage.getItem('theme')).toBe('dark')
    expect(sessionStorage.length).toBe(0)
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled()
  })
  it('retries unconfirmed revocation using a fresh session CSRF without replaying the original request', async () => {
    const network = vi.fn().mockRejectedValueOnce(new Error('Offline'))
    vi.stubGlobal('fetch', network)
    const history = renderLogout()
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled())
    network.mockImplementation(
      async (url: string) =>
        new Response(JSON.stringify(url.endsWith('/session') ? sessionFixture() : { revoked: true })),
    )
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await vi.waitFor(() => expect(history.get()).toBe('/'))
    expect(network.mock.calls.map(([url]) => url)).toEqual([
      'http://localhost:5001/v6/auth/logout',
      'http://localhost:5001/v6/auth/session',
      'http://localhost:5001/v6/auth/logout',
    ])
    expect(new Headers(network.mock.calls[2][1].headers).get('X-CSRF-Token')).toBe('csrf-token')
    expect(isLogged()).toBe(false)
  })
})
