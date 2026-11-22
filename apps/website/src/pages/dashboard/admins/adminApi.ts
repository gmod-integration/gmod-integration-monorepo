import { createEffect, createResource, createSignal } from 'solid-js'
import { fetchAPI } from '../../../utils/api.js'
import { QuerySort, type ClientQuery } from '../../../utils/types/QueryTypes.js'

export interface AdminListQuery extends ClientQuery {
  search: string
  [key: string]: unknown
}

export interface AdminPage<T> {
  items: T[]
  total: number
  query: AdminListQuery
}

export async function adminGet<T>(path: string, query?: Readonly<Record<string, unknown>>): Promise<T> {
  const parameters = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (['string', 'number', 'boolean'].includes(typeof value) && value !== '') parameters.set(key, String(value))
  }
  const suffix = parameters.size ? `?${parameters}` : ''
  const response = await fetchAPI(`/v6/admin${path}${suffix}`, 'GET')
  if (!response.ok) throw new Error('Administrative request failed')
  return await response.json()
}

export async function adminMutate<T = unknown>(
  path: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body: unknown,
): Promise<T> {
  const response = await fetchAPI(`/v6/admin${path}`, method, body)
  if (!response.ok) throw new Error('Administrative action failed')
  return await response.json()
}

/** Server pagination owns totals; filtering never slices a partial page in the browser. */
export function createAdminList<T>(
  path: string,
  initial: Partial<AdminListQuery> = {},
  itemSchema?: { parse: (value: unknown) => T },
) {
  const [query, setQuery] = createSignal<AdminListQuery>({
    limit: 25,
    offset: 0,
    sort: 'createdAt',
    orderBy: QuerySort.DESC,
    search: '',
    ...initial,
  })
  const [results, { refetch }] = createResource(query, async (value) => {
    const page = await adminGet<AdminPage<T>>(path, value)
    if (!Array.isArray(page.items) || !Number.isSafeInteger(page.total) || page.total < 0 || !page.query)
      throw new Error('Invalid administrative list')
    return { ...page, items: itemSchema ? page.items.map((item) => itemSchema.parse(item)) : page.items }
  })
  createEffect(() => {
    if (results.loading || results.error) return
    const page = results()
    if (page && Number.isSafeInteger(page.query.offset) && page.query.offset !== query().offset)
      setQuery((previous) => ({ ...previous, offset: page.query.offset }))
  })
  return {
    query,
    setQuery,
    results,
    refetch,
    paginate(next: ClientQuery) {
      setQuery((previous) => ({ ...previous, limit: next.limit, offset: next.offset }))
    },
    change(patch: Partial<AdminListQuery>) {
      setQuery((previous) => ({ ...previous, offset: 0, ...patch }))
    },
  }
}
