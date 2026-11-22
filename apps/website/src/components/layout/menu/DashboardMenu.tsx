import { createMemo, createSignal, createUniqueId, For, Show, type Component } from 'solid-js'
import { A, useLocation } from '@solidjs/router'
import { isDev } from 'solid-js/web'
import { useI18n } from '../../../i18n.js'
import { getUrlWithActualParams } from '../../../utils/api.js'
import { getGuild, getServer } from '../../../utils/utils.js'
import { Icon, type IconName } from '../../ui/index.js'

export enum linkBadge {
  SOON = 'Soon',
  TODO = 'Todo',
  NEW = 'New',
  UPDATED = 'Updated',
}

type DashboardMenuLink = {
  icon: IconName
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
  const [mobileOpen, setMobileOpen] = createSignal(false)
  const showLabels = () => !onlyShowEmoji() || mobileOpen()
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
          icon: 'info',
          label: t('dashboard.menu.guilds.informations', 'Community settings'),
          url: '/dashboard/guilds/:guildID/config',
        },
        {
          label: t('dashboard.menu.guilds.custom_bot', 'Custom Bot'),
          icon: 'bot',
          url: '/dashboard/guilds/:guildID/config/bot',
        },
        {
          icon: 'link',
          label: t('dashboard.menu.guilds.links', 'Links'),
          url: '/dashboard/guilds/:guildID/config/links',
        },
        {
          icon: 'shield-check',
          label: t('dashboard.menu.guilds.verification', 'Account verification'),
          url: '/dashboard/guilds/:guildID/config/verification',
        },
        {
          icon: 'ban',
          label: t('dashboard.menu.guilds.bans', 'Ban lists'),
          url: '/dashboard/guilds/:guildID/config/bans',
        },
        {
          icon: 'wand-sparkles',
          label: t('dashboard.menu.guilds.auto_role', 'Automatic roles'),
          url: '/dashboard/guilds/:guildID/config/auto-role',
        },
        {
          icon: 'lightbulb',
          label: t('dashboard.menu.guilds.suggestions', 'Suggestions'),
          url: '/dashboard/guilds/:guildID/config/suggestions',
          badge: linkBadge.TODO,
        },
        {
          icon: 'ticket',
          label: t('dashboard.menu.guilds.tickets', 'Tickets'),
          url: '/dashboard/guilds/:guildID/config/tickets',
          badge: linkBadge.TODO,
        },
        {
          icon: 'server',
          label: t('dashboard.menu.guilds.servers', 'Game servers'),
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
          icon: 'info',
          label: t('dashboard.menu.servers.informations', 'Server and connection'),
          url: '/dashboard/guilds/:guildID/config/servers/:serverID',
        },
        {
          icon: 'settings',
          label: t('dashboard.menu.servers.config', 'Configuration'),
          url: '/dashboard/guilds/:guildID/config/servers/:serverID/config',
        },
        {
          icon: 'activity',
          label: t('dashboard.menu.servers.status', 'Status'),
          url: '/dashboard/guilds/:guildID/config/servers/:serverID/status',
        },
        {
          icon: 'contact',
          label: t('dashboard.menu.servers.roles', 'Role synchronization'),
          url: '/dashboard/guilds/:guildID/config/servers/:serverID/roles',
        },
        {
          icon: 'users',
          label: t('dashboard.menu.servers.teams', 'Team roles'),
          url: '/dashboard/guilds/:guildID/config/servers/:serverID/teams',
        },
        {
          icon: 'messages-square',
          label: t('dashboard.menu.servers.chats', 'Chat relay'),
          url: '/dashboard/guilds/:guildID/config/servers/:serverID/chats',
        },
        {
          icon: 'id-card',
          label: t('dashboard.menu.servers.pseudo', 'Nickname synchronization'),
          url: '/dashboard/guilds/:guildID/config/servers/:serverID/pseudo',
        },
        {
          icon: 'gift',
          label: t('dashboard.menu.servers.rewards', 'Rewards'),
          url: '/dashboard/guilds/:guildID/config/servers/:serverID/rewards',
          badge: linkBadge.SOON,
        },
        {
          icon: 'users',
          label: t('dashboard.menu.servers.players', 'Players'),
          url: '/dashboard/guilds/:guildID/config/servers/:serverID/players',
        },
        {
          icon: 'triangle-alert',
          label: t('dashboard.menu.servers.warns', 'Warns'),
          url: '/dashboard/guilds/:guildID/config/servers/:serverID/warns',
        },
        {
          icon: 'scroll-text',
          label: t('dashboard.menu.servers.logs', 'Logs'),
          url: '/dashboard/guilds/:guildID/config/servers/:serverID/logs',
        },
        {
          icon: 'circle-alert',
          label: t('dashboard.menu.servers.errors', 'Lua errors'),
          url: '/dashboard/guilds/:guildID/config/servers/:serverID/errors',
        },
        {
          icon: 'forward',
          label: t('dashboard.menu.servers.forwards', 'Forwards'),
          url: '/dashboard/guilds/:guildID/config/servers/:serverID/forwards',
          badge: linkBadge.TODO,
        },
        {
          icon: 'bug',
          label: t('dashboard.menu.servers.bugs_report', 'Player bug reports'),
          url: '/dashboard/guilds/:guildID/config/servers/:serverID/bugs',
        },
        {
          icon: 'camera',
          label: t('dashboard.menu.servers.screenshots', 'Screenshots'),
          url: '/dashboard/guilds/:guildID/config/servers/:serverID/screenshots',
        },
        {
          icon: 'vote',
          label: t('dashboard.menu.servers.vote', 'Vote'),
          url: '/dashboard/guilds/:guildID/config/servers/:serverID/votes',
        },
        {
          icon: 'video',
          label: t('dashboard.menu.servers.streams', 'Streams'),
          url: '/dashboard/guilds/:guildID/config/servers/:serverID/streams',
          badge: linkBadge.TODO,
        },
        {
          icon: 'ticket',
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
        icon: item.icon,
        href: getUrlWithActualParams(item.url),
        badge: item.badge ? t('main.badge_' + item.badge, item.badge) : undefined,
        disabled: item.badge === linkBadge.SOON && !isDev,
      })),
  )

  const groups = () => [
    { id: 'overview', label: t('dashboard.ui.overview', 'Overview') },
    { id: 'configuration', label: t('dashboard.ui.configuration', 'Configuration') },
    { id: 'activity', label: t('dashboard.ui.activity', 'Activity') },
  ]
  const groupFor = (href: string) => {
    const path = href.split('/').at(-1)
    if (href === items()[0]?.href || path === 'servers') return 'overview'
    if (
      [
        'players',
        'warns',
        'logs',
        'errors',
        'bugs',
        'screenshots',
        'votes',
        'streams',
        'tickets',
        'bans',
        'suggestions',
        'forwards',
      ].includes(path || '')
    )
      return 'activity'
    return 'configuration'
  }
  const contextName = () => {
    return category().name === 'Servers'
      ? getServer().name || t('main.servers', 'Servers')
      : getGuild().name || t('main.guilds', 'Discord communities')
  }

  return (
    <aside class="dashboard-sidebar" data-collapsed={onlyShowEmoji()} data-mobile-open={mobileOpen()}>
      <div class="dashboard-context">
        <span class="dashboard-context-icon">
          <Icon name={category().name === 'Servers' ? 'server' : 'layout-dashboard'} size={20} />
        </span>
        <Show when={showLabels()}>
          <div class="min-w-0 flex-1">
            <span class="dashboard-context-label">{t('dashboard.ui.workspace', 'Workspace')}</span>
            <strong class="dashboard-context-name">{contextName()}</strong>
          </div>
        </Show>
        <button
          type="button"
          class="dashboard-mobile-toggle"
          aria-label={t('ui.toggle_navigation', 'Toggle navigation')}
          aria-controls={navigationId}
          aria-expanded={mobileOpen()}
          onClick={() => setMobileOpen(!mobileOpen())}
        >
          <Icon name={mobileOpen() ? 'x' : 'menu'} size={20} />
        </button>
      </div>
      <nav
        id={navigationId}
        aria-label={
          category().name === 'Servers' ? t('main.servers', 'Servers') : t('main.guilds', 'Discord communities')
        }
        class="dashboard-navigation"
      >
        <A
          class="dashboard-nav-back"
          href={getUrlWithActualParams(category().back)}
          aria-label={t('dashboard.menu.back', 'Back')}
          title={onlyShowEmoji() ? t('dashboard.menu.back', 'Back') : undefined}
        >
          <Icon name="arrow-left" size={17} />
          <Show when={showLabels()}>
            <span>{t('dashboard.menu.back', 'Back')}</span>
          </Show>
        </A>
        <For each={groups()}>
          {(group) => (
            <div class="dashboard-nav-group">
              <Show when={showLabels()}>
                <p class="dashboard-nav-group-title">{group.label}</p>
              </Show>
              <For each={items().filter((item) => groupFor(item.href) === group.id)}>
                {(link) => (
                  <A
                    href={link.href}
                    class="dashboard-nav-item"
                    classList={{ 'is-active': location.pathname === link.href, 'is-disabled': link.disabled }}
                    aria-label={link.label}
                    aria-current={location.pathname === link.href ? 'page' : undefined}
                    aria-disabled={link.disabled || undefined}
                    title={onlyShowEmoji() ? link.label : undefined}
                    onClick={(event) => {
                      if (link.disabled) event.preventDefault()
                      else setMobileOpen(false)
                    }}
                  >
                    <Icon name={link.icon} size={18} />
                    <Show when={showLabels()}>
                      <span class="dashboard-nav-label">{link.label}</span>
                      <Show when={link.badge}>
                        <span class="dashboard-nav-badge">{link.badge}</span>
                      </Show>
                    </Show>
                  </A>
                )}
              </For>
            </div>
          )}
        </For>
      </nav>
      <div class="dashboard-sidebar-footer">
        <button
          type="button"
          class="dashboard-nav-collapse"
          aria-label={onlyShowEmoji() ? t('dashboard.menu.expand', 'Expand') : t('dashboard.menu.collapse', 'Collapse')}
          aria-controls={navigationId}
          aria-expanded={!onlyShowEmoji()}
          onClick={toggleCollapsed}
        >
          <Icon name={onlyShowEmoji() ? 'panel-left-open' : 'panel-left-close'} size={18} />
          <Show when={showLabels()}>
            <span>
              {onlyShowEmoji() ? t('dashboard.menu.expand', 'Expand') : t('dashboard.menu.collapse', 'Collapse')}
            </span>
          </Show>
        </button>
      </div>
    </aside>
  )
}
