import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { renderWithProviders } from '../../testUtils.js'
import { Header } from '../../../src/components/layout/Header.js'
import {
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
import gbFlag from '../../../src/assets/flags/gb.svg'
import frFlag from '../../../src/assets/flags/fr.svg'
import { acceptAuthSession, authSession, resetAuthentication } from '../../../src/utils/authClient.js'
import { sessionFixture } from '../../authFixture.js'

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
  resetAuthentication()
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
  acceptAuthSession(
    sessionFixture({
      user: normalizeDiscordUserPayload(
        overrides.user ?? {
          id: overrides.discordID ?? 'd1',
          username: 'bob',
          globalName: 'Bobby',
          avatarURL: 'https://cdn/a.png',
          displayAvatarURL: 'https://cdn/b.png',
        },
      ),
    }),
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
      ['Invite the bot', '/invite'],
      ['Help and support', '/discord'],
      ['Premium', '/premium'],
      ['Documentation', '/docs'],
    ]) {
      expect(within(navigation).getByRole('link', { name })).toHaveAttribute('href', href)
    }
    expect(screen.getByRole('link', { name: 'Sign in with Discord' })).toHaveAttribute('href', '/login')
    expect(screen.queryByRole('link', { name: /^Notifications/ })).not.toBeInTheDocument()
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
    const flags = choices.map((choice) => choice.querySelector('img.language-flag')!)
    expect(flags).toHaveLength(9)
    expect(new Set(flags.map((flag) => flag.getAttribute('src'))).size).toBe(9)
    flags.forEach((flag) => {
      expect(flag).toHaveAttribute('alt', '')
      expect(flag).toHaveAttribute('aria-hidden', 'true')
    })
    expect(selector.querySelector('img.language-flag')).toHaveAttribute('src', gbFlag)
    expect(choices[0]).toHaveAttribute('aria-pressed', 'true')
    choices.slice(1).forEach((choice) => expect(choice).toHaveAttribute('aria-pressed', 'false'))
  })

  it('switches the visible navigation language without reloading or losing the selected community', () => {
    vi.stubGlobal('fetch', makeFetchMock())
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1' }))
    const reloadSpy = vi.spyOn(window.location, 'reload').mockImplementation(() => {})
    renderWithProviders(() => <Header />)

    fireEvent.click(screen.getByRole('button', { name: 'Language' }))
    fireEvent.click(screen.getByRole('button', { name: 'Français' }))

    expect(window.localStorage.getItem('locale')).toBe('fr')
    expect(screen.getByRole('link', { name: 'Inviter le bot' })).toHaveAttribute('href', '/invite')
    expect(screen.getByRole('link', { name: 'Se connecter avec Discord' })).toBeInTheDocument()
    expect(window.localStorage.getItem('guilds')).toBe(JSON.stringify({ id: 'g1' }))
    expect(reloadSpy).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Langue' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: 'Langue' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Langue' }).querySelector('img.language-flag')).toHaveAttribute(
      'src',
      frFlag,
    )
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

describe('Header authenticated identity', () => {
  it('renders a server-validated session without requiring stored credentials', () => {
    setValidAuth()
    vi.stubGlobal('fetch', makeFetchMock())
    renderWithProviders(() => <Header />)
    expect(isLogged()).toBe(true)
    expect(localStorage.getItem('accessToken')).toBeNull()
    expect(screen.getByRole('button', { name: 'Bobby' }).querySelector('img')).toHaveAttribute(
      'src',
      'https://cdn/b.png',
    )
    expect(initWebSocket).not.toHaveBeenCalled()
  })
  it('does not infer sign-in from a browser profile or bearer cache', () => {
    localStorage.setItem('discordUser', JSON.stringify({ id: 'fake', username: 'Fake' }))
    localStorage.setItem('accessToken', 'old-token')
    renderWithProviders(() => <Header />)
    expect(isLogged()).toBe(false)
    expect(screen.getByRole('link', { name: 'Sign in with Discord' })).toBeInTheDocument()
  })
  it('keeps the account control named when there is no avatar', () => {
    setValidAuth({ user: { id: 'd1', username: 'bob', globalName: 'Bobby' } })
    vi.stubGlobal('fetch', makeFetchMock())
    renderWithProviders(() => <Header />)
    const trigger = screen.getByRole('button', { name: 'Bobby' })
    expect(trigger).toHaveAttribute('aria-label', 'Bobby')
    expect(trigger.querySelector('img')).not.toBeInTheDocument()
  })
  it('uses the Discord default avatar for an authenticated account without a custom avatar', () => {
    setValidAuth({ user: { id: '123456789012345678', username: 'bob', globalName: 'Bobby', discriminator: '0' } })
    vi.stubGlobal('fetch', makeFetchMock())
    renderWithProviders(() => <Header />)
    expect(screen.getByRole('button', { name: 'Bobby' }).querySelector('img')).toHaveAttribute(
      'src',
      'https://cdn.discordapp.com/embed/avatars/0.png',
    )
  })
  it('updates the avatar when the authenticated Discord profile refreshes', () => {
    setValidAuth()
    vi.stubGlobal('fetch', makeFetchMock())
    renderWithProviders(() => <Header />)
    acceptAuthSession({
      ...authSession()!,
      user: { ...authSession()!.user, avatarURL: 'https://cdn/new.png', displayAvatarURL: 'https://cdn/new.png' },
    })
    expect(screen.getByRole('button', { name: 'Bobby' }).querySelector('img')).toHaveAttribute(
      'src',
      'https://cdn/new.png',
    )
  })
  it('uses the authenticated rank for the developer destination', () => {
    setValidAuth()
    acceptAuthSession({ ...authSession()!, user: { ...authSession()!.user, rank: 'developer' } })
    vi.stubGlobal('fetch', makeFetchMock())
    renderWithProviders(() => <Header />)
    openUserMenu()
    expect(isAdmin()).toBe(true)
    expect(screen.getByRole('link', { name: 'Admin Dashboard' })).toHaveAttribute(
      'href',
      '/dashboard/admins/informations',
    )
  })
  it('keeps the session when a notification request encounters a temporary failure', async () => {
    setValidAuth()
    vi.stubGlobal('fetch', makeFetchMock({ unreadCount: 'reject' }))
    renderWithProviders(() => <Header />)
    await Promise.resolve()
    expect(isLogged()).toBe(true)
    openUserMenu()
    expect(screen.getByRole('link', { name: 'Account' })).toBeInTheDocument()
  })
})

describe('Header notifications', () => {
  it.each([0, 5, 42])('shows the unread count %s with one authenticated count request', async (unreadCount) => {
    setValidAuth()
    const fetchMock = makeFetchMock({ unreadCount })
    vi.stubGlobal('fetch', fetchMock)
    renderWithProviders(() => <Header />)
    await vi.waitFor(() => expect(notificationCount()).toBe(unreadCount))
    const notifications = screen.getByRole('link', { name: /^Notifications/ })
    expect(notifications).toHaveAttribute('href', '/notifications')
    expect(notifications).toHaveAccessibleName(unreadCount > 0 ? `Notifications (${unreadCount})` : 'Notifications')
    expect(notifications.previousElementSibling).toBe(screen.getByRole('button', { name: 'Theme: Automatic' }))
    expect(notifications).toHaveTextContent(unreadCount === 0 ? /^$/ : unreadCount > 9 ? '9+' : String(unreadCount))
    const trigger = openUserMenu()
    const menu = document.getElementById('user-navigation')!
    expect(within(menu).queryByRole('link', { name: /^Notifications/ })).not.toBeInTheDocument()
    fireEvent.click(notifications)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
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
      expect(screen.getByRole('link', { name: 'Notifications' })).toBeInTheDocument()
      openUserMenu()
      expect(screen.getByRole('link', { name: 'Account' })).toBeInTheDocument()
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

  it('uses the server delegation marker for returning to the original account', () => {
    setValidAuth()
    acceptAuthSession({ ...authSession()!, session: { ...authSession()!.session, actorDiscordID: 'admin' } })
    vi.stubGlobal('fetch', makeFetchMock())
    renderWithProviders(() => <Header />)
    openUserMenu()
    expect(screen.getByRole('link', { name: 'Return to your account' })).toBeInTheDocument()
    expect(localStorage.getItem('oldAccessToken')).toBeNull()
  })

  it('does not offer stop impersonation for a regular session', () => {
    setValidAuth()
    vi.stubGlobal('fetch', makeFetchMock())
    renderWithProviders(() => <Header />)
    openUserMenu()
    expect(screen.queryByRole('link', { name: 'Return to your account' })).not.toBeInTheDocument()
  })
})
