import { createMemo, createResource, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { useParams } from '@solidjs/router'
import {
  ServerStatisticsResponseSchema,
  type ServerStatisticsResponse,
} from '@gmod/schema/server/ServerStatisticsSchema.js'
import AdminPanel from '../../../../../components/AdminPanel.js'
import { AsyncState, Button, FormField, StatusBadge } from '../../../../../components/ui/index.js'
import { useI18n } from '../../../../../i18n.js'
import { fetchAPI } from '../../../../../utils/api.js'
import { StatisticsBarChart, StatisticsHeatmap, StatisticsLineChart } from './StatisticsCharts.js'
import { customPeriod, decimal, utcDate, utcInput, type StatisticsPeriod } from './statisticsFormat.js'

export default function ServerStatistics() {
  const { t, locale } = useI18n()
  const params = useParams()
  const [now, setNow] = createSignal(Date.now())
  onMount(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    onCleanup(() => clearInterval(timer))
  })
  const [period, setPeriod] = createSignal<StatisticsPeriod>('7d')
  const [from, setFrom] = createSignal(utcInput(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)))
  const [to, setTo] = createSignal(utcInput(new Date()))
  const custom = createMemo(() => customPeriod(from(), to()))
  const validation = () => {
    if (period() !== 'custom') return undefined
    const error = custom().error
    if (error === 'order') return t('server_statistics.invalid_dates', 'Choose a start before the end of the period.')
    if (error === 'range') return t('server_statistics.range_limit', 'Choose a period of 90 days or less.')
    if (error === 'future') return t('server_statistics.future_date', 'The end of the period cannot be in the future.')
    return undefined
  }
  const request = createMemo(() => {
    if (!params.guildID || !params.serverID || validation()) return false
    const query = new URLSearchParams({ period: period() })
    if (period() === 'custom') {
      const dates = custom()
      if (!dates.from || !dates.to) return false
      query.set('from', dates.from)
      query.set('to', dates.to)
    }
    return `/users/:discordID/guilds/${encodeURIComponent(params.guildID)}/servers/${encodeURIComponent(params.serverID)}/statistics?${query}`
  })
  // Solid resources discard responses superseded by a new server or period request.
  const [statistics, { refetch }] = createResource(request, async (endpoint) => {
    const response = await fetchAPI(endpoint, 'GET')
    if (!response.ok) throw new Error('Statistics request failed')
    const result = ServerStatisticsResponseSchema.parse(await response.json())
    const query = new URL(endpoint, 'https://dashboard.local').searchParams
    if (query.get('period') === 'custom') {
      const clampedBy = Date.parse(query.get('to')!) - Date.parse(result.period.to)
      if (result.period.from !== query.get('from') || clampedBy < 0 || clampedBy > 60_000)
        throw new Error('Unexpected statistics period')
    }
    return result
  })
  const data = () => (!statistics.error && !statistics.loading && !validation() ? statistics() : undefined)
  const number = (value: number) => decimal(value, locale())
  const hours = (seconds: number) => `${number(seconds / 3600)} ${t('server_statistics.hours_unit', 'h')}`
  const minutes = (seconds: number) => `${number(seconds / 60)} ${t('server_statistics.minutes_unit', 'min')}`
  const liveIsRecent = (value: ServerStatisticsResponse) =>
    value.live.online && value.live.updatedAt !== null && new Date(value.live.updatedAt).getTime() >= now() - 300_000
  const empty = (value: ServerStatisticsResponse) =>
    !value.population.some((point) => point.samples > 0) &&
    value.summary.completedSessions === 0 &&
    value.summary.newPlayers === 0
  const metrics = (value: ServerStatisticsResponse) => [
    {
      label: t('server_statistics.registered_players', 'Registered players'),
      value: number(value.summary.registeredPlayers),
      note: t('server_statistics.all_time', 'All time · records still stored'),
    },
    { label: t('server_statistics.new_players', 'New players'), value: number(value.summary.newPlayers) },
    {
      label: t('server_statistics.peak_players', 'Peak players'),
      value: value.summary.peakPlayers === null ? '—' : number(value.summary.peakPlayers),
      note: value.summary.peakPlayers === null ? t('server_statistics.no_sample', 'No sample') : undefined,
    },
    {
      label: t('server_statistics.average_players', 'Average players'),
      value: value.summary.averagePlayers === null ? '—' : number(value.summary.averagePlayers),
      note: value.summary.averagePlayers === null ? t('server_statistics.no_sample', 'No sample') : undefined,
    },
    {
      label: t('server_statistics.completed_sessions', 'Completed sessions'),
      value: number(value.summary.completedSessions),
    },
    {
      label: t('server_statistics.active_players', 'Players with a completed session'),
      value: number(value.summary.activePlayers),
    },
    {
      label: t('server_statistics.played_time', 'Time in completed sessions'),
      value: hours(value.summary.playedSeconds),
    },
    {
      label: t('server_statistics.median_session', 'Median session duration'),
      value: value.summary.medianSessionSeconds === null ? '—' : minutes(value.summary.medianSessionSeconds),
      note:
        value.summary.medianSessionSeconds === null
          ? t('server_statistics.no_sessions', 'No completed sessions for this period.')
          : undefined,
    },
  ]
  const durationLabel = (key: ServerStatisticsResponse['sessionDurations'][number]['key']) =>
    ({
      under15m: t('server_statistics.duration_under15m', 'Under 15 minutes'),
      '15to60m': t('server_statistics.duration_15to60m', '15–60 minutes'),
      '1to3h': t('server_statistics.duration_1to3h', '1–3 hours'),
      over3h: t('server_statistics.duration_over3h', 'Over 3 hours'),
    })[key]
  return (
    <>
      <AdminPanel
        title={t('server_statistics.page_title', 'Server statistics')}
        description={t(
          'server_statistics.description',
          'Follow player activity using the records collected by this server. All periods and chart dates use UTC.',
        )}
        icon="chart-no-axes-combined"
        actions={
          <Button size="sm" loading={statistics.loading} disabled={!request()} onClick={() => void refetch()}>
            {t('server_statistics.refresh', 'Refresh')}
          </Button>
        }
      >
        <FormField id="server-statistics-period" label={t('server_statistics.period', 'Period')}>
          <select
            id="server-statistics-period"
            class="select w-full sm:max-w-sm"
            value={period()}
            onChange={(event) => setPeriod(event.currentTarget.value as StatisticsPeriod)}
          >
            <option value="24h">{t('server_statistics.last_24h', 'Last 24 hours')}</option>
            <option value="7d">{t('server_statistics.last_7d', 'Last 7 days')}</option>
            <option value="30d">{t('server_statistics.last_30d', 'Last 30 days')}</option>
            <option value="custom">{t('server_statistics.custom', 'Custom period')}</option>
          </select>
        </FormField>
        <Show when={period() === 'custom'}>
          <div class="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField id="server-statistics-from" label={t('server_statistics.from', 'From (UTC)')}>
              <input
                id="server-statistics-from"
                type="datetime-local"
                class="input w-full"
                value={from()}
                max={to()}
                onInput={(event) => setFrom(event.currentTarget.value)}
              />
            </FormField>
            <FormField id="server-statistics-to" label={t('server_statistics.to', 'To (UTC)')}>
              <input
                id="server-statistics-to"
                type="datetime-local"
                class="input w-full"
                value={to()}
                min={from()}
                max={utcInput(new Date(now()))}
                aria-invalid={!!validation()}
                aria-describedby={validation() ? 'server-statistics-date-error' : undefined}
                onInput={(event) => setTo(event.currentTarget.value)}
              />
            </FormField>
          </div>
          <Show when={validation()}>
            <p id="server-statistics-date-error" role="alert" class="text-sm text-error">
              {validation()}
            </p>
          </Show>
        </Show>
        <p class="text-sm text-base-content/65">
          {t(
            'server_statistics.sessions_note',
            'Only completed sessions are counted. Their full duration is assigned to the time they ended, including sessions that started before the period. Ongoing sessions are excluded.',
          )}
        </p>
        <AsyncState
          loading={statistics.loading && !validation()}
          error={!validation() && statistics.error}
          errorLabel={t('server_statistics.load_error', 'Unable to load server statistics. Try again.')}
          onRetry={() => void refetch()}
        >
          <Show when={data()}>
            {(value) => (
              <>
                <p class="text-sm text-base-content/65">
                  {utcDate(value().period.from, locale(), true)} – {utcDate(value().period.to, locale(), true)} · UTC
                </p>
                <Show when={empty(value())}>
                  <p role="status" class="rounded-lg bg-base-200/50 p-4 text-sm text-base-content/65">
                    {t(
                      'server_statistics.empty',
                      'No recorded activity for this period. Current server data and all-time player records are shown separately.',
                    )}
                  </p>
                </Show>
                <dl class="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                  <For each={metrics(value())}>
                    {(metric) => (
                      <div class="min-w-0 rounded-lg border border-base-200 p-4">
                        <dt class="text-sm text-base-content/65">{metric.label}</dt>
                        <dd class="mt-2 text-2xl font-semibold tabular-nums">{metric.value}</dd>
                        <Show when={metric.note}>
                          <p class="mt-2 text-sm text-base-content/60">{metric.note}</p>
                        </Show>
                      </div>
                    )}
                  </For>
                </dl>
              </>
            )}
          </Show>
        </AsyncState>
      </AdminPanel>
      <Show when={data()}>
        {(value) => (
          <>
            <div class="settings-card-grid">
              <AdminPanel
                title={t('server_statistics.population', 'Player population')}
                description={t(
                  'server_statistics.population_help',
                  'Average and peak of recorded player counts per interval. Gaps indicate missing samples, not an empty or offline server.',
                )}
                icon="activity"
              >
                <StatisticsLineChart
                  label={t('server_statistics.population', 'Player population')}
                  hourly={value().period.bucket === 'hour'}
                  times={value().population.map((point) => point.at)}
                  series={[
                    {
                      label: t('server_statistics.average_players', 'Average players'),
                      values: value().population.map((point) => point.average),
                      color: 'var(--color-primary)',
                    },
                    {
                      label: t('server_statistics.peak_players', 'Peak players'),
                      values: value().population.map((point) => point.peak),
                      color: 'var(--color-info)',
                      dash: '7 4',
                    },
                  ]}
                  emptyLabel={t('server_statistics.no_population', 'No population samples for this period.')}
                />
              </AdminPanel>
              <AdminPanel title={t('server_statistics.heatmap', 'Busiest hours (UTC)')} icon="activity">
                <StatisticsHeatmap cells={value().heatmap} />
              </AdminPanel>
              <AdminPanel title={t('server_statistics.activity', 'New players and completed sessions')} icon="users">
                <StatisticsLineChart
                  label={t('server_statistics.activity', 'New players and completed sessions')}
                  hourly={value().period.bucket === 'hour'}
                  times={value().activity.map((point) => point.at)}
                  series={[
                    {
                      label: t('server_statistics.new_players', 'New players'),
                      values: value().activity.map((point) => point.newPlayers),
                      color: 'var(--color-success)',
                    },
                    {
                      label: t('server_statistics.completed_sessions', 'Completed sessions'),
                      values: value().activity.map((point) => point.sessions),
                      color: 'var(--color-info)',
                      dash: '7 4',
                    },
                  ]}
                  emptyLabel={t('server_statistics.no_sessions', 'No completed sessions for this period.')}
                />
              </AdminPanel>
              <AdminPanel
                title={t('server_statistics.played_time', 'Time in completed sessions')}
                description={t(
                  'server_statistics.time_help',
                  'Hours are grouped by session end time. This is not an exact breakdown of time played within each interval.',
                )}
                icon="clock"
              >
                <StatisticsLineChart
                  label={t('server_statistics.played_time', 'Time in completed sessions')}
                  hourly={value().period.bucket === 'hour'}
                  times={value().activity.map((point) => point.at)}
                  series={[
                    {
                      label: t('server_statistics.hours', 'Hours'),
                      values: value().activity.map((point) => point.playedSeconds / 3600),
                      color: 'var(--color-primary)',
                    },
                  ]}
                  emptyLabel={t('server_statistics.no_sessions', 'No completed sessions for this period.')}
                />
              </AdminPanel>
              <AdminPanel title={t('server_statistics.session_durations', 'Session durations')} icon="clock">
                <StatisticsBarChart
                  label={t('server_statistics.session_durations', 'Session durations')}
                  items={value().sessionDurations.map((item) => ({
                    label: durationLabel(item.key),
                    value: item.count,
                  }))}
                  emptyLabel={t('server_statistics.no_sessions', 'No completed sessions for this period.')}
                />
              </AdminPanel>
              <AdminPanel
                title={t('server_statistics.live', 'Current server snapshot')}
                description={t(
                  'server_statistics.live_help',
                  'The latest server snapshot is independent of the selected period.',
                )}
                icon="server"
              >
                <StatusBadge
                  tone={value().live.updatedAt === null ? 'neutral' : liveIsRecent(value()) ? 'success' : 'neutral'}
                >
                  {value().live.updatedAt === null
                    ? t('server_statistics.live_unknown', 'No server snapshot')
                    : liveIsRecent(value())
                      ? t('server_statistics.live_online', 'Recent server snapshot')
                      : t('server_statistics.live_stale', 'Server snapshot is out of date')}
                </StatusBadge>
                <Show when={value().live.updatedAt}>
                  {(updatedAt) => (
                    <p class="text-sm text-base-content/65">
                      {t('server_statistics.last_sample', 'Last sample: {1} UTC', utcDate(updatedAt(), locale(), true))}
                    </p>
                  )}
                </Show>
                <Show
                  when={liveIsRecent(value())}
                  fallback={
                    <p class="text-sm text-base-content/65">
                      {t(
                        'server_statistics.live_unavailable',
                        'Current player counts and branches are unavailable until a recent snapshot is received.',
                      )}
                    </p>
                  }
                >
                  <p class="text-xl font-semibold tabular-nums">
                    {t(
                      'server_statistics.live_players',
                      '{1} / {2} players',
                      number(value().live.players),
                      number(value().live.maxPlayers),
                    )}
                  </p>
                  <h3 class="font-semibold">{t('server_statistics.branches', 'Current player branches')}</h3>
                  <p class="text-sm text-base-content/65">
                    {t(
                      'server_statistics.branches_help',
                      'Distribution among players listed in the latest snapshot, including unknown branches.',
                    )}
                  </p>
                  <StatisticsBarChart
                    label={t('server_statistics.branches', 'Current player branches')}
                    items={value().live.branches.map((branch) => ({
                      label:
                        branch.name === 'unknown'
                          ? t('server_statistics.unknown_branch', 'Unknown branch')
                          : branch.name,
                      value: branch.count,
                      detail: (
                        branch.count /
                        Math.max(
                          1,
                          value().live.branches.reduce((sum, item) => sum + item.count, 0),
                        )
                      ).toLocaleString(locale(), { style: 'percent', maximumFractionDigits: 1 }),
                    }))}
                    emptyLabel={t('server_statistics.no_branches', 'No player branch data in the current snapshot.')}
                  />
                </Show>
              </AdminPanel>
            </div>
            <AdminPanel
              title={t('server_statistics.top_players', 'Top players by completed session time')}
              description={t(
                'server_statistics.top_players_help',
                'Up to ten players, ranked by the total duration of sessions ending in the selected period.',
              )}
              icon="users"
              type="none"
            >
              <Show
                when={value().topPlayers.length}
                fallback={
                  <p class="p-4 text-sm text-base-content/65">
                    {t('server_statistics.no_sessions', 'No completed sessions for this period.')}
                  </p>
                }
              >
                <div class="overflow-x-auto">
                  <table class="table">
                    <thead>
                      <tr>
                        <th scope="col">{t('server_statistics.player', 'Player')}</th>
                        <th scope="col">{t('server_statistics.steam_id', 'SteamID64')}</th>
                        <th scope="col">{t('server_statistics.played_time', 'Time in completed sessions')}</th>
                        <th scope="col">{t('server_statistics.completed_sessions', 'Completed sessions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={value().topPlayers}>
                        {(player) => (
                          <tr>
                            <th scope="row">
                              {player.name || t('server_statistics.unnamed_player', 'Unnamed player')}
                            </th>
                            <td>{player.steamID64}</td>
                            <td class="tabular-nums">{hours(player.playedSeconds)}</td>
                            <td class="tabular-nums">{number(player.sessions)}</td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              </Show>
            </AdminPanel>
          </>
        )}
      </Show>
    </>
  )
}
