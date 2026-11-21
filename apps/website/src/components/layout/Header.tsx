import { A, useLocation } from '@solidjs/router'
import { createSignal, For, onCleanup, onMount, Show, type Component } from 'solid-js'
import {
  discordUser,
  isAdmin,
  isLogged,
  normalizeDiscordUserPayload,
  setDiscordUser,
  setIsAdmin,
  setIsLogged,
} from '../../utils/event'
import logo from '../../assets/brand/logo.png'
import { useI18n } from '../../i18n'
import { initWebSocket } from '../../utils/websocket'
import { API_FQDN, fetchAPI } from '../../utils/api'
import { notificationCount, updateNotificationCount } from '../../utils/notificationStore'
import { setThemeMode, type ThemeMode, themeMode } from '../../utils/theme'
import { parseSessionExpiration } from '../../utils/sessionExpiration.js'
import { ButtonLink, Icon, type IconName } from '../ui/index.js'

type Language = {
  code: string
  title: string
}

const lang: Language[] = [
  {
    code: 'en',
    title: 'English',
  },
  {
    code: 'fr',
    title: 'Français',
  },
  {
    code: 'de',
    title: 'Deutsch',
  },
  {
    code: 'es',
    title: 'Español',
  },
  {
    code: 'it',
    title: 'Italiano',
  },
  {
    code: 'nl',
    title: 'Nederlands',
  },
  {
    code: 'pl',
    title: 'Polski',
  },
  {
    code: 'ru',
    title: 'Русский',
  },
  {
    code: 'tr',
    title: 'Türkçe',
  },
]

const themeOptions: { mode: ThemeMode; icon: IconName; labelKey: string; fallback: string }[] = [
  { mode: 'auto', icon: 'monitor', labelKey: 'header.theme_auto', fallback: 'Automatic' },
  { mode: 'light', icon: 'sun', labelKey: 'header.theme_light', fallback: 'Light' },
  { mode: 'dark', icon: 'moon', labelKey: 'header.theme_dark', fallback: 'Dark' },
]

// Each click moves to the next mode: auto -> light -> dark -> auto.
const currentThemeOption = () => themeOptions.find((option) => option.mode === themeMode()) ?? themeOptions[0]

const cycleTheme = () => {
  const index = themeOptions.findIndex((option) => option.mode === themeMode())
  setThemeMode(themeOptions[(index + 1) % themeOptions.length].mode)
}

export const Header: Component = () => {
  const location = useLocation()
  const dashboard = () => location.pathname.startsWith('/dashboard')
  const [isOpen, setIsOpen] = createSignal(false)
  const [languageOpen, setLanguageOpen] = createSignal(false)
  const [publicNavigationOpen, setPublicNavigationOpen] = createSignal(false)
  let publicNavigationTrigger: HTMLButtonElement | undefined
  let languageTrigger: HTMLButtonElement | undefined
  let userTrigger: HTMLButtonElement | undefined
  const { t, locale, updateLocale } = useI18n()

  type NavLink = {
    title: string
    icon: IconName
    href: string
    color?: string
    hoverColor?: string
  }

  const navLinks = (): NavLink[] => [
    {
      title: t('main.documentation', 'Documentation'),
      icon: 'book-open',
      href: '/docs',
    },
    {
      title: t('main.add_bot', 'Add the Bot'),
      icon: 'bot',
      href: '/invite',
    },
    {
      title: t('main.support', 'Support'),
      icon: 'messages-square',
      href: '/discord',
    },
    {
      title: t('main.premium', 'Premium'),
      icon: 'crown',
      href: '/premium',
      color: 'text-amber-400',
      hoverColor: 'hover:text-amber-300',
    },
  ]

  type DropdownLink = {
    title: string
    content: {
      title: string
      icon: IconName
      href: string
      condition?: () => boolean
      onPress?: () => void
    }[]
  }

  const navDropdownLinks = (): DropdownLink[] => [
    {
      title: 'User',
      content: [
        {
          title: t('main.account', 'Account'),
          icon: 'user-round',
          href: '/account',
        },
        {
          title: t('main.notifications', 'Notifications'),
          icon: 'bell',
          href: '/notifications',
        },
        {
          title: 'Stop Impersonate',
          icon: 'user-round-cog',
          condition: () => {
            return localStorage.getItem('oldAccessToken') !== null
          },
          href: '/',
          onPress: () => {
            const oldToken = localStorage.getItem('oldAccessToken') || ''
            const oldDiscordID = localStorage.getItem('oldDiscordID') || ''
            const oldExpirationDate = parseSessionExpiration(localStorage.getItem('oldExpirationDate') || '')
            // 1 clear all cookies
            localStorage.clear()
            sessionStorage.clear()
            if (!oldExpirationDate || oldExpirationDate.getTime() <= Date.now()) {
              window.location.href = '/login'
              return
            }
            // set accessTokens & oldAccessToken
            localStorage.setItem('accessToken', oldToken)
            localStorage.setItem('discordID', oldDiscordID)
            localStorage.setItem('expirationDate', oldExpirationDate.toISOString())
            // redirect to home
            window.location.href = `/login/?discordID=${oldDiscordID}&accessToken=${oldToken}&expirationDate=${oldExpirationDate.getTime()}`
          },
        },
      ],
    },
    {
      title: 'Main',
      content: [
        {
          title: t('main.servers_ranking', 'Servers Ranking'),
          icon: 'server',
          href: '/servers',
        },
        {
          title: t('main.dashboard', 'Dashboard'),
          icon: 'layout-dashboard',
          href: '/dashboard/guilds',
        },
        {
          title: t('main.admin_dashboard', 'Admin Dashboard'),
          icon: 'wrench',
          href: '/dashboard/admins/informations',
          condition: () => {
            return isAdmin()
          },
        },
      ],
    },
    {
      title: 'Other',
      content: [
        {
          title: t('main.logout', 'Logout'),
          icon: 'log-out',
          href: '/logout',
        },
      ],
    },
  ]

  onMount(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return
      if (!event.target.closest('[data-header-menu="user"]')) setIsOpen(false)
      if (!event.target.closest('[data-header-menu="language"]')) setLanguageOpen(false)
      if (!event.target.closest('.site-header')) setPublicNavigationOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        const activeElement = document.activeElement
        const trigger =
          publicNavigationOpen() && activeElement?.closest('#public-navigation')
            ? publicNavigationTrigger
            : languageOpen() && activeElement?.closest('[data-header-menu="language"]')
              ? languageTrigger
              : isOpen() && activeElement?.closest('[data-header-menu="user"]')
                ? userTrigger
                : undefined
        setIsOpen(false)
        setLanguageOpen(false)
        setPublicNavigationOpen(false)
        trigger?.focus()
      }
    }
    document.addEventListener('keydown', handleEscape)
    // `onMount` (createEffect under the hood) doesn't treat a returned function as a cleanup
    // callback the way React's useEffect does - it was silently discarded, so this listener was
    // never actually removed on unmount. `onCleanup` is the real hook for that.
    onCleanup(() => document.removeEventListener('mousedown', handleClickOutside))
    onCleanup(() => document.removeEventListener('keydown', handleEscape))
  })

  onMount(() => {
    const discordID = localStorage.getItem('discordID')
    const token = localStorage.getItem('accessToken')
    const expirationDate = localStorage.getItem('expirationDate')

    if (!discordID || !token || !expirationDate) {
      setIsLogged(false)
      console.log('Failed to get the user data from the local storage')
      return
    }

    setIsAdmin(false)
    const expirationDateParsed = parseSessionExpiration(expirationDate)
    if (!expirationDateParsed || expirationDateParsed.getTime() <= Date.now()) {
      setIsLogged(false)
      console.log('The token has expired')
      return
    }
    localStorage.setItem('expirationDate', expirationDateParsed.toISOString())

    fetch(`${API_FQDN}/users/${discordID}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => {
        if (!res.ok) {
          setIsLogged(false)
          console.log('Failed to get the user data from the API')
        }
      })
      .catch(() => {
        setIsLogged(false)
        console.log('Failed to get the user data from the API')
      })

    let storedDiscordUser: unknown
    try {
      storedDiscordUser = JSON.parse(localStorage.getItem('discordUser') || 'null')
    } catch {
      localStorage.removeItem('discordUser')
      setIsLogged(false)
      return
    }
    if (!storedDiscordUser || typeof storedDiscordUser !== 'object') {
      setIsLogged(false)
      console.log('Failed to get the user data from the local storage')
      return
    }

    if ('error' in storedDiscordUser && storedDiscordUser.error) {
      localStorage.removeItem('discordUser')
      setIsLogged(false)
      console.log('The user data is invalid')
      return
    }

    const normalizedUser = normalizeDiscordUserPayload(storedDiscordUser)
    localStorage.setItem('discordUser', JSON.stringify(normalizedUser))
    setDiscordUser(normalizedUser)
    setIsLogged(true)
    initWebSocket()

    // Load notification count after authentication
    fetchAPI('/users/:discordID/notifications/count', 'GET')
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json()
          updateNotificationCount(data.unreadCount || 0)
        }
      })
      .catch((error) => {
        console.error('Failed to load notification count:', error)
      })

    fetch(`${API_FQDN}/users?discordID=${normalizedUser.id}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => {
        if (res.ok) {
          return res.json()
        }
      })
      .then((userInfo) => {
        // `userInfo` is undefined when the fetch above resolved with `!res.ok` (no `else` branch
        // there returns a value) - guard with optional chaining so that response is a silent
        // no-op instead of an unhandled promise rejection (`Cannot read properties of undefined`).
        if (userInfo?.rank && userInfo.rank === 'developer') {
          setIsAdmin(true)
        }
      })
      .catch(() => setIsAdmin(false))
  })

  return (
    <>
      <header
        class="site-header navbar bg-base-100"
        classList={{ 'is-dashboard': dashboard(), 'site-header-public': !dashboard() }}
      >
        <div class="header-brand-group flex flex-1 flex-wrap items-center min-w-0">
          <A href="/" class="header-brand font-bold text-base-content" aria-label="Gmod Integration">
            <img src={logo} alt="" width="34" height="34" />
            <span class="header-brand-name">Gmod Integration</span>
          </A>
          <Show when={dashboard()}>
            <span class="header-workspace-label">{t('main.dashboard', 'Dashboard')}</span>
          </Show>
          <Show when={!dashboard()}>
            <button
              ref={publicNavigationTrigger}
              type="button"
              class="public-menu-toggle header-control"
              aria-label={t('ui.toggle_navigation', 'Toggle navigation')}
              aria-controls="public-navigation"
              aria-expanded={publicNavigationOpen()}
              onClick={() => {
                setPublicNavigationOpen(!publicNavigationOpen())
                setIsOpen(false)
                setLanguageOpen(false)
              }}
            >
              <Icon name={publicNavigationOpen() ? 'x' : 'menu'} size={20} />
            </button>
            <nav
              id="public-navigation"
              class="public-navigation"
              classList={{ 'is-open': publicNavigationOpen() }}
              aria-label={t('ui.primary_navigation', 'Main navigation')}
            >
              <For each={navLinks()}>
                {({ title, icon, href, color, hoverColor }) => (
                  <A
                    href={href}
                    class={
                      'public-navigation-link whitespace-nowrap ' +
                      (color ? color : 'text-base-content/70') +
                      ' ' +
                      (hoverColor ? hoverColor : 'hover:text-base-content')
                    }
                    aria-current={location.pathname === href ? 'page' : undefined}
                    onClick={() => setPublicNavigationOpen(false)}
                  >
                    <Icon name={icon} size={17} class="inline-block mr-1.5" /> {title}
                  </A>
                )}
              </For>
            </nav>
          </Show>
        </div>

        <div class="flex">
          <div
            class="dropdown dropdown-end"
            data-header-menu="language"
            classList={{ 'dropdown-open': languageOpen() }}
          >
            <button
              ref={languageTrigger}
              type="button"
              class="header-control btn btn-ghost"
              aria-label={t('ui.language', 'Language')}
              aria-controls="language-navigation"
              aria-expanded={languageOpen()}
              onClick={() => {
                setLanguageOpen(!languageOpen())
                setIsOpen(false)
                setPublicNavigationOpen(false)
              }}
            >
              <span class="text-base-content">
                <Icon name="globe" size={18} />
              </span>
              <div class="flex justify-center items-center min-w-6 min-h-6">
                <Icon name="chevron-down" size={16} />
              </div>
            </button>
            <ul
              id="language-navigation"
              hidden={!languageOpen()}
              classList={{ hidden: !languageOpen() }}
              class="header-dropdown menu dropdown-content mt-3 z-50 p-2 gap-1 border border-base-300/60 shadow-lg bg-base-100 rounded-xl w-44 max-sm:fixed max-sm:left-4 max-sm:right-auto"
            >
              <For each={lang}>
                {(language) => (
                  <li class="flex">
                    <button
                      type="button"
                      class="px-3 py-2.5 gap-3 m-0 whitespace-nowrap rounded-lg"
                      onClick={() => {
                        updateLocale(language.code)
                        setLanguageOpen(false)
                        languageTrigger?.focus()
                      }}
                    >
                      <span class="flex justify-center w-6 items-center text-base-content">
                        <Icon name={locale() === language.code ? 'check' : 'globe'} size={16} />
                      </span>
                      {language.title}
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </div>
          <button
            type="button"
            class="header-control btn btn-ghost text-base-content"
            aria-label={`${t('header.theme', 'Theme')}: ${t(currentThemeOption().labelKey, currentThemeOption().fallback)}`}
            title={`${t('header.theme', 'Theme')}: ${t(currentThemeOption().labelKey, currentThemeOption().fallback)}`}
            onClick={cycleTheme}
          >
            <Icon name={currentThemeOption().icon} size={19} />
          </button>
        </div>

        <Show when={isLogged()}>
          <div class="flex-none max-sm:ml-auto">
            <div class="dropdown dropdown-end" data-header-menu="user" classList={{ 'dropdown-open': isOpen() }}>
              <button
                ref={userTrigger}
                type="button"
                class="header-user-trigger btn btn-ghost user-menu-trigger"
                aria-label={
                  discordUser().globalName ||
                  discordUser().displayName ||
                  discordUser().username ||
                  t('main.account', 'Account')
                }
                aria-controls="user-navigation"
                aria-expanded={isOpen()}
                onClick={() => {
                  setIsOpen(!isOpen())
                  setLanguageOpen(false)
                  setPublicNavigationOpen(false)
                }}
              >
                <div class="header-user-avatar rounded-full overflow-hidden flex items-center justify-center bg-base-200">
                  <Show
                    when={discordUser().displayAvatarURL || discordUser().avatarURL}
                    fallback={<Icon name="user-round" size={17} />}
                  >
                    <img alt="Discord avatar" src={discordUser().displayAvatarURL || discordUser().avatarURL} />
                  </Show>
                </div>
                <p class="header-user-name font-medium text-base-content">
                  {discordUser().globalName || discordUser().displayName || discordUser().username}
                </p>
                <div class="flex justify-center items-center min-w-6 min-h-6">
                  <Icon name={isOpen() ? 'chevron-up' : 'chevron-down'} size={16} />
                </div>
              </button>
              <ul
                id="user-navigation"
                hidden={!isOpen()}
                classList={{ hidden: !isOpen() }}
                tabIndex={-1}
                class="header-dropdown menu dropdown-content mt-3 z-50 p-2 gap-1 border border-base-300/60 shadow-lg bg-base-100 rounded-xl min-w-56"
              >
                <For each={navDropdownLinks()}>
                  {({ content }, index) => (
                    <>
                      <For each={content}>
                        {({ title, icon, href, condition, onPress }) => (
                          <Show when={!condition || condition()}>
                            <li class="flex">
                              <A
                                href={href}
                                class="px-3 py-2.5 m-0 whitespace-nowrap rounded-lg flex items-center gap-3"
                                onClick={(event) => {
                                  if (onPress) {
                                    event.preventDefault()
                                    onPress()
                                  }
                                  setIsOpen(false)
                                }}
                              >
                                <div class="flex justify-center items-center min-w-6 min-h-6">
                                  <Icon name={icon} size={17} />
                                </div>
                                {title}
                                <Show when={href === '/notifications' && notificationCount() > 0}>
                                  <span class="badge badge-warning ml-2">
                                    {notificationCount() > 9 ? '9+' : notificationCount()}
                                  </span>
                                </Show>
                              </A>
                            </li>
                          </Show>
                        )}
                      </For>
                      {index() < navDropdownLinks().length - 1 && <hr class="border-base-300/60 mx-2 my-1" />}
                    </>
                  )}
                </For>
              </ul>
            </div>
          </div>
        </Show>
        <Show when={!isLogged()}>
          <div class="flex-none pl-4">
            <ButtonLink
              href="/login"
              variant="primary"
              size="sm"
              class="header-login"
              aria-label={t('header.login', 'Login with Discord')}
            >
              <Icon name="user-round" size={16} />
              <span class="header-login-copy">{t('header.login', 'Login with Discord')}</span>
            </ButtonLink>
          </div>
        </Show>
      </header>
      <Show when={!dashboard()}>
        <hr class="border border-base-200" />
      </Show>
    </>
  )
}
