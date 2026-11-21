import { Match, Show, Switch, type JSX } from 'solid-js'
import { useI18n } from '../../i18n.js'
import { Button } from './Button.js'

export interface AsyncStateProps {
  loading?: boolean
  error?: unknown
  empty?: boolean
  loadingLabel?: string
  errorLabel?: string
  emptyLabel?: string
  onRetry?: () => void
  children?: JSX.Element
}

/** Test errors before reading a resource accessor in children. */
export function AsyncState(props: AsyncStateProps) {
  const { t } = useI18n()
  return (
    <Switch fallback={props.children}>
      <Match when={props.loading}>
        <div role="status" class="flex items-center justify-center gap-3 p-6 text-base-content/65">
          <span class="loading loading-spinner loading-sm" aria-hidden="true"></span>
          <span>{props.loadingLabel ?? t('ui.loading', 'Loading…')}</span>
        </div>
      </Match>
      <Match when={props.error}>
        <div role="alert" class="flex flex-col items-center gap-3 p-6 text-center">
          <p class="text-error">{props.errorLabel ?? t('ui.load_error', 'Unable to load this content.')}</p>
          <Show when={props.onRetry}>
            <Button size="sm" onClick={() => props.onRetry?.()}>
              {t('ui.retry', 'Try again')}
            </Button>
          </Show>
        </div>
      </Match>
      <Match when={props.empty}>
        <p role="status" class="p-6 text-center text-base-content/65">
          {props.emptyLabel ?? t('ui.empty', 'No items to display.')}
        </p>
      </Match>
    </Switch>
  )
}

export interface TableStateProps extends AsyncStateProps {
  colSpan: number
}

/** Place inside tbody; state content always lives inside a valid table row and cell. */
export function TableState(props: TableStateProps) {
  return (
    <Show when={props.loading || props.error || props.empty} fallback={props.children}>
      <tr>
        <td colSpan={props.colSpan}>
          <AsyncState {...props} />
        </td>
      </tr>
    </Show>
  )
}
