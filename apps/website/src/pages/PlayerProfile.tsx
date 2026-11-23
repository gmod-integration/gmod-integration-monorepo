import { useParams } from '@solidjs/router'
import {
  createEffect,
  createResource,
  createSignal,
  For,
  Match,
  on,
  onCleanup,
  Show,
  Switch,
  type Component,
} from 'solid-js'
import {
  PlayerProfileResponseSchema,
  PlayerSteamID64Schema,
  type PlayerProfileResponse,
  type PlayerProfileServer,
} from '@gmod/schema/user/PlayerProfileSchema.js'
import { PaginationControls } from '../components/Pagination.js'
import { AsyncState, ButtonLink, Icon, PageState, StatusBadge } from '../components/ui/index.js'
import DashboardMiddleware from '../middleware/DashboardMiddleware.js'
import { useI18n } from '../i18n.js'
import { fetchAPI } from '../utils/api.js'
import { authSession } from '../utils/authClient.js'
import { isLogged } from '../utils/event.js'
import defaultServer from '../assets/defaultServer.png'

type ProfileResult = { kind: 'ready'; profile: PlayerProfileResponse } | { kind: 'not-linked' | 'not-found' }

const PAGE_SIZE = 10

const PlayerProfile: Component = () => {
  const { t, locale } = useI18n()
  const params = useParams<{ steamID64?: string }>()
  const [pagination, setPagination] = createSignal({ target: params.steamID64 || '', offset: 0 })
  const authenticated = () => isLogged() && Boolean(authSession())
  const target = () => params.steamID64 || ''
  createEffect(on(target, (next) => setPagination({ target: next, offset: 0 }), { defer: true }))
  let activeRequest: AbortController | undefined
  onCleanup(() => activeRequest?.abort())

  const [result, { refetch }] = createResource(
    () =>
      authenticated()
        ? { target: target(), offset: pagination().target === target() ? pagination().offset : 0 }
        : false,
    async (request): Promise<ProfileResult> => {
      activeRequest?.abort()
      activeRequest = new AbortController()
      if (request.target && !PlayerSteamID64Schema.safeParse(request.target).success) return { kind: 'not-found' }
      const endpoint = request.target
        ? `/users/:discordID/players/${encodeURIComponent(request.target)}`
        : '/users/:discordID/player-profile'
      const query = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(request.offset) })
      const response = await fetchAPI(`${endpoint}?${query}`, 'GET', undefined, { signal: activeRequest.signal })
      if (response.status === 404) {
        const body: unknown = await response.json().catch(() => null)
        return {
          kind:
            !request.target && body && typeof body === 'object' && 'error' in body && body.error === 'steam_not_linked'
              ? 'not-linked'
              : 'not-found',
        }
      }
      if (!response.ok) throw new Error('Unable to load player profile')
      return { kind: 'ready', profile: PlayerProfileResponseSchema.parse(await response.json()) }
    },
  )

  const data = () => {
    if (result.error || !authenticated()) return undefined
    const value = result()
    return value?.kind === 'ready' ? value.profile : undefined
  }
  const state = () => (!result.error && authenticated() ? result()?.kind : undefined)
  const number = (value: number) => new Intl.NumberFormat(locale()).format(value)
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  const duration = (seconds: number) => {
    if (seconds < 60) return t('player_profile.duration_seconds', '{1} s', number(seconds))
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return t('player_profile.duration_minutes', '{1} min', number(minutes))
    return t('player_profile.duration_hours', '{1} h {2} min', number(Math.floor(minutes / 60)), number(minutes % 60))
  }
  const changePage = (offset: number) => setPagination({ target: target(), offset })
  const pages = () => Math.max(1, Math.ceil(data()!.pagination.total / data()!.pagination.limit))
  const page = () => Math.floor(data()!.pagination.offset / data()!.pagination.limit) + 1

  const ServerCard: Component<{ server: PlayerProfileServer }> = (props) => (
    <article class="public-card player-profile-server">
      <header class="player-profile-server-heading">
        <img src={props.server.image || defaultServer} alt="" loading="lazy" />
        <div class="min-w-0 flex-1">
          <h3>{props.server.name || t('servers.no_name', 'No name')}</h3>
          <p>{[props.server.gameMode, props.server.map].filter(Boolean).join(' · ') || t('ui.unknown', 'Unknown')}</p>
        </div>
      </header>
      <div class="flex flex-wrap gap-2">
        <StatusBadge tone={props.server.online ? 'success' : 'neutral'}>
          {props.server.online
            ? t('player_profile.server_online', 'Server online')
            : t('player_profile.server_offline', 'Server offline')}
        </StatusBadge>
        <StatusBadge tone="neutral" icon={props.server.public ? 'globe' : 'shield'}>
          {props.server.public
            ? t('player_profile.public_server', 'Public server')
            : t('player_profile.private_server', 'Private server')}
        </StatusBadge>
      </div>
      <dl class="player-profile-server-metrics">
        <div>
          <dt>{t('player_profile.player_name', 'Player name')}</dt>
          <dd>{props.server.playerName || t('ui.unknown', 'Unknown')}</dd>
        </div>
        <div>
          <dt>{t('player_profile.rank', 'Rank')}</dt>
          <dd>{props.server.rank || t('ui.unknown', 'Unknown')}</dd>
        </div>
        <div>
          <dt>{t('player_profile.playtime', 'Playtime')}</dt>
          <dd>{duration(props.server.totalTime)}</dd>
        </div>
        <div>
          <dt>{t('player_profile.connections', 'Connections')}</dt>
          <dd>{number(props.server.connections)}</dd>
        </div>
        <div>
          <dt>{t('player_profile.kills', 'Kills')}</dt>
          <dd>{number(props.server.kills)}</dd>
        </div>
        <div>
          <dt>{t('player_profile.deaths', 'Deaths')}</dt>
          <dd>{number(props.server.deaths)}</dd>
        </div>
      </dl>
      <dl class="player-profile-server-dates">
        <div>
          <dt>{t('player_profile.first_joined', 'First joined')}</dt>
          <dd>
            <time dateTime={props.server.firstJoinedAt}>{date(props.server.firstJoinedAt)}</time>
          </dd>
        </div>
        <div>
          <dt>{t('player_profile.last_seen', 'Last recorded activity')}</dt>
          <dd>
            <time dateTime={props.server.lastSeenAt}>{date(props.server.lastSeenAt)}</time>
          </dd>
        </div>
      </dl>
    </article>
  )

  return (
    <>
      <DashboardMiddleware />
      <div
        class="public-page player-profile-page mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12"
        aria-busy={result.loading}
      >
        <AsyncState
          loading={!authenticated() || result.loading}
          error={result.error}
          loadingLabel={t('player_profile.loading', 'Loading player profile…')}
          errorLabel={t('player_profile.load_error', 'Unable to load this player profile.')}
          onRetry={() => refetch()}
        >
          <Switch>
            <Match when={state() === 'not-linked'}>
              <PageState
                icon="link"
                title={t('player_profile.link_steam_title', 'Link your Steam account')}
                description={t(
                  'player_profile.link_steam_description',
                  'Link Steam in your account to find your player profile and game statistics.',
                )}
              >
                <ButtonLink href="/account" variant="primary">
                  {t('player_profile.manage_account', 'Manage account')}
                </ButtonLink>
              </PageState>
            </Match>
            <Match when={state() === 'not-found'}>
              <PageState
                icon="user-round"
                title={t('player_profile.not_found', 'Player profile not found')}
                description={t(
                  'player_profile.not_found_description',
                  'No visible player profile is available for this Steam account.',
                )}
              >
                <ButtonLink href="/servers">{t('player_profile.browse_servers', 'Browse servers')}</ButtonLink>
              </PageState>
            </Match>
            <Match when={data()}>
              {(profile) => (
                <>
                  <header class="public-page-heading">
                    <span class="inline-flex items-center gap-2 text-sm font-medium text-primary">
                      <Icon name="user-round" size={17} />
                      {t('player_profile.eyebrow', 'Garry’s Mod player')}
                    </span>
                    <h1>{t('player_profile.title', 'Player profile')}</h1>
                    <p>
                      {t(
                        'player_profile.description',
                        'Player information, recorded activity and statistics for each game server.',
                      )}
                    </p>
                  </header>

                  <section class="public-card player-profile-identity" aria-labelledby="player-identity-name">
                    <div class="player-profile-player">
                      <Show
                        when={profile().player.avatarURL}
                        fallback={
                          <span class="player-profile-avatar" aria-hidden="true">
                            <Icon name="user-round" size={32} />
                          </span>
                        }
                      >
                        <img class="player-profile-avatar" src={profile().player.avatarURL!} alt="" />
                      </Show>
                      <div class="min-w-0 flex-1">
                        <h2 id="player-identity-name">
                          {profile().player.name || t('player_profile.unknown_player', 'Unknown player')}
                        </h2>
                        <p class="player-profile-steam-id">
                          <span>{t('player_profile.steam_id', 'Steam ID')}</span>{' '}
                          <code>{profile().player.steamID64}</code>
                        </p>
                        <Show when={profile().player.registeredAt}>
                          <p class="player-profile-created">
                            {t('player_profile.registered', 'Profile created')}{' '}
                            <time dateTime={profile().player.registeredAt!}>
                              {date(profile().player.registeredAt!)}
                            </time>
                          </p>
                        </Show>
                        <ButtonLink
                          class="mt-4"
                          size="sm"
                          href={`https://steamcommunity.com/profiles/${profile().player.steamID64}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Icon name="external-link" size={15} />
                          {t('player_profile.open_steam', 'Open Steam profile')}
                        </ButtonLink>
                      </div>
                    </div>
                    <section class="player-profile-trust" aria-labelledby="player-trust-title">
                      <h3 id="player-trust-title">
                        <Icon name="shield-check" size={18} />
                        {t('player_profile.trust', 'Trust level')}
                      </h3>
                      <Show
                        when={profile().player.trustLevel !== null}
                        fallback={
                          <StatusBadge tone="neutral" icon="circle-help">
                            {t('ui.unknown', 'Unknown')}
                          </StatusBadge>
                        }
                      >
                        <p class="player-profile-trust-score">
                          {number(profile().player.trustLevel!)}
                          <span> / {number(100)}</span>
                        </p>
                        <meter
                          aria-labelledby="player-trust-title"
                          min={0}
                          max={100}
                          value={profile().player.trustLevel!}
                        >
                          {number(profile().player.trustLevel!)} / {number(100)}
                        </meter>
                      </Show>
                      <p class="player-profile-trust-help">
                        {t('player_profile.trust_description', 'Current trust score recorded by Gmod Integration.')}
                      </p>
                    </section>
                  </section>

                  <section aria-labelledby="player-summary-title" class="player-profile-section">
                    <div>
                      <h2 id="player-summary-title">{t('player_profile.overview', 'Activity overview')}</h2>
                      <p class="player-profile-note">
                        {t(
                          'player_profile.visible_statistics',
                          'Statistics cover all servers visible to you. Other players can only see public servers.',
                        )}
                      </p>
                    </div>
                    <dl class="player-profile-summary">
                      <div class="public-card">
                        <dt>{t('player_profile.servers', 'Servers played')}</dt>
                        <dd>{number(profile().summary.servers)}</dd>
                      </div>
                      <div class="public-card">
                        <dt>{t('player_profile.playtime', 'Playtime')}</dt>
                        <dd>{duration(profile().summary.totalTime)}</dd>
                      </div>
                      <div class="public-card">
                        <dt>{t('player_profile.kills', 'Kills')}</dt>
                        <dd>{number(profile().summary.kills)}</dd>
                      </div>
                      <div class="public-card">
                        <dt>{t('player_profile.deaths', 'Deaths')}</dt>
                        <dd>{number(profile().summary.deaths)}</dd>
                      </div>
                      <div class="public-card">
                        <dt>{t('player_profile.connections', 'Connections')}</dt>
                        <dd>{number(profile().summary.connections)}</dd>
                      </div>
                    </dl>
                    <dl class="player-profile-activity-dates">
                      <Show when={profile().summary.firstJoinedAt}>
                        <div>
                          <dt>{t('player_profile.first_joined', 'First joined')}</dt>
                          <dd>
                            <time dateTime={profile().summary.firstJoinedAt!}>
                              {date(profile().summary.firstJoinedAt!)}
                            </time>
                          </dd>
                        </div>
                      </Show>
                      <Show when={profile().summary.lastSeenAt}>
                        <div>
                          <dt>{t('player_profile.last_seen', 'Last recorded activity')}</dt>
                          <dd>
                            <time dateTime={profile().summary.lastSeenAt!}>{date(profile().summary.lastSeenAt!)}</time>
                          </dd>
                        </div>
                      </Show>
                    </dl>
                  </section>

                  <section aria-labelledby="player-servers-title" class="player-profile-section">
                    <h2 id="player-servers-title">{t('player_profile.server_statistics', 'Statistics by server')}</h2>
                    <AsyncState
                      empty={profile().servers.length === 0}
                      emptyLabel={t(
                        'player_profile.no_servers',
                        'No recorded statistics are available on servers visible to you.',
                      )}
                    >
                      <div class="player-profile-server-grid">
                        <For each={profile().servers}>{(server) => <ServerCard server={server} />}</For>
                      </div>
                    </AsyncState>
                    <Show when={profile().pagination.total > 0}>
                      <div class="player-profile-pagination">
                        <p role="status">
                          {t(
                            'player_profile.showing',
                            'Showing {1}–{2} of {3} servers',
                            number(profile().servers.length ? profile().pagination.offset + 1 : 0),
                            number(profile().pagination.offset + profile().servers.length),
                            number(profile().pagination.total),
                          )}
                        </p>
                        <PaginationControls
                          page={page()}
                          pages={pages()}
                          previousDisabled={page() <= 1}
                          nextDisabled={page() >= pages()}
                          onFirst={() => changePage(0)}
                          onPrevious={() => changePage(Math.max(0, profile().pagination.offset - PAGE_SIZE))}
                          onNext={() => changePage(profile().pagination.offset + PAGE_SIZE)}
                          onLast={() => changePage((pages() - 1) * PAGE_SIZE)}
                        />
                      </div>
                    </Show>
                  </section>
                </>
              )}
            </Match>
          </Switch>
        </AsyncState>
      </div>
    </>
  )
}

export default PlayerProfile
