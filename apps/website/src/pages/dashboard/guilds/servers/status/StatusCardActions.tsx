import { Show, type Component } from 'solid-js'
import { AsyncState, Button, FormActions } from '../../../../../components/ui/index.js'
import { useI18n } from '../../../../../i18n.js'
import { useStatusConfiguration, type StatusScope } from './StatusConfigurationContext.js'

/** Each card applies only its own draft; both saves share the server's revision. */
const StatusCardActions: Component<{ scope: StatusScope }> = (props) => {
  const editor = useStatusConfiguration()
  const { t } = useI18n()
  const form = () => editor.formFor(props.scope)
  return (
    <>
      <AsyncState loading={editor.loading()} error={editor.loadError()} onRetry={() => void editor.refetch()} />
      <Show when={editor.syncPending(props.scope)}>
        <p role="status" class="settings-notice">
          {t('editing.sync_pending', 'The configuration is saved. The Discord update has not been confirmed yet.')}
        </p>
      </Show>
      <Show when={editor.conflictScope() === props.scope}>
        <Button onClick={() => void editor.refetch()}>
          {t('editing.reload_saved', 'Discard changes and reload saved values')}
        </Button>
      </Show>
      <FormActions
        dirty={form().dirty()}
        pending={form().pending()}
        disabled={
          !editor.ready() ||
          editor.form.pending() ||
          editor.conflict() ||
          !!editor.validationError(props.scope) ||
          !!editor.accessError(props.scope)
        }
        error={form().error()}
        success={form().success()}
        onSave={() => void editor.save(props.scope)}
        onCancel={form().discard}
        saveLabel={
          props.scope === 'message'
            ? t('editing.save_status_message', 'Save message')
            : t('editing.save_status_buttons', 'Save buttons')
        }
        message={
          editor.accessError(props.scope) ||
          editor.validationError(props.scope) ||
          (editor.conflict() && !form().error()
            ? t('editing.conflict', 'The saved values changed. Reload them before saving again.')
            : undefined)
        }
      />
    </>
  )
}
export default StatusCardActions
