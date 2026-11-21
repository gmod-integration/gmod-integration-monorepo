import { Show, type JSX } from 'solid-js'
import { useI18n } from '../../i18n.js'
import { Button } from './Button.js'

export interface FormActionsProps {
  pending?: boolean
  /** Disable saving while validation or the preview is unavailable; cancel stays usable. */
  disabled?: boolean
  dirty?: boolean
  onSave: () => void
  onCancel?: () => void
  error?: string | boolean
  success?: string | boolean
  message?: JSX.Element
  saveLabel?: string
  cancelLabel?: string
  saveVariant?: 'primary' | 'danger' | 'warning'
}

export function FormActions(props: FormActionsProps) {
  const { t } = useI18n()
  return (
    <div class="ui-form-actions flex flex-col gap-3 border-t border-base-200 pt-4">
      <Show when={props.error}>
        <p role="alert" class="text-sm text-error">
          {typeof props.error === 'string' ? props.error : t('ui.save_error', 'Unable to save the changes.')}
        </p>
      </Show>
      <Show when={!props.error && props.success && !props.dirty}>
        <p role="status" class="text-sm text-success">
          {typeof props.success === 'string' ? props.success : t('ui.saved', 'Changes saved.')}
        </p>
      </Show>
      <Show when={props.message || (props.dirty && !props.error)}>
        <div class="text-sm text-base-content/65">{props.message || t('ui.unsaved', 'Unsaved changes.')}</div>
      </Show>
      <div class="ui-form-actions-buttons flex flex-wrap items-center gap-2">
        <Show when={props.onCancel}>
          <Button disabled={props.pending} onClick={() => !props.pending && props.onCancel?.()}>
            {props.cancelLabel ?? t('ui.cancel', 'Cancel')}
          </Button>
        </Show>
        <Button
          variant={props.saveVariant ?? 'primary'}
          loading={props.pending}
          disabled={props.disabled || props.dirty === false}
          onClick={() => {
            if (!props.pending && !props.disabled && props.dirty !== false) props.onSave()
          }}
        >
          {props.saveLabel ?? t('ui.save', 'Save')}
        </Button>
      </div>
    </div>
  )
}
