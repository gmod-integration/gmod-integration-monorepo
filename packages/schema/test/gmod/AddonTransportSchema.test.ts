import { describe, expect, it } from 'vitest'
import { AddonRequestSchema, ADDON_MAX_MESSAGE_BYTES } from '../../src/gmod/AddonTransportSchema.js'

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
