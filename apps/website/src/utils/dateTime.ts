export type DateTimeValue = string | number | Date | null | undefined

export interface DateTimeOptions {
  dateOnly?: boolean
  timeZone?: string
}

/** Numeric dates follow the selected language; clocks consistently use 00:00–23:59. */
export function getDateTimeParts(value: DateTimeValue, locale: string, options: DateTimeOptions = {}) {
  if (value == null || (typeof value === 'string' && !value.trim())) return undefined
  const date = new Date(value instanceof Date ? value.getTime() : value)
  if (!Number.isFinite(date.getTime())) return undefined
  const zone = { timeZone: options.timeZone }
  const dateText = new Intl.DateTimeFormat(locale, {
    ...zone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
  const timeText = options.dateOnly
    ? undefined
    : new Intl.DateTimeFormat(locale, {
        ...zone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(date)
  const title = new Intl.DateTimeFormat(locale, {
    ...zone,
    dateStyle: 'full',
    ...(options.dateOnly ? {} : { timeStyle: 'long', hourCycle: 'h23' as const }),
  }).format(date)
  return { dateTime: date.toISOString(), dateText, timeText, title }
}

/** Plain text for translated sentences and other contexts that cannot contain a component. */
export function formatDateTime(value: DateTimeValue, locale: string, options: DateTimeOptions = {}): string {
  const parts = getDateTimeParts(value, locale, options)
  return parts ? [parts.dateText, parts.timeText].filter(Boolean).join(' · ') : '—'
}
