import { Button, IconButton } from './ui/index.js'
import { For, Show, type Component } from 'solid-js'
import { type ClientQuery } from '../utils/types/QueryTypes.js'
import { useI18n } from '../i18n.js'

interface PaginationProps {
  query: ClientQuery
  total: number
  onChange: (newQuery: ClientQuery) => void
  colSpan?: number
  /** Keep the controls outside horizontally scrolling tables in new layouts. */
  standalone?: boolean
}

export interface PaginationControlsProps {
  page: number
  pages: number
  previousDisabled: boolean
  nextDisabled: boolean
  onPrevious: () => void
  onNext: () => void
  onFirst: () => void
  onLast?: () => void
  limit?: number
  limits?: readonly number[]
  onLimitChange?: (limit: number) => void
}

/** One presentation for table footers and public lists, independent of their query shape. */
export const PaginationControls: Component<PaginationControlsProps> = (props) => {
  const { t } = useI18n()
  return (
    <nav class="ui-pagination" aria-label={t('ui.pagination', 'Pagination')}>
      <div class="ui-pagination-group">
        <Show when={props.onLast}>
          <IconButton
            icon="arrow-left-to-line"
            label={t('ui.first_page', 'Back to the first page')}
            onClick={() => props.onFirst()}
            disabled={props.previousDisabled}
          />
        </Show>
        <IconButton
          icon="chevron-left"
          label={t('ui.previous_page', 'Previous page')}
          onClick={() => props.onPrevious()}
          disabled={props.previousDisabled}
        />
        <Button
          size="sm"
          class="ui-pagination-page"
          title={t('ui.first_page', 'Back to the first page')}
          onClick={() => props.onFirst()}
        >
          <span class="sr-only">{t('ui.page_of', 'Page {1} of {2}', props.page, props.pages)}</span>
          <span aria-hidden="true">
            {props.page} / {props.pages}
          </span>
        </Button>
        <Show when={props.onLimitChange}>
          <select
            class="select select-sm ui-pagination-limit"
            aria-label={t('ui.rows_per_page', 'Rows per page')}
            title={t('ui.rows_per_page', 'Rows per page')}
            value={props.limit}
            onChange={(event) => {
              const value = Number(event.currentTarget.value)
              if (props.limits?.includes(value)) props.onLimitChange?.(value)
            }}
          >
            <For each={props.limits}>{(value) => <option value={value}>{value}</option>}</For>
          </select>
        </Show>
        <IconButton
          icon="chevron-right"
          label={t('ui.next_page', 'Next page')}
          onClick={() => props.onNext()}
          disabled={props.nextDisabled}
        />
        <Show when={props.onLast}>
          <IconButton
            icon="arrow-right-to-line"
            label={t('ui.last_page', 'Last page')}
            onClick={() => props.onLast?.()}
            disabled={props.nextDisabled}
          />
        </Show>
      </div>
    </nav>
  )
}

const Pagination: Component<PaginationProps> = (props) => {
  const limit = () => (Number.isFinite(props.query.limit) && props.query.limit > 0 ? props.query.limit : 25)
  const offset = () => (Number.isFinite(props.query.offset) ? Math.max(0, props.query.offset) : 0)
  const currentPage = () => Math.floor(offset() / limit()) + 1
  const totalPages = () => Math.max(1, Math.ceil(props.total / limit()))

  const canPrev = () => offset() > 0
  const canNext = () => offset() + limit() < props.total

  const handlePrev = () => {
    if (!canPrev()) return
    props.onChange({
      ...props.query,
      offset: Math.max(0, offset() - limit()),
    })
  }

  const handleNext = () => {
    if (!canNext()) return
    props.onChange({
      ...props.query,
      offset: offset() + limit(),
    })
  }

  const handleReset = () => {
    props.onChange({
      ...props.query,
      offset: 0,
    })
  }

  const handleLimitChange = (newLimit: number) => {
    if (![25, 50, 250, 500].includes(newLimit)) return
    props.onChange({
      ...props.query,
      limit: newLimit,
      offset: 0, // Reset offset when limit changes
    })
  }

  const controls = () => (
    <PaginationControls
      page={currentPage()}
      pages={totalPages()}
      previousDisabled={!canPrev()}
      nextDisabled={!canNext()}
      onPrevious={handlePrev}
      onNext={handleNext}
      onFirst={handleReset}
      limit={limit()}
      limits={[25, 50, 250, 500]}
      onLimitChange={handleLimitChange}
    />
  )
  return (
    <Show
      when={props.standalone}
      fallback={
        <tr>
          <td colSpan={props.colSpan ?? 6}>{controls()}</td>
        </tr>
      }
    >
      {controls()}
    </Show>
  )
}

export default Pagination
