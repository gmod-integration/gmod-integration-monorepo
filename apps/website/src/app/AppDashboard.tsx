import { Button, Icon } from '../components/ui/index.js'
import { createMemo, ErrorBoundary, on, Show, type Component, type ParentComponent } from 'solid-js'
import { A, useLocation } from '@solidjs/router'
import { getGuild, getServer } from '../utils/utils.js'
import DashboardMiddleware from '../middleware/DashboardMiddleware.js'
import { DashboardMenu } from '../components/layout/menu/DashboardMenu.js'
import { AddErrorComponent, ShowErrorList } from '../components/layout/Errors.js'
import { useI18n } from '../i18n.js'

/** The same page hierarchy and context is used by community, server and admin routes. */
export const DashboardPageHeader: Component<{ admin?: boolean }> = (props) => {
  const { t } = useI18n()
  const location = useLocation()
  const serverRoute = () => /\/servers\/[^/]+(?:\/([^/]+))?/.exec(location.pathname)
  const guild = createMemo(
    on(
      () => location.pathname,
      () => getGuild(),
    ),
  )
  const server = createMemo(
    on(
      () => location.pathname,
      () => getServer(),
    ),
  )
  const title = () => {
    if (props.admin) {
      const section = location.pathname.split('/').at(-1)
      if (section === 'guilds') return t('main.guilds', 'Discord communities')
      if (section === 'servers') return t('admin_v6.nav_servers', 'Game servers')
      if (section === 'users') return t('admin_v6.nav_users', 'User accounts')
      if (section === 'premium') return t('admin_v6.nav_premium', 'Premium access')
      if (section === 'impersonate' || section === 'stop-impersonate')
        return t('dashboard.menu.admin.impersonate', 'Support access')
      return t('admin_v6.nav_overview', 'Overview')
    }
    const route = serverRoute()
    if (route) {
      const section = route[1] || 'informations'
      const labels: Record<string, [string, string]> = {
        informations: ['informations', 'Informations'],
        config: ['config', 'Configuration'],
        status: ['status', 'Status'],
        roles: ['roles', 'Roles'],
        teams: ['teams', 'Teams'],
        chats: ['chats', 'Chats'],
        pseudo: ['pseudo', 'Pseudo'],
        players: ['players', 'Players'],
        warns: ['warns', 'Warns'],
        logs: ['logs', 'Logs'],
        errors: ['errors', 'Errors'],
        bugs: ['bugs_report', 'Bugs Report'],
        screenshots: ['screenshots', 'Screenshots'],
        votes: ['vote', 'Vote'],
      }
      const [key, fallback] = labels[section] || ['informations', 'Informations']
      return t(`dashboard.menu.servers.${key}`, fallback)
    }
    const section = /\/config(?:\/([^/]+))?/.exec(location.pathname)?.[1] || 'informations'
    const labels: Record<string, [string, string]> = {
      informations: ['informations', 'Informations'],
      bot: ['custom_bot', 'Custom Bot'],
      links: ['links', 'Links'],
      verification: ['verification', 'Verification'],
      bans: ['bans', 'Bans'],
      'auto-role': ['auto_role', 'Auto-Role'],
      servers: ['servers', 'Servers'],
    }
    const [key, fallback] = labels[section] || ['informations', 'Informations']
    return t(`dashboard.menu.guilds.${key}`, fallback)
  }
  return (
    <header class="dashboard-topbar">
      <nav class="dashboard-breadcrumbs" aria-label={t('dashboard.ui.breadcrumb', 'Breadcrumb')}>
        <A href={props.admin ? '/dashboard/admins/informations' : '/dashboard/guilds'}>
          <Icon name="layout-dashboard" size={14} />
          <span>{props.admin ? t('dashboard.menu.admin.title', 'Admin') : t('main.dashboard', 'Dashboard')}</span>
        </A>
        <Icon name="chevron-right" size={13} />
        <Show when={!props.admin}>
          <A href={location.pathname.split('/config')[0] + '/config'}>
            {guild().name || t('dashboard.ui.community', 'Community')}
          </A>
          <Icon name="chevron-right" size={13} />
          <Show when={serverRoute()}>
            <span class="truncate">{server().name || t('main.servers', 'Servers')}</span>
            <Icon name="chevron-right" size={13} />
          </Show>
        </Show>
        <span aria-current="page">{title()}</span>
      </nav>
      <div class="dashboard-page-heading">
        <div>
          <p class="dashboard-eyebrow">
            {props.admin ? t('main.admin_dashboard', 'Admin Dashboard') : t('dashboard.ui.workspace', 'Workspace')}
          </p>
          <h1>{title()}</h1>
          <p class="dashboard-page-description">
            {props.admin
              ? t('dashboard.ui.admin_description', 'Manage the platform and communities.')
              : serverRoute()
                ? t('dashboard.ui.server_description', 'Configure your server and follow its activity.')
                : t('dashboard.ui.workspace_description', 'Manage your community and connected servers.')}
          </p>
        </div>
        <Show when={!props.admin && (guild().name || server().name)}>
          <span class="dashboard-current-context">
            <Icon name={serverRoute() ? 'server' : 'users'} size={16} />
            {serverRoute() ? server().name || guild().name : guild().name}
          </span>
        </Show>
      </div>
    </header>
  )
}

export const AppDashboard: ParentComponent = (props) => {
  const { t } = useI18n()
  return (
    <>
      <DashboardMiddleware />
      <div class="dashboard-shell">
        <DashboardMenu />
        <div class="dashboard-main">
          <DashboardPageHeader />
          <div class="dashboard-content">
            <ShowErrorList />
            <ErrorBoundary
              fallback={(_error, reset) => (
                <div class="flex flex-col gap-2">
                  <AddErrorComponent
                    message={t('ui.page_error', 'This page could not be displayed. Try again to reload its content.')}
                  />
                  <Button type="button" class="self-start" onClick={reset}>
                    {t('ui.retry', 'Try again')}
                  </Button>
                </div>
              )}
            >
              {props.children}
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </>
  )
}
