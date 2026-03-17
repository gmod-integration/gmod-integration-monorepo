import { Component, createResource, createSignal, For, Match, Show, Switch } from 'solid-js'
import AdminPanel from '../../../../components/AdminPanel'
import AdminModal from '../../../../components/AdminModal'
import Pagination from '../../../../components/Pagination'
import { useI18n } from '../../../../i18n'
import { convertSecToTime } from '../../../../utils/convertSecToTime'
import { fetchAPI } from '../../../../utils/api'
import { ClientQuery, QuerySort } from '../../../../utils/types/QueryTypes'

const fetchPlayers = async () => {
  const res = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/players', 'GET')
  if (!res.ok) {
    return {}
  }
  return await res.json()
}

class Player {
  steam_id: string
  name: string
  rank: number
  total_time: number
  total_connect: number
  bypassMaintenance: boolean

  constructor(
    steam_id: string,
    name: string,
    rank: number,
    total_time: number,
    total_connect: number,
    bypassMaintenance: boolean,
  ) {
    this.steam_id = steam_id
    this.name = name
    this.rank = rank
    this.total_time = total_time
    this.total_connect = total_connect
    this.bypassMaintenance = bypassMaintenance
  }
}

const ServerPlayer: Component = () => {
  const [playersList, { mutate }] = createResource('playersList', fetchPlayers)
  const [currentPlayers, setCurrentPlayers] = createSignal(new Player('', '', 0, 0, 0, false))
  const [sortInfo, setSortInfo] = createSignal({
    dsc: true,
    lastKey: '',
  })
  const [query, setQuery] = createSignal<ClientQuery>({
    limit: 50,
    offset: 0,
    sort: 'name',
    orderBy: QuerySort.DESC,
  })
  const { t } = useI18n()

  const [loadSearch, setLoadSearch] = createSignal(false)
  const [searchValue, setSearchValue] = createSignal('')

  async function sortPlayerBy(
    key: string = 'name',
    inverseOrder: boolean = true,
    offset: number = 0,
    search: string = '',
  ) {
    const sortInfoValue = sortInfo()

    if (inverseOrder) {
      setSortInfo({
        dsc: sortInfoValue.lastKey === key ? !sortInfoValue.dsc : false,
        lastKey: key,
      })
    }

    const newQuery: ClientQuery = {
      ...query(),
      sort: key,
      orderBy: !sortInfo().dsc ? QuerySort.ASC : QuerySort.DESC,
      offset: offset,
    }

    const params = {
      order: newQuery.orderBy,
      limit: newQuery.limit,
      offset: newQuery.offset,
      searchColum: key,
      search: search,
    }

    // transform the object into a query string
    const queryString = Object.keys(params)
      .map((k) => `${k}=${(params as Record<string, any>)[k]}`)
      .join('&')

    setLoadSearch(true)
    mutate(() => {
      return {
        ...playersList(),
        rows: [],
      }
    })
    const res = await fetchAPI(`/users/:discordID/guilds/:guildID/servers/:serverID/players?${queryString}`, 'GET')
    setLoadSearch(false)
    if (!res.ok) {
      return
    }

    const data = await res.json()
    mutate(() => data)
  }

  function getSortIcon(key: string) {
    const sortInfoValue = sortInfo()
    if (sortInfoValue.lastKey === key) {
      return sortInfoValue.dsc ? 'fa-solid fa-sort-down' : 'fa-solid fa-sort-up'
    }
    return 'fa-solid fa-sort'
  }

  async function handleQueryChange(newQuery: ClientQuery) {
    setQuery(newQuery)
    await sortPlayerBy(newQuery.sort, false, newQuery.offset, searchValue())
  }

  async function savePlayer() {
    const res = await fetchAPI(
      `/users/:discordID/guilds/:guildID/servers/:serverID/players/${currentPlayers().steam_id}`,
      'PUT',
      currentPlayers(),
    )
    if (!res.ok) {
      return
    }
    const ply = await res.json()
    mutate((prevPlayers) => {
      if (!prevPlayers) return prevPlayers
      return {
        ...prevPlayers,
        rows: prevPlayers.rows.map((p) =>
          p.steam_id === ply.steam_id ? { ...p, bypassMaintenance: ply.bypassMaintenance } : p,
        ),
      }
    })
  }

  const [inputID, setInputID] = createSignal(0)
  return (
    <>
      <AdminModal title={t('dashboard.server.edit_player.title', 'Edit Player')} id="edit_player">
        <div class="fieldset">
          <label class="label">
            <span>{t('dashboard.server.edit_player.bypass_maintenance', 'ByPass Maintenance')}</span>
          </label>
          <select
            class="select"
            disabled={playersList.loading}
            value={currentPlayers().bypassMaintenance ? 'true' : 'false'}
            onChange={(e) => {
              currentPlayers().bypassMaintenance = e.currentTarget.value === 'true'
            }}
          >
            <option value="true">{t('dashboard.server.edit_player.yes', 'Yes')}</option>
            <option value="false">{t('dashboard.server.edit_player.no', 'No')}</option>
          </select>
        </div>

        <button
          class="btn btn-base-200 mt-2"
          disabled={playersList.loading}
          onClick={async () => {
            // @ts-ignore
            edit_player.close()
            await savePlayer()
          }}
        >
          {t('dashboard.server.edit_player.save', 'Save')}
        </button>
      </AdminModal>

      <AdminPanel
        title={t('dashboard.server.players_database.title', 'Players Database')}
        description={t('dashboard.server.players_database.description', 'List of all players in the server')}
        type="none"
      >
        {/* search*/}
        <div class="p-4">
          <label class="input flex items-center p-2 gap-4">
            <input
              type="text"
              class="grow"
              placeholder="Search for SteamID64, Name, Rank..."
              onInput={(e) => {
                const value = e.currentTarget.value
                setSearchValue(value)
                const currentID = inputID() + 1
                setInputID(currentID)
                setTimeout(async () => {
                  if (currentID === inputID()) {
                    console.log(value)
                    await sortPlayerBy(query().sort, false, 0, value)
                  }
                }, 400)
              }}
            />
            <i class="fa-solid fa-search"></i>
          </label>
        </div>
        <table class="table table-auto table-fixed border-t border-base-200 rounded-none">
          <thead>
            <tr class="text-l hover:cursor-pointer">
              <th class="w-1/4" onClick={() => sortPlayerBy('name')}>
                {t('dashboard.server.players_database.name', 'Name')} <i class={getSortIcon('name')}></i>
              </th>
              <th class="w-1/6 text-center" onClick={() => sortPlayerBy('rank')}>
                {t('dashboard.server.players_database.rank', 'Rank')} <i class={getSortIcon('rank')}></i>
              </th>
              <th class="w-1/6 text-center" onClick={() => sortPlayerBy('total_time')}>
                {t('dashboard.server.players_database.total_time', 'Total Time')}{' '}
                <i class={getSortIcon('total_time')}></i>
              </th>
              <th class="w-1/6 text-center" onClick={() => sortPlayerBy('total_connect')}>
                {t('dashboard.server.players_database.total_connect', 'Total Connect')}{' '}
                <i class={getSortIcon('total_connect')}></i>
              </th>
              <th class="w-1/6 text-center" onClick={() => sortPlayerBy('bypassMaintenance')}>
                {t('dashboard.server.players_database.bypass_maintenance', 'Bypass Maintenance')}{' '}
                <i class={getSortIcon('bypassMaintenance')}></i>
              </th>
              <th class="hover:cursor-default w-1/6 text-center">
                {t('dashboard.server.players_database.actions', 'Actions')}
              </th>
            </tr>
          </thead>
          <tbody>
            <Show when={!playersList.loading}>
              <Show when={loadSearch()}>
                <tr>
                  <td colSpan="6">
                    <div class="flex justify-center h-36">
                      <div class="loading loading-spinner loading-lg"></div>
                    </div>
                  </td>
                </tr>
              </Show>
              <For each={playersList().rows}>
                {(player) => (
                  <tr>
                    <td class="w-1/4 truncate overflow-hidden text-ellipsis whitespace-nowrap">
                      <span>{player.name}</span>
                    </td>
                    <td class="w-1/6 text-center">{player.rank}</td>
                    <td class="w-1/6 text-center">{convertSecToTime(player.total_time)}</td>
                    <td class="w-1/6 text-center">{player.total_connect}</td>
                    <td class="w-1/6 text-center">
                      <div class="flex gap-2 justify-center">
                        {player.bypassMaintenance ? (
                          <i class="fa-solid fa-check text-success"></i>
                        ) : (
                          <i class="fa-solid fa-times text-error"></i>
                        )}
                      </div>
                    </td>
                    <td class="w-1/6">
                      <div class="flex gap-2 justify-center">
                        <a
                          href={`https://steamcommunity.com/profiles/${player.steam_id}`}
                          target="_blank"
                          class="tooltip tooltip-info"
                          data-tip={t('dashboard.server.players_database.steam', 'Steam')}
                        >
                          <i class="fa-brands fa-steam"></i>
                        </a>
                        <div
                          class="tooltip tooltip-info"
                          data-tip={t('dashboard.server.players_database.edit', 'Edit')}
                        >
                          <i
                            class="hover:cursor-pointer fa-solid fa-edit"
                            onClick={() => {
                              setCurrentPlayers(player)
                              // @ts-ignore
                              edit_player.showModal()
                            }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </For>
              <Pagination query={query()} total={playersList().query.total} onChange={handleQueryChange} colSpan={6} />
            </Show>
          </tbody>
        </table>

        <Switch>
          <Match when={playersList.loading}>
            <div class="flex justify-center h-36">
              <div class="loading loading-spinner loading-lg"></div>
            </div>
          </Match>
          <Match when={playersList.error}>
            <tr>
              <td colSpan="4">{t('dashboard.server.players_database.failed_to_load', 'Failed to load the links')}</td>
            </tr>
          </Match>
        </Switch>
      </AdminPanel>
    </>
  )
}

export default ServerPlayer
