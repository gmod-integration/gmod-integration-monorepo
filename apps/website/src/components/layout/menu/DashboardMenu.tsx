import { createMemo, createSignal, createUniqueId, For, Show, type Component } from 'solid-js'
import { A, useLocation } from '@solidjs/router'
import { isDev } from 'solid-js/web'
import { useI18n } from '../../../i18n.js'
import { getUrlWithActualParams } from '../../../utils/api.js'

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

export const DashboardMenu: Component = () => {
  const { t } = useI18n()
  const location = useLocation()
  const navigationId = createUniqueId()
  const [onlyShowEmoji, setOnlyShowEmoji] = createSignal(
    (() => {
      try {
        return localStorage.getItem('dashboard-navigation-collapsed') === 'true'
      } catch {
        return false
      }
    })(),
  )
  const toggleCollapsed = () => {
    const next = !onlyShowEmoji()
    setOnlyShowEmoji(next)
    try {
      localStorage.setItem('dashboard-navigation-collapsed', String(next))
    } catch {
      // Keep navigation usable when browser storage is unavailable.
    }
  }

  const linksData = (): DashboardMenuItem[] => [
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
          emoji: 'fa-ban',
          label: t('dashboard.menu.guilds.bans', 'Bans'),
          url: '/dashboard/guilds/:guildID/config/bans',
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
        },
        {
          emoji: 'fa-chart-simple',
          label: t('dashboard.menu.servers.status', 'Status'),
          url: '/dashboard/guilds/:guildID/config/servers/:serverID/status',
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
          emoji: 'fa-ticket',
          label: t('dashboard.menu.servers.tickets', 'Tickets'),
          url: '/dashboard/guilds/:guildID/config/servers/:serverID/tickets',
          badge: linkBadge.TODO,
        },
      ],
    },
  ]

  const category = createMemo(() => linksData().find((item) => item.condition(location.pathname))!)
  const items = createMemo(() =>
    category()
      .content.filter((item) => item.badge !== linkBadge.TODO || isDev)
      .map((item) => ({
        label: item.label,
        icon: item.emoji,
        href: getUrlWithActualParams(item.url),
        badge: item.badge ? t('main.badge_' + item.badge, item.badge) : undefined,
        disabled: item.badge === linkBadge.SOON && !isDev,
      })),
  )

  return (
    <>
      <aside class="flex flex-col p-4 gap-2" classList={{ 'min-w-[240px]': !onlyShowEmoji() }}>
        <nav
          id={navigationId}
          aria-label={category().name === 'Servers' ? t('main.servers', 'Servers') : t('main.guilds', 'Guilds')}
          class="contents"
        >
          <div class="flex flex-col">
            <A
              class="flex items-center p-2 gap-4 hover:font-bold"
              href={getUrlWithActualParams(category().back)}
              aria-label={t('dashboard.menu.back', 'Back')}
            >
              <div class="flex justify-center items-center min-w-6 min-h-6">
                <i aria-hidden="true" class="fa-solid fa-arrow-left" />
              </div>
              <Show when={!onlyShowEmoji()}>{t('dashboard.menu.back', 'Back')}</Show>
            </A>
          </div>
          <hr class="border border-base-200" />
          <For each={items()}>
            {(link) => (
              <A
                href={link.href}
                class="flex items-center gap-4 p-2 rounded-md"
                classList={{
                  'bg-base-200': location.pathname === link.href,
                  'text-base-content': Boolean(link.badge),
                  'hover:bg-base-200': location.pathname !== link.href,
                  'hover:cursor-not-allowed': link.disabled,
                }}
                aria-label={link.label}
                aria-current={location.pathname === link.href ? 'page' : undefined}
                aria-disabled={link.disabled || undefined}
                title={onlyShowEmoji() ? link.label : undefined}
                onClick={(event) => {
                  if (link.disabled) event.preventDefault()
                }}
              >
                <div class="flex justify-center items-center min-w-6 min-h-6">
                  <i aria-hidden="true" class={`fa-solid ${link.icon}`} />
                </div>
                <Show when={!onlyShowEmoji()}>
                  <span class="text-nowrap">{link.label}</span>
                  <Show when={link.badge}>
                    <div class="badge badge-outline">{link.badge}</div>
                  </Show>
                </Show>
              </A>
            )}
          </For>
        </nav>
        <div class="flex flex-col mt-auto">
          <hr class="border border-base-200 mb-4" />
          <button
            type="button"
            class="flex items-center p-2 gap-4 hover:font-bold rounded-md text-left"
            classList={{ 'hover:bg-base-200 hover:text-base-content/70': onlyShowEmoji() }}
            aria-label={
              onlyShowEmoji() ? t('dashboard.menu.expand', 'Expand') : t('dashboard.menu.collapse', 'Collapse')
            }
            aria-controls={navigationId}
            aria-expanded={!onlyShowEmoji()}
            onClick={toggleCollapsed}
          >
            <div class="flex justify-center items-center min-w-6 min-h-6">
              <i
                aria-hidden="true"
                class={`fa-solid ${onlyShowEmoji() ? 'fa-angle-double-right' : 'fa-angle-double-left'}`}
              />
            </div>
            <Show when={!onlyShowEmoji()}>
              <span>{t('dashboard.menu.collapse', 'Collapse')}</span>
            </Show>
          </button>
        </div>
      </aside>
      <div class="border border-base-200" />
    </>
  )
}
