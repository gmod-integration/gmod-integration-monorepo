import { createMemo, For, Show, type Component } from 'solid-js'
import type { PublicServerActivityPoint } from '@gmod/schema/server/PublicServerRankingSchema.js'
import { useI18n } from '../i18n.js'

interface ServerActivityChartProps {
  points: PublicServerActivityPoint[]
  online: boolean
}

const DAY = 24 * 60 * 60 * 1000

/** Daily peak population; missing days stay gaps instead of implying zero players. */
const ServerActivityChart: Component<ServerActivityChartProps> = (props) => {
  const { t, locale } = useI18n()
  const samples = createMemo(() => {
    const daily = new Map<number, number>()
    for (const point of props.points) {
      const at = new Date(point.at).getTime()
      if (!Number.isFinite(at) || !Number.isFinite(point.players) || point.players < 0) continue
      daily.set(at, Math.max(daily.get(at) || 0, point.players))
    }
    return [...daily].sort(([first], [second]) => first - second).map(([at, players]) => ({ at, players }))
  })
  const peak = () => Math.max(0, ...samples().map((point) => point.players))
  const plotted = createMemo(() => {
    const points = samples()
    const start = points[0]?.at ?? 0
    const end = points.at(-1)?.at ?? start
    return points.map((point) => ({
      ...point,
      x: end > start ? 8 + ((point.at - start) / (end - start)) * 284 : 150,
      y: 56 - (peak() ? (point.players / peak()) * 44 : 0),
    }))
  })
  const path = () =>
    plotted()
      .map(
        (point, index, all) =>
          `${index === 0 || point.at - all[index - 1].at > DAY ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`,
      )
      .join(' ')
  const shortDate = (at: number) => new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' }).format(at)
  const description = () =>
    `${t('servers.activity', 'Activity')} — ${t('servers.last7days', 'Last 7 days')}. ${t('servers.peak', 'Peak')}: ${peak()} ${t('servers.players', 'Players')}`

  return (
    <figure class="flex flex-col gap-1 w-full min-w-0" aria-label={t('servers.activity', 'Activity')}>
      <figcaption class="flex flex-wrap items-center justify-between gap-x-3 text-sm text-base-content/60">
        <span>
          {t('servers.activity', 'Activity')} · {t('servers.last7days', 'Last 7 days')}
        </span>
        <Show when={samples().length > 0}>
          <span>
            {t('servers.peak', 'Peak')} : {peak()}
          </span>
        </Show>
      </figcaption>
      <Show
        when={samples().length > 0}
        fallback={
          <p class="flex items-center h-16 text-sm text-base-content/60">
            {t('servers.noActivity', 'No activity recorded')}
          </p>
        }
      >
        <svg
          viewBox="0 0 300 64"
          role="img"
          aria-label={description()}
          class={`h-16 w-full ${props.online ? 'text-primary' : 'text-base-content/60'}`}
        >
          <title>{description()}</title>
          <path d="M8,12 H292 M8,34 H292 M8,56 H292" fill="none" stroke="currentColor" opacity="0.1" />
          <path
            data-activity-line
            d={path()}
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <For each={plotted()}>
            {(point) => (
              <circle cx={point.x} cy={point.y} r="2.5" fill="currentColor">
                <title>
                  {shortDate(point.at)} : {point.players} {t('servers.players', 'Players')}
                </title>
              </circle>
            )}
          </For>
        </svg>
        <div class="flex justify-between gap-3 text-sm text-base-content/60">
          <span>{shortDate(samples()[0].at)}</span>
          <span>{shortDate(samples().at(-1)!.at)}</span>
        </div>
      </Show>
    </figure>
  )
}

export default ServerActivityChart
