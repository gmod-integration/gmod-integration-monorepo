import { createMemo, createUniqueId, For, Show, type Component } from 'solid-js'
import type { AdminAnalytics, AdminDailyRegistrations } from '@gmod/schema/admin/AdminAnalyticsSchema.js'
import { useI18n } from '../../../i18n.js'

type SeriesKey = Exclude<keyof AdminDailyRegistrations, 'date'>
export type RegistrationMetric = 'all' | SeriesKey

const AdminRegistrationsChart: Component<{ data: AdminAnalytics; metric: RegistrationMetric }> = (props) => {
  const { t, locale } = useI18n()
  const id = createUniqueId()
  const series = createMemo(() =>
    [
      {
        key: 'communities' as const,
        label: t('admin_v6.communities', 'Communities'),
        color: 'var(--color-primary)',
        dash: '',
      },
      {
        key: 'servers' as const,
        label: t('admin_v6.game_servers', 'Game servers'),
        color: 'var(--color-info)',
        dash: '9 5',
      },
      {
        key: 'accounts' as const,
        label: t('admin_v6.user_accounts', 'User accounts'),
        color: 'var(--color-success)',
        dash: '2 5',
      },
    ].filter((item) => props.metric === 'all' || item.key === props.metric),
  )
  const maximum = createMemo(() =>
    Math.max(0, ...props.data.registrations.flatMap((point) => series().map((item) => point[item.key]))),
  )
  const step = () => Math.max(1, Math.ceil(maximum() / 4))
  const ceiling = () => step() * 4
  const x = (index: number) => 8 + (index / Math.max(1, props.data.registrations.length - 1)) * 684
  const y = (value: number) => 214 - (value / ceiling()) * 204
  const path = (key: SeriesKey) =>
    props.data.registrations
      .map((point, index) => `${index ? 'L' : 'M'}${x(index).toFixed(2)},${y(point[key]).toFixed(2)}`)
      .join(' ')
  const number = (value: number) => value.toLocaleString(locale())
  const date = (value: string, short = false) =>
    new Intl.DateTimeFormat(locale(), {
      day: 'numeric',
      month: 'short',
      ...(short ? {} : { year: 'numeric' }),
      timeZone: 'UTC',
    }).format(new Date(`${value}T00:00:00.000Z`))
  const total = (key: SeriesKey) => props.data.registrations.reduce((sum, point) => sum + point[key], 0)

  return (
    <figure class="flex min-w-0 flex-col gap-4" aria-label={t('admin_v6.daily_registrations', 'Daily registrations')}>
      <figcaption class="text-sm text-base-content/65">
        {t('admin_v6.analytics_period_utc', '{1}–{2} · UTC', date(props.data.startDate), date(props.data.endDate))}
      </figcaption>
      <ul class="flex flex-wrap gap-x-6 gap-y-3 text-sm" aria-label={t('admin_v6.chart_legend', 'Chart legend')}>
        <For each={series()}>
          {(item) => (
            <li class="flex items-center gap-2">
              <svg viewBox="0 0 36 12" width="36" height="12" aria-hidden="true">
                <path d="M0 6 H36" stroke={item.color} stroke-width="3" stroke-dasharray={item.dash} />
              </svg>
              <span>{item.label}</span>
              <strong class="tabular-nums">{number(total(item.key))}</strong>
            </li>
          )}
        </For>
      </ul>
      <Show
        when={maximum() > 0}
        fallback={
          <p role="status" class="rounded-lg bg-base-200/50 p-6 text-sm text-base-content/65">
            {t('admin_v6.registrations_empty', 'No registrations for the selected metric in this period.')}
          </p>
        }
      >
        <div class="grid min-w-0 grid-cols-[3rem_minmax(0,1fr)] gap-x-2">
          <div
            class="flex flex-col justify-between pb-6 text-right text-xs tabular-nums text-base-content/65"
            aria-hidden="true"
          >
            <For each={[4, 3, 2, 1, 0]}>{(tick) => <span>{number(tick * step())}</span>}</For>
          </div>
          <div class="min-w-0">
            <svg
              viewBox="0 0 700 224"
              preserveAspectRatio="none"
              class="h-56 w-full sm:h-64"
              role="img"
              aria-labelledby={`${id}-title ${id}-description`}
            >
              <title id={`${id}-title`}>
                {t('admin_v6.registration_chart_label', 'Daily registration trends in UTC')}
              </title>
              <desc id={`${id}-description`}>
                {t(
                  'admin_v6.registration_chart_description',
                  'Each line shows new records by registration day. Line patterns identify the metrics. Exact values are available in the daily data table.',
                )}
              </desc>
              <For each={[0, 1, 2, 3, 4]}>
                {(tick) => (
                  <path
                    d={`M8 ${10 + tick * 51} H692`}
                    fill="none"
                    stroke="currentColor"
                    opacity="0.12"
                    vector-effect="non-scaling-stroke"
                  />
                )}
              </For>
              <For each={series()}>
                {(item) => (
                  <g data-registration-series={item.key}>
                    <path
                      d={path(item.key)}
                      fill="none"
                      stroke={item.color}
                      stroke-width="2.5"
                      stroke-dasharray={item.dash}
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      vector-effect="non-scaling-stroke"
                    />
                    <For each={props.data.registrations}>
                      {(point, index) => (
                        <circle cx={x(index())} cy={y(point[item.key])} r="2.5" fill={item.color}>
                          <title>
                            {date(point.date)} · {item.label}: {number(point[item.key])}
                          </title>
                        </circle>
                      )}
                    </For>
                  </g>
                )}
              </For>
            </svg>
            <div class="flex justify-between gap-2 text-xs text-base-content/65" aria-hidden="true">
              <span>{date(props.data.startDate, true)}</span>
              <span>{date(props.data.registrations[Math.floor(props.data.days / 2)].date, true)}</span>
              <span>{date(props.data.endDate, true)}</span>
            </div>
          </div>
        </div>
      </Show>
      <details class="min-w-0 border-t border-base-200 pt-3">
        <summary class="cursor-pointer text-sm font-medium">{t('admin_v6.view_daily_data', 'View daily data')}</summary>
        <div class="mt-3 max-h-80 min-w-0 overflow-auto">
          <table class="table">
            <caption class="pb-2 text-left text-sm text-base-content/65">
              {t('admin_v6.daily_data_caption', 'Daily registration counts (UTC)')}
            </caption>
            <thead>
              <tr>
                <th scope="col">{t('admin_v6.date', 'Date')}</th>
                <For each={series()}>{(item) => <th scope="col">{item.label}</th>}</For>
              </tr>
            </thead>
            <tbody>
              <For each={props.data.registrations}>
                {(point) => (
                  <tr>
                    <th scope="row">
                      <time dateTime={point.date}>{date(point.date)}</time>
                    </th>
                    <For each={series()}>{(item) => <td class="tabular-nums">{number(point[item.key])}</td>}</For>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  )
}
export default AdminRegistrationsChart
