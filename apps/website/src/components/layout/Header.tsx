import { A } from '@solidjs/router'
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

type FlagProps = { locale: string; size: number }

const GetFlagImg: Component<FlagProps> = (props) => {
  const size = () => props.size
  const flag = () => (props.locale.toLowerCase() === 'en' ? 'gb' : props.locale.toLowerCase())
  return (
    <img
      src={`https://flagcdn.com/${size()}x${Math.round(size() * 0.75)}/${flag()}.png`}
      srcSet={`https://flagcdn.com/${size() * 2}x${Math.round(size() * 1.5)}/${flag()}.png 2x, https://flagcdn.com/${size() * 3}x${Math.round(size() * 2.25)}/${flag()}.png 3x`}
      width={size()}
      height={Math.round(size() * 0.75)}
      alt=""
      aria-hidden="true"
    />
  )
}

type Language = {
  code: string
  title: string
  emoji: string
}

const lang: Language[] = [
  {
    code: 'en',
    title: 'English',
    emoji: '🇬🇧',
  },
  {
    code: 'fr',
    title: 'Français',
    emoji: '🇫🇷',
  },
  {
    code: 'de',
    title: 'Deutsch',
    emoji: '🇩🇪',
  },
  {
    code: 'es',
    title: 'Español',
    emoji: '🇪🇸',
  },
  {
    code: 'it',
    title: 'Italiano',
    emoji: '🇮🇹',
  },
  {
    code: 'nl',
    title: 'Nederlands',
    emoji: '🇳🇱',
  },
  {
    code: 'pl',
    title: 'Polski',
    emoji: '🇵🇱',
  },
  {
    code: 'ru',
    title: 'Русский',
    emoji: '🇷🇺',
  },
  {
    code: 'tr',
    title: 'Türkçe',
    emoji: '🇹🇷',
  },
]

const themeOptions: { mode: ThemeMode; icon: string; labelKey: string; fallback: string }[] = [
  { mode: 'auto', icon: 'fa-circle-half-stroke', labelKey: 'header.theme_auto', fallback: 'Automatic' },
  { mode: 'light', icon: 'fa-sun', labelKey: 'header.theme_light', fallback: 'Light' },
  { mode: 'dark', icon: 'fa-moon', labelKey: 'header.theme_dark', fallback: 'Dark' },
]

// Each click moves to the next mode: auto -> light -> dark -> auto.
const currentThemeOption = () => themeOptions.find((option) => option.mode === themeMode()) ?? themeOptions[0]

const cycleTheme = () => {
  const index = themeOptions.findIndex((option) => option.mode === themeMode())
  setThemeMode(themeOptions[(index + 1) % themeOptions.length].mode)
}

export const Header: Component = () => {
  const [isOpen, setIsOpen] = createSignal(false)
  const [languageOpen, setLanguageOpen] = createSignal(false)
  const { t, locale, updateLocale } = useI18n()

  type NavLink = {
    title: string
    fontAwesomeIcon: string
    href: string
    color?: string
    hoverColor?: string
  }

  const navLinks = (): NavLink[] => [
    {
      title: t('main.documentation', 'Documentation'),
      fontAwesomeIcon: 'fa-solid fa-book',
      href: '/docs',
    },
    {
      title: t('main.add_bot', 'Add the Bot'),
      fontAwesomeIcon: 'fa-solid fa-robot',
      href: '/invite',
    },
    {
      title: t('main.support', 'Support'),
      fontAwesomeIcon: 'fa-brands fa-discord',
      href: '/discord',
    },
    {
      title: t('main.premium', 'Premium'),
      fontAwesomeIcon: 'fa-solid fa-crown',
      href: '/premium',
      color: 'text-amber-400',
      hoverColor: 'hover:text-amber-300',
    },
  ]

  type DropdownLink = {
    title: string
    content: {
      title: string
      fontAwesomeIcon: string
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
          fontAwesomeIcon: 'fa-solid fa-user',
          href: '/account',
        },
        {
          title: t('main.notifications', 'Notifications'),
          fontAwesomeIcon: 'fa-solid fa-bell',
          href: '/notifications',
        },
        {
          title: 'Stop Impersonate',
          fontAwesomeIcon: 'fa-solid fa-user-secret',
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
          fontAwesomeIcon: 'fa-solid fa-server',
          href: '/servers',
        },
        {
          title: t('main.dashboard', 'Dashboard'),
          fontAwesomeIcon: 'fa-solid fa-tachometer-alt',
          href: '/dashboard/guilds',
        },
        {
          title: t('main.admin_dashboard', 'Admin Dashboard'),
          fontAwesomeIcon: 'fa-solid fa-screwdriver-wrench',
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
          fontAwesomeIcon: 'fa-solid fa-right-from-bracket',
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
    }

    document.addEventListener('mousedown', handleClickOutside)
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
        setLanguageOpen(false)
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
      <header class="navbar bg-base-100 max-w-(--breakpoint-2xl) mx-auto p-4 flex-wrap gap-y-4">
        <div class="flex flex-1 flex-wrap items-center gap-y-4 min-w-0">
          <img src={logo} alt="logo" width="60" height="60" />
          <A
            href="/"
            class="text-2xl font-bold ml-4 text-base-content whitespace-nowrap max-sm:whitespace-normal max-sm:ml-2"
          >
            Gmod Integration
          </A>
          <nav class="contents" aria-label={t('ui.primary_navigation', 'Main navigation')}>
            <For each={navLinks()}>
              {({ title, fontAwesomeIcon, href, color, hoverColor }) => (
                <A
                  href={href}
                  class={
                    'ml-6 whitespace-nowrap ' +
                    (color ? color : 'text-base-content/70') +
                    ' ' +
                    (hoverColor ? hoverColor : 'hover:text-base-content')
                  }
                >
                  <i aria-hidden="true" class={fontAwesomeIcon + ' mr-1'} /> {title}
                </A>
              )}
            </For>
          </nav>
        </div>

        <div class="flex">
          <div
            class="dropdown dropdown-end"
            data-header-menu="language"
            classList={{ 'dropdown-open': languageOpen() }}
          >
            <button
              type="button"
              class="btn btn-ghost hover:bg-transparent text-lg input-ghost"
              aria-label={t('ui.language', 'Language')}
              aria-controls="language-navigation"
              aria-expanded={languageOpen()}
              onClick={() => {
                setLanguageOpen(!languageOpen())
                setIsOpen(false)
              }}
            >
              <span class="text-base-content">
                <GetFlagImg locale={locale()} size={20} />
              </span>
              <div class="flex justify-center items-center min-w-6 min-h-6">
                <i aria-hidden="true" class="fa-solid fa-angle-down" />
              </div>
            </button>
            <ul
              id="language-navigation"
              hidden={!languageOpen()}
              classList={{ hidden: !languageOpen() }}
              class="menu dropdown-content mt-3 z-1 p-4 gap-4 shadow-sm bg-base-200 rounded-md w-40 max-sm:fixed max-sm:left-4 max-sm:right-auto"
            >
              <For each={lang}>
                {(language) => (
                  <li class="flex">
                    <button
                      type="button"
                      class="p-0 gap-4 m-0 hover:font-bold whitespace-nowrap hover:bg-transparent"
                      onClick={() => {
                        updateLocale(language.code)
                        setLanguageOpen(false)
                      }}
                    >
                      <span class="flex justify-center w-6 items-center text-base-content">
                        <GetFlagImg locale={language.code} size={16} />
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
            class="btn btn-ghost hover:bg-transparent text-lg input-ghost text-base-content"
            aria-label={`${t('header.theme', 'Theme')}: ${t(currentThemeOption().labelKey, currentThemeOption().fallback)}`}
            title={`${t('header.theme', 'Theme')}: ${t(currentThemeOption().labelKey, currentThemeOption().fallback)}`}
            onClick={cycleTheme}
          >
            <i aria-hidden="true" class={`fa-solid ${currentThemeOption().icon}`} />
          </button>
        </div>

        <Show when={isLogged()}>
          <div class="flex-none max-sm:ml-auto">
            <div class="dropdown dropdown-end" data-header-menu="user" classList={{ 'dropdown-open': isOpen() }}>
              <button
                type="button"
                class="btn btn-ghost hover:bg-transparent input-ghost user-menu-trigger"
                aria-controls="user-navigation"
                aria-expanded={isOpen()}
                onClick={() => {
                  setIsOpen(!isOpen())
                  setLanguageOpen(false)
                }}
              >
                <div class="w-10 rounded-full overflow-hidden">
                  <img alt="Discord avatar" src={discordUser().displayAvatarURL || discordUser().avatarURL} />
                </div>
                <p class="text-[1.3em] text-secondary mx-2">
                  {discordUser().globalName || discordUser().displayName || discordUser().username}
                </p>
                <div class="flex justify-center items-center min-w-6 min-h-6">
                  <i aria-hidden="true" class={`fa-solid ${isOpen() ? 'fa-angle-up' : 'fa-angle-down'}`} />
                </div>
              </button>
              <ul
                id="user-navigation"
                hidden={!isOpen()}
                classList={{ hidden: !isOpen() }}
                tabIndex={-1}
                class="menu dropdown-content mt-3 z-1 p-4 gap-4 shadow-sm bg-base-200 rounded-md min-w-50"
              >
                <For each={navDropdownLinks()}>
                  {({ content }, index) => (
                    <>
                      <For each={content}>
                        {({ title, fontAwesomeIcon, href, condition, onPress }) => (
                          <Show when={!condition || condition()}>
                            <li class="flex">
                              <A
                                href={href}
                                class="p-0 m-0 hover:font-bold whitespace-nowrap hover:bg-transparent flex items-center gap-2"
                                onClick={(event) => {
                                  if (onPress) {
                                    event.preventDefault()
                                    onPress()
                                  }
                                  setIsOpen(false)
                                }}
                              >
                                <div class="flex justify-center items-center min-w-6 min-h-6">
                                  <i aria-hidden="true" class={fontAwesomeIcon} />
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
                      {index() < navDropdownLinks().length - 1 && <hr class="border border-[#6d6d6d]" />}
                    </>
                  )}
                </For>
              </ul>
            </div>
          </div>
        </Show>
        <Show when={!isLogged()}>
          <div class="flex-none pl-4">
            <A href="/login" class="btn btn-base-200">
              {t('header.login', 'Login with Discord')}
            </A>
          </div>
        </Show>
      </header>
      <hr class="border border-base-200" />
    </>
  )
}
