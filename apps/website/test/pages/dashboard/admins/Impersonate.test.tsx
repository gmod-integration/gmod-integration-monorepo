import { beforeEach, afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
import { renderWithProviders, historyAt } from '../../../testUtils.js'
import { acceptAuthSession, resetAuthentication } from '../../../../src/utils/authClient.js'
import { sessionFixture } from '../../../authFixture.js'
import Impersonate from '../../../../src/pages/dashboard/admins/Impersonate.js'
import { fetchAPI } from '../../../../src/utils/api.js'
vi.mock('../../../../src/utils/api.js', async (original) => ({ ...(await original<object>()), fetchAPI: vi.fn() }))
beforeEach(() => {
  localStorage.clear()
  resetAuthentication()
  vi.mocked(fetchAPI).mockClear()
  acceptAuthSession(sessionFixture({ user: { ...sessionFixture().user, rank: 'developer' } }))
  ;(fetchAPI as Mock).mockResolvedValue({
    ok: true,
    json: async () => [
      { discordID: 'u1', username: 'Self' },
      { discordID: 'target', username: 'Target' },
    ],
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
function renderPage(path = '/dashboard/admins/impersonate') {
  const history = historyAt(path)
  renderWithProviders(() => <Impersonate />, { path: '*', history, session: false })
  return history
}
describe('server-tracked administrative delegation', () => {
  it('shows target identities without requiring target session tokens', async () => {
    renderPage()
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Access Target' })).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Access Self' })).not.toBeInTheDocument()
  })
  it('excludes the current identity before paging and delegates to a target on a later page', async () => {
    const targets = Array.from({ length: 51 }, (_, index) => ({
      discordID: `target${index + 1}`,
      username: `Target ${index + 1}`,
    }))
    ;(fetchAPI as Mock).mockResolvedValue({
      ok: true,
      json: async () => [...targets.slice(0, 24), { discordID: 'u1', username: 'Self' }, ...targets.slice(24)],
    })
    const network = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify(
          sessionFixture({
            user: { ...sessionFixture().user, id: 'target51' },
            session: { ...sessionFixture().session, id: 'delegated', actorDiscordID: 'u1' },
          }),
        ),
      ),
    )
    vi.stubGlobal('fetch', network)
    const history = renderPage()
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Access Target 25' })).toBeInTheDocument())
    expect(screen.getAllByRole('button', { name: /^Access Target/ })).toHaveLength(25)
    expect(screen.queryByRole('button', { name: 'Access Self' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Access Target 26' })).not.toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByRole('button', { name: 'Access Target 26' })).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getAllByRole('button', { name: /^Access Target/ })).toHaveLength(1)
    await fireEvent.click(screen.getByRole('button', { name: 'Access Target 51' }))
    await vi.waitFor(() => expect(history.get()).toBe('/dashboard/guilds'))
    expect(network.mock.calls[0][1].body).toBe(JSON.stringify({ discordID: 'target51' }))
    expect(fetchAPI).toHaveBeenCalledTimes(1)
  })
  it('starts a delegated session using CSRF and cookies and leaves browser preferences intact', async () => {
    localStorage.setItem('theme', 'dark')
    const network = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify(
          sessionFixture({
            user: { ...sessionFixture().user, id: 'target' },
            session: { ...sessionFixture().session, id: 'delegated', actorDiscordID: 'u1' },
          }),
        ),
      ),
    )
    vi.stubGlobal('fetch', network)
    const history = renderPage()
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Access Target' })).toBeEnabled())
    await fireEvent.click(screen.getByRole('button', { name: 'Access Target' }))
    await vi.waitFor(() => expect(history.get()).toBe('/dashboard/guilds'))
    expect(network.mock.calls[0][0]).toBe('http://localhost:5001/v6/auth/impersonations')
    expect(network.mock.calls[0][1].body).toBe(JSON.stringify({ discordID: 'target' }))
    expect(network.mock.calls[0][1].credentials).toBe('include')
    expect(localStorage.getItem('theme')).toBe('dark')
    expect(localStorage.getItem('accessToken')).toBeNull()
    expect(localStorage.getItem('oldAccessToken')).toBeNull()
    expect(window.location.href).not.toContain('accessToken=')
  })
  it('reports a rejected delegation without replacing the current identity', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 403 })))
    const history = renderPage()
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Access Target' })).toBeEnabled())
    await fireEvent.click(screen.getByRole('button', { name: 'Access Target' }))
    await vi.waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(history.get()).toBe('/dashboard/admins/impersonate')
    expect(localStorage.getItem('discordID')).toBe('u1')
  })
  it('keeps the delegated identity after a failed return and retries with its own CSRF', async () => {
    acceptAuthSession(
      sessionFixture({
        user: { ...sessionFixture().user, id: 'target' },
        session: { ...sessionFixture().session, id: 'delegated', actorDiscordID: 'u1' },
      }),
    )
    const network = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(sessionFixture({ user: { ...sessionFixture().user, rank: 'developer' } }))),
      )
    vi.stubGlobal('fetch', network)
    const history = renderPage('/dashboard/admins/stop-impersonate')
    await vi.waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(localStorage.getItem('discordID')).toBe('target')
    expect(fetchAPI).not.toHaveBeenCalled()
    await fireEvent.click(screen.getByRole('button', { name: 'Return to your account' }))
    await vi.waitFor(() => expect(history.get()).toBe('/dashboard/admins/impersonate'))
    expect(network.mock.calls.map(([url]) => url)).toEqual([
      'http://localhost:5001/v6/auth/impersonations/end',
      'http://localhost:5001/v6/auth/impersonations/end',
    ])
    expect(new Headers(network.mock.calls[1][1].headers).get('X-CSRF-Token')).toBe('csrf-token')
    expect(localStorage.getItem('discordID')).toBe('u1')
  })
})
