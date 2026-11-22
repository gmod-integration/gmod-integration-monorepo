import { createUniqueId, Show, type Component, type JSX } from 'solid-js'
import { A } from '@solidjs/router'
import type { linkBadge } from './layout/menu/DashboardMenu.js'
import { useI18n } from '../i18n.js'
import { useAccess } from './AccessProvider.js'
import { upgradeHref } from './FeatureGate.js'
import { premium, PremiumBadge } from '../utils/premium.js'
import { Icon, type IconName } from './ui/index.js'

interface AdminPanelProps {
  id?: string
  title: string
  description?: string
  children?: JSX.Element
  type?: string
  info?: string
  badge?: linkBadge
  premium?: string | boolean
  actions?: JSX.Element
  footer?: JSX.Element
  icon?: IconName
}

const AdminPanel: Component<AdminPanelProps> = (props) => {
  const { t } = useI18n()
  const access = useAccess()
  const headingId = createUniqueId()
  return (
    <>
      <section
        id={props.id}
        aria-labelledby={headingId}
        class="dashboard-panel border border-base-200 rounded-lg flex flex-col min-w-0"
      >
        <div class="dashboard-panel-header flex flex-col gap-4 p-4">
          <div class="flex flex-wrap gap-4 items-center justify-between min-w-0">
            <div class="flex flex-wrap gap-3 items-center min-w-0">
              <Show when={props.icon}>
                <span class="dashboard-panel-icon">
                  <Icon name={props.icon!} />
                </span>
              </Show>
              <h2 id={headingId} class="dashboard-panel-title text-xl font-bold">
                {props.title}
              </h2>
              <Show when={props.badge}>
                <div class="badge badge-outline">{t('main.badge_' + props.badge, props.badge)}</div>
              </Show>
              <Show when={props.premium && access.ready() && access.snapshot()?.state === 'ready' && !premium()}>
                <PremiumBadge />
              </Show>
            </div>
            <Show when={props.actions}>
              <div class="flex flex-wrap gap-2 items-center">{props.actions}</div>
            </Show>
          </div>
          <Show when={props.premium && access.ready() && access.snapshot()?.state === 'ready' && !premium()}>
            <p class="text-amber-400">
              {props.premium === true
                ? t('main.buy_premium', 'This feature requires Premium for this Discord community.')
                : props.premium}{' '}
              <A class="link" href={upgradeHref()}>
                {t('tools.upgrade_now', 'View Premium plans')}
              </A>
            </p>
          </Show>
          <Show when={props.description}>
            <p class="dashboard-panel-description text-base-content/60">{props.description}</p>
          </Show>
          <Show when={props.info}>
            <div class="flex gap-2 items-center text-base-content/50">
              <Icon name="info" />
              <span>{props.info}</span>
            </div>
          </Show>
        </div>

        <hr class="dashboard-panel-divider border-base-200" />

        <div
          class="dashboard-panel-body flex flex-col min-w-0"
          classList={{
            'is-flush': props.type === 'none',
            'gap-4': !props.type || props.type != 'none',
            'p-4': !props.type || props.type != 'none',
          }}
        >
          {props.children}
        </div>
        <Show when={props.footer}>
          <div class="dashboard-panel-footer border-t border-base-200 p-4">{props.footer}</div>
        </Show>
      </section>
    </>
  )
}

export default AdminPanel
