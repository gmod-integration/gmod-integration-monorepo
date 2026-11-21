import { createUniqueId, Show, type JSX } from 'solid-js'
import { Icon, type IconName } from './Icon.js'
import { useI18n } from '../../i18n.js'

export interface SettingGroupProps {
  id?: string
  title: string
  description?: string
  icon?: IconName
  children: JSX.Element
}

/** A named group of related settings within an existing panel. */
export function SettingGroup(props: SettingGroupProps) {
  const headingId = createUniqueId()
  return (
    <section id={props.id} class="settings-group" aria-labelledby={headingId}>
      <header class="settings-group-heading">
        <Show when={props.icon}>
          <Icon name={props.icon!} size={18} />
        </Show>
        <div>
          <h3 id={headingId}>{props.title}</h3>
          <Show when={props.description}>
            <p>{props.description}</p>
          </Show>
        </div>
      </header>
      <div class="settings-group-content">{props.children}</div>
    </section>
  )
}

export interface SettingRowProps {
  controlId?: string
  title: JSX.Element
  description?: JSX.Element
  children: JSX.Element
  feedback?: JSX.Element
  stacked?: boolean
}

/** Label, explanation and control stay together, with feedback below the control. */
export function SettingRow(props: SettingRowProps) {
  return (
    <div class="settings-row" classList={{ 'is-stacked': props.stacked }}>
      <div class="settings-row-copy">
        <Show when={props.controlId} fallback={<div class="settings-row-title">{props.title}</div>}>
          <label class="settings-row-title" for={props.controlId}>
            {props.title}
          </label>
        </Show>
        <Show when={props.description}>
          <div id={props.controlId ? `${props.controlId}-description` : undefined} class="settings-row-description">
            {props.description}
          </div>
        </Show>
      </div>
      <div class="settings-row-content">
        <div class="settings-row-control">{props.children}</div>
        <Show when={props.feedback}>
          <div class="settings-row-feedback">{props.feedback}</div>
        </Show>
      </div>
    </div>
  )
}

/** Feedback for a setting that saves immediately. */
export function SettingFeedback(props: { pending?: boolean; error?: string; success?: boolean }) {
  const { t } = useI18n()
  return (
    <>
      <Show when={props.pending}>
        <span role="status" class="text-base-content/60">
          {t('ui.loading', 'Loading…')}
        </span>
      </Show>
      <Show when={!props.pending && props.error}>
        <span role="alert" class="text-error">
          {props.error}
        </span>
      </Show>
      <Show when={!props.pending && !props.error && props.success}>
        <span role="status" class="text-success">
          {t('ui.saved', 'Saved')}
        </span>
      </Show>
    </>
  )
}
