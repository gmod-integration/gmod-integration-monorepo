import { Button, Icon } from './ui/index.js'
import type { Component } from 'solid-js'
import { type ClientQuery } from '../utils/types/QueryTypes.js'
import { useI18n } from '../i18n.js'

interface PaginationProps {
  query: ClientQuery
  total: number
  onChange: (newQuery: ClientQuery) => void
  colSpan?: number
}

const Pagination: Component<PaginationProps> = (props) => {
  const { t } = useI18n()
  const limit = () => (Number.isFinite(props.query.limit) && props.query.limit > 0 ? props.query.limit : 25)
  const offset = () => Math.max(0, props.query.offset)
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

  const handleLimitChange = (event: Event) => {
    const newLimit = parseInt((event.target as HTMLSelectElement).value, 10)
    if (![25, 50, 250, 500].includes(newLimit)) return
    props.onChange({
      ...props.query,
      limit: newLimit,
      offset: 0, // Reset offset when limit changes
    })
  }

  return (
    <tr>
      <td colSpan={props.colSpan ?? 6}>
        <nav
          class="join flex justify-center [&>.join-item]:border-2 [&>.join-item]:border-base-200 [&>.join-item:not(:first-child)]:border-l-0"
          aria-label={t('ui.pagination', 'Pagination')}
        >
          <Button
            type="button"
            size="sm"
            class="join-item bg-base-200/20"
            aria-label={t('ui.previous_page', 'Previous page')}
            onClick={handlePrev}
            disabled={!canPrev()}
          >
            <Icon name="chevron-left" aria-hidden="true" />
          </Button>

          <Button
            type="button"
            size="sm"
            class="join-item bg-base-200/20"
            title={t('ui.first_page', 'Back to the first page')}
            onClick={handleReset}
          >
            {`${currentPage()} / ${totalPages()}`}
          </Button>

          <select
            class="btn btn-sm join-item bg-base-200/20"
            aria-label={t('ui.rows_per_page', 'Rows per page')}
            onChange={handleLimitChange}
            value={limit()}
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={250}>250</option>
            <option value={500}>500</option>
          </select>

          <Button
            type="button"
            size="sm"
            class="join-item bg-base-200/20"
            aria-label={t('ui.next_page', 'Next page')}
            onClick={handleNext}
            disabled={!canNext()}
          >
            <Icon name="chevron-right" aria-hidden="true" />
          </Button>
        </nav>
      </td>
    </tr>
  )
}

export default Pagination
