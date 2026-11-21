import { closeDialog, showDialog } from '../../../../utils/dialog.js'
import { type Component, createResource, createSignal, For, Show } from 'solid-js'
import { FormActions, FormField, IconButton, TableState, Icon, type IconName } from '../../../../components/ui/index.js'
import { createAsyncAction } from '../../../../hooks/createAsyncAction.js'
import AdminPanel from '../../../../components/AdminPanel'
import AdminModal from '../../../../components/AdminModal'
import Pagination from '../../../../components/Pagination'
import { useI18n } from '../../../../i18n'
import { convertSecToTime } from '../../../../utils/convertSecToTime'
import { fetchAPI } from '../../../../utils/api'
import { QuerySort, type ClientQuery, type ServerQuery } from '../../../../utils/types/QueryTypes.js'

type PlayerList = { rows: Player[]; query?: ServerQuery }

const fetchPlayers = async (): Promise<PlayerList> => {
  const res = await fetchAPI('/users/:discordID/guilds/:guildID/servers/:serverID/players', 'GET')
  if (!res.ok) {
    throw new Error('Players request failed')
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
  const [playersList, { mutate, refetch }] = createResource('playersList', fetchPlayers, {
    initialValue: { rows: [], query: undefined },
  })
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
  const save = createAsyncAction({ errorMessage: () => t('ui.save_error', 'Unable to save the changes.') })

  const [loadSearch, setLoadSearch] = createSignal(false)
  const [searchError, setSearchError] = createSignal(false)
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
    const queryString = new URLSearchParams(
      Object.entries(params).map(([key, value]) => [key, String(value)]),
    ).toString()

    setLoadSearch(true)
    setSearchError(false)
    if (!playersList.error) mutate((previous) => ({ ...previous, rows: [] }))
    try {
      const response = await fetchAPI(
        `/users/:discordID/guilds/:guildID/servers/:serverID/players?${queryString}`,
        'GET',
      )
      if (!response.ok) throw new Error('Player search failed')
      mutate(await response.json())
    } catch {
      setSearchError(true)
    } finally {
      setLoadSearch(false)
    }
  }

  function getSortIcon(key: string): IconName {
    const sortInfoValue = sortInfo()
    if (sortInfoValue.lastKey === key) {
      return sortInfoValue.dsc ? 'arrow-down' : 'arrow-up'
    }
    return 'arrow-up-down'
  }

  async function handleQueryChange(newQuery: ClientQuery) {
    setQuery(newQuery)
    await sortPlayerBy(newQuery.sort, false, newQuery.offset, searchValue())
  }

  async function savePlayer() {
    const draft = { ...currentPlayers() }
    const saved = await save.run(async () => {
      const res = await fetchAPI(
        `/users/:discordID/guilds/:guildID/servers/:serverID/players/${draft.steam_id}`,
        'PUT',
        draft,
      )
      if (!res.ok) {
        throw new Error('Player update failed')
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
    })
    if (saved) closeDialog('edit_player')
  }

  const [inputID, setInputID] = createSignal(0)
  return (
    <>
      <AdminModal
        title={t('dashboard.server.edit_player.title', 'Edit Player')}
        id="edit_player"
        busy={save.pending()}
        onClose={() => save.reset()}
        onCancel={() => save.reset()}
      >
        <FormField
          id="player-bypass-maintenance"
          label={t('dashboard.server.edit_player.bypass_maintenance', 'ByPass Maintenance')}
        >
          <select
            id="player-bypass-maintenance"
            class="select"
            disabled={playersList.loading || save.pending()}
            value={currentPlayers().bypassMaintenance ? 'true' : 'false'}
            onChange={(e) => {
              setCurrentPlayers((previous) => ({ ...previous, bypassMaintenance: e.currentTarget.value === 'true' }))
            }}
          >
            <option value="true">{t('dashboard.server.edit_player.yes', 'Yes')}</option>
            <option value="false">{t('dashboard.server.edit_player.no', 'No')}</option>
          </select>
        </FormField>
        <FormActions
          pending={save.pending()}
          disabled={playersList.loading}
          error={save.error()}
          onSave={() => void savePlayer()}
          onCancel={() => closeDialog('edit_player')}
          saveLabel={t('dashboard.server.edit_player.save', 'Save')}
        />
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
                    await sortPlayerBy(query().sort, false, 0, value)
                  }
                }, 400)
              }}
            />
            <Icon name="search" />
          </label>
        </div>
        <table class="table table-auto table-fixed border-t border-base-200 rounded-none">
          <thead>
            <tr class="text-l hover:cursor-pointer">
              <th class="w-1/4" onClick={() => sortPlayerBy('name')}>
                {t('dashboard.server.players_database.name', 'Name')} <Icon name={getSortIcon('name')} />
              </th>
              <th class="w-1/6 text-center" onClick={() => sortPlayerBy('rank')}>
                {t('dashboard.server.players_database.rank', 'Rank')} <Icon name={getSortIcon('rank')} />
              </th>
              <th class="w-1/6 text-center" onClick={() => sortPlayerBy('total_time')}>
                {t('dashboard.server.players_database.total_time', 'Total Time')}{' '}
                <Icon name={getSortIcon('total_time')} />
              </th>
              <th class="w-1/6 text-center" onClick={() => sortPlayerBy('total_connect')}>
                {t('dashboard.server.players_database.total_connect', 'Total Connect')}{' '}
                <Icon name={getSortIcon('total_connect')} />
              </th>
              <th class="w-1/6 text-center" onClick={() => sortPlayerBy('bypassMaintenance')}>
                {t('dashboard.server.players_database.bypass_maintenance', 'Bypass Maintenance')}{' '}
                <Icon name={getSortIcon('bypassMaintenance')} />
              </th>
              <th class="hover:cursor-default w-1/6 text-center">
                {t('dashboard.server.players_database.actions', 'Actions')}
              </th>
            </tr>
          </thead>
          <tbody>
            <TableState
              colSpan={6}
              loading={playersList.loading || loadSearch()}
              error={playersList.error || searchError()}
              empty={
                !playersList.loading &&
                !playersList.error &&
                !loadSearch() &&
                !searchError() &&
                playersList().rows.length === 0
              }
              onRetry={() => {
                if (searchError()) void sortPlayerBy(query().sort, false, query().offset, searchValue())
                else void refetch()
              }}
            >
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
                          <Icon name="check" class="text-success" />
                        ) : (
                          <Icon name="x" class="text-error" />
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
                          <Icon name="gamepad-2" />
                        </a>
                        <IconButton
                          variant="ghost"
                          size="sm"
                          label={t('dashboard.server.players_database.edit', 'Edit')}
                          icon="pencil"
                          onClick={() => {
                            setCurrentPlayers({ ...player })
                            save.reset()
                            showDialog('edit_player')
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                )}
              </For>
            </TableState>
            <Show when={!playersList.loading && !playersList.error && !loadSearch() && !searchError()}>
              <Pagination
                query={query()}
                total={playersList().query?.total ?? 0}
                onChange={handleQueryChange}
                colSpan={6}
              />
            </Show>
          </tbody>
        </table>
      </AdminPanel>
    </>
  )
}

export default ServerPlayer
