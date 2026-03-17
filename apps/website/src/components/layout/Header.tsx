import { A } from '@solidjs/router'
import { Component, createResource, createSignal, For, onMount, ParentProps, Show } from 'solid-js'
import { discordUser, isAdmin, isLogged, setDiscordUser, setIsAdmin, setIsLogged } from '../../utils/event'
import logo from '../../assets/brand/logo.png'
import { useI18n } from '../../i18n'
import { createStore } from 'solid-js/store'
import { convertSecToTime } from '../../utils/convertSecToTime'
import { initWebSocket } from '../../utils/websocket'
import { API_FQDN, fetchAPI } from '../../utils/api'
import { notificationCount, updateNotificationCount } from '../../utils/notificationStore'

interface GetFlagImgProps extends ParentProps {
  locale: string
  size?: number
}

const GetFlagImg: Component<GetFlagImgProps> = (props) => {
  const size = props.size || 16
  let flag = props.locale.toLowerCase()
  if (flag === 'en') {
    flag = 'gb' // Use GB for English flag
  }
  return (
    <img
      src={`https://flagcdn.com/${size}x${Math.round(size * 0.75)}/${flag}.png`}
      srcSet={`https://flagcdn.com/${size * 2}x${Math.round(size * 1.5)}/${flag}.png 2x, https://flagcdn.com/${size * 3}x${Math.round(size * 2.25)}/${flag}.png 3x`}
      width={size}
      height={Math.round(size * 0.75)}
      alt={flag}
    >
      {props.children}
    </img>
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

export const Header: Component = () => {
  const [isOpen, setIsOpen] = createSignal(false)
  const { t, locale, updateLocale } = useI18n()

  type NavLink = {
    title: string
    fontAwesomeIcon: string
    href: string
    color?: string
    hoverColor?: string
  }

  const [navLinks] = createStore<NavLink[]>([
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
  ])

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

  const [navDropdownLinks] = createStore<DropdownLink[]>([
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
            const oldExpirationDate = localStorage.getItem('oldExpirationDate') || ''
            // 1 clear all cookies
            localStorage.clear()
            sessionStorage.clear()
            // set accessTokens & oldAccessToken
            localStorage.setItem('accessToken', oldToken)
            localStorage.setItem('discordID', oldDiscordID)
            localStorage.setItem('expirationDate', oldExpirationDate)
            // redirect to home
            window.location.href = `/login/?discordID=${oldDiscordID}&accessToken=${oldToken}&expirationDate=${new Date(
              oldExpirationDate,
            ).getTime()}`
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
  ])

  onMount(() => {
    const handleClickOutside = (event: { target: any }) => {
      if (isOpen() && !event.target.closest('.dropdown')) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
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

    const expirationDateParsed = new Date(expirationDate)
    if (expirationDateParsed <= new Date()) {
      setIsLogged(false)
      console.log('The token has expired')
      return
    }

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

    const discordUser = JSON.parse(localStorage.getItem('discordUser')!)
    if (!discordUser) {
      setIsLogged(false)
      console.log('Failed to get the user data from the local storage')
      return
    }

    if (discordUser && discordUser.error) {
      localStorage.removeItem('discordUser')
      setIsLogged(false)
      console.log('The user data is invalid')
      return
    }

    setDiscordUser(discordUser)
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

    fetch(`${API_FQDN}/users?discordID=${discordUser.id}`, {
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
        if (userInfo.rank && userInfo.rank === 'developer') {
          setIsAdmin(true)
        }
      })
  })

  const [userNotifications, { refetch: refetchUserNotifications }] = createResource('userNotifications', async () => {
    return await fetchAPI('/users/:discordID/notifications/count', 'GET')
      .then((res) => {
        if (!res.ok) {
          return 0
        } else {
          return res.json()
        }
      })
      .then((json) => {
        const unreadCount = json.unreadCount || 0
        // Update the global store
        updateNotificationCount(unreadCount)
        return unreadCount > 9 ? '9+' : unreadCount
      })
  })

  const [timeLeft, setTimeLeft] = createSignal('00d 00h 00m 00s')
  onMount(() => {
    const interval = setInterval(() => {
      const now = new Date()
      const end = new Date('2024-09-22T23:59:59')
      let distance = end.getTime() - now.getTime()
      distance = Math.round(distance / 1000)
      setTimeLeft(convertSecToTime(distance, true, ['d', 'h', 'm', 's']))
    }, 1000)
    return () => clearInterval(interval)
  })

  return (
    <>
      <div class="navbar bg-base-100 max-w-(--breakpoint-2xl) mx-auto p-4">
        <div class="flex flex-1 items-center">
          <img src={logo} alt="logo" width="60" height="60" />
          <A href="/" class="text-2xl font-bold ml-4 text-base-content whitespace-nowrap">
            Gmod Integration
          </A>

          <For each={navLinks}>
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
                <i class={fontAwesomeIcon + ' mr-1'}></i> {title}
              </A>
            )}
          </For>
        </div>

        <div class="flex">
          <div class="dropdown dropdown-end">
            <div tabIndex="0" role="button" class="btn btn-ghost hover:bg-transparent text-lg input-ghost">
              <span class="text-base-content">
                <GetFlagImg locale={locale()} size={20} />
              </span>
              <div class="flex justify-center items-center min-w-6 min-h-6">
                <i class="fa-solid fa-angle-down"></i>
              </div>
            </div>
            <ul class="menu dropdown-content mt-3 z-1 p-4 gap-4 shadow-sm bg-base-200 rounded-md w-40">
              <For each={lang}>
                {(lang) => (
                  <li class="flex">
                    <button
                      class="p-0 gap-4 m-0 hover:font-bold  whitespace-nowrap hover:bg-transparent"
                      onClick={() => {
                        updateLocale(lang.code)
                        window.location.reload()
                      }}
                    >
                      <span class="flex justify-center w-6 items-center text-base-content">
                        <GetFlagImg locale={lang.code} size={16} />
                      </span>
                      {lang.title}
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </div>

          <label class="swap swap-rotate">
            <input type="checkbox" class="theme-controller" value="light" />

            <svg class="swap-off h-6 w-6 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <path d="M5.64,17l-.71.71a1,1,0,0,0,0,1.41,1,1,0,0,0,1.41,0l.71-.71A1,1,0,0,0,5.64,17ZM5,12a1,1,0,0,0-1-1H3a1,1,0,0,0,0,2H4A1,1,0,0,0,5,12Zm7-7a1,1,0,0,0,1-1V3a1,1,0,0,0-2,0V4A1,1,0,0,0,12,5ZM5.64,7.05a1,1,0,0,0,.7.29,1,1,0,0,0,.71-.29,1,1,0,0,0,0-1.41l-.71-.71A1,1,0,0,0,4.93,6.34Zm12,.29a1,1,0,0,0,.7-.29l.71-.71a1,1,0,1,0-1.41-1.41L17,5.64a1,1,0,0,0,0,1.41A1,1,0,0,0,17.66,7.34ZM21,11H20a1,1,0,0,0,0,2h1a1,1,0,0,0,0-2Zm-9,8a1,1,0,0,0-1,1v1a1,1,0,0,0,2,0V20A1,1,0,0,0,12,19ZM18.36,17A1,1,0,0,0,17,18.36l.71.71a1,1,0,0,0,1.41,0,1,1,0,0,0,0-1.41ZM12,6.5A5.5,5.5,0,1,0,17.5,12,5.51,5.51,0,0,0,12,6.5Zm0,9A3.5,3.5,0,1,1,15.5,12,3.5,3.5,0,0,1,12,15.5Z" />
            </svg>

            <svg class="swap-on h-6 w-6 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <path d="M21.64,13a1,1,0,0,0-1.05-.14,8.05,8.05,0,0,1-3.37.73A8.15,8.15,0,0,1,9.08,5.49a8.59,8.59,0,0,1,.25-2A1,1,0,0,0,8,2.36,10.14,10.14,0,1,0,22,14.05,1,1,0,0,0,21.64,13Zm-9.5,6.69A8.14,8.14,0,0,1,7.08,5.22v.27A10.15,10.15,0,0,0,17.22,15.63a9.79,9.79,0,0,0,2.1-.22A8.11,8.11,0,0,1,12.14,19.73Z" />
            </svg>
          </label>
        </div>

        <Show when={isLogged()}>
          <div class="flex-none">
            <div class="dropdown dropdown-end">
              <div
                tabIndex="0"
                role="button"
                class="btn btn-ghost hover:bg-transparent input-ghost"
                onClick={() => setIsOpen(true)}
              >
                <div class="w-10 rounded-full overflow-hidden">
                  <img alt="Tailwind CSS Navbar component" src={discordUser().displayAvatarURL} />
                </div>
                <p class="text-[1.3em] text-secondary mx-2">{discordUser().globalName}</p>
                <div class="flex justify-center items-center min-w-6 min-h-6">
                  <i class={`fa-solid ${isOpen() ? 'fa-angle-up' : 'fa-angle-down'}`}></i>
                </div>
              </div>
              <ul
                tabIndex="0"
                class="menu dropdown-content mt-3 z-1 p-4 gap-4 shadow-sm bg-base-200 rounded-md min-w-50"
              >
                <For each={navDropdownLinks}>
                  {({ title, content }, index) => (
                    <>
                      <For each={content}>
                        {({ title, fontAwesomeIcon, href, condition, onPress }) => (
                          <>
                            <Show when={!condition || condition()}>
                              <li class="flex">
                                <A
                                  href={href}
                                  class="p-0 m-0 hover:font-bold whitespace-nowrap hover:bg-transparent flex items-center gap-2"
                                  onClick={(e) => {
                                    if (onPress) {
                                      e.preventDefault()
                                      onPress()
                                    }
                                  }}
                                >
                                  <div class="flex justify-center items-center min-w-6 min-h-6">
                                    <i class={fontAwesomeIcon}></i>
                                  </div>
                                  {title}
                                  <Show when={title === 'Notifications' && notificationCount() > 0}>
                                    <span class="badge badge-warning ml-2">
                                      {notificationCount() > 9 ? '9+' : notificationCount()}
                                    </span>
                                  </Show>
                                </A>
                              </li>
                            </Show>
                          </>
                        )}
                      </For>
                      {index() < navDropdownLinks.length - 1 && <hr class="border border-[#6d6d6d]" />}
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
      </div>

      <hr class="border border-base-200" />
      <Show when={new Date() < new Date('2024-09-22T23:59:59')}>
        <A class="bg-sky-700 text-center p-2 hover:cursor-pointer" href={'/gmodstore'}>
          <span class="text-lg">
            {`🎉 I just turned 20! 🎉 And to celebrate, I'm offering a 15% discount on the GmodStore Premium plan for the next ${timeLeft()}!`}
          </span>
        </A>
        <hr class="border border-base-200" />
      </Show>
    </>
  )
}
