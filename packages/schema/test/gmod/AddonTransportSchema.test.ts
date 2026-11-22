import { describe, expect, it } from 'vitest'
import {
  AddonRequestSchema,
  AddonRconCommandSchema,
  AddonCommandResultSchema,
  ADDON_MAX_MESSAGE_BYTES,
} from '../../src/gmod/AddonTransportSchema.js'

const base = { action: 'addon.request', id: 'connection-1:request-2', method: 'POST', endpoint: '/servers/s1/status' }

describe('AddonRequestSchema', () => {
  it('accepts a bounded request and a bodyless lookup', () => {
    expect(AddonRequestSchema.safeParse({ ...base, body: { players: 0, available: true } }).success).toBe(true)
    expect(AddonRequestSchema.safeParse({ ...base, method: 'GET' }).success).toBe(true)
  })

  it.each([
    { action: 'execute' },
    { id: 'x'.repeat(97) },
    { id: '' },
    { id: '<script>' },
    { method: 'DELETE' },
    { endpoint: 'https://example.com/' },
    { endpoint: '/servers/../s1' },
    { endpoint: '/servers/s1%2fconfig' },
    { endpoint: '/servers/s1\n/config' },
    { token: 'secret' },
    { body: { key: undefined } },
    { body: { value: Infinity } },
    { body: new Date() },
  ])('rejects invalid envelope fields and non-JSON values: %j', (changes) => {
    expect(AddonRequestSchema.safeParse({ ...base, ...changes }).success).toBe(false)
  })

  it('rejects a body on GET requests', () => {
    expect(AddonRequestSchema.safeParse({ ...base, method: 'GET', body: {} }).success).toBe(false)
  })

  it('rejects cyclic, deeply nested and prototype-polluting bodies without recursion failure', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    let deep: unknown = null
    for (let i = 0; i < 100; i++) deep = { nested: deep }
    for (const body of [cyclic, deep, JSON.parse('{"__proto__":{"polluted":true}}'), { constructor: {} }]) {
      expect(AddonRequestSchema.safeParse({ ...base, body }).success).toBe(false)
    }
  })

  it('bounds aggregate payload string length and collection size', () => {
    const text = 'a'.repeat(ADDON_MAX_MESSAGE_BYTES / 2 + 1)
    expect(AddonRequestSchema.safeParse({ ...base, body: [text, text] }).success).toBe(false)
    expect(AddonRequestSchema.safeParse({ ...base, body: Array(10_001).fill(0) }).success).toBe(false)
  })
})

describe('addon privileged command schemas', () => {
  const id = '3a918b48-ff6f-4ed4-b2b9-f4b722840f04'
  const command = {
    method: 'wsAuthorizedRcon',
    requestID: id,
    steamID: '76561198000000001',
    command: 'status',
    expiresAt: 1800000000000,
  }
  it('accepts only bounded, correlated RCON commands with an expiry', () => {
    expect(AddonRconCommandSchema.safeParse(command).success).toBe(true)
    for (const changes of [
      { requestID: undefined },
      { expiresAt: undefined },
      { expiresAt: Infinity },
      { method: 'wsRunLua' },
      { steamID: '765' },
      { command: '' },
      { command: 'x'.repeat(8193) },
      { command: 'status\nquit' },
      { command: 'status\0quit' },
      { token: 'unexpected' },
    ])
      expect(AddonRconCommandSchema.safeParse({ ...command, ...changes }).success).toBe(false)
  })
  it('requires consistent terminal results without extra output or secrets', () => {
    const result = { action: 'addon.command-result', id, method: 'wsAuthorizedRcon', ok: true, code: 'executed' }
    expect(AddonCommandResultSchema.safeParse(result).success).toBe(true)
    expect(AddonCommandResultSchema.safeParse({ ...result, ok: false, code: 'permission_denied' }).success).toBe(true)
    expect(AddonCommandResultSchema.safeParse({ ...result, code: 'permission_denied' }).success).toBe(false)
    expect(AddonCommandResultSchema.safeParse({ ...result, ok: false }).success).toBe(false)
    expect(AddonCommandResultSchema.safeParse({ ...result, output: 'sensitive' }).success).toBe(false)
  })
})
