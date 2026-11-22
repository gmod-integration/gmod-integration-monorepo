import { children, Show, type ParentComponent } from 'solid-js'
import type { CapabilityKey } from '@gmod/schema/server/AccessPolicySchema.js'
import { useFeatureAccess, useAccess } from './AccessProvider.js'
import { useI18n } from '../i18n.js'
import { ButtonLink, Icon } from './ui/index.js'

export function upgradeHref() {
  const id = useAccess().snapshot()?.guildID
  return id ? `/premium?guildID=${encodeURIComponent(id)}` : '/premium'
}

/** Keeps the action visible; policy and load errors have distinct explanations. */
export const FeatureGate: ParentComponent<{
  capability: CapabilityKey
  used?: number
  loading?: boolean
  error?: unknown
  compact?: boolean
  showQuota?: boolean
}> = (props) => {
  const access = useFeatureAccess(props.capability)
  const { t, locale } = useI18n()
  const known = () => access.ready() && !props.loading && !props.error
  const used = () => props.used ?? access.snapshot()?.usages?.[props.capability] ?? 0
  const quota = () => access.limit()
  const blocked = () =>
    known() && access.snapshot()?.state === 'ready' && (!access.allowed() || (quota() !== null && used() >= quota()!))
  const needsUpgrade = () => blocked() && !access.snapshot()?.premium && props.capability !== 'bot.custom'
  const content = children(() => (
    <>
      {props.children}
      <Show when={known() && props.showQuota !== false && access.allowed() && quota() !== null}>
        <span class="text-xs text-base-content/60">
          {t('access.quota', '{1} / {2} used', used().toLocaleString(locale()), quota()!.toLocaleString(locale()))}
        </span>
      </Show>
      <Show when={blocked()}>
        <div role="note" class="flex flex-wrap items-center gap-2 text-sm text-base-content/65">
          <Icon name="crown" size={15} class="ui-premium-icon" />
          <span>
            {!access.allowed()
              ? props.capability === 'bot.custom'
                ? t('access.historical_bot', 'Requires a GmodStore purchase')
                : t('access.upgrade_required', 'This feature requires Premium.')
              : t('access.quota_reached', 'You have reached the limit for this feature.')}
          </span>
          <Show when={needsUpgrade()}>
            <ButtonLink variant="ghost" size="sm" href={upgradeHref()}>
              {t('tools.upgrade_now', 'View Premium plans')}
            </ButtonLink>
          </Show>
          <Show when={props.capability === 'bot.custom' && !access.allowed()}>
            <ButtonLink variant="ghost" size="sm" href="/gmodstore">
              {t('access.historical_bot', 'Requires a GmodStore purchase')}
            </ButtonLink>
          </Show>
        </div>
      </Show>
      <Show
        when={
          !props.loading &&
          !props.error &&
          !access.loading() &&
          (!access.ready() ||
            (access.snapshot()?.state === 'unknown' && (!access.allowed() || !access.canCreate(used()))))
        }
      >
        <p role="status" class="text-sm text-base-content/60">
          {t('access.unavailable', 'Access could not be verified. Your saved configuration is preserved.')}
        </p>
      </Show>
    </>
  ))
  return (
    <Show when={content.toArray().some((value) => value != null && typeof value !== 'boolean' && value !== '')}>
      <div class="flex min-w-0 flex-col gap-2">{content()}</div>
    </Show>
  )
}

export const SuspendedFeature: ParentComponent<{ capability: CapabilityKey; active?: boolean }> = (props) => {
  const access = useFeatureAccess(props.capability)
  const { t } = useI18n()
  return (
    <Show when={access.ready() && access.snapshot()?.state === 'ready' && !access.allowed() && props.active}>
      <p role="note" class="text-sm text-warning">
        {t('access.suspended', 'This saved feature is suspended. You can still disable or remove its configuration.')}
        {props.children}
      </p>
    </Show>
  )
}
