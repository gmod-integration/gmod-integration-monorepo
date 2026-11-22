import { createEffect, on, type Accessor, type Component, type JSX } from 'solid-js'
import AdminModal from './AdminModal.js'
import { FormActions } from './ui/FormActions.js'
import { createAsyncAction } from '../hooks/createAsyncAction.js'
import { useI18n } from '../i18n.js'
import { closeDialog } from '../utils/dialog.js'
import { useDraftGuard } from '../hooks/draftRegistry.js'

export type ConfirmActionDialogProps = {
  id: string
  title: string
  description?: string
  confirmLabel?: string
  variant?: 'primary' | 'danger' | 'warning'
  children?: JSX.Element | ((pending: Accessor<boolean>) => JSX.Element)
  disabled?: boolean
  onConfirm: () => Promise<unknown>
  onSuccess?: () => void
}

/** Commands name their target and consequences, and never close on an unsuccessful request. */
const ConfirmActionDialog: Component<ConfirmActionDialogProps> = (props) => {
  const { t } = useI18n()
  const action = createAsyncAction({ errorMessage: () => t('ui.action_error', 'The action failed. Please try again.') })
  useDraftGuard({ dirty: () => false, pending: action.pending, discard: () => {} })
  createEffect(
    on(
      () => [props.title, props.description],
      () => action.reset(),
    ),
  )
  return (
    <AdminModal
      id={props.id}
      title={props.title}
      description={props.description}
      busy={action.pending()}
      onClose={action.reset}
      onCancel={action.reset}
    >
      {typeof props.children === 'function' ? props.children(action.pending) : props.children}
      <FormActions
        pending={action.pending()}
        error={action.error()}
        disabled={props.disabled}
        saveLabel={props.confirmLabel ?? t('ui.confirm', 'Confirm')}
        saveVariant={props.variant ?? 'danger'}
        onCancel={() => closeDialog(props.id)}
        onSave={async () => {
          if (props.disabled) return
          if (await action.run(props.onConfirm)) {
            closeDialog(props.id)
            props.onSuccess?.()
          }
        }}
      />
    </AdminModal>
  )
}
export default ConfirmActionDialog
