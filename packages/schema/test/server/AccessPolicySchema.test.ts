import { describe, expect, it } from 'vitest'
import {
  ACCESS_POLICY,
  AccessResponseSchema,
  hasCapability,
  capabilityLimit,
  limitResources,
} from '../../src/server/AccessPolicySchema.js'

const free = { premium: false, customBot: false, state: 'ready' as const }
describe('shared access policy', () => {
  it('defines the same free and paid quotas for every consumer', () => {
    expect(capabilityLimit(free, 'sync.roles.rules')).toBe(4)
    expect(capabilityLimit(free, 'status.buttons')).toBe(3)
    expect(capabilityLimit({ ...free, premium: true }, 'status.buttons')).toBe(25)
    expect(capabilityLimit(free, 'logs.history')).toBe(500)
    expect(capabilityLimit(free, 'errors.history')).toBe(50)
    expect(capabilityLimit({ ...free, premium: true }, 'guild.servers')).toBeNull()
    expect(hasCapability(free, 'sync.nicknames.format')).toBe(true)
    expect(hasCapability(free, 'sync.teams')).toBe(false)
    expect(hasCapability(free, 'console.rcon')).toBe(false)
    expect(hasCapability({ ...free, premium: true }, 'console.rcon')).toBe(true)
    expect(hasCapability(free, 'rewards.rules')).toBe(false)
    expect(hasCapability({ ...free, premium: true }, 'rewards.rules')).toBe(true)
    expect(Object.keys(ACCESS_POLICY)).toHaveLength(23)
  })
  it('keeps historical custom bot access separate from premium', () => {
    expect(hasCapability({ ...free, premium: true }, 'bot.custom')).toBe(false)
    expect(hasCapability({ ...free, customBot: true }, 'bot.custom')).toBe(true)
    expect(capabilityLimit({ ...free, premium: true }, 'bot.custom')).toBe(0)
    expect(capabilityLimit({ ...free, customBot: true }, 'bot.custom')).toBe(1)
  })
  it('caps only effective resources, preserving the provided stable order and original data', () => {
    const saved = ['first', 'second', 'third', 'fourth']
    expect(limitResources(free, 'status.buttons', saved)).toEqual(['first', 'second', 'third'])
    expect(saved).toHaveLength(4)
    expect(limitResources(free, 'sync.teams', saved)).toEqual([])
  })
  it('validates a public access response without accepting unknown capabilities or personal billing fields', () => {
    const snapshot = {
      guildID: 'g',
      premium: false,
      customBot: false,
      state: 'ready',
      sources: [],
      revision: 'rev',
      validUntil: '2030-01-01T00:00:00.000Z',
      usages: { 'guild.servers': 1 },
    }
    expect(AccessResponseSchema.safeParse(snapshot).success).toBe(true)
    expect(AccessResponseSchema.safeParse({ ...snapshot, usages: { unknown: 1 } }).success).toBe(false)
    expect(AccessResponseSchema.safeParse({ ...snapshot, buyer: 'person' }).success).toBe(false)
  })
})
