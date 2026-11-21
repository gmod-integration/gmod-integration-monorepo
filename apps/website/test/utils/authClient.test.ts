import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acceptAuthSession,
  AUTH_STORAGE_KEY,
  authenticatedFetch,
  authCommand,
  authSession,
  authStatus,
  refreshAuthSession,
  revalidateAuthSession,
  resetAuthentication,
  safeAuthRedirect,
} from '../../src/utils/authClient.js'
import { isLogged } from '../../src/utils/event.js'
import { sessionFixture } from '../authFixture.js'

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
beforeEach(() => {
  localStorage.clear()
  resetAuthentication()
})
afterEach(() => {
  resetAuthentication()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
describe('authoritative browser session client', () => {
  it('deduplicates concurrent session checks', async () => {
    const network = vi.fn().mockResolvedValue(json(sessionFixture()))
    vi.stubGlobal('fetch', network)
    await Promise.all([refreshAuthSession(), refreshAuthSession(), refreshAuthSession()])
    expect(network).toHaveBeenCalledTimes(1)
    expect(isLogged()).toBe(true)
    expect(authStatus()).toBe('authenticated')
  })
  it.each([429, 503])('preserves an established session and selections on HTTP %s', async (status) => {
    acceptAuthSession(sessionFixture())
    localStorage.setItem('server', JSON.stringify({ id: 's1' }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({}, status)))
    await refreshAuthSession()
    expect(isLogged()).toBe(true)
    expect(authSession()?.session.id).toBe('session-current-123')
    expect(authStatus()).toBe('temporarily_unavailable')
    expect(localStorage.getItem('server')).toBe(JSON.stringify({ id: 's1' }))
  })
  it('preserves legacy credentials on a network failure so migration can be retried', async () => {
    localStorage.setItem('accessToken', 'legacy')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await refreshAuthSession()
    expect(authStatus()).toBe('temporarily_unavailable')
    expect(localStorage.getItem('accessToken')).toBe('legacy')
  })
  it('keeps the current identity when a successful session response is malformed', async () => {
    acceptAuthSession(sessionFixture())
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(null)))
    await refreshAuthSession()
    expect(authStatus()).toBe('temporarily_unavailable')
    expect(authSession()?.session.id).toBe('session-current-123')
  })
  it('does not interpret an unreadable unauthorized body as an operator recovery challenge', async () => {
    acceptAuthSession(sessionFixture())
    const network = vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 }))
    vi.stubGlobal('fetch', network)
    await refreshAuthSession()
    expect(authStatus()).toBe('signed_out')
    expect(network).toHaveBeenCalledTimes(1)
  })
  it('migrates an old bearer only in a request body after the cookie session is rejected', async () => {
    localStorage.setItem('accessToken', 'legacy')
    localStorage.setItem('theme', 'dark')
    const network = vi.fn().mockResolvedValueOnce(json({}, 401)).mockResolvedValueOnce(json(sessionFixture()))
    vi.stubGlobal('fetch', network)
    await refreshAuthSession()
    expect(network.mock.calls[1][0]).toBe('http://localhost:5001/v6/auth/legacy-session')
    expect(network.mock.calls[1][1].body).toBe(JSON.stringify({ token: 'legacy' }))
    expect(localStorage.getItem('accessToken')).toBeNull()
    expect(localStorage.getItem('theme')).toBe('dark')
  })
  it('recovers a legacy migration already completed by another tab before clearing identity', async () => {
    localStorage.setItem('accessToken', 'legacy')
    const network = vi
      .fn()
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json(sessionFixture()))
    vi.stubGlobal('fetch', network)
    await refreshAuthSession()
    expect(network.mock.calls.map(([url]) => url)).toEqual([
      'http://localhost:5001/v6/auth/session',
      'http://localhost:5001/v6/auth/legacy-session',
      'http://localhost:5001/v6/auth/session',
    ])
    expect(isLogged()).toBe(true)
    expect(localStorage.getItem('accessToken')).toBeNull()
  })
  it('restores an expired delegated session to its operator once with the operator CSRF challenge', async () => {
    acceptAuthSession(
      sessionFixture({
        user: { ...sessionFixture().user, id: 'target-account' },
        session: { ...sessionFixture().session, id: 'expired-delegation', actorDiscordID: 'u1' },
      }),
    )
    const network = vi
      .fn()
      .mockResolvedValueOnce(json({ error: { code: 'actor_session_available' }, csrfToken: 'operator-csrf' }, 401))
      .mockResolvedValueOnce(json(sessionFixture()))
    vi.stubGlobal('fetch', network)
    await Promise.all([refreshAuthSession(), refreshAuthSession()])
    expect(network.mock.calls.map(([url]) => url)).toEqual([
      'http://localhost:5001/v6/auth/session',
      'http://localhost:5001/v6/auth/impersonations/end',
    ])
    const init = network.mock.calls[1][1]
    expect(init).toMatchObject({ method: 'POST', credentials: 'include', body: '{}' })
    expect(new Headers(init.headers).get('X-CSRF-Token')).toBe('operator-csrf')
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json')
    expect(new Headers(init.headers).has('Authorization')).toBe(false)
    expect(authSession()?.user.id).toBe('u1')
    expect(authSession()?.session.actorDiscordID).toBeUndefined()
    expect(authStatus()).toBe('authenticated')
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).not.toBeNull()
  })
  it('signs out when the operator was revoked between the recovery challenge and return request', async () => {
    acceptAuthSession(
      sessionFixture({
        session: { ...sessionFixture().session, id: 'expired-delegation', actorDiscordID: 'operator' },
      }),
    )
    const network = vi
      .fn()
      .mockResolvedValueOnce(json({ error: { code: 'actor_session_available' }, csrfToken: 'operator-csrf' }, 401))
      .mockResolvedValueOnce(json({ error: { code: 'unauthorized' } }, 401))
    vi.stubGlobal('fetch', network)
    await refreshAuthSession()
    expect(network).toHaveBeenCalledTimes(2)
    expect(authSession()).toBeUndefined()
    expect(authStatus()).toBe('signed_out')
    expect(isLogged()).toBe(false)
  })
  it('preserves the delegated snapshot and draft when operator recovery is temporarily unavailable', async () => {
    acceptAuthSession(
      sessionFixture({
        session: { ...sessionFixture().session, id: 'expired-delegation', actorDiscordID: 'operator' },
      }),
    )
    localStorage.setItem('draft:status', 'Unsaved status changes')
    const network = vi
      .fn()
      .mockResolvedValueOnce(json({ error: { code: 'actor_session_available' }, csrfToken: 'operator-csrf' }, 401))
      .mockResolvedValueOnce(json({ error: { code: 'provider_unavailable' } }, 503))
    vi.stubGlobal('fetch', network)
    await refreshAuthSession()
    expect(authSession()?.session.id).toBe('expired-delegation')
    expect(authStatus()).toBe('temporarily_unavailable')
    expect(isLogged()).toBe(true)
    expect(localStorage.getItem('draft:status')).toBe('Unsaved status changes')
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull()
  })
  it('clears authenticated identity only after a definitive unauthorized session response', async () => {
    acceptAuthSession(sessionFixture())
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({}, 401)))
    await refreshAuthSession()
    expect(authSession()).toBeUndefined()
    expect(authStatus()).toBe('signed_out')
    expect(isLogged()).toBe(false)
  })
  it('ignores a late session check after logout', async () => {
    let finish!: (response: Response) => void
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(
        new Promise<Response>((resolve) => {
          finish = resolve
        }),
      ),
    )
    const checking = refreshAuthSession()
    resetAuthentication()
    finish(json(sessionFixture()))
    await checking
    expect(isLogged()).toBe(false)
    expect(authSession()).toBeUndefined()
  })
  it('starts a fresh cookie check and aborts a previous check when another tab changes identity', async () => {
    let finish!: (response: Response) => void
    const next = sessionFixture({ session: { ...sessionFixture().session, id: 'session-from-other-tab' } })
    const network = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve
          }),
      )
      .mockResolvedValueOnce(json(next))
    vi.stubGlobal('fetch', network)
    const previous = refreshAuthSession()
    const fresh = revalidateAuthSession()
    expect(network.mock.calls[0][1].signal.aborted).toBe(true)
    await fresh
    finish(json(sessionFixture()))
    await previous
    expect(network).toHaveBeenCalledTimes(2)
    expect(authSession()?.session.id).toBe('session-from-other-tab')
  })
  it('sends cookies and CSRF on mutations without sending a durable bearer', async () => {
    acceptAuthSession(sessionFixture())
    const network = vi.fn().mockResolvedValue(json({}))
    vi.stubGlobal('fetch', network)
    await authenticatedFetch('http://localhost:5001/v6/settings', { method: 'PUT', body: '{}' })
    const init = network.mock.calls[0][1]
    expect(init.credentials).toBe('include')
    expect(new Headers(init.headers).get('X-CSRF-Token')).toBe('csrf-token')
    expect(new Headers(init.headers).has('Authorization')).toBe(false)
  })
  it('does not turn a permission error into logout or automatically replay a failed mutation', async () => {
    acceptAuthSession(sessionFixture())
    const network = vi
      .fn()
      .mockResolvedValueOnce(json({}, 403))
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json(sessionFixture()))
    vi.stubGlobal('fetch', network)
    await authenticatedFetch('/forbidden')
    expect(authStatus()).toBe('authenticated')
    await authenticatedFetch('/write', { method: 'POST' })
    expect(network.mock.calls.filter(([, init]) => init.method === 'POST')).toHaveLength(1)
    expect(isLogged()).toBe(true)
  })
  it('keeps the application session when Discord asks for a new authorization', async () => {
    acceptAuthSession(sessionFixture())
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: { code: 'discord_reauth_required' } }, 403)))
    await authenticatedFetch('/guilds')
    expect(authStatus()).toBe('reauth_required')
    expect(isLogged()).toBe(true)
  })
  it('preserves identity when a permission denial has no JSON response', async () => {
    acceptAuthSession(sessionFixture())
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Forbidden', { status: 403 })))
    const response = await authenticatedFetch('/private')
    expect(response.status).toBe(403)
    expect(authStatus()).toBe('authenticated')
    expect(isLogged()).toBe(true)
  })
  it('rejects a malformed account-switch acknowledgement without adopting it', async () => {
    acceptAuthSession(sessionFixture())
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ authenticated: true, user: { id: 'other' } })))
    await expect(authCommand('/impersonations', { discordID: 'other' })).rejects.toThrow(
      'Invalid session action acknowledgement',
    )
    expect(authSession()?.user.id).toBe('u1')
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull()
  })
  it('recognizes the legacy v3 Discord reauthorization error without dropping the session or draft', async () => {
    acceptAuthSession(sessionFixture())
    localStorage.setItem('draft:status', 'Unsaved player-list changes')
    const network = vi.fn().mockResolvedValue(json({ error: 'discord_reauth_required' }, 403))
    vi.stubGlobal('fetch', network)
    const response = await authenticatedFetch('http://localhost:5001/v3/users/u1/guilds')
    expect(response.status).toBe(403)
    expect(authStatus()).toBe('reauth_required')
    expect(authSession()?.session.id).toBe('session-current-123')
    expect(isLogged()).toBe(true)
    expect(localStorage.getItem('draft:status')).toBe('Unsaved player-list changes')
    expect(network).toHaveBeenCalledTimes(1)
  })
  it('retries a GET once after session recovery', async () => {
    acceptAuthSession(sessionFixture())
    const network = vi
      .fn()
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json(sessionFixture()))
      .mockResolvedValueOnce(json({ ok: true }))
    vi.stubGlobal('fetch', network)
    const response = await authenticatedFetch('/read')
    expect(response.ok).toBe(true)
    expect(network.mock.calls.map(([url]) => url)).toEqual(['/read', 'http://localhost:5001/v6/auth/session', '/read'])
  })
  it('rejects a successful response belonging to a session that has since changed', async () => {
    acceptAuthSession(sessionFixture())
    let finish!: (response: Response) => void
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(
        new Promise<Response>((resolve) => {
          finish = resolve
        }),
      ),
    )
    const pending = authenticatedFetch('/read')
    acceptAuthSession(sessionFixture({ session: { ...sessionFixture().session, id: 'other-session' } }))
    finish(json({ private: 'old account' }))
    await expect(pending).rejects.toThrow('session changed')
  })
  it.each(['https://evil.example', '//evil.example', '/\\evil.example', '/\nwrong'])(
    'rejects unsafe OAuth return destination %s',
    (value) => {
      expect(safeAuthRedirect(value)).toBe('/dashboard/guilds')
    },
  )
})
