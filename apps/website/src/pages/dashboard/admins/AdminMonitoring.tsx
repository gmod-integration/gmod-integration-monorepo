import { createResource, createSignal, For, Show, type JSX } from 'solid-js'
import {
  AdminConnectionsSchema,
  AdminErrorsSchema,
  AdminBugsSchema,
  type AdminConnections,
  type AdminErrors,
  type AdminBugs,
} from '@gmod/schema/admin/AdminMonitoringSchema.js'
import AdminPanel from '../../../components/AdminPanel.js'
import Pagination from '../../../components/Pagination.js'
import { Button, ButtonLink, FormField, StatusBadge, TableState } from '../../../components/ui/index.js'
import { useI18n } from '../../../i18n.js'
import { QuerySort, type ClientQuery } from '../../../utils/types/QueryTypes.js'
import { adminGet, type AdminListQuery } from './adminApi.js'

function monitor<T extends { total: number; query: { offset: number } }>(
  path: string,
  schema: { parse: (raw: unknown) => T },
  filters: Record<string, unknown> = {},
) {
  const [query, setQuery] = createSignal<AdminListQuery>({
    offset: 0,
    limit: 25,
    sort: 'createdAt',
    orderBy: QuerySort.DESC,
    search: '',
    ...filters,
  })
  const [resource, { refetch }] = createResource(query, async (q) =>
    schema.parse(await adminGet(`/monitoring/${path}`, q)),
  )
  return {
    query,
    resource,
    refetch,
    data: () => (resource.error ? undefined : resource()),
    change: (patch: Partial<AdminListQuery>) => setQuery((previous) => ({ ...previous, offset: 0, ...patch })),
    paginate: (next: ClientQuery) => setQuery((previous) => ({ ...previous, limit: next.limit, offset: next.offset })),
  }
}

export default function AdminMonitoring() {
  const { t, locale } = useI18n()
  const connections = monitor<AdminConnections>('connections', AdminConnectionsSchema)
  const errors = monitor<AdminErrors>('errors', AdminErrorsSchema, {
    days: 7,
    source: 'integration',
    recurringOnly: false,
  })
  const bugs = monitor<AdminBugs>('bugs', AdminBugsSchema, { days: 7, state: 'open', recurringOnly: true })
  const [connectionSearch, setConnectionSearch] = createSignal('')
  const [errorSearch, setErrorSearch] = createSignal('')
  const [bugSearch, setBugSearch] = createSignal('')
  const number = (value: number) => value.toLocaleString(locale())
  const date = (value: string) => new Date(value).toLocaleString(locale())
  const toolbar = (
    id: string,
    list: typeof connections | typeof errors | typeof bugs,
    search: () => string,
    setSearch: (value: string) => void,
    extra?: JSX.Element,
  ) => (
    <form
      class="flex min-w-0 flex-wrap items-end gap-3 p-4"
      onSubmit={(event) => {
        event.preventDefault()
        list.change({ search: search() })
      }}
    >
      <div class="min-w-0 basis-full sm:basis-64 sm:flex-1">
        <FormField id={`${id}-search`} label={t('admin_v6.search', 'Search')}>
          <input
            id={`${id}-search`}
            class="input w-full"
            type="search"
            maxLength={100}
            value={search()}
            onInput={(event) => setSearch(event.currentTarget.value)}
          />
        </FormField>
      </div>
      <Button type="submit" loading={list.resource.loading}>
        {t('admin_v6.search', 'Search')}
      </Button>
      {extra}
      <Button loading={list.resource.loading} onClick={() => void list.refetch()}>
        {t('admin_v6.refresh', 'Refresh')}
      </Button>
    </form>
  )
  const period = (id: string, list: typeof errors | typeof bugs) => (
    <>
      <FormField id={`${id}-days`} label={t('admin_v6.analytics_window', 'Period')}>
        <select
          id={`${id}-days`}
          class="select"
          value={Number(list.query().days)}
          onChange={(e) => list.change({ days: Number(e.currentTarget.value) })}
        >
          <For each={[7, 30, 90]}>
            {(days) => <option value={days}>{t('admin_monitoring.days', 'Last {1} days', days)}</option>}
          </For>
        </select>
      </FormField>
      <FormField id={`${id}-recurring`} label={t('admin_monitoring.recurrence', 'Recurrence')}>
        <select
          id={`${id}-recurring`}
          class="select"
          value={String(list.query().recurringOnly)}
          onChange={(e) => list.change({ recurringOnly: e.currentTarget.value === 'true' })}
        >
          <option value="false">{t('admin_monitoring.all_groups', 'All groups')}</option>
          <option value="true">{t('admin_monitoring.recurring', 'At least two reports')}</option>
        </select>
      </FormField>
    </>
  )
  const footer = (list: typeof connections | typeof errors | typeof bugs) => (
    <Show when={!list.resource.loading && list.data()}>
      {(page) => (
        <Pagination
          query={{ ...list.query(), offset: page().query.offset }}
          total={page().total}
          onChange={list.paginate}
          standalone
        />
      )}
    </Show>
  )
  const incidents = (list: typeof errors | typeof bugs, isError: boolean) => (
    <div class="min-w-0 overflow-x-auto">
      <table class="table admin-monitoring-table">
        <thead>
          <tr>
            <th>{t('admin_monitoring.summary', 'Summary')}</th>
            <th>{t('admin_monitoring.reports', 'Reports')}</th>
            <th>{t('admin_monitoring.servers', 'Servers')}</th>
            <Show when={isError}>
              <th>{t('admin_monitoring.occurrences', 'Occurrences')}</th>
            </Show>
            <th>{t('admin_monitoring.last_seen', 'Last received')}</th>
          </tr>
        </thead>
        <tbody>
          <TableState
            colSpan={isError ? 5 : 4}
            loading={list.resource.loading}
            error={list.resource.error}
            empty={list.data()?.items.length === 0}
            onRetry={() => void list.refetch()}
          >
            <For each={list.data()?.items}>
              {(incident) => (
                <tr>
                  <td class="max-w-xl whitespace-pre-wrap [overflow-wrap:anywhere]">
                    {incident.summary || t('admin_monitoring.no_summary', 'No summary available')}
                    <Show when={'realm' in incident}>
                      <div class="mt-1 text-xs text-base-content/65">
                        {(incident as AdminErrors['items'][number]).realm === 'client'
                          ? t('admin_monitoring.realm_client', 'Player client')
                          : (incident as AdminErrors['items'][number]).realm === 'server'
                            ? t('admin_monitoring.realm_server', 'Game server')
                            : t('ui.unknown', 'Unknown')}
                      </div>
                    </Show>
                  </td>
                  <td class="tabular-nums">{number(incident.reports)}</td>
                  <td class="tabular-nums">{number(incident.serverCount)}</td>
                  <Show when={isError}>
                    <td class="tabular-nums">{number((incident as AdminErrors['items'][number]).occurrences)}</td>
                  </Show>
                  <td>
                    <time dateTime={incident.lastSeenAt}>{date(incident.lastSeenAt)}</time>
                  </td>
                </tr>
              )}
            </For>
          </TableState>
        </tbody>
      </table>
    </div>
  )
  return (
    <>
      <AdminPanel
        title={t('admin_monitoring.connections', 'WebSocket connections')}
        description={t(
          'admin_monitoring.connections_note',
          'Connections confirmed by the gateway for each registered server. A disconnected server may remain visible for up to 90 seconds. Missing confirmation is shown separately from unavailable monitoring.',
        )}
        icon="server"
        type="none"
        footer={footer(connections)}
      >
        {toolbar('admin-connections', connections, connectionSearch, setConnectionSearch)}
        <Show when={connections.data()?.presence === 'unavailable'}>
          <p role="status" class="px-4 pb-4 text-warning">
            {t(
              'admin_monitoring.presence_unavailable',
              'Connection monitoring is unavailable. Server connection states are unknown.',
            )}
          </p>
        </Show>
        <div class="min-w-0 overflow-x-auto">
          <table class="table admin-monitoring-table">
            <thead>
              <tr>
                <th>{t('admin_v6.server_name', 'Server name')}</th>
                <th>{t('admin_monitoring.connection', 'Connection')}</th>
                <th>{t('admin_monitoring.sockets', 'Sockets')}</th>
                <th>{t('admin_monitoring.actions', 'Inspect')}</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                colSpan={4}
                loading={connections.resource.loading}
                error={connections.resource.error}
                empty={connections.data()?.items.length === 0}
                onRetry={() => void connections.refetch()}
              >
                <For each={connections.data()?.items}>
                  {(server) => (
                    <tr>
                      <td>
                        <strong class="[overflow-wrap:anywhere]">{server.name}</strong>
                        <p class="text-xs text-base-content/65">{server.guildName}</p>
                      </td>
                      <td>
                        <StatusBadge
                          tone={
                            server.activeSockets === null ? 'warning' : server.activeSockets > 0 ? 'success' : 'neutral'
                          }
                        >
                          {server.activeSockets === null
                            ? t('ui.unknown', 'Unknown')
                            : server.activeSockets > 0
                              ? t('admin_monitoring.connected', 'Connected')
                              : t('admin_monitoring.no_connection', 'No confirmed connection')}
                        </StatusBadge>
                      </td>
                      <td>{server.activeSockets === null ? '—' : number(server.activeSockets)}</td>
                      <td>
                        <ButtonLink
                          size="sm"
                          href={`/dashboard/admins/previews?serverID=${encodeURIComponent(server.id)}`}
                        >
                          {t('admin_previews.preview', 'Preview')}
                        </ButtonLink>
                      </td>
                    </tr>
                  )}
                </For>
              </TableState>
            </tbody>
          </table>
        </div>
      </AdminPanel>
      <AdminPanel
        title={t('admin_monitoring.errors', 'Detected Lua errors')}
        description={t(
          'admin_monitoring.errors_note',
          'Automatically groups received Lua reports by addon name, realm and the first 1,000 message characters. Integration detection uses addon names and paths; it is a hint, not a confirmed cause. Counts describe received reports, not all errors that occurred.',
        )}
        icon="activity"
        type="none"
        footer={footer(errors)}
      >
        {toolbar(
          'admin-errors',
          errors,
          errorSearch,
          setErrorSearch,
          <>
            {period('admin-errors', errors)}
            <FormField id="admin-errors-source" label={t('admin_monitoring.source', 'Source')}>
              <select
                id="admin-errors-source"
                class="select"
                value={String(errors.query().source)}
                onChange={(e) => errors.change({ source: e.currentTarget.value })}
              >
                <option value="integration">Gmod Integration</option>
                <option value="all">{t('admin_monitoring.all_addons', 'All addons')}</option>
              </select>
            </FormField>
          </>,
        )}
        {incidents(errors, true)}
      </AdminPanel>
      <AdminPanel
        title={t('admin_monitoring.bugs', 'Recurring player bug reports')}
        description={t(
          'admin_monitoring.bugs_note',
          'Groups player reports by their first 1,000 description characters, ignoring case and surrounding spaces. Similar wording does not establish a shared cause. Raw player details and stacks are omitted.',
        )}
        icon="messages-square"
        type="none"
        footer={footer(bugs)}
      >
        {toolbar(
          'admin-bugs',
          bugs,
          bugSearch,
          setBugSearch,
          <>
            {period('admin-bugs', bugs)}
            <FormField id="admin-bugs-state" label={t('admin_monitoring.state', 'Report state')}>
              <select
                id="admin-bugs-state"
                class="select"
                value={String(bugs.query().state)}
                onChange={(e) => bugs.change({ state: e.currentTarget.value })}
              >
                <option value="open">{t('admin_monitoring.open', 'Open')}</option>
                <option value="all">{t('admin_monitoring.all_states', 'All states')}</option>
              </select>
            </FormField>
          </>,
        )}
        {incidents(bugs, false)}
      </AdminPanel>
    </>
  )
}
