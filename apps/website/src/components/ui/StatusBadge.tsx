import { Show, splitProps, type JSX } from 'solid-js'
import { Icon, type IconName } from './Icon.js'
import { useI18n } from '../../i18n.js'

export type StatusTone = 'success' | 'neutral' | 'warning' | 'danger' | 'info'
export interface StatusBadgeProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  children: JSX.Element
  tone?: StatusTone
  icon?: IconName
  size?: 'sm' | 'md'
}

/** A read-only state: its text carries the meaning; color and icon reinforce it. */
export function StatusBadge(props: StatusBadgeProps) {
  const [local, attributes] = splitProps(props, ['tone', 'icon', 'size', 'class', 'children'])
  return (
    <span
      {...attributes}
      class={`ui-status-badge ${local.class ?? ''}`}
      data-tone={local.tone ?? 'neutral'}
      data-size={local.size ?? 'md'}
    >
      <Show when={local.icon}>
        <Icon name={local.icon!} size={local.size === 'sm' ? 12 : 13} />
      </Show>
      <span class="ui-status-badge-label">{local.children}</span>
    </span>
  )
}

export interface BooleanStatusProps extends Omit<StatusBadgeProps, 'tone' | 'icon' | 'children'> {
  value: boolean | null | undefined
  trueLabel?: string
  falseLabel?: string
  unknownLabel?: string
}

/** An inactive setting is neutral; a missing value stays unknown instead of becoming disabled. */
export function BooleanStatus(props: BooleanStatusProps) {
  const { t } = useI18n()
  const [local, attributes] = splitProps(props, ['value', 'trueLabel', 'falseLabel', 'unknownLabel'])
  return (
    <StatusBadge
      {...attributes}
      class={`ui-boolean-status ${attributes.class ?? ''}`}
      tone={local.value === true ? 'success' : 'neutral'}
      icon={local.value === true ? 'check' : local.value === false ? 'x' : 'circle-help'}
    >
      {local.value === true
        ? (local.trueLabel ?? t('ui.enabled', 'Enabled'))
        : local.value === false
          ? (local.falseLabel ?? t('ui.disabled', 'Disabled'))
          : (local.unknownLabel ?? t('ui.unknown', 'Unknown'))}
    </StatusBadge>
  )
}
