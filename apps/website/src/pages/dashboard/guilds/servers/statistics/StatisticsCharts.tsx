import { createMemo, createUniqueId, For, Show } from 'solid-js'
import type { ServerStatisticsResponse } from '@gmod/schema/server/ServerStatisticsSchema.js'
import { useI18n } from '../../../../../i18n.js'
import { decimal, linePath, utcDate } from './statisticsFormat.js'

interface ChartSeries {
  label: string
  values: (number | null)[]
  color: string
  dash?: string
}

export function StatisticsLineChart(props: {
  label: string
  times: string[]
  series: ChartSeries[]
  hourly: boolean
  emptyLabel: string
}) {
  const { t, locale } = useI18n()
  const id = createUniqueId()
  const maximum = createMemo(() => Math.max(1, ...props.series.flatMap((series) => series.values.map((v) => v ?? 0))))
  const hasData = () => props.series.some((series) => series.values.some((value) => value !== null))
  const date = (at: string) => utcDate(at, locale(), props.hourly)
  return (
    <figure class="flex min-w-0 flex-col gap-4" aria-label={props.label}>
      <Show when={hasData()} fallback={<p class="text-sm text-base-content/65">{props.emptyLabel}</p>}>
        <ul class="flex flex-wrap gap-x-6 gap-y-2 text-sm" aria-label={t('server_statistics.legend', 'Legend')}>
          <For each={props.series}>
            {(series) => (
              <li class="flex items-center gap-2">
                <svg width="30" height="12" aria-hidden="true">
                  <path d="M0 6 H30" stroke={series.color} stroke-width="3" stroke-dasharray={series.dash} />
                </svg>
                <span>{series.label}</span>
              </li>
            )}
          </For>
        </ul>
        <div class="grid min-w-0 grid-cols-[2.75rem_minmax(0,1fr)] gap-2">
          <div
            class="flex flex-col justify-between pb-7 text-right text-sm tabular-nums text-base-content/60"
            aria-hidden="true"
          >
            <For each={[1, 0.5, 0]}>{(fraction) => <span>{decimal(maximum() * fraction, locale())}</span>}</For>
          </div>
          <div class="min-w-0">
            <svg
              viewBox="0 0 700 190"
              preserveAspectRatio="none"
              class="h-48 w-full"
              role="img"
              aria-labelledby={`${id}-title`}
            >
              <title id={`${id}-title`}>{props.label}</title>
              <For each={[10, 95, 180]}>
                {(y) => <path d={`M10 ${y} H680`} fill="none" stroke="currentColor" opacity="0.12" />}
              </For>
              <For each={props.series}>
                {(series) => (
                  <g data-statistics-series={series.label}>
                    <path
                      d={linePath(series.values, maximum())}
                      fill="none"
                      stroke={series.color}
                      stroke-width="2.5"
                      stroke-dasharray={series.dash}
                      vector-effect="non-scaling-stroke"
                    />
                    <For each={series.values}>
                      {(value, index) => (
                        <Show when={value !== null}>
                          <circle
                            cx={10 + (index() / Math.max(1, props.times.length - 1)) * 670}
                            cy={180 - ((value ?? 0) / maximum()) * 170}
                            r="2.5"
                            fill={series.color}
                          >
                            <title>
                              {date(props.times[index()])}: {series.label} {decimal(value ?? 0, locale())}
                            </title>
                          </circle>
                        </Show>
                      )}
                    </For>
                  </g>
                )}
              </For>
            </svg>
            <Show when={props.times.length}>
              <div class="mt-2 flex justify-between gap-2 text-sm text-base-content/60">
                <span>{date(props.times[0])}</span>
                <span>{date(props.times.at(-1)!)}</span>
              </div>
            </Show>
          </div>
        </div>
        <details class="border-t border-base-200 pt-3">
          <summary class="cursor-pointer text-sm font-medium">
            {t('server_statistics.view_data', 'View chart data')}
          </summary>
          <div class="mt-3 max-h-80 overflow-auto">
            <table class="table">
              <caption class="pb-2 text-left text-sm text-base-content/65">{props.label} · UTC</caption>
              <thead>
                <tr>
                  <th scope="col">{t('server_statistics.date', 'Date (UTC)')}</th>
                  <For each={props.series}>{(series) => <th scope="col">{series.label}</th>}</For>
                </tr>
              </thead>
              <tbody>
                <For each={props.times}>
                  {(at, index) => (
                    <tr>
                      <th scope="row">{date(at)}</th>
                      <For each={props.series}>
                        {(series) => (
                          <td class="tabular-nums">
                            {series.values[index()] === null
                              ? t('server_statistics.no_sample', 'No sample')
                              : decimal(series.values[index()] ?? 0, locale())}
                          </td>
                        )}
                      </For>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </details>
      </Show>
    </figure>
  )
}

export function StatisticsBarChart(props: {
  label: string
  items: { label: string; value: number; detail?: string }[]
  emptyLabel: string
  suffix?: string
}) {
  const { t, locale } = useI18n()
  const maximum = () => Math.max(1, ...props.items.map((item) => item.value))
  const value = (amount: number) => `${decimal(amount, locale())}${props.suffix || ''}`
  const itemValue = (item: { value: number; detail?: string }) =>
    `${value(item.value)}${item.detail ? ` (${item.detail})` : ''}`
  return (
    <figure class="flex min-w-0 flex-col gap-4" aria-label={props.label}>
      <Show
        when={props.items.some((item) => item.value > 0)}
        fallback={<p class="text-sm text-base-content/65">{props.emptyLabel}</p>}
      >
        <ul class="flex min-w-0 flex-col gap-4">
          <For each={props.items}>
            {(item) => (
              <li class="min-w-0">
                <div class="mb-2 flex justify-between gap-3 text-sm">
                  <span class="break-words">{item.label}</span>
                  <strong class="tabular-nums">{itemValue(item)}</strong>
                </div>
                <svg
                  viewBox="0 0 100 12"
                  preserveAspectRatio="none"
                  class="h-3 w-full"
                  role="img"
                  aria-label={`${item.label}: ${itemValue(item)}`}
                >
                  <title>
                    {item.label}: {itemValue(item)}
                  </title>
                  <rect width="100" height="12" rx="3" fill="var(--color-base-200)" />
                  <rect width={(item.value / maximum()) * 100} height="12" rx="3" fill="var(--color-primary)" />
                </svg>
              </li>
            )}
          </For>
        </ul>
        <details class="border-t border-base-200 pt-3">
          <summary class="cursor-pointer text-sm font-medium">
            {t('server_statistics.view_data', 'View chart data')}
          </summary>
          <div class="mt-3 max-h-80 overflow-auto">
            <table class="table">
              <caption class="pb-2 text-left text-sm text-base-content/65">{props.label}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('server_statistics.category', 'Category')}</th>
                  <th scope="col">{t('server_statistics.count', 'Count')}</th>
                </tr>
              </thead>
              <tbody>
                <For each={props.items}>
                  {(item) => (
                    <tr>
                      <th scope="row">{item.label}</th>
                      <td class="tabular-nums">{itemValue(item)}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </details>
      </Show>
    </figure>
  )
}

export function StatisticsHeatmap(props: { cells: ServerStatisticsResponse['heatmap'] }) {
  const { t, locale } = useI18n()
  const weekdays = () =>
    Array.from({ length: 7 }, (_, day) =>
      new Intl.DateTimeFormat(locale(), { weekday: 'short', timeZone: 'UTC' }).format(
        new Date(Date.UTC(2024, 0, 7 + day)),
      ),
    )
  const maximum = () => Math.max(1, ...props.cells.map((cell) => cell.average ?? 0))
  const cell = (day: number, hour: number) => props.cells.find((item) => item.day === day && item.hour === hour)
  const value = (average: number | null | undefined) =>
    average == null ? t('server_statistics.no_sample', 'No sample') : decimal(average, locale())
  return (
    <figure class="flex min-w-0 flex-col gap-4" aria-label={t('server_statistics.heatmap', 'Busiest hours (UTC)')}>
      <Show
        when={props.cells.some((item) => item.samples > 0)}
        fallback={
          <p class="text-sm text-base-content/65">
            {t('server_statistics.no_population', 'No population samples for this period.')}
          </p>
        }
      >
        <div class="overflow-x-auto">
          <svg
            viewBox="0 0 750 220"
            class="w-full min-w-[32rem]"
            role="img"
            aria-label={t('server_statistics.heatmap', 'Busiest hours (UTC)')}
          >
            <title>{t('server_statistics.heatmap', 'Busiest hours (UTC)')}</title>
            <For each={Array.from({ length: 24 }, (_, hour) => hour)}>
              {(hour) => (
                <text x={67 + hour * 28} y="17" text-anchor="middle" font-size="14" fill="currentColor">
                  {hour}
                </text>
              )}
            </For>
            <For each={weekdays()}>
              {(day, dayIndex) => (
                <g>
                  <text x="46" y={44 + dayIndex() * 26} text-anchor="end" font-size="14" fill="currentColor">
                    {day}
                  </text>
                  <For each={Array.from({ length: 24 }, (_, hour) => hour)}>
                    {(hour) => (
                      <g>
                        <rect
                          x={54 + hour * 28}
                          y={26 + dayIndex() * 26}
                          width="24"
                          height="22"
                          rx="3"
                          fill="var(--color-base-200)"
                        />
                        <Show when={cell(dayIndex(), hour)?.average != null}>
                          <rect
                            x={54 + hour * 28}
                            y={26 + dayIndex() * 26}
                            width="24"
                            height="22"
                            rx="3"
                            fill="var(--color-primary)"
                            opacity={0.15 + ((cell(dayIndex(), hour)?.average ?? 0) / maximum()) * 0.85}
                          />
                        </Show>
                        <title>
                          {day} {hour}:00 UTC: {value(cell(dayIndex(), hour)?.average)}
                        </title>
                      </g>
                    )}
                  </For>
                </g>
              )}
            </For>
          </svg>
        </div>
        <p class="text-sm text-base-content/65">
          {t(
            'server_statistics.heatmap_help',
            'Average recorded players by weekday and hour. Stronger color means more players; grey cells have no sample.',
          )}
        </p>
        <details class="border-t border-base-200 pt-3">
          <summary class="cursor-pointer text-sm font-medium">
            {t('server_statistics.view_data', 'View chart data')}
          </summary>
          <div class="mt-3 max-h-80 overflow-auto">
            <table class="table">
              <caption class="pb-2 text-left text-sm text-base-content/65">
                {t('server_statistics.heatmap', 'Busiest hours (UTC)')}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{t('server_statistics.day', 'Day')}</th>
                  <th scope="col">{t('server_statistics.hour', 'Hour (UTC)')}</th>
                  <th scope="col">{t('server_statistics.average_players', 'Average players')}</th>
                  <th scope="col">{t('server_statistics.samples', 'Samples')}</th>
                </tr>
              </thead>
              <tbody>
                <For each={props.cells}>
                  {(item) => (
                    <tr>
                      <th scope="row">{weekdays()[item.day]}</th>
                      <td>{item.hour}:00</td>
                      <td>{value(item.average)}</td>
                      <td>{decimal(item.samples, locale(), 0)}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </details>
      </Show>
    </figure>
  )
}
