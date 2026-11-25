import { useAccess } from './AccessProvider.js'
import { Component, Show } from 'solid-js'
import { useI18n } from '../i18n'
import { premium } from '../utils/premium'

export const PremiumOnly: Component = () => {
  const { t } = useI18n()
  const access = useAccess()
  return (
    <Show when={access.ready() && access.snapshot()?.state === 'ready' && !premium()}>
      - {t('tools.premium_only', 'Premium Only')}
    </Show>
  )
}
