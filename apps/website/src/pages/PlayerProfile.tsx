import { useLocation, useNavigate, useParams } from '@solidjs/router'
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
  PlayerIdentifierSchema,
  PlayerSteamID64Schema,
  type PlayerProfileResponse,
  type PlayerProfileServer,
} from '@gmod/schema/user/PlayerProfileSchema.js'
import { PaginationControls } from '../components/Pagination.js'
import {
  AsyncState,
  Button,
  ButtonLink,
  CopyableValue,
  DateTime,
  DiscordAvatar,
  FormField,
  Icon,
  PageState,
  StatusBadge,
} from '../components/ui/index.js'
import PlayerProfileActions from '../components/PlayerProfileActions.js'
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
  const params = useParams<{ steamID64?: string; discordID?: string; playerID?: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const target = () => params.discordID || params.playerID || params.steamID64 || ''
  const provider = () =>
    params.discordID ? 'discord' : location.pathname.startsWith('/players/steam/') ? 'steam' : 'auto'
  const identity = () => `${provider()}:${target()}`
  const emptyPagination = () => ({ target: identity(), offset: 0, warningOffset: 0, banOffset: 0 })
  const [pagination, setPagination] = createSignal(emptyPagination())
  const [lookup, setLookup] = createSignal(target())
  const [invalidLookup, setInvalidLookup] = createSignal(false)
  const [failedSteamAvatar, setFailedSteamAvatar] = createSignal<string>()
  const authenticated = () => isLogged() && Boolean(authSession())
  createEffect(
    on(
      identity,
      () => {
        setPagination(emptyPagination())
        setLookup(target())
        setInvalidLookup(false)
        setFailedSteamAvatar(undefined)
      },
      { defer: true },
    ),
  )
  let activeRequest: AbortController | undefined
  onCleanup(() => activeRequest?.abort())

  const [result, { refetch }] = createResource(
    () =>
      authenticated()
        ? {
            ...(pagination().target === identity() ? pagination() : emptyPagination()),
            target: target(),
            provider: provider(),
          }
        : false,
    async (request): Promise<ProfileResult> => {
      activeRequest?.abort()
      activeRequest = new AbortController()
      const identifierSchema = request.provider === 'steam' ? PlayerSteamID64Schema : PlayerIdentifierSchema
      if (request.target && !identifierSchema.safeParse(request.target).success) return { kind: 'not-found' }
      const endpoint = request.target
        ? `/users/:discordID/players/${request.provider === 'auto' ? '' : `${request.provider}/`}${encodeURIComponent(request.target)}`
        : '/users/:discordID/player-profile'
      const query = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(request.offset),
        warningOffset: String(request.warningOffset),
        banOffset: String(request.banOffset),
      })
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
  const steamAvatar = () => {
    const url = data()?.player.avatarURL
    return url && failedSteamAvatar() !== url ? url : undefined
  }
  const number = (value: number) => new Intl.NumberFormat(locale()).format(value)
  const duration = (seconds: number) => {
    if (seconds < 60) return t('player_profile.duration_seconds', '{1} s', number(seconds))
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return t('player_profile.duration_minutes', '{1} min', number(minutes))
    return t('player_profile.duration_hours', '{1} h {2} min', number(Math.floor(minutes / 60)), number(minutes % 60))
  }
  const changePage = (offset: number) => setPagination((previous) => ({ ...previous, target: identity(), offset }))
  const changeModerationPage = (kind: 'warnings' | 'bans', offset: number) =>
    setPagination((previous) => ({
      ...previous,
      target: identity(),
      [kind === 'warnings' ? 'warningOffset' : 'banOffset']: offset,
    }))
  const pages = () => Math.max(1, Math.ceil(data()!.pagination.total / data()!.pagination.limit))
  const page = () => Math.floor(data()!.pagination.offset / data()!.pagination.limit) + 1

  const findPlayer = (event: SubmitEvent) => {
    event.preventDefault()
    const id = lookup().trim()
    const valid = PlayerIdentifierSchema.safeParse(id).success
    setInvalidLookup(!valid)
    if (valid) navigate(`/players/${encodeURIComponent(id)}`)
  }

  type Sanction =
    PlayerProfileResponse['moderation']['warnings'][number] | PlayerProfileResponse['moderation']['bans'][number]
  const ModerationList: Component<{ kind: 'warnings' | 'bans'; profile: PlayerProfileResponse }> = (props) => {
    const records = (): Sanction[] => props.profile.moderation[props.kind]
    const paging = () => props.profile.moderation[props.kind === 'warnings' ? 'warningsPagination' : 'bansPagination']
    const totalPages = () => Math.max(1, Math.ceil(paging().total / paging().limit))
    const currentPage = () => Math.floor(paging().offset / paging().limit) + 1
    return (
      <section class="public-card player-profile-sanctions" aria-labelledby={`player-${props.kind}-title`}>
        <header>
          <h3 id={`player-${props.kind}-title`}>
            <Icon name={props.kind === 'warnings' ? 'triangle-alert' : 'ban'} size={18} />
            {props.kind === 'warnings' ? t('player_profile.warnings', 'Warnings') : t('player_profile.bans', 'Bans')}
            <span class="player-profile-sanction-count">{number(paging().total)}</span>
          </h3>
        </header>
        <AsyncState
          empty={records().length === 0}
          emptyLabel={
            props.kind === 'warnings'
              ? t('player_profile.no_warnings', 'No recorded warnings on servers visible to you.')
              : t('player_profile.no_bans', 'No recorded bans on servers visible to you.')
          }
        >
          <ul class="player-profile-sanction-list">
            <For each={records()}>
              {(sanction) => (
                <li>
                  <div class="player-profile-sanction-heading">
                    <strong>{sanction.serverName || t('servers.no_name', 'No name')}</strong>
                    <Show when={'active' in sanction ? sanction : undefined}>
                      {(ban) => (
                        <StatusBadge tone={ban().active ? 'danger' : 'neutral'}>
                          {ban().active
                            ? t('player_profile.ban_active', 'Active')
                            : t('player_profile.ban_expired', 'Expired')}
                        </StatusBadge>
                      )}
                    </Show>
                  </div>
                  <p class="player-profile-sanction-reason">
                    {sanction.reason || t('player_profile.no_reason', 'No reason recorded')}
                  </p>
                  <dl>
                    <div>
                      <dt>{t('player_profile.issued_at', 'Issued')}</dt>
                      <dd>
                        <DateTime value={sanction.createdAt} />
                      </dd>
                    </div>
                    <Show when={'durationMinutes' in sanction ? sanction : undefined}>
                      {(ban) => (
                        <>
                          <div>
                            <dt>{t('player_profile.ban_duration', 'Duration')}</dt>
                            <dd>
                              {ban().durationMinutes === 0
                                ? t('player_profile.ban_permanent', 'Permanent')
                                : duration(ban().durationMinutes * 60)}
                            </dd>
                          </div>
                          <Show when={ban().expiresAt}>
                            {(expiresAt) => (
                              <div>
                                <dt>{t('player_profile.ban_expires', 'Expires')}</dt>
                                <dd>
                                  <DateTime value={expiresAt()} />
                                </dd>
                              </div>
                            )}
                          </Show>
                        </>
                      )}
                    </Show>
                  </dl>
                </li>
              )}
            </For>
          </ul>
        </AsyncState>
        <Show when={paging().total > 0}>
          <div class="player-profile-pagination">
            <p role="status">
              {t(
                'player_profile.sanctions_showing',
                'Showing {1}–{2} of {3} records',
                number(records().length ? paging().offset + 1 : 0),
                number(paging().offset + records().length),
                number(paging().total),
              )}
            </p>
            <PaginationControls
              page={currentPage()}
              pages={totalPages()}
              previousDisabled={currentPage() <= 1}
              nextDisabled={currentPage() >= totalPages()}
              onFirst={() => changeModerationPage(props.kind, 0)}
              onPrevious={() => changeModerationPage(props.kind, Math.max(0, paging().offset - paging().limit))}
              onNext={() => changeModerationPage(props.kind, paging().offset + paging().limit)}
              onLast={() => changeModerationPage(props.kind, (totalPages() - 1) * paging().limit)}
            />
          </div>
        </Show>
      </section>
    )
  }

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
            <DateTime value={props.server.firstJoinedAt} />
          </dd>
        </div>
        <div>
          <dt>{t('player_profile.last_seen', 'Last recorded activity')}</dt>
          <dd>
            <DateTime value={props.server.lastSeenAt} />
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
        <form class="public-toolbar player-profile-lookup" onSubmit={findPlayer}>
          <FormField
            id="player-profile-lookup"
            label={t('player_profile.lookup', 'Find a player')}
            description={t('player_profile.lookup_help', 'Enter a Steam ID64 or Discord ID to open a player profile.')}
            error={
              invalidLookup()
                ? t('player_profile.invalid_identifier', 'Enter an ID containing 17 to 20 digits.')
                : undefined
            }
          >
            <input
              id="player-profile-lookup"
              class="input input-bordered w-full"
              inputmode="numeric"
              value={lookup()}
              onInput={(event) => {
                setLookup(event.currentTarget.value)
                setInvalidLookup(false)
              }}
              autocomplete="off"
              aria-invalid={invalidLookup() || undefined}
              aria-describedby={`player-profile-lookup-description${invalidLookup() ? ' player-profile-lookup-error' : ''}`}
            />
          </FormField>
          <Button type="submit" variant="primary">
            <Icon name="search" size={16} />
            {t('player_profile.lookup_open', 'Open profile')}
          </Button>
        </form>
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
                  'No visible player profile is available for this Steam or Discord account.',
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
                      <div class="player-profile-avatars">
                        <figure>
                          <div class="player-profile-avatar" aria-hidden="true">
                            <Show when={steamAvatar()} keyed fallback={<Icon name="user-round" size={32} />}>
                              {(src) => (
                                <img
                                  src={src}
                                  alt=""
                                  decoding="async"
                                  onError={() => {
                                    if (data()?.player.avatarURL === src) setFailedSteamAvatar(src)
                                  }}
                                />
                              )}
                            </Show>
                          </div>
                          <figcaption>Steam</figcaption>
                        </figure>
                        <Show when={profile().player.discordID}>
                          {(id) => (
                            <figure>
                              <div class="player-profile-avatar">
                                <DiscordAvatar
                                  user={{ id: id(), avatarURL: profile().player.discordAvatarURL ?? undefined }}
                                />
                              </div>
                              <figcaption>Discord</figcaption>
                            </figure>
                          )}
                        </Show>
                      </div>
                      <div class="min-w-0 flex-1">
                        <h2 id="player-identity-name">
                          {profile().player.name || t('player_profile.unknown_player', 'Unknown player')}
                        </h2>
                        <dl class="player-profile-identifiers">
                          <div>
                            <dt>{t('player_profile.steam_id', 'Steam ID')}</dt>
                            <dd>
                              <CopyableValue
                                value={profile().player.steamID64}
                                label={t('player_profile.copy_steam_id', 'Copy Steam ID')}
                              />
                            </dd>
                          </div>
                          <div>
                            <dt>{t('player_profile.discord_id', 'Discord ID')}</dt>
                            <dd>
                              <Show
                                when={profile().player.discordID}
                                fallback={
                                  <span class="player-profile-note">
                                    {t('player_profile.discord_not_linked', 'No linked Discord account')}
                                  </span>
                                }
                              >
                                {(id) => (
                                  <CopyableValue
                                    value={id()}
                                    label={t('player_profile.copy_discord_id', 'Copy Discord ID')}
                                  />
                                )}
                              </Show>
                            </dd>
                          </div>
                        </dl>
                        <Show when={profile().player.registeredAt}>
                          <p class="player-profile-created">
                            {t('player_profile.registered', 'Profile created')}{' '}
                            <DateTime value={profile().player.registeredAt} />
                          </p>
                        </Show>
                      </div>
                    </div>
                    <div class="player-profile-action-panel">
                      <div class="player-profile-links">
                        <ButtonLink
                          size="sm"
                          href={`https://steamcommunity.com/profiles/${profile().player.steamID64}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Icon name="external-link" size={15} />
                          {t('player_profile.open_steam', 'Open Steam profile')}
                        </ButtonLink>
                        <Show when={profile().player.discordID}>
                          {(id) => (
                            <ButtonLink
                              size="sm"
                              href={`https://discord.com/users/${id()}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <Icon name="external-link" size={15} />
                              {t('player_profile.open_discord', 'Open Discord profile')}
                            </ButtonLink>
                          )}
                        </Show>
                      </div>
                      <PlayerProfileActions profile={profile()} />
                    </div>
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
                            <DateTime value={profile().summary.firstJoinedAt} />
                          </dd>
                        </div>
                      </Show>
                      <Show when={profile().summary.lastSeenAt}>
                        <div>
                          <dt>{t('player_profile.last_seen', 'Last recorded activity')}</dt>
                          <dd>
                            <DateTime value={profile().summary.lastSeenAt} />
                          </dd>
                        </div>
                      </Show>
                    </dl>
                  </section>

                  <section aria-labelledby="player-moderation-title" class="player-profile-section">
                    <div>
                      <h2 id="player-moderation-title">{t('player_profile.moderation', 'Recorded moderation')}</h2>
                      <p class="player-profile-note">
                        {t(
                          'player_profile.moderation_visibility',
                          'Warnings and bans cover servers visible to you. Other players can only see public servers. These records describe decisions made by each server.',
                        )}
                      </p>
                      <p class="player-profile-note">
                        {t(
                          'player_profile.ban_status_help',
                          'Ban status is estimated from its recorded duration; early unbans may not be reflected.',
                        )}
                      </p>
                    </div>
                    <div class="player-profile-moderation-grid">
                      <ModerationList kind="warnings" profile={profile()} />
                      <ModerationList kind="bans" profile={profile()} />
                    </div>
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
