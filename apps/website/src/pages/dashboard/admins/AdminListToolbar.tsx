import { For, type JSX } from 'solid-js'
import { Button, FormField } from '../../../components/ui/index.js'
import { useI18n } from '../../../i18n.js'
import { QuerySort } from '../../../utils/types/QueryTypes.js'

export default function AdminListToolbar(props: {
  id: string
  search: string
  onSearchInput: (value: string) => void
  onSearch: () => void
  sort: string
  sorts: { value: string; label: string }[]
  onSort: (value: string) => void
  orderBy: QuerySort
  onOrder: (value: QuerySort) => void
  loading?: boolean
  onRefresh: () => void
  children?: JSX.Element
}) {
  const { t } = useI18n()
  return (
    <form
      class="flex min-w-0 flex-wrap items-end gap-3 p-4"
      onSubmit={(event) => {
        event.preventDefault()
        props.onSearch()
      }}
    >
      <div class="min-w-0 flex-1 sm:min-w-64">
        <FormField id={`${props.id}-search`} label={t('admin_v6.search', 'Search')}>
          <input
            id={`${props.id}-search`}
            class="input w-full"
            type="search"
            maxLength={100}
            value={props.search}
            onInput={(event) => props.onSearchInput(event.currentTarget.value)}
          />
        </FormField>
      </div>
      <Button type="submit" loading={props.loading}>
        {t('admin_v6.search', 'Search')}
      </Button>
      {props.children}
      <FormField id={`${props.id}-sort`} label={t('admin_v6.sort_by', 'Sort by')}>
        <select
          id={`${props.id}-sort`}
          class="select"
          value={props.sort}
          onChange={(event) => props.onSort(event.currentTarget.value)}
        >
          <For each={props.sorts}>{(sort) => <option value={sort.value}>{sort.label}</option>}</For>
        </select>
      </FormField>
      <FormField id={`${props.id}-order`} label={t('admin_v6.sort_order', 'Order')}>
        <select
          id={`${props.id}-order`}
          class="select"
          value={props.orderBy}
          onChange={(event) => props.onOrder(event.currentTarget.value as QuerySort)}
        >
          <option value={QuerySort.DESC}>{t('admin_v6.descending', 'Descending')}</option>
          <option value={QuerySort.ASC}>{t('admin_v6.ascending', 'Ascending')}</option>
        </select>
      </FormField>
      <Button loading={props.loading} onClick={props.onRefresh}>
        {t('admin_v6.refresh', 'Refresh')}
      </Button>
    </form>
  )
}
