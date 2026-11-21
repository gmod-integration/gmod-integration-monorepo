import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { renderWithProviders } from '../../testUtils.js'
import { Header } from '../../../src/components/layout/Header.js'
import {
  discordUser,
  isAdmin,
  isLogged,
  normalizeDiscordUserPayload,
  setDiscordUser,
  setIsAdmin,
  setIsLogged,
} from '../../../src/utils/event.js'
import { notificationCount, updateNotificationCount } from '../../../src/utils/notificationStore.js'
import { initWebSocket } from '../../../src/utils/websocket.js'
import { setThemeMode } from '../../../src/utils/theme.js'

vi.mock('../../../src/utils/websocket.js', () => ({ initWebSocket: vi.fn() }))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
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
  setThemeMode('auto')
  vi.mocked(initWebSocket).mockClear()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

type FetchMockConfig = {
  userValidation?: 'ok' | 'notOk' | 'reject'
  unreadCount?: number | 'notOk' | 'reject'
  rank?: string
}

function makeFetchMock(config: FetchMockConfig = {}) {
  const response = (data: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(data), { status }))
  return vi.fn((url: string) => {
    if (url.includes('/notifications/count')) {
      if (config.unreadCount === 'reject') return Promise.reject(new Error('network down'))
      if (config.unreadCount === 'notOk') return response({}, 503)
      return response({ unreadCount: config.unreadCount ?? 0 })
    }
    if (url.includes('/users?discordID=')) {
      if (config.rank === 'reject') return Promise.reject(new Error('rank unavailable'))
      if (config.rank === 'notOk') return response({}, 403)
      return response({ rank: config.rank ?? 'member' })
    }
    if (config.userValidation === 'reject') return Promise.reject(new Error('network down'))
    return response({}, config.userValidation === 'notOk' ? 401 : 200)
  })
}

function setValidAuth(
  overrides: Partial<{ discordID: string; accessToken: string; expired: boolean; user: unknown }> = {},
) {
  const discordID = overrides.discordID ?? 'd1'
  window.localStorage.setItem('discordID', discordID)
  window.localStorage.setItem('accessToken', overrides.accessToken ?? 'tok1')
  window.localStorage.setItem(
    'expirationDate',
    new Date(Date.now() + (overrides.expired ? -60_000 : 60_000_000)).toISOString(),
  )
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

function openUserMenu() {
  const trigger = screen.getByRole('button', { name: /Bobby/ })
  fireEvent.click(trigger)
  return trigger
}

describe('Header navigation', () => {
  it('opens public navigation and closes it with Escape or a link selection', () => {
    vi.stubGlobal('fetch', makeFetchMock())
    renderWithProviders(() => <Header />)
    const toggle = screen.getByRole('button', { name: 'Toggle navigation' })
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const language = screen.getByRole('button', { name: 'Language' })
    fireEvent.click(language)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(language).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(toggle)
    expect(language).toHaveAttribute('aria-expanded', 'false')
    screen.getByRole('link', { name: 'Premium' }).focus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveFocus()
    fireEvent.click(toggle)
    fireEvent.click(screen.getByRole('link', { name: 'Premium' }))
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })
  it('provides the brand, main destinations and sign-in link when logged out', () => {
    const fetchMock = makeFetchMock()
    vi.stubGlobal('fetch', fetchMock)
    renderWithProviders(() => <Header />)

    expect(screen.getByRole('link', { name: 'Gmod Integration' }).querySelector('img')).toHaveAttribute('alt', '')
    expect(screen.getByRole('link', { name: 'Gmod Integration' })).toHaveAttribute('href', '/')
    const navigation = screen.getByRole('navigation', { name: 'Main navigation' })
    for (const [name, href] of [
      ['Invite the Bot', '/invite'],
      ['Support', '/discord'],
      ['Premium', '/premium'],
      ['Documentation', '/docs'],
    ]) {
      expect(within(navigation).getByRole('link', { name })).toHaveAttribute('href', href)
    }
    expect(screen.getByRole('link', { name: 'Login with Discord' })).toHaveAttribute('href', '/login')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('offers all nine languages in the language dropdown', () => {
    vi.stubGlobal('fetch', makeFetchMock())
    const { container } = renderWithProviders(() => <Header />)
    const selector = screen.getByRole('button', { name: 'Language' })
    expect(selector).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(selector)
    expect(selector).toHaveAttribute('aria-expanded', 'true')
    const languageMenu = container.querySelector<HTMLUListElement>('#language-navigation')!
    expect(languageMenu).not.toHaveAttribute('hidden')
    const choices = within(languageMenu).getAllByRole('button')
    expect(choices.map((choice) => choice.textContent?.trim())).toEqual([
      'English',
      'Français',
      'Deutsch',
      'Español',
      'Italiano',
      'Nederlands',
      'Polski',
      'Русский',
      'Türkçe',
    ])
    expect(selector.querySelector('svg[data-icon="globe"]')).toBeInTheDocument()
  })

  it('switches the visible navigation language without reloading or losing the selected community', () => {
    vi.stubGlobal('fetch', makeFetchMock())
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1' }))
    const reloadSpy = vi.spyOn(window.location, 'reload').mockImplementation(() => {})
    renderWithProviders(() => <Header />)

    fireEvent.click(screen.getByRole('button', { name: 'Language' }))
    fireEvent.click(screen.getByRole('button', { name: 'Français' }))

    expect(window.localStorage.getItem('locale')).toBe('fr')
    expect(screen.getByRole('link', { name: 'Inviter le Bot' })).toHaveAttribute('href', '/invite')
    expect(screen.getByRole('link', { name: 'Se Connecter' })).toBeInTheDocument()
    expect(window.localStorage.getItem('guilds')).toBe(JSON.stringify({ id: 'g1' }))
    expect(reloadSpy).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Langue' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: 'Langue' })).toHaveFocus()
  })

  it('closes the language dropdown with Escape, outside clicks and when opening the user menu', () => {
    setValidAuth()
    vi.stubGlobal('fetch', makeFetchMock())
    renderWithProviders(() => <Header />)
    const toggle = screen.getByRole('button', { name: 'Language' })
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    screen.getByRole('button', { name: 'Français' }).focus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveFocus()
    fireEvent.click(toggle)
    fireEvent.mouseDown(document.body)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    openUserMenu()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('cycles the theme preference with an accessible button and persists the choice', () => {
    vi.stubGlobal('fetch', makeFetchMock())
    renderWithProviders(() => <Header />)
    const theme = screen.getByRole('button', { name: 'Theme: Automatic' })
    fireEvent.click(theme)
    expect(screen.getByRole('button', { name: 'Theme: Light' })).toBe(theme)
    expect(window.localStorage.getItem('theme')).toBe('light')
    fireEvent.click(theme)
    expect(screen.getByRole('button', { name: 'Theme: Dark' })).toBe(theme)
    expect(window.localStorage.getItem('theme')).toBe('dark')
    fireEvent.click(theme)
    expect(screen.getByRole('button', { name: 'Theme: Automatic' })).toBe(theme)
  })

  it('does not start an obsolete promotion countdown', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-09-20T00:00:00.000Z'))
    const intervalSpy = vi.spyOn(window, 'setInterval')
    vi.stubGlobal('fetch', makeFetchMock())
    renderWithProviders(() => <Header />)
    expect(screen.queryByText(/I just turned 20/)).not.toBeInTheDocument()
    expect(intervalSpy).not.toHaveBeenCalled()
  })
})

describe('Header authentication bootstrap', () => {
  it('stays signed out without stored credentials and does not request notification counts', () => {
    const fetchMock = makeFetchMock()
    vi.stubGlobal('fetch', fetchMock)
    renderWithProviders(() => <Header />)
    expect(isLogged()).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(initWebSocket).not.toHaveBeenCalled()
  })

  it.each(['expired', 'invalid'] as const)('rejects an %s expiration date', (expiration) => {
    setValidAuth({ expired: expiration === 'expired' })
    if (expiration === 'invalid') window.localStorage.setItem('expirationDate', 'invalid-date')
    const fetchMock = makeFetchMock()
    vi.stubGlobal('fetch', fetchMock)
    renderWithProviders(() => <Header />)
    expect(isLogged()).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(['null', '{invalid JSON', '{"error":"invalid session"}'])(
    'handles unusable cached user data: %s',
    (cached) => {
      setValidAuth()
      window.localStorage.setItem('discordUser', cached)
      vi.stubGlobal('fetch', makeFetchMock())
      expect(() => renderWithProviders(() => <Header />)).not.toThrow()
      expect(isLogged()).toBe(false)
      expect(initWebSocket).not.toHaveBeenCalled()
    },
  )

  it('restores and normalizes the cached user synchronously and opens the websocket once', () => {
    setValidAuth()
    vi.stubGlobal('fetch', makeFetchMock())
    renderWithProviders(() => <Header />)
    expect(isLogged()).toBe(true)
    expect(discordUser().globalName).toBe('Bobby')
    expect(JSON.parse(window.localStorage.getItem('discordUser')!)).toMatchObject({ id: 'd1', globalName: 'Bobby' })
    expect(initWebSocket).toHaveBeenCalledTimes(1)
    expect(screen.getByAltText('Discord avatar')).toHaveAttribute('src', 'https://cdn/b.png')
  })

  it('keeps the account button named when its avatar is missing and the visible name is hidden on mobile', () => {
    setValidAuth({ user: { id: 'd1', username: 'bob', globalName: 'Bobby' } })
    vi.stubGlobal('fetch', makeFetchMock())
    renderWithProviders(() => <Header />)
    const trigger = screen.getByRole('button', { name: 'Bobby' })
    expect(trigger).toHaveAttribute('aria-label', 'Bobby')
    expect(screen.queryByAltText('Discord avatar')).not.toBeInTheDocument()
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })

  it('restores an existing session cached with a millisecond expiration and migrates it to ISO', () => {
    setValidAuth()
    const expirationDate = Date.now() + 60_000_000
    window.localStorage.setItem('expirationDate', String(expirationDate))
    vi.stubGlobal('fetch', makeFetchMock())
    renderWithProviders(() => <Header />)

    expect(isLogged()).toBe(true)
    expect(discordUser().id).toBe('d1')
    expect(window.localStorage.getItem('expirationDate')).toBe(new Date(expirationDate).toISOString())
    expect(initWebSocket).toHaveBeenCalledTimes(1)
  })

  it.each(['notOk', 'reject'] as const)(
    'clears the signed-in state after a %s validation response',
    async (userValidation) => {
      setValidAuth()
      vi.stubGlobal('fetch', makeFetchMock({ userValidation }))
      renderWithProviders(() => <Header />)
      expect(isLogged()).toBe(true)
      await vi.waitFor(() => expect(isLogged()).toBe(false))
      expect(screen.getByRole('link', { name: 'Login with Discord' })).toBeInTheDocument()
    },
  )

  it('grants the admin destination only for a developer account', async () => {
    setValidAuth()
    vi.stubGlobal('fetch', makeFetchMock({ rank: 'developer' }))
    renderWithProviders(() => <Header />)
    await vi.waitFor(() => expect(isAdmin()).toBe(true))
    openUserMenu()
    expect(screen.getByRole('link', { name: 'Admin Dashboard' })).toHaveAttribute(
      'href',
      '/dashboard/admins/informations',
    )
  })

  it.each(['member', 'notOk', 'reject'])(
    'keeps a %s rank lookup non-admin without an unhandled rejection',
    async (rank) => {
      setValidAuth()
      const fetchMock = makeFetchMock({ rank })
      vi.stubGlobal('fetch', fetchMock)
      renderWithProviders(() => <Header />)
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(isAdmin()).toBe(false)
      openUserMenu()
      expect(screen.queryByRole('link', { name: 'Admin Dashboard' })).not.toBeInTheDocument()
    },
  )
})

describe('Header notifications', () => {
  it.each([0, 5, 42])('shows the unread count %s with one authenticated count request', async (unreadCount) => {
    setValidAuth()
    const fetchMock = makeFetchMock({ unreadCount })
    vi.stubGlobal('fetch', fetchMock)
    renderWithProviders(() => <Header />)
    await vi.waitFor(() => expect(notificationCount()).toBe(unreadCount))
    openUserMenu()
    const notifications = screen.getByRole('link', { name: /^Notifications/ })
    expect(notifications).toHaveTextContent(
      unreadCount === 0 ? /^Notifications$/ : unreadCount > 9 ? '9+' : String(unreadCount),
    )
    expect(fetchMock.mock.calls.filter(([url]) => url.includes('/notifications/count'))).toHaveLength(1)
  })

  it.each(['notOk', 'reject'] as const)(
    'handles a %s notifications response without breaking the menu',
    async (unreadCount) => {
      setValidAuth()
      vi.stubGlobal('fetch', makeFetchMock({ unreadCount }))
      renderWithProviders(() => <Header />)
      if (unreadCount === 'reject') {
        await vi.waitFor(() =>
          expect(console.error).toHaveBeenCalledWith('Failed to load notification count:', expect.any(Error)),
        )
      }
      openUserMenu()
      expect(screen.getByRole('link', { name: 'Notifications' })).toBeInTheDocument()
      expect(notificationCount()).toBe(0)
    },
  )
})

describe('Header user menu', () => {
  it('opens by button activation, stays open for inside clicks and closes outside', () => {
    setValidAuth()
    vi.stubGlobal('fetch', makeFetchMock())
    const { container } = renderWithProviders(() => <Header />)
    const trigger = screen.getByRole('button', { name: /Bobby/ })
    const menu = container.querySelector<HTMLUListElement>('#user-navigation')!
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(menu).toHaveAttribute('hidden')
    trigger.focus()
    expect(trigger).toHaveFocus()
    fireEvent.click(trigger, { detail: 0 })
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(menu).not.toHaveAttribute('hidden')
    fireEvent.mouseDown(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    fireEvent.mouseDown(document.body)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(menu).toHaveAttribute('hidden')
  })

  it('closes after following a user destination', () => {
    setValidAuth()
    vi.stubGlobal('fetch', makeFetchMock())
    renderWithProviders(() => <Header />)
    const trigger = openUserMenu()
    fireEvent.click(screen.getByRole('link', { name: 'Account' }))
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('removes its document listener on unmount', () => {
    vi.stubGlobal('fetch', makeFetchMock())
    const removeListener = vi.spyOn(document, 'removeEventListener')
    const { unmount } = renderWithProviders(() => <Header />)
    unmount()
    expect(removeListener).toHaveBeenCalledWith('mousedown', expect.any(Function))
    expect(() => fireEvent.mouseDown(document.body)).not.toThrow()
  })

  it.each(['ISO', 'milliseconds'])(
    'restores the previous session with an %s expiration when stopping impersonation',
    (format) => {
      setValidAuth()
      const expirationDate = Date.now() + 60_000_000
      const expirationISO = new Date(expirationDate).toISOString()
      window.localStorage.setItem('oldAccessToken', 'oldTok')
      window.localStorage.setItem('oldDiscordID', 'oldD1')
      window.localStorage.setItem('oldExpirationDate', format === 'ISO' ? expirationISO : String(expirationDate))
      vi.stubGlobal('fetch', makeFetchMock())
      renderWithProviders(() => <Header />)
      openUserMenu()
      fireEvent.click(screen.getByRole('link', { name: 'Stop Impersonate' }))
      expect(window.localStorage.getItem('accessToken')).toBe('oldTok')
      expect(window.localStorage.getItem('discordID')).toBe('oldD1')
      expect(window.localStorage.getItem('expirationDate')).toBe(expirationISO)
      expect(window.localStorage.getItem('oldAccessToken')).toBeNull()
      expect(window.location.href).toContain('/login/?discordID=oldD1&accessToken=oldTok')
      expect(new URL(window.location.href).searchParams.get('expirationDate')).toBe(String(expirationDate))
    },
  )

  it.each(['invalid-date', String(Date.now() - 60_000)])(
    'requires sign-in when the previous expiration is %s',
    (expirationDate) => {
      setValidAuth()
      window.localStorage.setItem('oldAccessToken', 'oldTok')
      window.localStorage.setItem('oldDiscordID', 'oldD1')
      window.localStorage.setItem('oldExpirationDate', expirationDate)
      vi.stubGlobal('fetch', makeFetchMock())
      renderWithProviders(() => <Header />)
      openUserMenu()
      fireEvent.click(screen.getByRole('link', { name: 'Stop Impersonate' }))

      expect(window.location.pathname).toBe('/login')
      expect(window.localStorage.getItem('accessToken')).toBeNull()
      expect(window.localStorage.getItem('oldAccessToken')).toBeNull()
    },
  )

  it('does not offer stop impersonation for a regular session', () => {
    setValidAuth()
    vi.stubGlobal('fetch', makeFetchMock())
    renderWithProviders(() => <Header />)
    openUserMenu()
    expect(screen.queryByRole('link', { name: 'Stop Impersonate' })).not.toBeInTheDocument()
  })
})
