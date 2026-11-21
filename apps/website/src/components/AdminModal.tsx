import { Show, type Component, type JSX } from 'solid-js'
import { useI18n } from '../i18n.js'
import { IconButton } from './ui/index.js'

interface AdminModalProps {
  title: string
  id: string
  children: JSX.Element
  description?: string
  busy?: boolean
  onClose?: (event: Event) => void
  onCancel?: (event: Event) => void
  size?: 'md' | 'wide'
  footer?: JSX.Element
}

const AdminModal: Component<AdminModalProps> = (props) => {
  const { t } = useI18n()
  return (
    <>
      <dialog
        class="dashboard-dialog modal"
        id={props.id}
        aria-labelledby={`${props.id}-title`}
        aria-describedby={props.description ? `${props.id}-description` : undefined}
        aria-busy={props.busy || undefined}
        onClose={(event) => props.onClose?.(event)}
        onCancel={(event) => {
          if (props.busy) event.preventDefault()
          else props.onCancel?.(event)
        }}
      >
        <div class={`dashboard-dialog-box modal-box min-w-0 ${props.size === 'wide' ? 'max-w-4xl' : ''}`}>
          <form
            method="dialog"
            onSubmit={(event) => {
              if (props.busy) event.preventDefault()
            }}
          >
            <IconButton
              type="submit"
              size="sm"
              class="btn-circle absolute right-2 top-2"
              label={t('ui.close', 'Close')}
              icon="x"
              disabled={props.busy}
            />
          </form>
          <div class="modal-body flex flex-col gap-4 min-w-0">
            <h2 id={`${props.id}-title`} class="text-2xl font-bold pr-8">
              {props.title}
            </h2>
            <Show when={props.description}>
              <p id={`${props.id}-description`} class="text-sm text-base-content/65">
                {props.description}
              </p>
            </Show>
            {props.children}
          </div>
          <Show when={props.footer}>
            <div class="mt-4">{props.footer}</div>
          </Show>
        </div>
      </dialog>
    </>
  )
}

export default AdminModal
