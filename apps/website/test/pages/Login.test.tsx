import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../testUtils.js'
import {
  discordUser,
  isLogged,
  normalizeDiscordUserPayload,
  setDiscordUser,
  setIsLogged,
} from '../../src/utils/event.js'
import Login from '../../src/pages/Login.js'
import { Header } from '../../src/components/layout/Header.js'

vi.mock('../../src/utils/websocket.js', () => ({ initWebSocket: vi.fn() }))

const futureExpiration = Date.now() + 60_000_000
const futureExpirationISO = new Date(futureExpiration).toISOString()
const callbackURL = `/login?discordID=123&expirationDate=${futureExpiration}&accessToken=tok`

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderAt(path: string) {
  const history = historyAt(path)
  renderWithProviders(() => <Login />, { path: '/login', history })
  return history
}

function jsonResponse(data: unknown, ok = true) {
  return { ok, json: async () => data } as Response
}

function stubLocation() {
  const originalLocation = window.location
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { href: 'http://localhost:3000/login' },
    writable: true,
  })
  return () => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation, writable: true })
  }
}

describe('pages/Login.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setIsLogged(false)
    setDiscordUser(normalizeDiscordUserPayload({}))
  })

  it('renders a click-to-redirect link pointing at the API login endpoint', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    renderAt(callbackURL)
    const link = screen.getByText('Click here if you are not redirected.') as HTMLAnchorElement
    expect(link.href).toBe('http://localhost:5001/v3/users/login')
  })

  describe('when discordID/expirationDate/accessToken are all present', () => {
    it.each([String(futureExpiration), futureExpirationISO])(
      'stores a normalized expiration from %s and signs in',
      async (expirationDate) => {
        const fetchMock = vi
          .fn()
          .mockResolvedValue(
            jsonResponse({ id: '123', username: 'bob', globalName: 'Bob', discriminator: '0', avatarURL: 'a.png' }),
          )
        vi.stubGlobal('fetch', fetchMock)

        const history = renderAt(
          `/login?discordID=123&expirationDate=${encodeURIComponent(expirationDate)}&accessToken=tok`,
        )

        await vi.waitFor(() => expect(history.get()).toBe('/dashboard/guilds'))

        expect(fetchMock).toHaveBeenCalledWith(
          'http://localhost:5001/v3/users/123',
          expect.objectContaining({ headers: { Authorization: 'Bearer tok' } }),
        )
        expect(window.localStorage.getItem('discordID')).toBe('123')
        expect(window.localStorage.getItem('expirationDate')).toBe(futureExpirationISO)
        expect(window.localStorage.getItem('accessToken')).toBe('tok')
        expect(JSON.parse(window.localStorage.getItem('discordUser')!).id).toBe('123')
        expect(isLogged()).toBe(true)
        expect(discordUser().id).toBe('123')
      },
    )

    it('navigates to the redirect query param target instead of the default dashboard', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ id: '123' })))

      const history = renderAt(callbackURL + '&redirect=' + encodeURIComponent('/dashboard/guilds/g1'))

      await vi.waitFor(() => expect(history.get()).toBe('/dashboard/guilds/g1'))
    })

    it('logs out and navigates home when the user fetch response is not ok', async () => {
      setIsLogged(true)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, false)))

      const history = renderAt(callbackURL)

      await vi.waitFor(() => expect(history.get()).toBe('/'))
      expect(isLogged()).toBe(false)
    })

    it('sets isLogged to false and does not navigate when the fetch throws', async () => {
      setIsLogged(true)
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

      const history = renderAt(callbackURL)

      await vi.waitFor(() => expect(isLogged()).toBe(false))
      // Credentials were written before the fetch attempt, but no navigation happens on error.
      expect(window.localStorage.getItem('discordID')).toBe('123')
      expect(history.get()).toBe(callbackURL)
    })

    it('restores the signed-in session after an OAuth millisecond callback and page reload', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async () => jsonResponse({ id: '123', username: 'bob' })),
      )
      const history = renderAt(callbackURL)
      await vi.waitFor(() => expect(history.get()).toBe('/dashboard/guilds'))
      expect(window.localStorage.getItem('expirationDate')).toBe(futureExpirationISO)

      // A reload recreates the app signals while retaining browser storage.
      cleanup()
      setIsLogged(false)
      setDiscordUser(normalizeDiscordUserPayload({}))
      renderWithProviders(() => <Header />)

      expect(isLogged()).toBe(true)
      expect(discordUser().id).toBe('123')
      expect(screen.getByRole('button', { name: /bob/ })).toBeInTheDocument()
    })

    it.each(['invalid-date', String(Date.now() - 60_000), new Date(Date.now() - 60_000).toISOString()])(
      'rejects invalid or expired callback expiration %s before storing credentials',
      async (expirationDate) => {
        setIsLogged(true)
        const fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)
        const history = renderAt(
          `/login?discordID=123&expirationDate=${encodeURIComponent(expirationDate)}&accessToken=tok`,
        )

        await vi.waitFor(() => expect(history.get()).toBe('/'))
        expect(isLogged()).toBe(false)
        expect(fetchMock).not.toHaveBeenCalled()
        expect(window.localStorage.getItem('accessToken')).toBeNull()
        expect(window.localStorage.getItem('expirationDate')).toBeNull()
      },
    )
  })

  describe('when required query params are missing', () => {
    it('clears localStorage and redirects to the API login endpoint when not logged in', async () => {
      const restoreLocation = stubLocation()
      window.localStorage.setItem('someLeftoverKey', 'x')
      setIsLogged(false)

      renderAt('/login')

      await vi.waitFor(() => expect(window.location.href).toBe('http://localhost:5001/v3/users/login'))
      expect(window.localStorage.getItem('someLeftoverKey')).toBeNull()
      restoreLocation()
    })

    it('includes the redirect param in the API login URL when present', async () => {
      const restoreLocation = stubLocation()
      setIsLogged(false)

      renderAt('/login?redirect=' + encodeURIComponent('/dashboard/guilds/g1'))

      await vi.waitFor(() =>
        expect(window.location.href).toBe('http://localhost:5001/v3/users/login?redirect=/dashboard/guilds/g1'),
      )
      restoreLocation()
    })

    it('navigates to the default dashboard when already logged in', async () => {
      setIsLogged(true)

      const history = renderAt('/login')

      await vi.waitFor(() => expect(history.get()).toBe('/dashboard/guilds'))
    })

    it('navigates to the redirect target when already logged in with a redirect param', async () => {
      setIsLogged(true)

      const history = renderAt('/login?redirect=' + encodeURIComponent('/dashboard/guilds/g1'))

      await vi.waitFor(() => expect(history.get()).toBe('/dashboard/guilds/g1'))
    })
  })
})
