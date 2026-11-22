import { Show, type JSX } from 'solid-js'
import { useI18n } from '../../i18n.js'
import type { AutosaveState } from '../../hooks/createAutosave.js'
import { Button } from './Button.js'
import { Icon } from './Icon.js'

/** Compact feedback for settings that persist as they change. */
export function AutosaveFeedback(props: { state: AutosaveState; message?: JSX.Element }) {
  const { t } = useI18n()
  return (
    <div class="settings-autosave" aria-busy={props.state.pending() || props.state.queued()}>
      <Show
        when={props.state.error()}
        fallback={
          <span role="status" class="flex items-center gap-2">
            <Icon name={props.state.success() ? 'check' : 'refresh-cw'} size={14} />
            {props.state.pending() || props.state.queued()
              ? t('ui.saving', 'Saving…')
              : props.message ||
                (props.state.success()
                  ? t('ui.saved', 'Changes saved.')
                  : t('ui.autosave', 'Changes are saved automatically.'))}
          </span>
        }
      >
        <span role="alert" class="text-error">
          {typeof props.state.error() === 'string'
            ? props.state.error()
            : t('ui.save_error', 'Unable to save the changes.')}
        </span>
        <Button variant="ghost" size="sm" disabled={props.state.pending()} onClick={() => void props.state.retry()}>
          {t('ui.retry', 'Retry')}
        </Button>
      </Show>
    </div>
  )
}
