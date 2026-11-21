import { describe, expect, it } from 'vitest'
import { redactLogData } from '../../src/utils/redactLogData.js'

describe('redactLogData', () => {
  it('redacts credentials in nested JSON objects and arrays while keeping ordinary diagnostic fields', () => {
    const input = {
      password: 'private-password',
      receipt: 'private-erasure-receipt',
      nested: [{ client_secret: 'private-secret', access_token: 'private-token', code: 'private-code', count: 2 }],
      enabled: false,
      details: null,
    }

    expect(redactLogData(input)).toEqual({
      password: '[REDACTED]',
      receipt: '[REDACTED]',
      nested: [{ client_secret: '[REDACTED]', access_token: '[REDACTED]', code: '[REDACTED]', count: 2 }],
      enabled: false,
      details: null,
    })
    expect(input.password).toBe('private-password')
  })

  it('preserves absent bodies and primitive JSON values', () => {
    expect(redactLogData(undefined)).toBeUndefined()
    expect(redactLogData('diagnostic')).toBe('diagnostic')
    expect(redactLogData(0)).toBe(0)
  })
})
