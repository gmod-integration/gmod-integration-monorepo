/** OAuth callbacks use epoch milliseconds; existing browser sessions may use ISO dates. */
export function parseSessionExpiration(value: string | number): Date | null {
  const date = new Date(typeof value === 'string' && /^-?\d+$/.test(value) ? Number(value) : value)
  return Number.isFinite(date.getTime()) ? date : null
}
