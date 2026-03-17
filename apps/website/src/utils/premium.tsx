import { getGuild } from './utils'
import { Component, ParentProps, Show } from 'solid-js'
import { useI18n } from '../i18n'
import { A } from '@solidjs/router'

export function premium() {
  return getGuild().isPremium
}

interface PremiumBadgeProps {
  onlyIcon?: boolean
  noMargin?: boolean
}

export const PremiumBadge: Component<PremiumBadgeProps> = (props) => {
  const { t } = useI18n()
  return (
    <Show when={!premium()}>
      <Show
        when={!props.onlyIcon}
        fallback={
          <A
            href="/premium"
            class="tooltip"
            classList={{
              'mr-2': !props.noMargin,
            }}
            data-tip={t('main.premium', 'Premium')}
          >
            <i class="text-amber-400 fa-solid fa-crown" />
          </A>
        }
      >
        <A
          href="/premium"
          class="badge badge-outline text-amber-400 py-3 flex tooltip tooltip-warning"
          classList={{
            'mr-2': !props.noMargin,
          }}
          data-tip={t('main.buy_premium', 'This feature is only available to premium users.')}
        >
          <i class="fa-solid fa-crown" />
          <span class="ml-2">{t('tools.premium', 'Premium')}</span>
        </A>
      </Show>
    </Show>
  )
}

interface BuyPremiumBtnProps extends ParentProps {
  subCondition?: boolean
  btnText?: string
  hidden?: boolean
}

export const BuyPremiumBtn: Component<BuyPremiumBtnProps> = (props) => {
  const { t } = useI18n()
  return (
    <Show when={props.hidden !== undefined ? !props.hidden : true}>
      <Show
        when={premium() || (props.subCondition !== undefined ? props.subCondition : true)}
        fallback={
          <A href={'/premium'} class="btn btn-outline btn-warning">
            {props.btnText || t('main.buy_premium', 'This feature is only available to premium users.')}
          </A>
        }
      >
        {props.children}
      </Show>
    </Show>
  )
}
