import { Show, type Component } from 'solid-js'
import { AsyncState, AutosaveFeedback, Button } from '../../../../../components/ui/index.js'
import { useI18n } from '../../../../../i18n.js'
import { useStatusConfiguration, type StatusScope } from './StatusConfigurationContext.js'

/** Each card saves automatically; both scopes share the server's revision. */
const StatusCardActions: Component<{ scope: StatusScope }> = (props) => {
  const editor = useStatusConfiguration()
  const { t } = useI18n()
  return (
    <>
      <AsyncState loading={editor.loading()} error={editor.loadError()} onRetry={() => void editor.refetch()} />
      <Show when={editor.syncPending(props.scope)}>
        <p role="status" class="settings-notice">
          {t('editing.sync_pending', 'The configuration is saved. The Discord update has not been confirmed yet.')}
        </p>
      </Show>
      <Show when={editor.conflictScope() === props.scope}>
        <p role="alert" class="text-sm text-error">
          {t('editing.conflict', 'The saved values changed. Reload them before saving again.')}
        </p>
        <Button onClick={() => void editor.refetch()}>
          {t('editing.reload_saved', 'Discard changes and reload saved values')}
        </Button>
      </Show>
      <Show when={editor.accessError(props.scope) || editor.validationError(props.scope)}>
        <p role="alert" class="text-sm text-error">
          {editor.accessError(props.scope) || editor.validationError(props.scope)}
        </p>
      </Show>
      <AutosaveFeedback
        state={{
          ...editor.autosaveFor(props.scope),
          error: () => (editor.conflict() ? undefined : editor.autosaveFor(props.scope).error()),
        }}
      />
    </>
  )
}
export default StatusCardActions
