// ServerWarns.tsx
import { Component, createResource, createSignal, For, Show } from 'solid-js'
import { DateTime, TableState } from '../../../../components/ui/index.js'
import AdminPanel from '../../../../components/AdminPanel'
import { useI18n } from '../../../../i18n'
import Pagination from '../../../../components/Pagination'
import { ClientQuery, QuerySort, ServerQuery } from '../../../../utils/types/QueryTypes'
import { NeedAddon } from '../../../../components/popup/NeedAddons'
import { fetchAPI } from '../../../../utils/api'

interface Warn {
  id: number
  serverID: string
  userSteamID64: string
  adminSteamID64: string
  reason: string
  createdAt: string
  updatedAt: string
}

interface WarnResponse {
  warns: Warn[]
  query: ServerQuery
}

const ServerWarns: Component = () => {
  const { t } = useI18n()

  // 1) Our local query state (offset, limit, sort, orderBy)
  // Omit 'total' so that setting it doesn't re-fetch
  const [query, setQuery] = createSignal<ClientQuery>({
    limit: 25,
    offset: 0,
    sort: 'createdAt',
    orderBy: QuerySort.DESC,
  })

  // 2) The fetcher uses your query to form the request
  async function fetchWarns(q: ClientQuery) {
    const res = await fetchAPI(
      `/users/:discordID/guilds/:guildID/servers/:serverID/warns` +
        `?offset=${q.offset}` +
        `&limit=${q.limit}` +
        `&sort=${q.sort}` +
        `&orderBy=${q.orderBy}`,
      'GET',
    )

    if (!res.ok) {
      throw new Error('Failed to fetch warns')
    }
    return (await res.json()) as WarnResponse
  }

  // 3) Create the resource, bound to the 'query' signal
  const [warnsData, { refetch }] = createResource(query, fetchWarns, {
    // Provide initialValue so warnsData() is never undefined
    initialValue: {
      warns: [],
      query: {
        ...query(),
        total: 0,
      },
    },
  })

  return (
    <>
      <NeedAddon
        addons={[
          {
            name: 'AWarn3',
            link: 'https://www.gmodstore.com/market/view/awarn3-warning-system',
          },
        ]}
      />
      <AdminPanel
        title={t('dashboard.server.warns.title', 'Warnings')}
        description={t(
          'dashboard.server.warns.description',
          'View warnings received from AWarn3, with the player, administrator and reason. Warnings are managed in game.',
        )}
        type="none"
        footer={
          !warnsData.loading && !warnsData.error ? (
            <Pagination query={query()} total={warnsData().query.total} onChange={setQuery} standalone />
          ) : undefined
        }
      >
        <table class="table">
          <thead>
            <tr class="text-l">
              <th>{t('dashboard.server.date', 'Date')}</th>
              <th>{t('dashboard.server.admin', 'Admin')}</th>
              <th>{t('dashboard.server.player', 'Player')}</th>
              <th>{t('dashboard.server.reason', 'Reason')}</th>
            </tr>
          </thead>
          <tbody>
            <TableState
              colSpan={4}
              loading={warnsData.loading}
              error={warnsData.error}
              errorLabel={t('dashboard.server.warns.load_error', 'Unable to load warning history. Try again.')}
              emptyLabel={t(
                'dashboard.server.warns.empty',
                'No warnings have been received for this server. AWarn3 must be installed to send warnings.',
              )}
              empty={!warnsData.loading && !warnsData.error && warnsData().warns.length === 0}
              onRetry={() => refetch()}
            >
              {/* RENDER WARNS ROWS */}
              <For each={warnsData().warns}>
                {(warn) => (
                  <tr>
                    <td class="w-1/6 text-base-content/70 text-nowrap">
                      <DateTime value={warn.createdAt} />
                    </td>
                    <td class="w-1/8 text-nowrap">{warn.adminSteamID64}</td>
                    <td class="w-1/8 text-nowrap">{warn.userSteamID64}</td>
                    <td class="wrap-break-word">{warn.reason}</td>
                  </tr>
                )}
              </For>
            </TableState>
          </tbody>
        </table>
      </AdminPanel>
    </>
  )
}

export default ServerWarns
