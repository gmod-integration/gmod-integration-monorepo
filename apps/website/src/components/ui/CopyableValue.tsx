import { createEffect, createSignal, on, onCleanup, Show, type JSX } from 'solid-js'
import { createAsyncAction } from '../../hooks/createAsyncAction.js'
import { useI18n } from '../../i18n.js'
import { IconButton } from './IconButton.js'

export interface CopyButtonProps {
  value: string
  label?: string
  disabled?: boolean
  class?: string
}

/** Clipboard feedback is shown only after the browser confirms the write. */
export function CopyButton(props: CopyButtonProps) {
  const { t } = useI18n()
  const action = createAsyncAction({ errorMessage: () => t('ui.copy_error', 'Unable to copy. Please try again.') })
  const [feedbackValue, setFeedbackValue] = createSignal<string>()
  let resetTimer: ReturnType<typeof setTimeout> | undefined
  let generation = 0
  let disposed = false
  const clearTimer = () => {
    if (resetTimer !== undefined) clearTimeout(resetTimer)
    resetTimer = undefined
  }
  createEffect(
    on(
      () => props.value,
      () => {
        generation++
        clearTimer()
        setFeedbackValue(undefined)
        action.reset()
      },
      { defer: true },
    ),
  )
  onCleanup(() => {
    disposed = true
    generation++
    clearTimer()
  })
  const copied = () => feedbackValue() === props.value && action.success()
  const error = () => (feedbackValue() === props.value ? action.error() : undefined)
  const state = () => (action.pending() ? 'pending' : copied() ? 'copied' : error() ? 'error' : 'idle')
  const copy = async () => {
    if (props.disabled || !props.value || action.pending()) return
    const value = props.value
    const current = generation
    clearTimer()
    setFeedbackValue(value)
    const success = await action.run(() => navigator.clipboard.writeText(value))
    if (disposed) return
    if (current !== generation) {
      action.reset()
      return
    }
    if (success) resetTimer = setTimeout(() => action.reset(), 2_000)
  }
  return (
    <>
      <IconButton
        label={props.label ?? t('ui.copy', 'Copy')}
        title={copied() ? t('ui.copied', 'Copied!') : error() || props.label || t('ui.copy', 'Copy')}
        class={`ui-copy-button ${props.class ?? ''}`}
        disabled={props.disabled || !props.value || action.pending()}
        aria-busy={action.pending() || undefined}
        data-copy-state={state()}
        icon={action.pending() ? 'loader-circle' : copied() ? 'check' : error() ? 'circle-alert' : 'copy'}
        onClick={() => void copy()}
      />
      <Show when={copied()}>
        <span class="sr-only" role="status">
          {t('ui.copied', 'Copied!')}
        </span>
      </Show>
      <Show when={error()}>
        <span class="ui-copy-error text-error text-xs" role="alert">
          {error()}
        </span>
      </Show>
    </>
  )
}

export interface CopyableValueProps extends CopyButtonProps {
  display?: JSX.Element
  multiline?: boolean
}

/** Display and clipboard values can differ, for example when masking a token. */
export function CopyableValue(props: CopyableValueProps) {
  return (
    <span class={`ui-copyable ${props.multiline ? 'ui-copyable--multiline' : ''} ${props.class ?? ''}`}>
      <code class="ui-copyable-value">
        <Show when={props.display !== undefined} fallback={props.value}>
          {props.display}
        </Show>
      </code>
      <CopyButton value={props.value} label={props.label} disabled={props.disabled} />
    </span>
  )
}
