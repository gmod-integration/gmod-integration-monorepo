import { A, useLocation } from '@solidjs/router'
import { createEffect, createSignal, For, on, onCleanup, onMount, Show, type Component } from 'solid-js'
import { discordUser, isAdmin, isLogged } from '../../utils/event'
import logo from '../../assets/brand/logo.png'
import { useI18n, type Locale } from '../../i18n.js'
import { fetchAPI } from '../../utils/api'
import { notificationCount, updateNotificationCount } from '../../utils/notificationStore'
import { setThemeMode, type ThemeMode, themeMode } from '../../utils/theme'
import { authSession, authStatus } from '../../utils/authClient.js'
import {
  ButtonLink,
  DiscordAvatar,
  Icon,
  IconButtonLink,
  LanguageFlag,
  StatusBadge,
  type IconName,
} from '../ui/index.js'

type Language = {
  code: Locale
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
      title: t('main.add_bot', 'Invite the bot'),
      icon: 'bot',
      href: '/invite',
    },
    {
      title: t('main.support', 'Help and support'),
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
          title: t('auth.stop_impersonation', 'Return to your account'),
          icon: 'user-round-cog',
          condition: () => !!authSession()?.session.actorDiscordID,
          href: '/dashboard/admins/stop-impersonate',
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
            return isAdmin() && !authSession()?.session.actorDiscordID
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

  createEffect(
    on(
      () => isLogged() && discordUser().id,
      (id) => {
        if (!id) return
        fetchAPI('/users/:discordID/notifications/count', 'GET')
          .then(async (response) => {
            if (response.ok) updateNotificationCount((await response.json()).unreadCount || 0)
          })
          .catch((error) => console.error('Failed to load notification count:', error))
      },
    ),
  )

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
              title={lang.find((language) => language.code === locale())?.title}
              aria-controls="language-navigation"
              aria-expanded={languageOpen()}
              onClick={() => {
                setLanguageOpen(!languageOpen())
                setIsOpen(false)
                setPublicNavigationOpen(false)
              }}
            >
              <LanguageFlag locale={locale()} />
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
                      class="px-3 py-2.5 gap-3 m-0 whitespace-nowrap rounded-lg w-full"
                      aria-pressed={locale() === language.code}
                      onClick={() => {
                        updateLocale(language.code)
                        setLanguageOpen(false)
                        languageTrigger?.focus()
                      }}
                    >
                      <LanguageFlag locale={language.code} />
                      <span lang={language.code} class="flex-1 text-left">
                        {language.title}
                      </span>
                      <Show when={locale() === language.code}>
                        <Icon name="check" size={16} />
                      </Show>
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
          <Show when={isLogged()}>
            <IconButtonLink
              href="/notifications"
              size="md"
              class="header-control relative"
              label={`${t('main.notifications', 'Notifications')}${notificationCount() > 0 ? ` (${notificationCount().toLocaleString(locale())})` : ''}`}
              onClick={() => {
                setIsOpen(false)
                setLanguageOpen(false)
                setPublicNavigationOpen(false)
              }}
            >
              <Icon name="bell" size={19} />
              <Show when={notificationCount() > 0}>
                <StatusBadge tone="info" size="sm" class="absolute -top-1 -right-1" aria-hidden="true">
                  {notificationCount() > 9 ? '9+' : notificationCount()}
                </StatusBadge>
              </Show>
            </IconButtonLink>
          </Show>
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
                  <DiscordAvatar user={discordUser()} class="h-full w-full" />
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
        <Show when={!isLogged() && authStatus() !== 'checking'}>
          <div class="flex-none pl-4">
            <ButtonLink
              href="/login"
              variant="primary"
              size="sm"
              class="header-login"
              aria-label={t('header.login', 'Sign in with Discord')}
            >
              <Icon name="user-round" size={16} />
              <span class="header-login-copy">{t('header.login', 'Sign in with Discord')}</span>
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
