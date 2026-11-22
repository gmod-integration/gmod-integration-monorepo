import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const raw = vi.hoisted(() => vi.fn())
vi.mock('@gmod/infra-prisma', () => ({ default: { $queryRaw: raw } }))
const { getAdminAnalytics } = await import('../../../src/models/v6/adminAnalytics.js')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-22T12:34:56.000Z'))
  raw.mockReset().mockResolvedValue([])
})
afterEach(() => vi.useRealTimers())

describe('stored administration registration analytics', () => {
  it('aggregates three bounded prepared queries and fills every missing UTC day with zero', async () => {
    raw
      .mockResolvedValueOnce([
        { date: '2026-11-16', count: 2n },
        { date: '2026-11-22', count: 1n },
      ])
      .mockResolvedValueOnce([{ date: '2026-11-18', count: 4n }])
      .mockResolvedValueOnce([{ date: '2026-11-22', count: 9n }])
    const result = await getAdminAnalytics({ days: '7' })
    expect(result).toMatchObject({
      days: 7,
      timeZone: 'UTC',
      startDate: '2026-11-16',
      endDate: '2026-11-22',
      generatedAt: '2026-11-22T12:34:56.000Z',
    })
    expect(result.registrations).toHaveLength(7)
    expect(result.registrations[0]).toEqual({ date: '2026-11-16', communities: 2, servers: 0, accounts: 0 })
    expect(result.registrations[1]).toEqual({ date: '2026-11-17', communities: 0, servers: 0, accounts: 0 })
    expect(result.registrations[2].servers).toBe(4)
    expect(result.registrations.at(-1)).toEqual({ date: '2026-11-22', communities: 1, servers: 0, accounts: 9 })
    expect(raw).toHaveBeenCalledTimes(3)
    const queries = raw.mock.calls.map(([query]) => query)
    expect(queries.map((query) => query.sql.match(/FROM (gm_\w+)/)?.[1])).toEqual(['gm_guild', 'gm_server', 'gm_user'])
    for (const query of queries) {
      expect(query.sql).toMatch(/COUNT\(\*\).*FROM/s)
      expect(query.sql).toMatch(/createdAt >= \? AND createdAt <= \?/)
      expect(query.values).toEqual([new Date('2026-11-16T00:00:00.000Z'), new Date('2026-11-22T12:34:56.000Z')])
      expect(query.sql).not.toContain('2026-11')
    }
  })
  it.each([7, 30, 90])('bounds the selected window to %i inclusive UTC days across a year boundary', async (days) => {
    vi.setSystemTime(new Date('2027-01-02T00:00:00.000Z'))
    const result = await getAdminAnalytics({ days })
    expect(result.registrations).toHaveLength(days)
    expect(result.endDate).toBe('2027-01-02')
    expect(result.startDate).toBe(new Date(Date.UTC(2027, 0, 2) - (days - 1) * 86_400_000).toISOString().slice(0, 10))
    expect(result.registrations.every((point) => point.accounts + point.communities + point.servers === 0)).toBe(true)
  })
  it('uses UTC day boundaries across leap day rather than local daylight-saving offsets', async () => {
    vi.setSystemTime(new Date('2024-03-01T00:30:00.000Z'))
    const result = await getAdminAnalytics({ days: 7 })
    expect(result.registrations.map((point) => point.date)).toContain('2024-02-29')
    expect(result.registrations.at(-1)?.date).toBe('2024-03-01')
  })
  it.each([{ days: 1000 }, { days: ['7'] }, { days: '7 OR 1=1' }, { days: 30, table: 'gm_panelToken' }])(
    'rejects invalid input before querying: %j',
    async (query) => {
      await expect(getAdminAnalytics(query)).rejects.toMatchObject({ status: 400, code: 'invalid_request' })
      expect(raw).not.toHaveBeenCalled()
    },
  )
  it('propagates storage failure instead of returning fabricated zero history', async () => {
    raw.mockRejectedValueOnce(new Error('Storage unavailable'))
    await expect(getAdminAnalytics({})).rejects.toThrow('Storage unavailable')
  })
  it.each([
    { date: '2026-11-23', count: 1n },
    { date: '2026-11-22', count: -1n },
    { date: '2026-11-22', count: 9_007_199_254_740_992n },
  ])('rejects an invalid aggregate instead of omitting it: %o', async (row) => {
    raw.mockResolvedValueOnce([row])
    await expect(getAdminAnalytics({ days: 7 })).rejects.toThrow('Invalid registration aggregate')
  })
})
