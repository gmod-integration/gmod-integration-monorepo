import { upgradeHref } from '../FeatureGate.js'
import { useAccess } from '../AccessProvider.js'
import { Icon } from '../ui/index.js'
import { Show, type Component } from 'solid-js'
import { useI18n } from '../../i18n'
import { A } from '@solidjs/router'

import { premium } from '../../utils/premium'

export const PremiumFeature: Component<{ message?: string }> = (props) => {
  const { t } = useI18n()
  const access = useAccess()
  return (
    <>
      <Show when={access.ready() && access.snapshot()?.state === 'ready' && !premium()}>
        <div role="note" class="text-warning flex items-center rounded-lg border-warning border py-2 px-4 gap-4">
          <Icon name="crown" aria-hidden="true" />
          <span>
            {props.message || t('ui.premium_required', 'This feature requires a premium plan.')}{' '}
            <A class="link" href={upgradeHref()}>
              {t('tools.upgrade_now', 'Upgrade Now')}
            </A>
          </span>
        </div>
      </Show>
    </>
  )
}
