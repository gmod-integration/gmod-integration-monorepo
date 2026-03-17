import { Component, createEffect, createSignal, For, Show } from 'solid-js'
import { A, useLocation } from '@solidjs/router'
import { makePersisted } from '@solid-primitives/storage'

import { useI18n } from '../../../i18n'
import { isDev } from 'solid-js/web'
import { getUrlWithActualParams } from '../../../utils/api'

export enum linkBadge {
  SOON = 'Soon',
  TODO = 'Todo',
  NEW = 'New',
  UPDATED = 'Updated',
}

type DashboardMenuLink = {
  emoji: string
  label: string
  url: string
  badge?: linkBadge
}

type DashboardMenuItem = {
  name: string
  condition: (url: string) => boolean
  back: string
  content: DashboardMenuLink[]
}

class navLink {
  emoji: string
  label: string
  url: string
  badge?: linkBadge
  current?: boolean

  constructor(emoji: string, label: string, url: string, current?: boolean, badge?: linkBadge) {
    this.emoji = emoji
    this.label = label
    this.url = url
    this.current = current
    this.badge = badge
  }
}

export const DashboardMenu: Component = () => {
  const [onlyShowEmoji, setOnlyShowEmoji] = makePersisted(createSignal(false))
  const [backUrl, setBackUrl] = createSignal('/dashboard/guilds')
  const [actualLinksData, setActualLinksData] = createSignal([] as navLink[])
  const { t } = useI18n()

  const linksData: DashboardMenuItem[] = [
    {
      name: 'Guilds',
      condition: (url: string) => !url.includes('/servers/'),
      back: '/dashboard/guilds',
      content: [
        {
          emoji: 'fa-info',
          label: t('dashboard.menu.guilds.informations', 'Informations'),
          url: '/dashboard/guilds/:guildID/config',
        },
        {
          label: t('dashboard.menu.guilds.custom_bot', 'Custom Bot'),
          emoji: 'fa-robot',
          url: '/dashboard/guilds/:guildID/config/bot',
        },
        {
          emoji: 'fa-link',
          label: t('dashboard.menu.guilds.links', 'Links'),
          url: '/dashboard/guilds/:guildID/config/links',
        },
        {
          emoji: 'fa-shield-halved',
          label: t('dashboard.menu.guilds.verification', 'Verification'),
          url: '/dashboard/guilds/:guildID/config/verification',
        },
        {
          emoji: 'fa-solid fa-wand-magic-sparkles',
          label: t('dashboard.menu.guilds.auto_role', 'Auto-Role'),
          url: '/dashboard/guilds/:guildID/config/auto-role',
        },
        {
          emoji: 'fa-lightbulb',
          label: t('dashboard.menu.guilds.suggestions', 'Suggestions'),
          url: '/dashboard/guilds/:guildID/config/suggestions',
          badge: linkBadge.TODO,
        },
        {
          emoji: 'fa-ticket',
          label: t('dashboard.menu.guilds.tickets', 'Tickets'),
          url: '/dashboard/guilds/:guildID/config/tickets',
          badge: linkBadge.TODO,
        },
        {
          emoji: 'fa-server',
          label: t('dashboard.menu.guilds.servers', 'Servers'),
          url: '/dashboard/guilds/:guildID/config/servers',
        },
      ],
    },
    {
      name: 'Servers',
      condition: (url: string) => url.includes('/servers/'),
      back: '/dashboard/guilds/:guildID/config/servers',
      content: [
        {
          emoji: 'fa-info',
          label: t('dashboard.menu.servers.informations', 'Informations'),
          url: '/dashboard/guilds/:guildID/config/servers/:serverID',
        },
        {
          emoji: 'fa-cog',
          label: t('dashboard.menu.servers.config', 'Configuration'),
          url: '/dashboard/guilds/:guildID/config/servers/:serverID/config',
          badge: linkBadge.NEW,
        },
        {
          emoji: 'fa-chart-simple',
          label: t('dashboard.menu.servers.status', 'Status'),
          url: '/dashboard/guilds/:guildID/config/servers/:serverID/status',
          badge: linkBadge.UPDATED,
        },
        {
          emoji: 'fa-address-book',
          label: t('dashboard.menu.servers.roles', 'Roles'),
          url: '/dashboard/guilds/:guildID/config/servers/:serverID/roles',
        },
        {
          emoji: 'fa-person-rifle',
          label: t('dashboard.menu.servers.teams', 'Teams'),
          url: '/dashboard/guilds/:guildID/config/servers/:serverID/teams',
        },
        {
          emoji: 'fa-comments',
          label: t('dashboard.menu.servers.chats', 'Chats'),
          url: '/dashboard/guilds/:guildID/config/servers/:serverID/chats',
        },
        {
          emoji: 'fa-id-card',
          label: t('dashboard.menu.servers.pseudo', 'Pseudo'),
          url: '/dashboard/guilds/:guildID/config/servers/:serverID/pseudo',
        },
        {
          emoji: 'fa-gift',
          label: t('dashboard.menu.servers.rewards', 'Rewards'),
          url: '/dashboard/guilds/:guildID/config/servers/:serverID/rewards',
          badge: linkBadge.SOON,
        },
        {
          emoji: 'fa-users',
          label: t('dashboard.menu.servers.players', 'Players'),
          url: '/dashboard/guilds/:guildID/config/servers/:serverID/players',
        },
        {
          emoji: 'fa-exclamation-triangle',
          label: t('dashboard.menu.servers.warns', 'Warns'),
          url: '/dashboard/guilds/:guildID/config/servers/:serverID/warns',
        },
        {
          emoji: 'fa-eye',
          label: t('dashboard.menu.servers.logs', 'Logs'),
          url: '/dashboard/guilds/:guildID/config/servers/:serverID/logs',
        },
        {
          emoji: 'fa-explosion',
          label: t('dashboard.menu.servers.errors', 'Errors'),
          url: '/dashboard/guilds/:guildID/config/servers/:serverID/errors',
        },
        {
          emoji: 'fa-truck-arrow-right',
          label: t('dashboard.menu.servers.forwards', 'Forwards'),
          url: '/dashboard/guilds/:guildID/config/servers/:serverID/forwards',
          badge: linkBadge.TODO,
        },
        {
          emoji: 'fa-bug',
          label: t('dashboard.menu.servers.bugs_report', 'Bugs Report'),
          url: '/dashboard/guilds/:guildID/config/servers/:serverID/bugs',
        },
        {
          emoji: 'fa-camera',
          label: t('dashboard.menu.servers.screenshots', 'Screenshots'),
          url: '/dashboard/guilds/:guildID/config/servers/:serverID/screenshots',
        },
        {
          emoji: 'fa-vote-yea',
          label: t('dashboard.menu.servers.vote', 'Vote'),
          url: '/dashboard/guilds/:guildID/config/servers/:serverID/votes',
        },
        {
          emoji: 'fa-video',
          label: t('dashboard.menu.servers.streams', 'Streams'),
          url: '/dashboard/guilds/:guildID/config/servers/:serverID/streams',
          badge: linkBadge.TODO,
        },
        {
          emoji: 'fa-ban',
          label: t('dashboard.menu.servers.bans', 'Bans'),
          url: '/dashboard/guilds/:guildID/config/servers/:serverID/bans',
          badge: linkBadge.SOON,
        },
        {
          emoji: 'fa-ticket',
          label: t('dashboard.menu.servers.tickets', 'Tickets'),
          url: '/dashboard/guilds/:guildID/config/servers/:serverID/tickets',
          badge: linkBadge.TODO,
        },
      ],
    },
  ]

  function refreshLinks(pathname: string) {
    linksData.forEach((category) => {
      if (category.condition(pathname)) {
        setBackUrl(category.back)
        setActualLinksData(
          category.content.map(
            (link) =>
              new navLink(link.emoji, link.label, link.url, getUrlWithActualParams(link.url) === pathname, link.badge),
          ),
        )
      }
    })
  }

  const location = useLocation()
  createEffect(() => {
    refreshLinks(location.pathname)
  }, [location.pathname])

  return (
    <>
      <div
        class="flex flex-col p-4 gap-2"
        classList={{
          'min-w-[240px]': !onlyShowEmoji(),
        }}
      >
        <div class="flex flex-col">
          <A class="flex items-center p-2 gap-4 hover:font-bold" href={getUrlWithActualParams(backUrl())}>
            <div class="flex justify-center items-center min-w-6 min-h-6">
              <i class="fa-solid fa-arrow-left"></i>
            </div>
            <Show when={!onlyShowEmoji()}>{t('dashboard.menu.back', 'Back')}</Show>
          </A>
        </div>

        <hr class="border border-base-200" />

        <For each={actualLinksData()}>
          {(link) => (
            <Show when={!link.badge || link.badge !== linkBadge.TODO || isDev}>
              <A
                href={getUrlWithActualParams(link.url)}
                class="flex items-center gap-4 p-2 rounded-md"
                classList={{
                  'bg-base-200': link.current,
                  'text-base-content': link.badge && (link.badge === linkBadge.SOON || link.badge === linkBadge.TODO),
                  'hover:bg-base-200': !link.current,
                  'hover:cursor-not-allowed': link.badge && link.badge === linkBadge.SOON && !isDev,
                }}
                onClick={(e) => {
                  if (link.badge && link.badge === linkBadge.SOON && !isDev) {
                    e.preventDefault()
                  }
                }}
              >
                <div class="flex justify-center items-center min-w-6 min-h-6">
                  <i class={`fa-solid ${link.emoji}`}></i>
                </div>
                <span
                  class="text-nowrap"
                  classList={{
                    visible: !onlyShowEmoji(),
                    hidden: onlyShowEmoji(),
                  }}
                >
                  {link.label}
                </span>
                <Show when={link.badge}>
                  <div
                    class="badge badge-outline"
                    classList={{
                      visible: !onlyShowEmoji(),
                      hidden: onlyShowEmoji(),
                    }}
                  >
                    {t('main.badge_' + link.badge, link.badge)}
                  </div>
                </Show>
              </A>
            </Show>
          )}
        </For>

        <div class="flex flex-col mt-auto hover:cursor-pointer" onClick={() => setOnlyShowEmoji(!onlyShowEmoji())}>
          <hr class="border border-base-200 mb-4" />
          <div
            class="flex items-center p-2 gap-4 hover:font-bold rounded-md"
            classList={{
              'hover:bg-base-200 hover:text-base-content/70': onlyShowEmoji(),
            }}
          >
            <div class="flex justify-center items-center min-w-6 min-h-6">
              <i
                class="fa-solid"
                classList={{
                  'fa-angle-double-right': onlyShowEmoji(),
                  'fa-angle-double-left': !onlyShowEmoji(),
                }}
              ></i>
            </div>
            {!onlyShowEmoji() ? <span>{t('dashboard.menu.collapse', 'Collapse')}</span> : ''}
          </div>
        </div>
      </div>
      <div class="border border-base-200" />
    </>
  )
}
