import { createEffect, createMemo, createSignal, on, type Accessor } from 'solid-js'
import { QuerySort, type ClientQuery } from '../utils/types/QueryTypes.js'

const pageSizes = [25, 50, 250, 500] as const

/** Paginate an already loaded list without changing the full snapshot used by actions or quotas. */
export function createListPagination<T>(
  source: Accessor<readonly T[] | undefined>,
  options: { initialLimit?: number; resetKey?: Accessor<unknown> } = {},
) {
  const initialLimit = pageSizes.includes(options.initialLimit as (typeof pageSizes)[number])
    ? options.initialLimit!
    : pageSizes[0]
  const [requested, setRequested] = createSignal<ClientQuery>({
    limit: initialLimit,
    offset: 0,
    sort: 'id',
    orderBy: QuerySort.ASC,
  })
  const all = createMemo<readonly T[]>(() => {
    const items = source()
    return Array.isArray(items) ? items : []
  })
  const total = () => all().length
  const query = createMemo<ClientQuery>(() => {
    const current = requested()
    const lastOffset = Math.max(0, Math.ceil(total() / current.limit) - 1) * current.limit
    return { ...current, offset: Math.min(current.offset, lastOffset) }
  })
  const reset = () => setRequested((previous) => ({ ...previous, offset: 0 }))
  // Persist the corrected page after deletion/filtering so later additions cannot restore a stale offset.
  createEffect(() => {
    if (source() === undefined) return
    const current = query()
    if (current.offset !== requested().offset) setRequested(current)
  })
  if (options.resetKey) createEffect(on(options.resetKey, reset, { defer: true }))

  return {
    items: () => all().slice(query().offset, query().offset + query().limit),
    total,
    query,
    visible: () => total() > pageSizes[0],
    reset,
    onChange(next: ClientQuery) {
      if (!pageSizes.includes(next.limit as (typeof pageSizes)[number])) return
      const offset = Number.isFinite(next.offset) ? Math.max(0, Math.floor(next.offset / next.limit) * next.limit) : 0
      setRequested({ ...next, offset: next.limit !== requested().limit ? 0 : offset })
    },
  }
}
