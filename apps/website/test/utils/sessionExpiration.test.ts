import { describe, expect, it } from 'vitest'
import { parseSessionExpiration } from '../../src/utils/sessionExpiration.js'

describe('session expiration formats', () => {
  const timestamp = Date.UTC(2030, 0, 1)
  const iso = '2030-01-01T00:00:00.000Z'

  it.each([timestamp, String(timestamp), iso])('reads the same expiration instant from %s', (value) => {
    expect(parseSessionExpiration(value)?.toISOString()).toBe(iso)
  })

  it.each([0, '0', -1, '-1'])('preserves an expired timestamp %s for the caller to reject', (value) => {
    expect(parseSessionExpiration(value)?.getTime()).toBe(Number(value))
  })

  it.each(['', 'invalid-date', 'Infinity', Number.NaN, Number.POSITIVE_INFINITY, '8640000000000001'])(
    'rejects an invalid or out-of-range expiration %s',
    (value) => {
      expect(parseSessionExpiration(value)).toBeNull()
    },
  )
})
