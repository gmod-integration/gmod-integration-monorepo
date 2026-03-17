import { Component, Show } from 'solid-js'
import { useI18n } from '../i18n'
import { premium } from '../utils/premium'

export const PremiumOnly: Component = () => {
  const { t } = useI18n()
  return <Show when={!premium()}>- {t('tools.premium_only', 'Premium Only')}</Show>
}
