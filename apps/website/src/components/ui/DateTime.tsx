import { createMemo, Show, splitProps, type JSX } from 'solid-js'
import { useI18n } from '../../i18n.js'
import { getDateTimeParts, type DateTimeOptions, type DateTimeValue } from '../../utils/dateTime.js'

export interface DateTimeProps extends Omit<JSX.HTMLAttributes<HTMLElement>, 'children' | 'ref'>, DateTimeOptions {
  value: DateTimeValue
  fallback?: JSX.Element
}

/** Compact localized date and 24-hour clock, with the complete timestamp available on hover. */
export function DateTime(props: DateTimeProps) {
  const { locale } = useI18n()
  const [local, attributes] = splitProps(props, ['value', 'dateOnly', 'timeZone', 'fallback', 'class', 'title'])
  const parts = createMemo(() =>
    getDateTimeParts(local.value, locale(), { dateOnly: local.dateOnly, timeZone: local.timeZone }),
  )
  return (
    <Show
      when={parts()}
      keyed
      fallback={
        <span {...attributes} class={`ui-date-time ${local.class ?? ''}`}>
          {local.fallback ?? '—'}
        </span>
      }
    >
      {(value) => (
        <time
          {...attributes}
          class={`ui-date-time ${local.class ?? ''}`}
          dateTime={value.dateTime}
          title={local.title ?? value.title}
        >
          <span>{value.dateText}</span>
          <Show when={value.timeText}>
            <span class="ui-date-time-separator" aria-hidden="true">
              {' '}
              ·{' '}
            </span>
            <span class="ui-date-time-clock">{value.timeText}</span>
          </Show>
        </time>
      )}
    </Show>
  )
}
