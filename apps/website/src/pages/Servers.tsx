import { createResource, createSignal, For, onCleanup, Show, type Component } from 'solid-js'
import {
  PublicServerRankingResponseSchema,
  type PublicRankedServer,
  type PublicServerRankingQuery,
  type PublicServerRankingResponse,
} from '@gmod/schema/server/PublicServerRankingSchema.js'
import DashboardMiddleware from '../middleware/DashboardMiddleware.js'
import ServerActivityChart from '../components/ServerActivityChart.js'
import defaultServer from '../assets/defaultServer.png'
import { useI18n } from '../i18n.js'
import { fetchAPI } from '../utils/api.js'

const initialQuery: PublicServerRankingQuery = { limit: 10, offset: 0, search: '', gameMode: '', status: 'all' }

const Servers: Component = () => {
  const { t, locale } = useI18n()
  const [query, setQuery] = createSignal<PublicServerRankingQuery>({ ...initialQuery })
  const [searchInput, setSearchInput] = createSignal('')
  const [gameModes, setGameModes] = createSignal<string[]>([])
  let searchTimer: ReturnType<typeof setTimeout> | undefined
  onCleanup(() => clearTimeout(searchTimer))

  const [ranking, { refetch }] = createResource(query, async (current): Promise<PublicServerRankingResponse> => {
    const params = new URLSearchParams(Object.entries(current).map(([key, value]) => [key, String(value)]))
    const response = await fetchAPI(`/users/:discordID/servers/ranking?${params}`, 'GET')
    if (!response.ok) throw new Error('Unable to load server ranking')
    const data = PublicServerRankingResponseSchema.parse(await response.json())
    setGameModes(data.filters.gameModes)
    return data
  })

  const updateFilters = (next: Partial<PublicServerRankingQuery>) => {
    setQuery((previous) => ({ ...previous, ...next, offset: 0 }))
  }
  const updateSearch = (value: string) => {
    setSearchInput(value)
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => updateFilters({ search: value.trim() }), 250)
  }
  const resetFilters = () => {
    clearTimeout(searchTimer)
    setSearchInput('')
    setQuery((previous) => ({ ...initialQuery, limit: previous.limit }))
  }
  const hasFilters = () => Boolean(query().search || query().gameMode || query().status !== 'all')
  const featured = () => {
    const data = ranking()!
    return data.pagination.offset === 0 && data.servers.length >= 3 ? data.servers.slice(0, 3) : []
  }
  const regularServers = () => ranking()!.servers.slice(featured().length)
  const pages = () => Math.max(1, Math.ceil(ranking()!.pagination.total / ranking()!.pagination.limit))
  const currentPage = () => Math.floor(ranking()!.pagination.offset / ranking()!.pagination.limit) + 1
  const changePage = (offset: number) => setQuery((previous) => ({ ...previous, offset }))
  const lastSeen = (date: string) =>
    new Intl.DateTimeFormat(locale(), { dateStyle: 'short', timeStyle: 'short' }).format(new Date(date))

  const ServerCard: Component<{ server: PublicRankedServer; featured?: boolean }> = (props) => {
    const name = () => props.server.status?.hostname || props.server.name || t('servers.no_name', 'No name')
    // The shared response schema validates Discord invitations before rendering them.
    const discordUrl = () => props.server.discordUrl
    return (
      <article
        data-server-id={props.server.id}
        class={`border rounded-lg p-4 flex gap-4 min-w-0 ${props.featured ? 'border-primary/40 bg-base-200/20 flex-col' : 'border-base-200 flex-col md:flex-row'}`}
      >
        <div
          class={`flex gap-4 min-w-0 ${props.featured ? 'items-start' : 'md:flex-col md:items-center md:w-28 md:shrink-0'}`}
        >
          <img
            src={props.server.image || defaultServer}
            alt={props.server.name || t('servers.no_name', 'No name')}
            class={`rounded-md object-cover shrink-0 ${props.featured ? 'w-16 h-16' : 'w-20 h-20 md:w-28 md:h-28'}`}
            loading="lazy"
          />
          <div class="flex flex-col gap-2 min-w-0">
            <span class={`badge font-bold ${props.featured ? 'badge-primary' : 'badge-ghost'}`}>
              #{props.server.rank}
            </span>
            <Show when={props.featured}>
              <h3 class="text-lg font-bold wrap-break-word">{name()}</h3>
            </Show>
          </div>
        </div>
        <div class="flex flex-col gap-3 min-w-0 flex-1">
          <Show when={!props.featured}>
            <h3 class="text-xl font-bold wrap-break-word">{name()}</h3>
          </Show>
          <div class="flex flex-wrap gap-2 items-center">
            <span class={`badge ${props.server.online ? 'badge-success' : 'badge-ghost'}`}>
              {props.server.online ? t('servers.online', 'Online') : t('servers.offline', 'Offline')}
            </span>
            <span class="text-sm text-base-content/70">
              {props.server.vote} {t('servers.votes', 'votes')}
            </span>
          </div>
          <p class="text-sm text-base-content/70 wrap-break-word">
            {props.server.description || t('servers.no_description', 'No description')}
          </p>
          <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm min-w-0">
            <div>
              <dt class="text-base-content/60">{t('servers.players', 'Players')}</dt>
              <dd class="font-semibold">
                {props.server.online && props.server.status
                  ? `${props.server.status.players}/${props.server.status.maxPlayers}`
                  : t('servers.offline', 'Offline')}
              </dd>
            </div>
            <div>
              <dt class="text-base-content/60">{t('servers.game_mode', 'Game Mode')}</dt>
              <dd class="font-semibold wrap-break-word">{props.server.status?.gameMode || '—'}</dd>
            </div>
            <div>
              <dt class="text-base-content/60">{t('servers.map', 'Map')}</dt>
              <dd class="font-semibold wrap-break-word">{props.server.status?.map || '—'}</dd>
            </div>
            <div class="min-w-0">
              <dt class="text-base-content/60">{t('servers.ip', 'IP')}</dt>
              <dd class="wrap-break-word">
                <Show when={props.server.ip && props.server.port} fallback="—">
                  <a
                    class="text-secondary hover:underline"
                    href={`steam://connect/${props.server.ip}:${props.server.port}`}
                  >
                    {props.server.ip}:{props.server.port}
                  </a>
                </Show>
              </dd>
            </div>
          </dl>
          <Show when={!props.server.online && props.server.lastSeenAt}>
            <p class="text-sm text-base-content/60">
              {t('servers.last_seen', 'Last activity')}:{' '}
              <time dateTime={props.server.lastSeenAt!}>{lastSeen(props.server.lastSeenAt!)}</time>
            </p>
          </Show>
        </div>
        <div class={`flex flex-col gap-3 min-w-0 ${props.featured ? '' : 'md:w-56 md:shrink-0'}`}>
          <ServerActivityChart points={props.server.activity} online={props.server.online} />
          <Show
            when={discordUrl()}
            fallback={
              <button
                type="button"
                class="btn btn-sm btn-outline w-full h-auto min-h-8 whitespace-normal py-2"
                disabled
                title={t('servers.discord_unavailable', 'Discord invitation unavailable')}
              >
                <i class="fa-brands fa-discord" aria-hidden="true"></i>
                {t('servers.discord_unavailable', 'Discord invitation unavailable')}
              </button>
            }
          >
            <a
              href={discordUrl()!}
              class="btn btn-sm btn-outline btn-primary w-full"
              target="_blank"
              rel="noopener noreferrer"
            >
              <i class="fa-brands fa-discord" aria-hidden="true"></i>
              {t('servers.join_discord', 'Join Discord')}
            </a>
          </Show>
        </div>
      </article>
    )
  }

  return (
    <>
      <DashboardMiddleware />
      <div class="flex flex-col p-4 gap-6 max-w-(--breakpoint-xl) mx-auto w-full">
        <h1 class="text-2xl py-4 font-bold">{t('servers.title', 'Servers')}</h1>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label class="flex flex-col gap-2 text-sm min-w-0">
            <span>{t('servers.search', 'Search')}</span>
            <input
              type="search"
              class="input input-bordered w-full"
              maxLength={100}
              value={searchInput()}
              onInput={(event) => updateSearch(event.currentTarget.value)}
              placeholder={t('servers.search_placeholder', 'Name, description or IP')}
            />
          </label>
          <label class="flex flex-col gap-2 text-sm min-w-0">
            <span>{t('servers.game_mode', 'Game Mode')}</span>
            <select
              class="select select-bordered w-full"
              value={query().gameMode}
              onChange={(event) => updateFilters({ gameMode: event.currentTarget.value })}
            >
              <option value="">{t('servers.all_modes', 'All game modes')}</option>
              <For each={gameModes()}>{(mode) => <option value={mode}>{mode}</option>}</For>
            </select>
          </label>
          <label class="flex flex-col gap-2 text-sm min-w-0">
            <span>{t('servers.status', 'Status')}</span>
            <select
              class="select select-bordered w-full"
              value={query().status}
              onChange={(event) =>
                updateFilters({ status: event.currentTarget.value as PublicServerRankingQuery['status'] })
              }
            >
              <option value="all">{t('servers.all_statuses', 'All servers')}</option>
              <option value="online">{t('servers.online', 'Online')}</option>
              <option value="offline">{t('servers.offline', 'Offline')}</option>
            </select>
          </label>
          <label class="flex flex-col gap-2 text-sm min-w-0">
            <span>{t('servers.per_page', 'Servers per page')}</span>
            <select
              class="select select-bordered w-full"
              value={query().limit}
              onChange={(event) => updateFilters({ limit: Number(event.currentTarget.value) })}
            >
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
            </select>
          </label>
        </div>
        <Show when={hasFilters()}>
          <button type="button" class="btn btn-sm btn-ghost self-start" onClick={resetFilters}>
            {t('servers.reset_filters', 'Clear filters')}
          </button>
        </Show>
        <div aria-busy={ranking.loading}>
          <Show
            when={!ranking.error}
            fallback={
              <div role="alert" class="border border-base-200 rounded-lg p-6 flex flex-col items-center gap-4">
                <p>{t('servers.load_error', 'Unable to load servers.')}</p>
                <button type="button" class="btn btn-base-200" disabled={ranking.loading} onClick={() => refetch()}>
                  {t('ui.retry', 'Try again')}
                </button>
              </div>
            }
          >
            <Show
              when={!ranking.loading}
              fallback={
                <div role="status" class="flex justify-center p-10">
                  <span class="loading loading-lg" aria-label={t('servers.loading', 'Loading servers')}></span>
                </div>
              }
            >
              <Show
                when={ranking()!.servers.length > 0}
                fallback={
                  <p role="status" class="border border-base-200 rounded-lg p-8 text-center">
                    {t('servers.empty', 'No servers match these filters.')}
                  </p>
                }
              >
                <div class="flex flex-col gap-6">
                  <Show when={featured().length > 0}>
                    <section aria-labelledby="server-top-three" class="flex flex-col gap-4">
                      <h2 id="server-top-three" class="text-lg font-bold">
                        {t('servers.top_three', 'Top 3')}
                      </h2>
                      <p class="text-sm text-base-content/60">
                        {t('servers.ranking_description', 'Ranked by votes over the last 30 days.')}
                      </p>
                      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <For each={featured()}>{(server) => <ServerCard server={server} featured />}</For>
                      </div>
                    </section>
                  </Show>
                  <Show when={regularServers().length > 0}>
                    <section aria-label={t('servers.ranking', 'Server ranking')} class="flex flex-col gap-4">
                      <For each={regularServers()}>{(server) => <ServerCard server={server} />}</For>
                    </section>
                  </Show>
                </div>
              </Show>
              <Show when={ranking()!.pagination.total > 0}>
                <div class="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <p role="status" class="text-sm text-base-content/70">
                    {t(
                      'servers.showing',
                      'Showing {1}–{2} of {3} servers',
                      ranking()!.pagination.offset + 1,
                      ranking()!.pagination.offset + ranking()!.servers.length,
                      ranking()!.pagination.total,
                    )}
                  </p>
                  <nav
                    aria-label={t('ui.pagination', 'Pagination')}
                    class="flex flex-wrap items-center justify-center gap-2"
                  >
                    <button
                      type="button"
                      class="btn btn-sm btn-base-200"
                      onClick={() => changePage(0)}
                      disabled={currentPage() <= 1}
                    >
                      {t('servers.first_page', 'First')}
                    </button>
                    <button
                      type="button"
                      class="btn btn-sm btn-base-200"
                      onClick={() => changePage(Math.max(0, query().offset - query().limit))}
                      disabled={currentPage() <= 1}
                    >
                      {t('ui.previous_page', 'Previous page')}
                    </button>
                    <span class="px-2 text-sm" aria-current="page">
                      {t('servers.page_of', 'Page {1} of {2}', currentPage(), pages())}
                    </span>
                    <button
                      type="button"
                      class="btn btn-sm btn-base-200"
                      onClick={() => changePage(query().offset + query().limit)}
                      disabled={currentPage() >= pages()}
                    >
                      {t('ui.next_page', 'Next page')}
                    </button>
                    <button
                      type="button"
                      class="btn btn-sm btn-base-200"
                      onClick={() => changePage((pages() - 1) * query().limit)}
                      disabled={currentPage() >= pages()}
                    >
                      {t('servers.last_page', 'Last')}
                    </button>
                  </nav>
                </div>
              </Show>
            </Show>
          </Show>
        </div>
      </div>
    </>
  )
}

export default Servers
