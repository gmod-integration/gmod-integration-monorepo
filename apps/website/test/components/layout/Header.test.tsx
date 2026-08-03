import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
import { renderWithProviders } from '../../testUtils.js'
import { Header } from '../../../src/components/layout/Header.js'
import { discordUser, isAdmin, isLogged, normalizeDiscordUserPayload, setDiscordUser, setIsAdmin, setIsLogged } from '../../../src/utils/event.js'
import { updateNotificationCount } from '../../../src/utils/notificationStore.js'
import { initWebSocket } from '../../../src/utils/websocket.js'

vi.mock('../../../src/utils/websocket.js', () => ({
  initWebSocket: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  setIsLogged(false)
  setDiscordUser(normalizeDiscordUserPayload({}))
  setIsAdmin(false)
  updateNotificationCount(0)
  vi.mocked(initWebSocket).mockClear()
  // Every onMount auth branch logs to console - keep test output clean.
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

type FetchMockConfig = {
  userValidation?: 'ok' | 'notOk' | 'reject'
  unreadCount?: number | 'notOk' | 'reject'
  rank?: string | 'notOk'
}

function makeFetchMock(config: FetchMockConfig = {}) {
  return vi.fn((url: string) => {
    if (url.includes('/notifications/count')) {
      if (config.unreadCount === 'reject') {
        return Promise.reject(new Error('network down'))
      }
      if (config.unreadCount === 'notOk') {
        return Promise.resolve({ ok: false, json: async () => ({}) })
      }
      return Promise.resolve({ ok: true, json: async () => ({ unreadCount: config.unreadCount ?? 0 }) })
    }
    if (url.includes('/users?discordID=')) {
      if (config.rank === 'notOk') {
        return Promise.resolve({ ok: false, json: async () => ({}) })
      }
      return Promise.resolve({ ok: true, json: async () => ({ rank: config.rank ?? 'member' }) })
    }
    // Plain `/users/:discordID` validation fetch.
    if (config.userValidation === 'reject') {
      return Promise.reject(new Error('network down'))
    }
    return Promise.resolve({ ok: config.userValidation !== 'notOk', json: async () => ({}) })
  })
}

function setValidAuth(overrides: Partial<{ discordID: string; accessToken: string; expired: boolean; user: any }> = {}) {
  const discordID = overrides.discordID ?? 'd1'
  window.localStorage.setItem('discordID', discordID)
  window.localStorage.setItem('accessToken', overrides.accessToken ?? 'tok1')
  const expirationDate = overrides.expired
    ? new Date(Date.now() - 60_000).toISOString()
    : new Date(Date.now() + 60_000_000).toISOString()
  window.localStorage.setItem('expirationDate', expirationDate)
  window.localStorage.setItem(
    'discordUser',
    JSON.stringify(
      overrides.user ?? {
        id: discordID,
        username: 'bob',
        globalName: 'Bobby',
        avatarURL: 'https://cdn/a.png',
        displayAvatarURL: 'https://cdn/b.png',
      },
    ),
  )
}

describe('components/layout/Header.tsx', () => {
  it('renders the logo, top nav links, and a Login link when logged out', () => {
    vi.stubGlobal('fetch', makeFetchMock())
    renderWithProviders(() => <Header />)

    expect(screen.getByAltText('logo')).toBeInTheDocument()
    expect(screen.getByText('Gmod Integration')).toHaveAttribute('href', '/')

    expect(screen.getByText('Invite the Bot').closest('a')).toHaveAttribute('href', '/invite')
    expect(screen.getByText('Support').closest('a')).toHaveAttribute('href', '/discord')
    expect(screen.getByText('Premium').closest('a')).toHaveAttribute('href', '/premium')
    expect(screen.getByText('Documentation').closest('a')).toHaveAttribute('href', '/docs')

    const login = screen.getByText('Login with Discord')
    expect(login.closest('a')).toHaveAttribute('href', '/login')
  })

  it('renders the locale flag dropdown, remapping "en" to the GB flag for both the trigger and the list item', () => {
    vi.stubGlobal('fetch', makeFetchMock())
    const { container } = renderWithProviders(() => <Header />)

    expect(container.querySelectorAll('img[alt="gb"]')).toHaveLength(2)
    expect(container.querySelector('img[alt="fr"]')).toBeInTheDocument()
    expect(container.querySelector('img[alt="de"]')).toBeInTheDocument()
  })

  it('updates the locale and reloads the page when a language is chosen', () => {
    vi.stubGlobal('fetch', makeFetchMock())
    const reloadSpy = vi.spyOn(window.location, 'reload').mockImplementation(() => {})
    renderWithProviders(() => <Header />)

    fireEvent.click(screen.getByText('Français'))

    expect(window.localStorage.getItem('locale')).toBe('fr')
    expect(reloadSpy).toHaveBeenCalledTimes(1)
  })

  describe('auth bootstrap (onMount)', () => {
    it('stays logged out when localStorage is missing discordID/accessToken/expirationDate', () => {
      vi.stubGlobal('fetch', makeFetchMock())
      renderWithProviders(() => <Header />)
      expect(isLogged()).toBe(false)
      expect(screen.getByText('Login with Discord')).toBeInTheDocument()
    })

    it('stays logged out when the stored token has already expired', () => {
      setValidAuth({ expired: true })
      vi.stubGlobal('fetch', makeFetchMock())
      renderWithProviders(() => <Header />)
      expect(isLogged()).toBe(false)
    })

    it('stays logged out when the stored discordUser is null', () => {
      window.localStorage.setItem('discordID', 'd1')
      window.localStorage.setItem('accessToken', 'tok1')
      window.localStorage.setItem('expirationDate', new Date(Date.now() + 60_000_000).toISOString())
      // no 'discordUser' key at all -> JSON.parse(null) -> null
      vi.stubGlobal('fetch', makeFetchMock())
      renderWithProviders(() => <Header />)
      expect(isLogged()).toBe(false)
    })

    it('stays logged out and clears discordUser when the stored payload has an error field', () => {
      setValidAuth({ user: { error: 'invalid session' } })
      vi.stubGlobal('fetch', makeFetchMock())
      renderWithProviders(() => <Header />)
      expect(isLogged()).toBe(false)
      expect(window.localStorage.getItem('discordUser')).toBeNull()
    })

    it('logs in synchronously, normalizes+persists the user, opens the websocket, and renders the avatar/name', () => {
      setValidAuth()
      vi.stubGlobal('fetch', makeFetchMock())
      renderWithProviders(() => <Header />)

      expect(isLogged()).toBe(true)
      expect(discordUser().globalName).toBe('Bobby')
      expect(JSON.parse(window.localStorage.getItem('discordUser')!)).toMatchObject({ globalName: 'Bobby' })
      expect(initWebSocket).toHaveBeenCalledTimes(1)

      expect(screen.getByAltText('Discord avatar')).toHaveAttribute('src', 'https://cdn/b.png')
      expect(screen.getByText('Bobby')).toBeInTheDocument()
    })

    it('sets isLogged false asynchronously when the background user-validation fetch fails', async () => {
      setValidAuth()
      vi.stubGlobal('fetch', makeFetchMock({ userValidation: 'notOk' }))
      renderWithProviders(() => <Header />)

      // Synchronously true first (the storedDiscordUser branch doesn't await the validation fetch)...
      expect(isLogged()).toBe(true)
      // ...then flipped false once the fire-and-forget validation fetch resolves as not-ok.
      await vi.waitFor(() => expect(isLogged()).toBe(false))
    })

    it('sets isLogged false asynchronously when the background user-validation fetch rejects', async () => {
      setValidAuth()
      vi.stubGlobal('fetch', makeFetchMock({ userValidation: 'reject' }))
      renderWithProviders(() => <Header />)

      expect(isLogged()).toBe(true)
      await vi.waitFor(() => expect(isLogged()).toBe(false))
    })

    it('grants admin when the rank lookup reports "developer"', async () => {
      setValidAuth()
      vi.stubGlobal('fetch', makeFetchMock({ rank: 'developer' }))
      renderWithProviders(() => <Header />)

      await vi.waitFor(() => expect(isAdmin()).toBe(true))
      await vi.waitFor(() => expect(screen.getByText('Admin Dashboard')).toBeInTheDocument())
    })

    it('does not grant admin, and does not throw an unhandled rejection, when the rank lookup response is not ok', async () => {
      setValidAuth()
      vi.stubGlobal('fetch', makeFetchMock({ rank: 'notOk' }))
      renderWithProviders(() => <Header />)

      await vi.waitFor(() => expect(initWebSocket).toHaveBeenCalled())
      // Give the rank-lookup promise chain a tick to settle.
      await new Promise((r) => setTimeout(r, 0))
      expect(isAdmin()).toBe(false)
      expect(screen.queryByText('Admin Dashboard')).not.toBeInTheDocument()
    })

    it('does not grant admin for a non-developer rank', async () => {
      setValidAuth()
      vi.stubGlobal('fetch', makeFetchMock({ rank: 'member' }))
      renderWithProviders(() => <Header />)
      await new Promise((r) => setTimeout(r, 0))
      expect(isAdmin()).toBe(false)
    })
  })

  describe('notifications', () => {
    it('shows no badge when unreadCount is 0', () => {
      setValidAuth()
      vi.stubGlobal('fetch', makeFetchMock({ unreadCount: 0 }))
      renderWithProviders(() => <Header />)
      const notifLink = screen.getByText('Notifications').closest('a')
      expect(notifLink!.querySelector('.badge-warning')).not.toBeInTheDocument()
    })

    it('shows the exact count when between 1 and 9', async () => {
      setValidAuth()
      vi.stubGlobal('fetch', makeFetchMock({ unreadCount: 5 }))
      renderWithProviders(() => <Header />)
      const notifLink = screen.getByText('Notifications').closest('a')
      await vi.waitFor(() => expect(notifLink!.querySelector('.badge-warning')).toHaveTextContent('5'))
    })

    it('shows "9+" when the count exceeds 9', async () => {
      setValidAuth()
      vi.stubGlobal('fetch', makeFetchMock({ unreadCount: 42 }))
      renderWithProviders(() => <Header />)
      const notifLink = screen.getByText('Notifications').closest('a')
      await vi.waitFor(() => expect(notifLink!.querySelector('.badge-warning')).toHaveTextContent('9+'))
    })

    it('treats a failed notifications-count fetch as zero', async () => {
      setValidAuth()
      vi.stubGlobal('fetch', makeFetchMock({ unreadCount: 'notOk' }))
      renderWithProviders(() => <Header />)
      await new Promise((r) => setTimeout(r, 0))
      const notifLink = screen.getByText('Notifications').closest('a')
      expect(notifLink!.querySelector('.badge-warning')).not.toBeInTheDocument()
    })

    it('logs an error instead of throwing when the onMount notifications-count fetch rejects', async () => {
      setValidAuth()
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.stubGlobal('fetch', makeFetchMock({ unreadCount: 'reject' }))
      renderWithProviders(() => <Header />)
      await vi.waitFor(() =>
        expect(errorSpy).toHaveBeenCalledWith('Failed to load notification count:', expect.any(Error)),
      )
    })
  })

  describe('avatar dropdown open state', () => {
    it('opens on click and closes on an outside mousedown, but stays open for an inside click', () => {
      setValidAuth()
      vi.stubGlobal('fetch', makeFetchMock())
      const { container } = renderWithProviders(() => <Header />)

      const avatarButton = screen.getByAltText('Discord avatar').closest('[role="button"]')!
      expect(container.querySelector('.fa-angle-down')).toBeInTheDocument()

      fireEvent.click(avatarButton)
      expect(container.querySelector('.fa-angle-up')).toBeInTheDocument()

      // Inside click (still within .dropdown) must not close it.
      fireEvent.mouseDown(avatarButton)
      expect(container.querySelector('.fa-angle-up')).toBeInTheDocument()

      // Outside mousedown closes it.
      fireEvent.mouseDown(document.body)
      expect(container.querySelector('.fa-angle-down')).toBeInTheDocument()
    })

    it('removes the mousedown listener on unmount without throwing', () => {
      setValidAuth()
      vi.stubGlobal('fetch', makeFetchMock())
      const { unmount } = renderWithProviders(() => <Header />)
      expect(() => unmount()).not.toThrow()
      expect(() => fireEvent.mouseDown(document.body)).not.toThrow()
    })
  })

  describe('Stop Impersonate', () => {
    it('is hidden with no oldAccessToken, and restores the previous session + redirects when pressed', () => {
      setValidAuth()
      window.localStorage.setItem('oldAccessToken', 'oldTok')
      window.localStorage.setItem('oldDiscordID', 'oldD1')
      window.localStorage.setItem('oldExpirationDate', '2030-01-01T00:00:00.000Z')
      vi.stubGlobal('fetch', makeFetchMock())
      renderWithProviders(() => <Header />)

      const stopLink = screen.getByText('Stop Impersonate').closest('a') as HTMLAnchorElement
      fireEvent.click(stopLink)

      expect(window.localStorage.getItem('accessToken')).toBe('oldTok')
      expect(window.localStorage.getItem('discordID')).toBe('oldD1')
      expect(window.localStorage.getItem('expirationDate')).toBe('2030-01-01T00:00:00.000Z')
      expect(window.localStorage.getItem('oldAccessToken')).toBeNull()
      expect(window.location.href).toContain('/login/?discordID=oldD1&accessToken=oldTok')
    })

    it('is absent when there is no oldAccessToken in localStorage', () => {
      setValidAuth()
      vi.stubGlobal('fetch', makeFetchMock())
      renderWithProviders(() => <Header />)
      expect(screen.queryByText('Stop Impersonate')).not.toBeInTheDocument()
    })
  })

  it('clicking a dropdown link with no onPress (e.g. Account) does not invoke any custom handler', () => {
    setValidAuth()
    vi.stubGlobal('fetch', makeFetchMock())
    renderWithProviders(() => <Header />)
    const accountLink = screen.getByText('Account').closest('a') as HTMLAnchorElement
    expect(() => fireEvent.click(accountLink)).not.toThrow()
  })

  describe('anniversary promo banner (date-gated)', () => {
    it('is absent once the cutoff date (2024-09-22) has passed (the real-world default)', () => {
      vi.stubGlobal('fetch', makeFetchMock())
      renderWithProviders(() => <Header />)
      expect(screen.queryByText(/I just turned 20/)).not.toBeInTheDocument()
    })

    it('renders the countdown and updates it every second before the cutoff date, clearing the interval on unmount', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-09-20T00:00:00.000Z'))
      vi.stubGlobal('fetch', makeFetchMock())
      const clearIntervalSpy = vi.spyOn(window, 'clearInterval')

      const { unmount } = renderWithProviders(() => <Header />)

      const banner = screen.getByText(/I just turned 20/)
      expect(banner).toBeInTheDocument()
      expect(banner.textContent).toMatch(/\d{2}d \d{2}h \d{2}m \d{2}s/)
      const firstText = banner.textContent

      vi.advanceTimersByTime(1000)
      expect(banner.textContent).not.toBe(firstText)

      unmount()
      expect(clearIntervalSpy).toHaveBeenCalled()
    })
  })
})
