import { Icon } from '../components/ui/index.js'
import { useAccess } from '../components/AccessProvider.js'
import { upgradeHref } from '../components/FeatureGate.js'
import { type Component, type ParentProps, Show } from 'solid-js'
import { useI18n } from '../i18n'
import { A } from '@solidjs/router'

export function premium() {
  const access = useAccess()
  return access.ready() && access.snapshot()?.premium === true
}

interface PremiumBadgeProps {
  onlyIcon?: boolean
  noMargin?: boolean
}

export const PremiumBadge: Component<PremiumBadgeProps> = (props) => {
  const { t } = useI18n()
  const access = useAccess()
  return (
    <Show when={access.ready() && access.snapshot()?.state === 'ready' && !premium()}>
      <Show
        when={!props.onlyIcon}
        fallback={
          <A
            href={upgradeHref()}
            class="tooltip"
            aria-label={t('main.premium', 'Premium')}
            classList={{
              'mr-2': !props.noMargin,
            }}
            data-tip={t('main.premium', 'Premium')}
          >
            <Icon name="crown" class="text-amber-400" />
          </A>
        }
      >
        <A
          href={upgradeHref()}
          class="badge badge-outline text-amber-400 py-3 flex tooltip tooltip-warning"
          classList={{
            'mr-2': !props.noMargin,
          }}
          data-tip={t('main.buy_premium', 'This feature is only available to premium users.')}
        >
          <Icon name="crown" />
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

/** @deprecated Use FeatureGate with a named capability. This adapter is presentation only. */
export const BuyPremiumBtn: Component<BuyPremiumBtnProps> = (props) => {
  const { t } = useI18n()
  const access = useAccess()
  const blocked = () =>
    access.ready() && access.snapshot()?.state === 'ready' && !premium() && props.subCondition === false
  return (
    <Show when={!props.hidden}>
      <div class="flex flex-wrap items-center gap-2">
        <fieldset disabled={blocked()} class="contents">
          {props.children}
        </fieldset>
        <Show when={blocked()}>
          <A href={upgradeHref()} class="link text-sm">
            {props.btnText || t('tools.upgrade_now', 'Upgrade Now')}
          </A>
        </Show>
      </div>
    </Show>
  )
}
