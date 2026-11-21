import { AsyncState, Button, ButtonLink, FormField, Icon } from '../components/ui/index.js'
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
    const discordUrl = () => props.server.discordUrl
    return (
      <article
        data-server-id={props.server.id}
        data-featured={props.featured || undefined}
        class={`ranking-server-card public-card grid min-w-0 gap-5 rounded-xl border border-base-content/10 bg-base-100 p-5 ${props.featured ? '' : 'xl:grid-cols-[minmax(0,1fr)_220px]'}`}
      >
        <div class="ranking-server-details flex min-w-0 flex-col gap-4">
          <header class="flex min-w-0 items-start gap-3">
            <img
              src={props.server.image || defaultServer}
              alt={props.server.name || t('servers.no_name', 'No name')}
              class="ranking-server-avatar h-12 w-12 shrink-0 rounded-xl border border-base-content/8 object-cover"
              loading="lazy"
            />
            <div class="flex min-w-0 flex-1 flex-col gap-2">
              <div class="flex flex-wrap items-center gap-2">
                <span
                  class={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold ${props.featured ? 'bg-primary/10 text-primary' : 'bg-base-200/70 text-base-content/55'}`}
                >
                  #{props.server.rank}
                </span>
                <span
                  class={`inline-flex items-center gap-1.5 text-[10px] font-medium ${props.server.online ? 'text-success' : 'text-base-content/40'}`}
                >
                  <span
                    class={`h-1.5 w-1.5 rounded-full ${props.server.online ? 'bg-success' : 'bg-base-content/30'}`}
                    aria-hidden="true"
                  />
                  {props.server.online ? t('servers.online', 'Online') : t('servers.offline', 'Offline')}
                </span>
              </div>
              <h3 class="wrap-break-word text-base font-semibold leading-snug tracking-tight">{name()}</h3>
            </div>
          </header>
          <p class="wrap-break-word text-xs leading-relaxed text-base-content/55">
            {props.server.description || t('servers.no_description', 'No description')}
          </p>
          <dl
            class={`ranking-server-metrics grid min-w-0 gap-x-4 gap-y-3 text-xs ${props.featured ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'}`}
          >
            <div class="min-w-0">
              <dt class="mb-1 text-[10px] font-medium text-base-content/40">{t('servers.players', 'Players')}</dt>
              <dd class="font-medium">
                {props.server.online && props.server.status
                  ? `${props.server.status.players}/${props.server.status.maxPlayers}`
                  : t('servers.offline', 'Offline')}
              </dd>
            </div>
            <div class="min-w-0">
              <dt class="mb-1 text-[10px] font-medium text-base-content/40">{t('servers.game_mode', 'Game Mode')}</dt>
              <dd class="wrap-break-word font-medium">{props.server.status?.gameMode || '—'}</dd>
            </div>
            <div class="min-w-0">
              <dt class="mb-1 text-[10px] font-medium text-base-content/40">{t('servers.map', 'Map')}</dt>
              <dd class="wrap-break-word font-medium">{props.server.status?.map || '—'}</dd>
            </div>
            <div class="min-w-0">
              <dt class="mb-1 text-[10px] font-medium text-base-content/40">{t('servers.ip', 'IP')}</dt>
              <dd class="wrap-break-word font-mono text-[11px]">
                <Show when={props.server.ip && props.server.port} fallback="—">
                  <a
                    class="text-primary hover:underline"
                    href={`steam://connect/${props.server.ip}:${props.server.port}`}
                  >
                    {props.server.ip}:{props.server.port}
                  </a>
                </Show>
              </dd>
            </div>
          </dl>
          <div class="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-base-content/7 pt-3 text-[11px] text-base-content/45">
            <span class="inline-flex items-center gap-1.5">
              <Icon name="vote" size={13} />
              {props.server.vote} {t('servers.votes', 'votes')}
            </span>
            <Show when={!props.server.online && props.server.lastSeenAt}>
              <span>
                {t('servers.last_seen', 'Last activity')}:{' '}
                <time dateTime={props.server.lastSeenAt!}>{lastSeen(props.server.lastSeenAt!)}</time>
              </span>
            </Show>
          </div>
        </div>
        <div
          class={`ranking-server-actions flex min-w-0 flex-col justify-between gap-4 ${props.featured ? 'border-t border-base-content/7 pt-4' : 'border-t border-base-content/7 pt-4 xl:border-t-0 xl:border-l xl:pl-5 xl:pt-0'}`}
        >
          <ServerActivityChart points={props.server.activity} online={props.server.online} />
          <Show
            when={discordUrl()}
            fallback={
              <Button
                size="sm"
                class="h-auto! min-h-9! w-full whitespace-normal py-2!"
                disabled
                title={t('servers.discord_unavailable', 'Discord invitation unavailable')}
              >
                <Icon name="message-circle" size={15} />
                {t('servers.discord_unavailable', 'Discord invitation unavailable')}
              </Button>
            }
          >
            <ButtonLink
              href={discordUrl()!}
              class="w-full"
              variant="primary"
              size="sm"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icon name="message-circle" size={15} />
              {t('servers.join_discord', 'Join Discord')}
            </ButtonLink>
          </Show>
        </div>
      </article>
    )
  }

  return (
    <>
      <DashboardMiddleware />
      <div class="public-page ranking-page mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <header class="public-page-heading flex flex-col gap-3">
          <span class="inline-flex items-center gap-2 text-xs font-medium text-primary">
            <Icon name="server" size={16} />
            {t('servers.ranking', 'Server ranking')}
          </span>
          <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">{t('servers.title', 'Servers')}</h1>
          <p class="max-w-2xl text-sm leading-relaxed text-base-content/55">
            {t('servers.ranking_description', 'Ranked by votes over the last 30 days.')}
          </p>
        </header>
        <section
          class="public-toolbar ranking-toolbar rounded-xl border border-base-content/10 bg-base-100 p-5"
          aria-label={t('servers.search', 'Search')}
        >
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_1fr_1fr_1fr]">
            <FormField id="ranking-search" label={t('servers.search', 'Search')}>
              <div class="input flex w-full items-center gap-2">
                <Icon name="search" size={16} class="text-base-content/40" />
                <input
                  id="ranking-search"
                  type="search"
                  class="min-w-0 flex-1 bg-transparent outline-none"
                  maxLength={100}
                  value={searchInput()}
                  onInput={(event) => updateSearch(event.currentTarget.value)}
                  placeholder={t('servers.search_placeholder', 'Name, description or IP')}
                />
              </div>
            </FormField>
            <FormField id="ranking-game-mode" label={t('servers.game_mode', 'Game Mode')}>
              <select
                id="ranking-game-mode"
                class="select w-full"
                value={query().gameMode}
                onChange={(event) => updateFilters({ gameMode: event.currentTarget.value })}
              >
                <option value="">{t('servers.all_modes', 'All game modes')}</option>
                <For each={gameModes()}>{(mode) => <option value={mode}>{mode}</option>}</For>
              </select>
            </FormField>
            <FormField id="ranking-status" label={t('servers.status', 'Status')}>
              <select
                id="ranking-status"
                class="select w-full"
                value={query().status}
                onChange={(event) =>
                  updateFilters({ status: event.currentTarget.value as PublicServerRankingQuery['status'] })
                }
              >
                <option value="all">{t('servers.all_statuses', 'All servers')}</option>
                <option value="online">{t('servers.online', 'Online')}</option>
                <option value="offline">{t('servers.offline', 'Offline')}</option>
              </select>
            </FormField>
            <FormField id="ranking-page-size" label={t('servers.per_page', 'Servers per page')}>
              <select
                id="ranking-page-size"
                class="select w-full"
                value={query().limit}
                onChange={(event) => updateFilters({ limit: Number(event.currentTarget.value) })}
              >
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
              </select>
            </FormField>
          </div>
          <Show when={hasFilters()}>
            <Button size="sm" variant="ghost" class="mt-3" onClick={resetFilters}>
              <Icon name="x" size={13} />
              {t('servers.reset_filters', 'Clear filters')}
            </Button>
          </Show>
        </section>
        <div aria-busy={ranking.loading}>
          <AsyncState
            loading={ranking.loading}
            error={ranking.error}
            loadingLabel={t('servers.loading', 'Loading servers')}
            errorLabel={t('servers.load_error', 'Unable to load servers.')}
            onRetry={() => refetch()}
          >
            <Show
              when={ranking()!.servers.length > 0}
              fallback={<AsyncState empty emptyLabel={t('servers.empty', 'No servers match these filters.')} />}
            >
              <div class="flex flex-col gap-8">
                <Show when={featured().length > 0}>
                  <section aria-labelledby="server-top-three" class="ranking-podium flex flex-col gap-4">
                    <div class="flex items-center gap-2">
                      <Icon name="crown" size={17} class="text-primary" />
                      <h2 id="server-top-three" class="text-sm font-semibold">
                        {t('servers.top_three', 'Top 3')}
                      </h2>
                    </div>
                    <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
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
              <div class="ranking-pagination mt-7 flex flex-col gap-4 border-t border-base-content/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p role="status" class="text-xs text-base-content/50">
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
                  class="flex flex-wrap items-center justify-center gap-1.5"
                >
                  <Button size="sm" onClick={() => changePage(0)} disabled={currentPage() <= 1}>
                    {t('servers.first_page', 'First')}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => changePage(Math.max(0, query().offset - query().limit))}
                    disabled={currentPage() <= 1}
                  >
                    {t('ui.previous_page', 'Previous page')}
                  </Button>
                  <span class="px-2 text-xs text-base-content/55" aria-current="page">
                    {t('servers.page_of', 'Page {1} of {2}', currentPage(), pages())}
                  </span>
                  <Button
                    size="sm"
                    onClick={() => changePage(query().offset + query().limit)}
                    disabled={currentPage() >= pages()}
                  >
                    {t('ui.next_page', 'Next page')}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => changePage((pages() - 1) * query().limit)}
                    disabled={currentPage() >= pages()}
                  >
                    {t('servers.last_page', 'Last')}
                  </Button>
                </nav>
              </div>
            </Show>
          </AsyncState>
        </div>
      </div>
    </>
  )
}

export default Servers
