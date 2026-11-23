import { beforeEach, describe, expect, it, vi } from 'vitest'

const { aggregate, toArray, lookupCountry, collection, db } = vi.hoisted(() => {
  const aggregate = vi.fn()
  const toArray = vi.fn()
  const collection = vi.fn(() => ({ aggregate }))
  const db = vi.fn(() => ({ collection }))
  return { aggregate, toArray, lookupCountry: vi.fn(), collection, db }
})
vi.mock('@gmod/infra-mongo', () => ({ mongoClient: { db } }))
vi.mock('@gmod/infra-geoip', () => ({ lookupCountry }))

const { getServerCountryStatistics } = await import('../../../src/models/v3/serverCountryStatistics.js')
const from = new Date('2026-11-16T12:00:00Z')
const to = new Date('2026-11-23T12:00:00Z')

beforeEach(() => {
  aggregate.mockReset().mockReturnValue({ toArray })
  toArray.mockReset().mockResolvedValue([])
  lookupCountry.mockReset().mockReturnValue(null)
  collection.mockClear()
  db.mockClear()
})

describe('server country statistics', () => {
  it('scopes connections to one server and period, deduplicating players before grouping their addresses', async () => {
    await getServerCountryStatistics('server-$ne', from, to)
    expect(db).toHaveBeenCalledWith('gmod_integration')
    expect(collection).toHaveBeenCalledWith('logs')
    const [pipeline, options] = aggregate.mock.calls[0]
    expect(pipeline[0]).toEqual({
      $match: { serverID: 'server-$ne', type: 'player_connect', createdAt: { $gte: from, $lt: to } },
    })
    expect(pipeline[1]).toEqual({ $sort: { createdAt: -1, _id: -1 } })
    const identity = pipeline[2].$project.steamID64.$let
    // A present explicit field takes precedence, even if invalid; only absent fields allow legacy fallback.
    expect(identity.vars.candidate.$cond[0]).toEqual({ $eq: [{ $type: '$data.steamID64' }, 'missing'] })
    expect(identity.vars.candidate.$cond[2]).toBe('$data.steamID64')
    expect(identity.in).toEqual({
      $cond: [{ $eq: [{ $type: '$$candidate' }, 'string'] }, '$$candidate', null],
    })
    // An arbitrary first subject is unsafe: legacy multi-subject logs may include Steam IDs in names.
    expect(identity.vars.candidate.$cond[1]).toEqual({
      $cond: [
        { $isArray: '$playerInvolvedSteamID64' },
        {
          $cond: [
            { $eq: [{ $size: '$playerInvolvedSteamID64' }, 1] },
            { $arrayElemAt: ['$playerInvolvedSteamID64', 0] },
            null,
          ],
        },
        '$playerInvolvedSteamID64',
      ],
    })
    expect(pipeline[3].$match.steamID64.$regex).toBe('^[0-9]{17}$')
    expect(pipeline.filter((stage: object) => '$group' in stage)).toEqual([
      { $group: { _id: '$steamID64', ip: { $first: '$ip' } } },
      { $group: { _id: '$ip', players: { $sum: 1 } } },
    ])
    expect(options).toMatchObject({ maxTimeMS: 5_000, timeoutMS: 5_000, allowDiskUse: true })
    expect(lookupCountry).not.toHaveBeenCalled()
  })

  it('combines addresses from the same country, includes unknown players and returns only sorted totals', async () => {
    toArray.mockResolvedValue([
      { ip: '8.8.8.8', players: 3 },
      { ip: '1.1.1.1', players: 2 },
      { ip: '2001:4860:4860::8888', players: 1 },
      { ip: '192.168.1.1', players: 2 },
      { ip: null, players: 2 },
      { ip: 'invalid', players: 1 },
      { ip: '9.9.9.9', players: 1 },
    ])
    lookupCountry.mockImplementation((ip) => {
      if (ip === '8.8.8.8' || ip === '2001:4860:4860::8888') return 'US'
      if (ip === '1.1.1.1') return 'AU'
      if (ip === '9.9.9.9') return 'FR'
      return null
    })

    const result = await getServerCountryStatistics('server', from, to)
    expect(result).toEqual({
      available: true,
      totalPlayers: 12,
      items: [
        { country: null, players: 5 },
        { country: 'US', players: 4 },
        { country: 'AU', players: 2 },
        { country: 'FR', players: 1 },
      ],
    })
    expect(lookupCountry).toHaveBeenCalledTimes(7)
    expect(JSON.stringify(result)).not.toContain('ip')
    expect(JSON.stringify(result)).not.toContain('8.8.8.8')
    expect(JSON.stringify(result)).not.toContain('steam')
  })

  it('keeps known countries ordered by code with unknown last when counts tie', async () => {
    toArray.mockResolvedValue([
      { ip: 'US', players: 2 },
      { ip: null, players: 2 },
      { ip: 'FR', players: 2 },
    ])
    lookupCountry.mockImplementation((ip) => ip)
    expect((await getServerCountryStatistics('server', from, to)).items).toEqual([
      { country: 'FR', players: 2 },
      { country: 'US', players: 2 },
      { country: null, players: 2 },
    ])
  })

  it('distinguishes a successfully empty period from unavailable geography', async () => {
    expect(await getServerCountryStatistics('server', from, to)).toEqual({
      available: true,
      totalPlayers: 0,
      items: [],
    })
    toArray.mockRejectedValue(new Error('Mongo timeout'))
    expect(await getServerCountryStatistics('server', from, to)).toEqual({
      available: false,
      totalPlayers: 0,
      items: [],
    })
  })

  it('also isolates synchronous storage or lookup failures without exposing addresses', async () => {
    aggregate.mockImplementationOnce(() => {
      throw new Error('Unavailable database')
    })
    expect((await getServerCountryStatistics('server', from, to)).available).toBe(false)
    toArray.mockResolvedValue([{ ip: '8.8.8.8', players: 1 }])
    lookupCountry.mockImplementationOnce(() => {
      throw new Error('Lookup failure')
    })
    expect(await getServerCountryStatistics('server', from, to)).toEqual({
      available: false,
      totalPlayers: 0,
      items: [],
    })
  })

  it('does not report malformed aggregate counts as a successful empty distribution', async () => {
    for (const players of [0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      toArray.mockResolvedValue([{ ip: null, players }])
      expect((await getServerCountryStatistics('server', from, to)).available).toBe(false)
    }
  })
})
