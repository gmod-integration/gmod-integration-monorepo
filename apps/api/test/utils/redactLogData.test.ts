import { describe, expect, it } from 'vitest'
import { redactLogData } from '../../src/utils/redactLogData.js'

describe('redactLogData', () => {
  it('omits encoded avatar and nested image uploads without logging their bytes', () => {
    expect(
      redactLogData({ avatar: 'data:image/png;base64,cHJpdmF0ZQ==', nested: ['data:image/jpeg;base64,cHJpdmF0ZQ=='] }),
    ).toEqual({ avatar: '[IMAGE]', nested: ['[IMAGE]'] })
  })
  it('also redacts one-time OAuth state, PKCE verifiers and socket tickets', () => {
    expect(
      redactLogData({ state: 'private', code_verifier: 'private', ticket: 'private', redirect: '/account' }),
    ).toEqual({ state: '[REDACTED]', code_verifier: '[REDACTED]', ticket: '[REDACTED]', redirect: '/account' })
  })
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
