const sensitiveKey = /token|password|secret|authorization|apikey|accesskey|receipt|verifier|^code$|^state$|^ticket$/i

/** Return a log-safe copy of JSON request data without changing what controllers receive. */
export function redactLogData(value: unknown): unknown {
  if (typeof value === 'string' && /^data:image\//i.test(value)) return '[IMAGE]'
  if (Array.isArray(value)) return value.map(redactLogData)
  if (value === null || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      sensitiveKey.test(key.replace(/[^a-z0-9]/gi, '')) ? '[REDACTED]' : redactLogData(entry),
    ]),
  )
}
