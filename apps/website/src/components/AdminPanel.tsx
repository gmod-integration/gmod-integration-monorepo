import { Component, Show } from 'solid-js'
import { A } from '@solidjs/router'
import { linkBadge } from './layout/menu/DashboardMenu'
import { useI18n } from '../i18n'
import { premium, PremiumBadge } from '../utils/premium'

interface AdminPanelProps {
  title: string
  description: string
  children?: any
  type?: string
  info?: string
  badge?: linkBadge
  premium?: string | boolean
}

const AdminPanel: Component<AdminPanelProps> = (props) => {
  const { t } = useI18n()
  return (
    <>
      <div class="border border-base-200 rounded-lg flex flex-col">
        <div class="flex flex-col gap-4 p-4">
          <div class="flex gap-4 items-center">
            <h2 class="text-xl font-bold">{props.title}</h2>
            <Show when={props.badge}>
              <div class="badge badge-outline">{t('main.badge_' + props.badge, props.badge)}</div>
            </Show>
            <Show when={props.premium && !premium()}>
              <PremiumBadge />
            </Show>
          </div>
          <Show when={props.premium && !premium()}>
            <p class="text-amber-400">
              {props.premium === true
                ? t('main.buy_premium', 'This feature is only available to premium users.')
                : props.premium}{' '}
              <A class="link" href="/premium">
                {t('tools.upgrade_now', 'Upgrade Now')}
              </A>
            </p>
          </Show>
          <p class="text-base-content/60">{props.description}</p>
          <Show when={props.info}>
            <div class="flex gap-2 items-center text-base-content/50">
              <i class="fa-solid fa-circle-info"></i>
              <span>{props.info}</span>
            </div>
          </Show>
        </div>

        <hr class="border-base-200" />

        <div
          class="flex flex-col"
          classList={{
            'gap-4': !props.type || props.type != 'none',
            'p-4': !props.type || props.type != 'none',
          }}
        >
          {props.children}
        </div>
      </div>
    </>
  )
}

export default AdminPanel
