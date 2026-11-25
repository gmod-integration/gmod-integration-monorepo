import { Icon, StatusBadge } from '../components/ui/index.js'
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
            <Icon name="crown" class="ui-premium-icon" />
          </A>
        }
      >
        <A
          href={upgradeHref()}
          class="inline-flex max-w-full tooltip tooltip-warning"
          classList={{
            'mr-2': !props.noMargin,
          }}
          data-tip={t('main.buy_premium', 'This feature requires Premium for this Discord community.')}
        >
          <StatusBadge tone="warning" icon="crown">
            {t('tools.premium', 'Premium')}
          </StatusBadge>
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
            {props.btnText || t('tools.upgrade_now', 'View Premium plans')}
          </A>
        </Show>
      </div>
    </Show>
  )
}
