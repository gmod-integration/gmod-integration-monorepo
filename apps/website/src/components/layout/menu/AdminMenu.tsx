import { createSignal, createUniqueId, For, Show, type Component } from 'solid-js'
import { A, useLocation } from '@solidjs/router'
import { useI18n } from '../../../i18n.js'
import { Icon, type IconName } from '../../ui/index.js'

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
      label: t('dashboard.menu.admin.information', 'Information'),
      icon: 'info',
      url: '/dashboard/admins/informations',
    },
    { label: t('main.guilds', 'Discord communities'), icon: 'server', url: '/dashboard/admins/guilds' },
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
            <p class="dashboard-nav-group-title">{t('dashboard.ui.overview', 'Overview')}</p>
          </Show>
          <For each={links()}>
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
