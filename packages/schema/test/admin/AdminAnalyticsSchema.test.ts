import { describe, expect, it } from 'vitest'
import { AdminAnalyticsQuerySchema, AdminAnalyticsSchema } from '../../src/admin/AdminAnalyticsSchema.js'

const fixture = () => ({
  days: 7,
  timeZone: 'UTC',
  startDate: '2026-11-16',
  endDate: '2026-11-22',
  registrations: Array.from({ length: 7 }, (_, index) => ({
    date: `2026-11-${16 + index}`,
    communities: index === 0 ? 2 : 0,
    servers: 0,
    accounts: 0,
  })),
  generatedAt: '2026-11-22T12:00:00.000Z',
})

describe('administration analytics contracts', () => {
  it('defaults to thirty days and accepts only the three supported windows', () => {
    expect(AdminAnalyticsQuerySchema.parse({})).toEqual({ days: 30 })
    for (const days of [7, 30, 90]) {
      expect(AdminAnalyticsQuerySchema.parse({ days })).toEqual({ days })
      expect(AdminAnalyticsQuerySchema.parse({ days: String(days) })).toEqual({ days })
    }
  })
  it.each([
    { days: 365 },
    { days: '07' },
    { days: '' },
    { days: ['7'] },
    { days: true },
    { limit: 7 },
    { days: '7; DROP TABLE gm_user' },
  ])('rejects ambiguous or unsupported windows: %j', (query) => {
    expect(AdminAnalyticsQuerySchema.safeParse(query).success).toBe(false)
  })
  it('accepts a contiguous UTC window including stored zero counts', () => {
    expect(AdminAnalyticsSchema.parse(fixture()).registrations).toHaveLength(7)
  })
  it('rejects missing, duplicated, reordered or out-of-window buckets', () => {
    const data = fixture()
    for (const registrations of [
      data.registrations.slice(1),
      [...data.registrations.slice(0, 6), data.registrations[0]],
      [...data.registrations].reverse(),
      data.registrations.map((point, index) => (index === 6 ? { ...point, date: '2026-11-23' } : point)),
    ])
      expect(AdminAnalyticsSchema.safeParse({ ...data, registrations }).success).toBe(false)
  })
  it('rejects impossible dates, negative/non-integer counts and inconsistent metadata without throwing', () => {
    const data = fixture()
    for (const changes of [
      { startDate: '2026-99-99' },
      { startDate: '2026-02-30' },
      { endDate: '2026-11-23' },
      { generatedAt: '2026-11-23T12:00:00.000Z' },
      { timeZone: 'Europe/Paris' },
      { revenue: 100 },
      ...[-1, 1.5, Number.MAX_SAFE_INTEGER + 1].map((accounts) => ({
        registrations: data.registrations.map((point) => ({ ...point, accounts })),
      })),
    ])
      expect(AdminAnalyticsSchema.safeParse({ ...data, ...changes }).success).toBe(false)
  })
})
