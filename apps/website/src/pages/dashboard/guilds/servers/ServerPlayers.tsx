import { closeDialog, showDialog } from '../../../../utils/dialog.js'
import { type Component, createResource, createSignal, For } from 'solid-js'
import {
  BooleanStatus,
  Button,
  FormActions,
  FormField,
  IconButton,
  IconButtonLink,
  TableState,
  Icon,
  type IconName,
} from '../../../../components/ui/index.js'
import { createDraftForm } from '../../../../hooks/createDraftForm.js'
import AdminPanel from '../../../../components/AdminPanel.js'
import AdminModal from '../../../../components/AdminModal.js'
import Pagination from '../../../../components/Pagination.js'
import { useI18n } from '../../../../i18n.js'
import { convertSecToTime } from '../../../../utils/convertSecToTime.js'
import { fetchAPI } from '../../../../utils/api.js'
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
  const editor = createDraftForm({
    initial: new Player('', '', 0, 0, 0, false),
    validate: (draft) =>
      !/^\d{17}$/.test(draft.steam_id) || typeof draft.bypassMaintenance !== 'boolean'
        ? { steam_id: t('ui.invalid_value', 'Check this value.') }
        : {},
    errorMessage: () => t('ui.save_error', 'Unable to save the changes.'),
  })

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
    setQuery(newQuery)

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

  function getSortDirection(key: string): 'none' | 'ascending' | 'descending' {
    if (sortInfo().lastKey !== key) return 'none'
    return sortInfo().dsc ? 'descending' : 'ascending'
  }

  async function handleQueryChange(newQuery: ClientQuery) {
    setQuery(newQuery)
    await sortPlayerBy(newQuery.sort, false, newQuery.offset, searchValue())
  }

  async function savePlayer() {
    if (playersList.loading || playersList.error || loadSearch() || searchError()) return
    const saved = await editor.save(async (snapshot) => {
      const response = await fetchAPI(
        `/users/:discordID/guilds/:guildID/servers/:serverID/players/${snapshot.steam_id}`,
        'PUT',
        { bypassMaintenance: snapshot.bypassMaintenance },
      )
      if (!response.ok) throw new Error('Player update failed')
      const accepted = await response.json()
      if (typeof accepted.bypassMaintenance !== 'boolean') throw new Error('Invalid player permission')
      mutate((previous) => ({
        ...previous,
        rows: previous.rows.map((player) =>
          player.steam_id === snapshot.steam_id ? { ...player, bypassMaintenance: accepted.bypassMaintenance } : player,
        ),
      }))
      return { ...snapshot, bypassMaintenance: accepted.bypassMaintenance }
    })
    if (saved) closeDialog('edit_player')
  }

  const [inputID, setInputID] = createSignal(0)
  return (
    <>
      <AdminModal
        title={t('dashboard.server.edit_player.title', 'Edit player access')}
        id="edit_player"
        description={editor.draft().steam_id ? `${editor.draft().name} · ${editor.draft().steam_id}` : undefined}
        busy={editor.pending()}
        onClose={editor.discard}
        onCancel={editor.discard}
      >
        <FormField
          id="player-bypass-maintenance"
          label={t('dashboard.server.edit_player.bypass_maintenance', 'Allow access during maintenance')}
          description={t(
            'dashboard.server.edit_player.bypass_help',
            'Allow this player to join while maintenance mode is enabled. Save to apply this permission.',
          )}
        >
          <select
            id="player-bypass-maintenance"
            aria-describedby="player-bypass-maintenance-description"
            class="select"
            disabled={playersList.loading || !!playersList.error || editor.pending()}
            value={editor.draft().bypassMaintenance ? 'true' : 'false'}
            onChange={(e) => {
              editor.patch({ bypassMaintenance: e.currentTarget.value === 'true' })
            }}
          >
            <option value="true">{t('dashboard.server.edit_player.yes', 'Yes')}</option>
            <option value="false">{t('dashboard.server.edit_player.no', 'No')}</option>
          </select>
        </FormField>
        <FormActions
          dirty={editor.dirty()}
          pending={editor.pending()}
          disabled={playersList.loading || !!playersList.error || loadSearch() || searchError() || !editor.valid()}
          error={editor.error()}
          onSave={() => void savePlayer()}
          onCancel={() => {
            editor.discard()
            closeDialog('edit_player')
          }}
          saveLabel={t('dashboard.server.edit_player.save', 'Save')}
        />
      </AdminModal>

      <AdminPanel
        title={t('dashboard.server.players_database.title', 'Player records')}
        description={t(
          'dashboard.server.players_database.description',
          'View recorded players, their total playtime and connection count. Edit a player to manage maintenance access.',
        )}
        type="none"
        footer={
          !playersList.loading && !playersList.error && !loadSearch() && !searchError() ? (
            <Pagination
              standalone
              query={query()}
              total={playersList().query?.total ?? 0}
              onChange={handleQueryChange}
            />
          ) : undefined
        }
      >
        {/* search*/}
        <div class="p-4">
          <label class="input flex items-center p-2 gap-4">
            <input
              type="text"
              class="grow"
              aria-label={t('dashboard.server.players_database.search_label', 'Search players')}
              placeholder={t(
                'dashboard.server.players_database.search_placeholder',
                'Search by SteamID64, name or rank…',
              )}
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
            <tr class="text-l">
              <th class="w-1/4" scope="col" aria-sort={getSortDirection('name')}>
                <Button variant="ghost" size="sm" class="ui-table-sort" onClick={() => void sortPlayerBy('name')}>
                  {t('dashboard.server.players_database.name', 'Name')} <Icon name={getSortIcon('name')} />
                </Button>
              </th>
              <th class="w-1/6 text-center" scope="col" aria-sort={getSortDirection('rank')}>
                <Button variant="ghost" size="sm" class="ui-table-sort" onClick={() => void sortPlayerBy('rank')}>
                  {t('dashboard.server.players_database.rank', 'Rank')} <Icon name={getSortIcon('rank')} />
                </Button>
              </th>
              <th class="w-1/6 text-center" scope="col" aria-sort={getSortDirection('total_time')}>
                <Button variant="ghost" size="sm" class="ui-table-sort" onClick={() => void sortPlayerBy('total_time')}>
                  {t('dashboard.server.players_database.total_time', 'Total playtime')}{' '}
                  <Icon name={getSortIcon('total_time')} />
                </Button>
              </th>
              <th class="w-1/6 text-center" scope="col" aria-sort={getSortDirection('total_connect')}>
                <Button
                  variant="ghost"
                  size="sm"
                  class="ui-table-sort"
                  onClick={() => void sortPlayerBy('total_connect')}
                >
                  {t('dashboard.server.players_database.total_connect', 'Connections')}{' '}
                  <Icon name={getSortIcon('total_connect')} />
                </Button>
              </th>
              <th class="w-1/6 text-center" scope="col" aria-sort={getSortDirection('bypassMaintenance')}>
                <Button
                  variant="ghost"
                  size="sm"
                  class="ui-table-sort"
                  onClick={() => void sortPlayerBy('bypassMaintenance')}
                >
                  {t('dashboard.server.players_database.bypass_maintenance', 'Maintenance access')}{' '}
                  <Icon name={getSortIcon('bypassMaintenance')} />
                </Button>
              </th>
              <th class="w-1/6 text-center" scope="col">
                {t('dashboard.server.players_database.actions', 'Actions')}
              </th>
            </tr>
          </thead>
          <tbody>
            <TableState
              colSpan={6}
              loading={playersList.loading || loadSearch()}
              error={playersList.error || searchError()}
              errorLabel={t(
                'dashboard.server.players_database.load_error',
                'Unable to load players. Try again to reload the current search.',
              )}
              emptyLabel={t(
                'dashboard.server.players_database.empty',
                'No players match this search. Try another name, SteamID64 or rank, or clear the search.',
              )}
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
              <For each={!playersList.error ? playersList().rows : []}>
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
                        <BooleanStatus
                          value={player.bypassMaintenance}
                          trueLabel={t('dashboard.server.edit_player.yes', 'Yes')}
                          falseLabel={t('dashboard.server.edit_player.no', 'No')}
                        />
                      </div>
                    </td>
                    <td class="w-1/6">
                      <div class="flex gap-2 justify-center">
                        <IconButtonLink
                          href={`https://steamcommunity.com/profiles/${player.steam_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          variant="ghost"
                          size="sm"
                          label={t('dashboard.server.players_database.steam', 'Open Steam profile')}
                          icon="gamepad-2"
                        />
                        <IconButton
                          variant="ghost"
                          size="sm"
                          label={t('dashboard.server.players_database.edit', 'Edit')}
                          icon="pencil"
                          disabled={editor.pending() || playersList.loading || loadSearch()}
                          onClick={() => {
                            editor.reset({ ...player })
                            showDialog('edit_player')
                          }}
                        />
                      </div>
                    </td>
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

export default ServerPlayer
