import { Show, type Component } from 'solid-js'
import { useI18n } from '../../i18n'
import { A } from '@solidjs/router'

import { premium } from '../../utils/premium'

export const PremiumFeature: Component<{ message?: string }> = (props) => {
  const { t } = useI18n()
  return (
    <>
      <Show when={!premium()}>
        <div role="note" class="text-warning flex items-center rounded-lg border-warning border py-2 px-4 gap-4">
          <i aria-hidden="true" class="fa-solid fa-crown"></i>
          <span>
            {props.message || t('ui.premium_required', 'This feature requires a premium plan.')}{' '}
            <A class="link" href="/premium">
              {t('tools.upgrade_now', 'Upgrade Now')}
            </A>
          </span>
        </div>
      </Show>
    </>
  )
}
