export type StatisticsPeriod = '24h' | '7d' | '30d' | 'custom'

export const utcInput = (date: Date) => date.toISOString().slice(0, 16)

/** datetime-local intentionally represents UTC here, rather than the browser's local time. */
export function customPeriod(from: string, to: string, now = Date.now()) {
  const start = new Date(`${from}Z`).getTime()
  const end = new Date(`${to}Z`).getTime()
  if (!from || !to || !Number.isFinite(start) || !Number.isFinite(end) || start >= end)
    return { error: 'order' as const }
  if (end - start > 90 * 24 * 60 * 60 * 1000) return { error: 'range' as const }
  if (end > now) return { error: 'future' as const }
  return { from: new Date(start).toISOString(), to: new Date(end).toISOString() }
}

export function utcDate(value: string, locale: string, hour = false) {
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(hour ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(new Date(value))
}

export function decimal(value: number, locale: string, maximumFractionDigits = 1) {
  return value.toLocaleString(locale, { maximumFractionDigits })
}

/** Missing buckets break the path; a missing sample never means zero players. */
export function linePath(values: (number | null)[], maximum: number) {
  let previousKnown = false
  return values
    .map((value, index) => {
      if (value === null) {
        previousKnown = false
        return ''
      }
      const x = 10 + (index / Math.max(1, values.length - 1)) * 670
      const y = 180 - (value / Math.max(1, maximum)) * 170
      const command = previousKnown ? 'L' : 'M'
      previousKnown = true
      return `${command}${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}
