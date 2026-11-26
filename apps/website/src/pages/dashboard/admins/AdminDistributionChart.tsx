import { createMemo, For, Show, type Component } from 'solid-js'
import { useI18n } from '../../../i18n.js'

export interface AdminDistributionItem {
  label: string
  value: number | null
}

/** Counts share one scale; categories can overlap and are never presented as a pie. */
const AdminDistributionChart: Component<{
  label: string
  items: AdminDistributionItem[]
  emptyLabel: string
}> = (props) => {
  const { t, locale } = useI18n()
  const maximum = createMemo(() => Math.max(1, ...props.items.map((item) => item.value ?? 0)))
  const number = (value: number | null) =>
    value === null ? t('ui.unknown', 'Unknown') : value.toLocaleString(locale())
  return (
    <figure class="flex min-w-0 flex-col gap-4" aria-label={props.label}>
      <Show
        when={props.items.some((item) => item.value === null || item.value > 0)}
        fallback={
          <p role="status" class="text-sm text-base-content/60">
            {props.emptyLabel}
          </p>
        }
      >
        <ul class="flex min-w-0 flex-col gap-4">
          <For each={props.items}>
            {(item) => (
              <li class="min-w-0">
                <div class="mb-2 flex min-w-0 items-center justify-between gap-3 text-sm">
                  <span class="min-w-0 break-words">{item.label}</span>
                  <strong class="tabular-nums">{number(item.value)}</strong>
                </div>
                <Show when={item.value !== null}>
                  <svg
                    viewBox="0 0 100 12"
                    preserveAspectRatio="none"
                    class="h-3 w-full"
                    role="img"
                    aria-label={`${item.label}: ${number(item.value)}`}
                  >
                    <title>
                      {item.label}: {number(item.value)}
                    </title>
                    <rect width="100" height="12" rx="3" fill="var(--color-base-200)" />
                    <rect
                      width={(item.value! / maximum()) * 100}
                      height="12"
                      rx="3"
                      fill="var(--color-primary)"
                      data-distribution-bar
                    />
                  </svg>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </Show>
      <details class="min-w-0 border-t border-base-200 pt-3">
        <summary class="cursor-pointer text-sm font-medium">{t('admin_v6.view_chart_data', 'View chart data')}</summary>
        <div class="mt-3 max-h-80 min-w-0 overflow-auto">
          <table class="table">
            <caption class="pb-2 text-left text-sm text-base-content/65">{props.label}</caption>
            <thead>
              <tr>
                <th scope="col">{t('admin_v6.category', 'Category')}</th>
                <th scope="col">{t('admin_v6.count', 'Count')}</th>
              </tr>
            </thead>
            <tbody>
              <For each={props.items}>
                {(item) => (
                  <tr>
                    <th scope="row">{item.label}</th>
                    <td class="tabular-nums">{number(item.value)}</td>
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
export default AdminDistributionChart
