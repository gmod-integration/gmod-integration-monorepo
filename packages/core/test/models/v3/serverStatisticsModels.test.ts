import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ServerStatisticsResponseSchema } from '@gmod/schema/server/ServerStatisticsSchema.js'

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  gm_server_stat: { count: vi.fn() },
  gm_server_status: { findUnique: vi.fn() },
}))
vi.mock('@gmod/infra-prisma', () => ({ default: prismaMock }))
const countryStatisticsMock = vi.hoisted(() => vi.fn())
vi.mock('../../../src/models/v3/serverCountryStatistics.js', () => ({
  getServerCountryStatistics: countryStatisticsMock,
}))
const { processGetServerStatistics } = await import('../../../src/models/v3/serverStatisticsModels.js')
const now = new Date('2026-11-23T12:00:00.000Z')
const DAY = 86_400_000

function aggregates(
  overrides: {
    population?: unknown[]
    arrivals?: unknown[]
    activity?: unknown[]
    summary?: unknown[]
    heatmap?: unknown[]
    durations?: unknown[]
    top?: unknown[]
  } = {},
) {
  for (const rows of [
    overrides.population,
    overrides.arrivals,
    overrides.activity,
    overrides.summary,
    overrides.heatmap,
    overrides.durations,
    overrides.top,
  ])
    prismaMock.$queryRaw.mockResolvedValueOnce(rows ?? [])
}

beforeEach(() => {
  prismaMock.$queryRaw.mockReset()
  prismaMock.gm_server_stat.count.mockReset().mockResolvedValue(0)
  prismaMock.gm_server_status.findUnique.mockReset().mockResolvedValue(null)
  countryStatisticsMock.mockReset().mockResolvedValue({ available: true, totalPlayers: 0, items: [] })
})

describe('server statistics', () => {
  it('rejects malformed, incomplete, reversed, too long and future ranges before accessing storage', async () => {
    for (const query of [
      { period: 'forever' },
      { period: ['7d'] },
      { period: '7d', from: now.toISOString() },
      { period: 'custom', from: '2026-11-22T00:00:00Z' },
      { period: 'custom', from: 'invalid', to: now.toISOString() },
      { period: 'custom', from: now.toISOString(), to: '2026-11-22T00:00:00Z' },
      { period: 'custom', from: '2026-01-01T00:00:00Z', to: now.toISOString() },
      { period: 'custom', from: '2026-11-22T00:00:00Z', to: '2026-11-23T12:02:00Z' },
      { period: 'custom', from: '2026-11-24T00:00:00Z', to: '2026-11-25T00:00:00Z' },
      { unknown: true },
    ]) {
      const result = await processGetServerStatistics('server', query, now)
      expect(result.status).toBe(400)
      expect(result.body).toMatchObject({ error: 'Invalid server statistics query' })
    }
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled()
    expect(prismaMock.gm_server_stat.count).not.toHaveBeenCalled()
    expect(prismaMock.gm_server_status.findUnique).not.toHaveBeenCalled()
    expect(countryStatisticsMock).not.toHaveBeenCalled()
  })

  it('fills empty UTC intervals with unknown population and zero completed activity', async () => {
    aggregates()
    const result = await processGetServerStatistics('server', {}, now)
    expect(result.status).toBe(200)
    const body = ServerStatisticsResponseSchema.parse(result.body)
    expect(body.period).toEqual({
      from: '2026-11-16T12:00:00.000Z',
      to: now.toISOString(),
      bucket: 'day',
      timeZone: 'UTC',
    })
    expect(body.population).toHaveLength(8)
    expect(body.population[0]).toEqual({ at: '2026-11-16T00:00:00.000Z', average: null, peak: null, samples: 0 })
    expect(body.population.every((point) => point.average === null && point.peak === null && point.samples === 0)).toBe(
      true,
    )
    expect(
      body.activity.every((point) => point.newPlayers === 0 && point.sessions === 0 && point.playedSeconds === 0),
    ).toBe(true)
    expect(body.summary).toEqual({
      registeredPlayers: 0,
      newPlayers: 0,
      peakPlayers: null,
      averagePlayers: null,
      completedSessions: 0,
      playedSeconds: 0,
      medianSessionSeconds: null,
      activePlayers: 0,
    })
    expect(body.heatmap).toHaveLength(168)
    expect(body.heatmap[0]).toEqual({ day: 0, hour: 0, average: null, samples: 0 })
    expect(body.heatmap[167]).toEqual({ day: 6, hour: 23, average: null, samples: 0 })
    expect(body.sessionDurations.map((row) => row.count)).toEqual([0, 0, 0, 0])
    expect(body.live).toEqual({ updatedAt: null, online: false, players: 0, maxPlayers: 0, branches: [] })
    expect(body.countries).toEqual({ available: true, totalPlayers: 0, items: [] })
  })

  it('combines bounded SQL aggregates, weights averages by observations and keeps missing data distinct from zero', async () => {
    prismaMock.gm_server_stat.count.mockResolvedValue(100)
    countryStatisticsMock.mockResolvedValue({
      available: true,
      totalPlayers: 3,
      items: [
        { country: 'FR', players: 2 },
        { country: null, players: 1 },
      ],
    })
    aggregates({
      population: [
        { at: '2026-11-22T00:00:00.000Z', average: { toString: () => '12.5' }, peak: 15, samples: 2n },
        { at: '2026-11-23T00:00:00.000Z', average: 0, peak: 0, samples: 3n },
      ],
      arrivals: [{ at: '2026-11-22T00:00:00.000Z', newPlayers: 4n }],
      activity: [{ at: '2026-11-22T00:00:00.000Z', sessions: 5n, playedSeconds: 7200n }],
      summary: [
        {
          completedSessions: 5n,
          playedSeconds: 7200n,
          activePlayers: 3n,
          medianSessionSeconds: { toString: () => '600.5' },
        },
      ],
      heatmap: [{ day: 0, hour: 14, average: 12.5, samples: 2n }],
      durations: [{ under15m: 2n, mediumSessions: 2n, longSessions: 1n, over3h: 0n }],
      top: [{ steamID64: '76561198000000001', name: 'Player', playedSeconds: 3600n, sessions: 2n }],
    })
    const result = await processGetServerStatistics('server', {}, now)
    expect(result.status).toBe(200)
    const body = ServerStatisticsResponseSchema.parse(result.body)
    expect(body.summary).toEqual({
      registeredPlayers: 100,
      newPlayers: 4,
      peakPlayers: 15,
      averagePlayers: 5,
      completedSessions: 5,
      playedSeconds: 7200,
      medianSessionSeconds: 600.5,
      activePlayers: 3,
    })
    expect(body.population.at(-2)).toMatchObject({ average: 12.5, peak: 15, samples: 2 })
    expect(body.population.at(-1)).toMatchObject({ average: 0, peak: 0, samples: 3 })
    expect(body.population[0].average).toBeNull()
    expect(body.activity.at(-2)).toMatchObject({ newPlayers: 4, sessions: 5, playedSeconds: 7200 })
    expect(body.heatmap[14]).toEqual({ day: 0, hour: 14, average: 12.5, samples: 2 })
    expect(body.sessionDurations).toEqual([
      { key: 'under15m', count: 2 },
      { key: '15to60m', count: 2 },
      { key: '1to3h', count: 1 },
      { key: 'over3h', count: 0 },
    ])
    expect(body.topPlayers).toEqual([
      { steamID64: '76561198000000001', name: 'Player', playedSeconds: 3600, sessions: 2 },
    ])
    expect(body.countries).toEqual({
      available: true,
      totalPlayers: 3,
      items: [
        { country: 'FR', players: 2 },
        { country: null, players: 1 },
      ],
    })
    expect(() => JSON.stringify(body)).not.toThrow()
  })

  it('binds server and exact half-open time boundaries for every aggregate, sorting median values in the database', async () => {
    aggregates()
    const serverID = "server' OR 1=1"
    await processGetServerStatistics(serverID, { period: '24h' }, now)
    const from = new Date(now.getTime() - DAY)
    const queries = prismaMock.$queryRaw.mock.calls.map(([query]) => query)
    expect(queries).toHaveLength(7)
    for (const query of queries) {
      expect(query.sql).not.toContain(serverID)
      expect(query.values).toContain(serverID)
      expect(query.values).toContainEqual(from)
      expect(query.values).toContainEqual(now)
      expect(query.sql).toContain('>= ?')
      expect(query.sql).toContain('< ?')
    }
    expect(queries[0].sql).toContain("DATE_FORMAT(createdAt, '%Y-%m-%dT%H:00:00.000Z')")
    expect(queries[1].sql).toContain('first_join >= ? AND first_join < ?')
    expect(queries[2].sql).toContain('sessionEndTimeStamp >= ? AND sessionEndTimeStamp < ?')
    expect(queries[3].sql).toContain('COUNT(DISTINCT steamID64)')
    expect(queries[3].sql).toContain('ROW_NUMBER() OVER (ORDER BY time, id)')
    expect(queries[3].sql).toContain('FROM scoped_sessions WHERE time >= 0')
    expect(queries[3].sql).toContain('FLOOR((total + 1) / 2), FLOOR((total + 2) / 2)')
    expect(queries[5].sql).toContain('time >= 0 AND time < 900')
    expect(queries[5].sql).toContain('time >= 900 AND time < 3600')
    expect(queries[5].sql).toContain('time >= 3600 AND time < 10800')
    expect(queries[5].sql).toContain('time >= 10800')
    expect(queries[6].sql).toContain('LIMIT 10')
    expect(prismaMock.gm_server_stat.count).toHaveBeenCalledWith({ where: { server_id: serverID } })
    expect(countryStatisticsMock).toHaveBeenCalledWith(serverID, from, now)
  })

  it('preserves other statistics when the country log store is unavailable', async () => {
    aggregates()
    countryStatisticsMock.mockResolvedValue({ available: false, totalPlayers: 0, items: [] })
    prismaMock.gm_server_stat.count.mockResolvedValue(42)
    const result = await processGetServerStatistics('server', {}, now)
    expect(result.status).toBe(200)
    const body = ServerStatisticsResponseSchema.parse(result.body)
    expect(body.summary.registeredPlayers).toBe(42)
    expect(body.countries).toEqual({ available: false, totalPlayers: 0, items: [] })
  })

  it('normalizes offset dates, clamps a small browser clock drift and supports the 90-day custom limit', async () => {
    aggregates()
    const custom = await processGetServerStatistics(
      'server',
      { period: 'custom', from: '2026-11-23T11:30:00+01:00', to: '2026-11-23T12:00:30Z' },
      now,
    )
    expect(custom.status).toBe(200)
    const body = ServerStatisticsResponseSchema.parse(custom.body)
    expect(body.period).toEqual({
      from: '2026-11-23T10:30:00.000Z',
      to: now.toISOString(),
      bucket: 'hour',
      timeZone: 'UTC',
    })
    expect(body.population.map((point) => point.at)).toEqual(['2026-11-23T10:00:00.000Z', '2026-11-23T11:00:00.000Z'])
    aggregates()
    const maximum = await processGetServerStatistics(
      'server',
      { period: 'custom', from: new Date(now.getTime() - 90 * DAY).toISOString(), to: now.toISOString() },
      now,
    )
    expect(maximum.status).toBe(200)
    expect(ServerStatisticsResponseSchema.parse(maximum.body).population).toHaveLength(91)
  })

  it('projects only branch counts from a fresh snapshot, including unknown clients', async () => {
    aggregates()
    prismaMock.gm_server_status.findUnique.mockResolvedValue({
      updatedAt: now,
      players: 6,
      maxPlayers: 32,
      playersList: JSON.stringify([
        { branch: 'x86-64', name: 'Private name', steamID64: 'sensitive', position: { x: 7 } },
        { branch: ' X86-64 ' },
        { branch: 'dev' },
        {},
        { branch: 'x'.repeat(33) },
        { branch: 42 },
        null,
      ]),
    })
    const result = await processGetServerStatistics('server', {}, now)
    expect(result.status).toBe(200)
    const body = ServerStatisticsResponseSchema.parse(result.body)
    expect(body.live).toEqual({
      updatedAt: now.toISOString(),
      online: true,
      players: 6,
      maxPlayers: 32,
      branches: [
        { name: 'unknown', count: 3 },
        { name: 'x86-64', count: 2 },
        { name: 'dev', count: 1 },
      ],
    })
    expect(JSON.stringify(body)).not.toContain('Private name')
    expect(JSON.stringify(body)).not.toContain('sensitive')
    expect(JSON.stringify(body)).not.toContain('position')
    expect(prismaMock.gm_server_status.findUnique).toHaveBeenCalledWith({
      where: { id: 'server' },
      select: { updatedAt: true, players: true, maxPlayers: true, playersList: true },
    })
  })

  it('marks stale snapshots offline and handles malformed live snapshots without losing historical statistics', async () => {
    for (const playersList of ['invalid', '{}', '[]']) {
      aggregates()
      prismaMock.gm_server_status.findUnique.mockResolvedValue({
        updatedAt: now,
        players: 2,
        maxPlayers: 32,
        playersList,
      })
      const current = await processGetServerStatistics('server', {}, now)
      expect(ServerStatisticsResponseSchema.parse(current.body).live.branches).toEqual([])
    }
    aggregates()
    prismaMock.gm_server_status.findUnique.mockResolvedValue({
      updatedAt: new Date(now.getTime() - 300_001),
      players: 15,
      maxPlayers: 32,
      playersList: JSON.stringify([{ branch: 'dev' }]),
    })
    const stale = await processGetServerStatistics('server', {}, now)
    expect(ServerStatisticsResponseSchema.parse(stale.body).live).toMatchObject({
      online: false,
      players: 0,
      maxPlayers: 32,
      branches: [],
    })
  })
})
