import { createSignal, createUniqueId, For, Show, type Component } from 'solid-js'
import { A, useLocation } from '@solidjs/router'
import { useI18n } from '../../../i18n.js'
import { Icon, type IconName } from '../../ui/index.js'
import { authSession } from '../../../utils/authClient.js'

export const AdminMenu: Component = () => {
  const { t } = useI18n()
  const location = useLocation()
  const navigationId = createUniqueId()
  const [onlyShowEmoji, setOnlyShowEmoji] = createSignal(
    (() => {
      try {
        return localStorage.getItem('admin-navigation-collapsed') === 'true'
      } catch {
        return false
      }
    })(),
  )
  const [mobileOpen, setMobileOpen] = createSignal(false)
  const [hoverExpand, setHoverExpand] = createSignal(false)
  const expanded = () => !onlyShowEmoji() || hoverExpand() || mobileOpen()
  const toggleCollapsed = () => {
    const next = !onlyShowEmoji()
    setOnlyShowEmoji(next)
    try {
      localStorage.setItem('admin-navigation-collapsed', String(next))
    } catch {
      // The menu still works when browser storage is unavailable.
    }
  }
  const links = (): { label: string; icon: IconName; url: string }[] => [
    {
      label: t('admin_v6.nav_overview', 'Overview'),
      icon: 'layout-dashboard',
      url: '/dashboard/admins/informations',
    },
    { label: t('main.guilds', 'Discord communities'), icon: 'server', url: '/dashboard/admins/guilds' },
    { label: t('admin_v6.nav_servers', 'Game servers'), icon: 'gamepad-2', url: '/dashboard/admins/servers' },
    { label: t('admin_v6.nav_users', 'User accounts'), icon: 'users', url: '/dashboard/admins/users' },
    { label: t('admin_v6.nav_premium', 'Premium access'), icon: 'crown', url: '/dashboard/admins/premium' },
    {
      label: t('dashboard.menu.admin.impersonate', 'Support access'),
      icon: 'user-round-cog',
      url: '/dashboard/admins/impersonate',
    },
  ]

  return (
    <aside
      class="dashboard-sidebar"
      data-collapsed={!expanded()}
      data-mobile-open={mobileOpen()}
      onMouseEnter={() => setHoverExpand(true)}
      onMouseLeave={() => setHoverExpand(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setMobileOpen(false)
      }}
    >
      <div class="dashboard-context">
        <span class="dashboard-context-icon">
          <Icon name="wrench" size={20} />
        </span>
        <Show when={expanded()}>
          <div class="min-w-0 flex-1">
            <span class="dashboard-context-label">Gmod Integration</span>
            <strong class="dashboard-context-name">{t('dashboard.menu.admin.title', 'Admin')}</strong>
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
      <nav id={navigationId} aria-label={t('dashboard.menu.admin.title', 'Admin')} class="dashboard-navigation">
        <div class="dashboard-nav-group">
          <Show when={expanded()}>
            <p class="dashboard-nav-group-title">{t('admin_v6.platform', 'Platform')}</p>
          </Show>
          <For
            each={
              authSession()?.session.actorDiscordID
                ? [
                    {
                      label: t('auth.stop_impersonation', 'Return to your account'),
                      icon: 'user-round-cog' as IconName,
                      url: '/dashboard/admins/stop-impersonate',
                    },
                  ]
                : links()
            }
          >
            {(link) => (
              <A
                href={link.url}
                class="dashboard-nav-item"
                classList={{ 'is-active': location.pathname === link.url }}
                aria-label={link.label}
                aria-current={location.pathname === link.url ? 'page' : undefined}
                title={onlyShowEmoji() ? link.label : undefined}
                onClick={() => setMobileOpen(false)}
              >
                <Icon name={link.icon} size={18} />
                <Show when={expanded()}>
                  <span class="dashboard-nav-label">{link.label}</span>
                </Show>
              </A>
            )}
          </For>
        </div>
      </nav>
      <div class="dashboard-sidebar-footer">
        <button
          type="button"
          class="dashboard-nav-collapse"
          aria-label={onlyShowEmoji() ? t('dashboard.menu.expand', 'Expand') : t('dashboard.menu.collapse', 'Collapse')}
          aria-controls={navigationId}
          aria-expanded={expanded()}
          onClick={toggleCollapsed}
        >
          <Icon name={onlyShowEmoji() ? 'panel-left-open' : 'panel-left-close'} size={18} />
          <Show when={expanded()}>
            <span>
              {onlyShowEmoji() ? t('dashboard.menu.expand', 'Expand') : t('dashboard.menu.collapse', 'Collapse')}
            </span>
          </Show>
        </button>
      </div>
    </aside>
  )
}
