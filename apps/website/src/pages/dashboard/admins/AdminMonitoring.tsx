import { createResource, createSignal, For, Show, type JSX } from 'solid-js'
import {
  AdminConnectionsQuerySchema,
  AdminConnectionsSchema,
  AdminErrorsSchema,
  AdminBugsSchema,
  type AdminConnections,
  type AdminErrors,
  type AdminBugs,
} from '@gmod/schema/admin/AdminMonitoringSchema.js'
import AdminPanel from '../../../components/AdminPanel.js'
import Pagination from '../../../components/Pagination.js'
import {
  Button,
  ButtonLink,
  DateTime,
  FormField,
  SortableTableHeader,
  StatusBadge,
  TableState,
} from '../../../components/ui/index.js'
import { useI18n } from '../../../i18n.js'
import { QuerySort, type ClientQuery } from '../../../utils/types/QueryTypes.js'
import { adminGet, type AdminListQuery } from './adminApi.js'

type ConnectionFilters = {
  name: string
  connectionState: string
  addonVersion: string
  protocol: string
  minRequestsPerMinute: string
  maxRequestsPerMinute: string
  lastSeenFrom: string
  lastSeenTo: string
}
const emptyConnectionFilters = (): ConnectionFilters => ({
  name: '',
  connectionState: 'all',
  addonVersion: '',
  protocol: 'all',
  minRequestsPerMinute: '',
  maxRequestsPerMinute: '',
  lastSeenFrom: '',
  lastSeenTo: '',
})

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
  const [connectionFilters, setConnectionFilters] = createSignal(emptyConnectionFilters())
  const [filterError, setFilterError] = createSignal(false)
  const editConnectionFilter = (key: keyof ConnectionFilters, value: string) => {
    setConnectionFilters((previous) => ({ ...previous, [key]: value }))
    setFilterError(false)
  }
  const applyConnectionFilters = () => {
    const filters = connectionFilters()
    const timestamp = (value: string) => {
      if (!value) return undefined
      const date = new Date(value)
      return Number.isNaN(date.getTime()) ? value : date.toISOString()
    }
    const patch = {
      ...filters,
      search: connectionSearch().trim(),
      minRequestsPerMinute: filters.minRequestsPerMinute === '' ? undefined : Number(filters.minRequestsPerMinute),
      maxRequestsPerMinute: filters.maxRequestsPerMinute === '' ? undefined : Number(filters.maxRequestsPerMinute),
      lastSeenFrom: timestamp(filters.lastSeenFrom),
      lastSeenTo: timestamp(filters.lastSeenTo),
    }
    if (!AdminConnectionsQuerySchema.safeParse({ ...connections.query(), ...patch }).success) {
      setFilterError(true)
      return
    }
    setFilterError(false)
    connections.change(patch)
  }
  const resetConnectionFilters = () => {
    setConnectionSearch('')
    setConnectionFilters(emptyConnectionFilters())
    setFilterError(false)
    connections.change({
      ...emptyConnectionFilters(),
      search: '',
      minRequestsPerMinute: undefined,
      maxRequestsPerMinute: undefined,
      lastSeenFrom: undefined,
      lastSeenTo: undefined,
    })
  }
  const connectionColumns = () => [
    { key: 'name', label: t('admin_v6.server_name', 'Server name') },
    { key: 'activeSockets', label: t('admin_monitoring.websocket_presence', 'WebSocket presence') },
    { key: 'addonVersion', label: t('admin_monitoring.addon_version', 'Addon version') },
    { key: 'protocol', label: t('admin_monitoring.protocol', 'Observed protocol') },
    { key: 'requestsPerMinute', label: t('admin_monitoring.requests_per_minute', 'Requests / min') },
    { key: 'lastSeenAt', label: t('admin_monitoring.last_activity', 'Last received activity') },
  ]
  const [errorSearch, setErrorSearch] = createSignal('')
  const [bugSearch, setBugSearch] = createSignal('')
  const number = (value: number) => value.toLocaleString(locale())
  const traffic = (value: number | null) => (value === null ? t('ui.unknown', 'Unknown') : number(value))
  const pageTraffic = () => {
    const page = connections.data()
    if (!page || page.telemetry !== 'ready' || page.items.some((server) => server.requestsPerMinute === null))
      return null
    return page.items.reduce((total, server) => total + server.requestsPerMinute!, 0)
  }
  const toolbar = (
    id: string,
    list: typeof connections | typeof errors | typeof bugs,
    search: () => string,
    setSearch: (value: string) => void,
    extra?: JSX.Element,
  ) => (
    <form
      id={`${id}-filters`}
      class="flex min-w-0 flex-wrap items-end gap-3 p-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (list === connections && list.resource.loading) return
        if (list === connections) applyConnectionFilters()
        else list.change({ search: search() })
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
        {list === connections ? t('admin_monitoring.apply_filters', 'Apply filters') : t('admin_v6.search', 'Search')}
      </Button>
      <Show when={list === connections}>
        <Button disabled={list.resource.loading} onClick={resetConnectionFilters}>
          {t('admin_monitoring.reset_filters', 'Reset filters')}
        </Button>
      </Show>
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
    <Show when={(!list.resource.loading || list === connections) && list.data()}>
      {(page) => (
        <Pagination
          query={{ ...list.query(), offset: page().query.offset }}
          total={page().total}
          onChange={(query) => {
            if (!list.resource.loading) list.paginate(query)
          }}
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
                    <DateTime value={incident.lastSeenAt} />
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
        title={t('admin_monitoring.connections', 'Server connections')}
        description={t(
          'admin_monitoring.connections_note',
          'WebSocket presence and authenticated requests received over the last 60 seconds. HTTP activity does not confirm a WebSocket connection. Presence may take up to 90 seconds to expire. Use Refresh to update the data.',
        )}
        icon="server"
        type="none"
        footer={footer(connections)}
      >
        {toolbar('admin-connections', connections, connectionSearch, setConnectionSearch)}
        <Show when={filterError()}>
          <p role="alert" class="px-4 pb-4 text-error">
            {t(
              'admin_monitoring.invalid_filters',
              'Check the request limits and activity dates: minimums must not exceed maximums.',
            )}
          </p>
        </Show>
        <Show when={connections.data()}>
          {(page) => (
            <div class="px-4 pb-4">
              <p class="mb-2 text-xs font-medium text-base-content/65">
                {t('admin_monitoring.current_page', 'Current page')}
              </p>
              <dl class="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <dt class="text-xs text-base-content/65">{t('admin_monitoring.servers_shown', 'Servers shown')}</dt>
                  <dd class="font-semibold tabular-nums">{number(page().items.length)}</dd>
                </div>
                <div>
                  <dt class="text-xs text-base-content/65">
                    {t('admin_monitoring.connected_servers', 'Servers with a confirmed WebSocket')}
                  </dt>
                  <dd class="font-semibold tabular-nums">
                    {page().presence === 'unavailable' || page().items.some((server) => server.activeSockets === null)
                      ? t('ui.unknown', 'Unknown')
                      : number(
                          page().items.filter((server) => server.activeSockets !== null && server.activeSockets > 0)
                            .length,
                        )}
                  </dd>
                </div>
                <div>
                  <dt class="text-xs text-base-content/65">
                    {t('admin_monitoring.requests_per_minute', 'Requests / min')}
                  </dt>
                  <dd class="font-semibold tabular-nums">{traffic(pageTraffic())}</dd>
                </div>
              </dl>
              <Show when={page().trafficObservedAt}>
                <p class="mt-3 text-xs text-base-content/65">
                  {t('admin_monitoring.measured_at', 'Traffic measured at')}{' '}
                  <DateTime value={page().trafficObservedAt} />
                </p>
              </Show>
            </div>
          )}
        </Show>
        <Show when={connections.data()?.presence === 'unavailable'}>
          <p role="status" class="px-4 pb-4 text-warning">
            {t(
              'admin_monitoring.presence_unavailable',
              'Connection monitoring is unavailable. Server connection states are unknown.',
            )}
          </p>
        </Show>
        <Show when={connections.data()?.telemetry === 'unavailable'}>
          <p role="status" class="px-4 pb-4 text-warning">
            {t(
              'admin_monitoring.telemetry_unavailable',
              'Request monitoring is unavailable. Traffic and activity are unknown.',
            )}
          </p>
        </Show>
        <div class="min-w-0 overflow-x-auto">
          <table class="table admin-monitoring-table">
            <thead>
              <tr>
                <For each={connectionColumns()}>
                  {(column) => (
                    <SortableTableHeader
                      label={column.label}
                      active={connections.query().sort === column.key}
                      direction={connections.query().orderBy}
                      onSort={() =>
                        connections.change({
                          sort: column.key,
                          orderBy:
                            connections.query().sort === column.key && connections.query().orderBy === QuerySort.ASC
                              ? QuerySort.DESC
                              : QuerySort.ASC,
                        })
                      }
                    />
                  )}
                </For>
                <th scope="col">{t('admin_monitoring.actions', 'Inspect')}</th>
              </tr>
              <tr class="admin-connection-filters">
                <td>
                  <FormField id="connection-name" label={t('admin_monitoring.filter_name', 'Filter by server name')}>
                    <input
                      id="connection-name"
                      form="admin-connections-filters"
                      class="input input-sm w-full"
                      maxLength={100}
                      value={connectionFilters().name}
                      onInput={(e) => editConnectionFilter('name', e.currentTarget.value)}
                    />
                  </FormField>
                </td>
                <td>
                  <FormField
                    id="connection-presence"
                    label={t('admin_monitoring.filter_presence', 'Filter by WebSocket presence')}
                  >
                    <select
                      id="connection-presence"
                      form="admin-connections-filters"
                      class="select select-sm w-full"
                      value={connectionFilters().connectionState}
                      onChange={(e) => editConnectionFilter('connectionState', e.currentTarget.value)}
                    >
                      <option value="all">{t('admin_monitoring.all_values', 'All')}</option>
                      <option value="connected">{t('admin_monitoring.connected', 'Connected')}</option>
                      <option value="disconnected">
                        {t('admin_monitoring.no_connection', 'No confirmed WebSocket')}
                      </option>
                      <option value="unknown">{t('ui.unknown', 'Unknown')}</option>
                    </select>
                  </FormField>
                </td>
                <td>
                  <FormField
                    id="connection-version"
                    label={t('admin_monitoring.filter_version', 'Filter by addon version')}
                  >
                    <input
                      id="connection-version"
                      form="admin-connections-filters"
                      class="input input-sm w-full"
                      maxLength={64}
                      value={connectionFilters().addonVersion}
                      onInput={(e) => editConnectionFilter('addonVersion', e.currentTarget.value)}
                    />
                  </FormField>
                </td>
                <td>
                  <FormField
                    id="connection-protocol"
                    label={t('admin_monitoring.filter_protocol', 'Filter by protocol')}
                  >
                    <select
                      id="connection-protocol"
                      form="admin-connections-filters"
                      class="select select-sm w-full"
                      value={connectionFilters().protocol}
                      onChange={(e) => editConnectionFilter('protocol', e.currentTarget.value)}
                    >
                      <option value="all">{t('admin_monitoring.all_values', 'All')}</option>
                      <option value="legacy">{t('admin_monitoring.protocol_legacy', 'HTTP / legacy WebSocket')}</option>
                      <option value="acknowledged">
                        {t('admin_monitoring.protocol_acknowledged', 'Acknowledged WebSocket')}
                      </option>
                      <option value="unknown">{t('ui.unknown', 'Unknown')}</option>
                    </select>
                  </FormField>
                </td>
                <td>
                  <div class="grid gap-2">
                    <FormField
                      id="connection-min-requests"
                      label={t('admin_monitoring.min_requests', 'Minimum requests per minute')}
                    >
                      <input
                        id="connection-min-requests"
                        form="admin-connections-filters"
                        class="input input-sm w-full"
                        type="number"
                        min="0"
                        step="1"
                        value={connectionFilters().minRequestsPerMinute}
                        onInput={(e) => editConnectionFilter('minRequestsPerMinute', e.currentTarget.value)}
                      />
                    </FormField>
                    <FormField
                      id="connection-max-requests"
                      label={t('admin_monitoring.max_requests', 'Maximum requests per minute')}
                    >
                      <input
                        id="connection-max-requests"
                        form="admin-connections-filters"
                        class="input input-sm w-full"
                        type="number"
                        min="0"
                        step="1"
                        value={connectionFilters().maxRequestsPerMinute}
                        onInput={(e) => editConnectionFilter('maxRequestsPerMinute', e.currentTarget.value)}
                      />
                    </FormField>
                  </div>
                </td>
                <td>
                  <div class="grid gap-2">
                    <FormField
                      id="connection-activity-from"
                      label={t('admin_monitoring.activity_from', 'Activity from')}
                    >
                      <input
                        id="connection-activity-from"
                        form="admin-connections-filters"
                        class="input input-sm w-full"
                        type="datetime-local"
                        value={connectionFilters().lastSeenFrom}
                        onInput={(e) => editConnectionFilter('lastSeenFrom', e.currentTarget.value)}
                      />
                    </FormField>
                    <FormField
                      id="connection-activity-until"
                      label={t('admin_monitoring.activity_until', 'Activity until')}
                    >
                      <input
                        id="connection-activity-until"
                        form="admin-connections-filters"
                        class="input input-sm w-full"
                        type="datetime-local"
                        value={connectionFilters().lastSeenTo}
                        onInput={(e) => editConnectionFilter('lastSeenTo', e.currentTarget.value)}
                      />
                    </FormField>
                  </div>
                </td>
                <td />
              </tr>
            </thead>
            <tbody>
              <TableState
                colSpan={7}
                loading={connections.resource.loading && !connections.data()}
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
                        <p class="mt-1 font-mono text-xs text-base-content/65 [overflow-wrap:anywhere]">{server.id}</p>
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
                              : t('admin_monitoring.no_connection', 'No confirmed WebSocket')}
                        </StatusBadge>
                        <p class="mt-1 text-xs text-base-content/65">
                          {t('admin_monitoring.sockets', 'Sockets')}: {traffic(server.activeSockets)}
                        </p>
                      </td>
                      <td class="font-mono">{server.addonVersion || t('ui.unknown', 'Unknown')}</td>
                      <td>
                        <StatusBadge tone={server.protocol === 'acknowledged' ? 'info' : 'neutral'}>
                          {server.protocol === 'acknowledged'
                            ? t('admin_monitoring.protocol_acknowledged', 'Acknowledged WebSocket')
                            : server.protocol === 'legacy'
                              ? t('admin_monitoring.protocol_legacy', 'HTTP / legacy WebSocket')
                              : t('ui.unknown', 'Unknown')}
                        </StatusBadge>
                      </td>
                      <td class="tabular-nums">
                        <strong>{traffic(server.requestsPerMinute)}</strong>
                        <p class="mt-1 whitespace-nowrap text-xs text-base-content/65">
                          {t(
                            'admin_monitoring.request_breakdown',
                            'HTTP: {1} · WS: {2}',
                            traffic(server.httpRequestsPerMinute),
                            traffic(server.websocketRequestsPerMinute),
                          )}
                        </p>
                        <Show when={server.requestsPerMinute === 0}>
                          <p class="mt-1 text-xs text-base-content/65">
                            {t('admin_monitoring.no_recent_requests', 'No requests in the last 60 seconds')}
                          </p>
                        </Show>
                      </td>
                      <td>
                        <Show
                          when={server.lastSeenAt}
                          fallback={
                            connections.data()?.telemetry === 'unavailable'
                              ? t('ui.unknown', 'Unknown')
                              : t('admin_monitoring.no_activity', 'No recorded activity')
                          }
                        >
                          <DateTime value={server.lastSeenAt} />
                        </Show>
                      </td>
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
