import { createSignal, For } from 'solid-js'
import AdminModal from './AdminModal.js'
import { AsyncState, FormActions, FormField } from './ui/index.js'
import { createAsyncAction } from '../hooks/createAsyncAction.js'
import { useI18n } from '../i18n.js'
import { closeDialog } from '../utils/dialog.js'

interface AdminRoleSelectorProps {
  id: string
  title: string
  roles: { id: string; name: string }[]
  loading?: boolean
  error?: unknown
  loadingLabel?: string
  onConfirm: (roleID: string) => Promise<unknown>
}

/** Role selection stays local until Save; a rejected request keeps the choice available for retry. */
export default function AdminRoleSelector(props: AdminRoleSelectorProps) {
  const { t } = useI18n()
  const [selected, setSelected] = createSignal('')
  const action = createAsyncAction({ errorMessage: () => t('ui.save_error', 'Unable to save. Please try again.') })
  const valid = () => props.roles.some((role) => role.id === selected())
  const reset = () => {
    if (action.pending()) return
    setSelected('')
    action.reset()
  }
  const save = async () => {
    if (props.loading || props.error || !valid()) return
    if (await action.run(() => props.onConfirm(selected()))) closeDialog(props.id)
  }
  return (
    <AdminModal id={props.id} title={props.title} busy={action.pending()} onClose={reset} onCancel={reset}>
      <AsyncState loading={props.loading} error={props.error} loadingLabel={props.loadingLabel}>
        <FormField id={`${props.id}-role`} label={props.title}>
          <select
            id={`${props.id}-role`}
            class="select w-full"
            value={selected()}
            disabled={props.loading || !!props.error || action.pending()}
            onChange={(event) => setSelected(event.currentTarget.value)}
          >
            <option value="">{props.title}</option>
            <For each={props.roles}>{(role) => <option value={role.id}>{role.name}</option>}</For>
          </select>
        </FormField>
      </AsyncState>
      <FormActions
        dirty={!!selected()}
        disabled={props.loading || !!props.error || !valid()}
        pending={action.pending()}
        error={action.error()}
        onSave={save}
        onCancel={() => {
          reset()
          closeDialog(props.id)
        }}
      />
    </AdminModal>
  )
}
