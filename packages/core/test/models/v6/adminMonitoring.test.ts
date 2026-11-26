import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  count: vi.fn(),
  servers: vi.fn(),
  raw: vi.fn(),
  eval: vi.fn(),
  aggregate: vi.fn(),
  telemetry: vi.fn(),
}))
vi.mock('@gmod/infra-prisma', () => ({
  default: { gm_server: { count: mocks.count, findMany: mocks.servers }, $queryRaw: mocks.raw },
}))
vi.mock('@gmod/infra-redis', () => ({ default: { eval: mocks.eval } }))
vi.mock('@gmod/infra-redis/addonTelemetry.js', () => ({ readAddonTelemetry: mocks.telemetry }))
vi.mock('@gmod/infra-mongo', () => ({
  mongoClient: { db: () => ({ collection: () => ({ aggregate: mocks.aggregate }) }) },
}))
const { listAdminConnections, listAdminErrors, listAdminBugs, monitoringSummary } =
  await import('../../../src/models/v6/adminMonitoring.js')
const now = new Date('2026-11-22T12:00:00Z').getTime()
type ConnectionFixture = {
  id: string
  name?: string
  activeSockets?: number
  addonVersion?: string | null
  protocol?: 'legacy' | 'acknowledged' | null
  requestsPerMinute?: number | null
  lastSeenAt?: string | null
  createdAt?: Date
}
function connectionsFixture(records: ConnectionFixture[]) {
  const byID = new Map(records.map((row) => [row.id, row]))
  mocks.count.mockResolvedValue(records.length)
  mocks.servers.mockImplementation(async (query) => {
    const offset = query.cursor ? records.findIndex((row) => row.id === query.cursor.id) + 1 : query.skip || 0
    return records.slice(offset, offset + query.take).map((row) => ({
      id: row.id,
      name: row.name || row.id,
      guild: 'g1',
      gm_guild: { name: 'Community' },
      createdAt: row.createdAt || new Date(now),
    }))
  })
  mocks.eval.mockImplementation(async (_script, _size, ...keys: string[]) => [
    now,
    ...keys.flatMap((key) => {
      const sockets = byID.get(key.slice('ws:server-presence:'.length))?.activeSockets ?? 0
      return [sockets, sockets ? now + 90_000 : 0]
    }),
  ])
  mocks.telemetry.mockImplementation(async (ids: string[]) => ({
    available: true,
    observedAt: new Date(now).toISOString(),
    items: ids.map((id) => {
      const row = byID.get(id)!
      return {
        addonVersion: row.addonVersion ?? null,
        protocol: row.protocol ?? null,
        lastSeenAt: row.lastSeenAt ?? null,
        lastHttpAt: null,
        lastWebsocketAt: null,
        requestsPerMinute: row.requestsPerMinute ?? null,
        httpRequestsPerMinute: row.requestsPerMinute ?? null,
        websocketRequestsPerMinute: row.requestsPerMinute === undefined || row.requestsPerMinute === null ? null : 0,
      }
    }),
  }))
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.count.mockResolvedValue(1)
  mocks.servers.mockResolvedValue([{ id: 's1', name: 'Test server', guild: 'g1', gm_guild: { name: 'Community' } }])
  mocks.eval.mockResolvedValue([now, 1, now + 90_000])
  mocks.telemetry.mockImplementation(async (ids: string[]) => ({
    available: true,
    observedAt: '2026-11-22T12:00:00.000Z',
    items: ids.map(() => ({
      addonVersion: '5.2.8',
      lastSeenAt: '2026-11-22T11:59:59.000Z',
      lastHttpAt: '2026-11-22T11:59:59.000Z',
      lastWebsocketAt: null,
      protocol: 'legacy',
      httpRequestsPerMinute: 12,
      websocketRequestsPerMinute: 0,
      requestsPerMinute: 12,
    })),
  }))
  mocks.aggregate.mockReturnValue({ toArray: async () => [] })
  mocks.raw.mockResolvedValue([])
})
describe('administration operational monitoring', () => {
  it('reads socket leases across replicas without mutating them or trusting recent requests', async () => {
    const data = await listAdminConnections({ offset: 900, search: 'Test' })
    expect(data).toMatchObject({
      presence: 'ready',
      observedAt: '2026-11-22T12:00:00.000Z',
      total: 1,
      query: { offset: 0 },
    })
    expect(data.items[0]).toMatchObject({ activeSockets: 1, leaseExpiresAt: '2026-11-22T12:01:30.000Z' })
    expect(mocks.eval).toHaveBeenCalledWith(expect.stringContaining("redis.call('ZCOUNT'"), 1, 'ws:server-presence:s1')
    expect(mocks.eval.mock.calls[0][0]).not.toMatch(/ZADD|ZREM|PEXPIRE|KEYS\(/)
    expect(mocks.servers.mock.calls[0][0].select).not.toHaveProperty('token')
    expect(mocks.servers.mock.calls[0][0]).toMatchObject({ skip: 0, take: 25 })
  })
  it('adds measured traffic and version for the requested page without using HTTP activity as socket presence', async () => {
    mocks.eval.mockResolvedValueOnce([now, 0, 0])
    const data = await listAdminConnections({})
    expect(data).toMatchObject({
      telemetry: 'ready',
      trafficWindowSeconds: 60,
      trafficObservedAt: '2026-11-22T12:00:00.000Z',
    })
    expect(data.items[0]).toMatchObject({
      activeSockets: 0,
      addonVersion: '5.2.8',
      protocol: 'legacy',
      httpRequestsPerMinute: 12,
      websocketRequestsPerMinute: 0,
      requestsPerMinute: 12,
      lastSeenAt: '2026-11-22T11:59:59.000Z',
    })
    expect(mocks.telemetry).toHaveBeenCalledExactlyOnceWith(['s1'])
  })
  it('keeps live socket presence when traffic measurements are unavailable', async () => {
    mocks.telemetry.mockResolvedValueOnce({
      available: false,
      observedAt: null,
      items: [
        {
          addonVersion: null,
          lastSeenAt: null,
          lastHttpAt: null,
          lastWebsocketAt: null,
          protocol: null,
          httpRequestsPerMinute: null,
          websocketRequestsPerMinute: null,
          requestsPerMinute: null,
        },
      ],
    })
    const data = await listAdminConnections({})
    expect(data).toMatchObject({ presence: 'ready', telemetry: 'unavailable', trafficObservedAt: null })
    expect(data.items[0]).toMatchObject({ activeSockets: 1, requestsPerMinute: null, protocol: null })
  })
  it('preserves measured traffic when socket presence is unavailable', async () => {
    mocks.eval.mockRejectedValueOnce(new Error('Presence unavailable'))
    const data = await listAdminConnections({})
    expect(data).toMatchObject({ presence: 'unavailable', telemetry: 'ready' })
    expect(data.items[0]).toMatchObject({ activeSockets: null, requestsPerMinute: 12 })
  })
  it('keeps absent leases distinct from unavailable or malformed presence data', async () => {
    mocks.eval.mockResolvedValueOnce([now, 0, 0])
    expect((await listAdminConnections({})).items[0].activeSockets).toBe(0)
    for (const response of [
      [now, 1],
      [now, 1, now - 1000],
      [now, -1, 0],
    ]) {
      mocks.eval.mockResolvedValueOnce(response)
      const page = await listAdminConnections({})
      expect(page.presence).toBe('unavailable')
      expect(page.items[0].activeSockets).toBeNull()
      expect(page.observedAt).toBeNull()
    }
    mocks.eval.mockRejectedValueOnce(new Error('Redis unavailable'))
    expect((await listAdminConnections({})).presence).toBe('unavailable')
  })
  it('scopes connections to the selected guild and keeps empty names and missing leases readable', async () => {
    mocks.servers.mockResolvedValueOnce([{ id: 's1', name: '', guild: 'g1', gm_guild: { name: '' } }])
    mocks.eval.mockResolvedValueOnce([now, 0, 0])
    const result = await listAdminConnections({ guildID: 'g1', orderBy: 'ASC' })
    expect(result.items[0]).toMatchObject({ name: '', guildName: '', activeSockets: 0, leaseExpiresAt: null })
    expect(mocks.count).toHaveBeenCalledWith({ where: { guild: 'g1' } })
    expect(mocks.servers).toHaveBeenCalledWith(
      expect.objectContaining({ where: { guild: 'g1' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    )
  })
  it('does not ask Redis for presence when the selected connection page is empty', async () => {
    mocks.count.mockResolvedValueOnce(0)
    mocks.servers.mockResolvedValueOnce([])
    expect(await listAdminConnections({ offset: 500 })).toMatchObject({
      items: [],
      total: 0,
      observedAt: null,
      presence: 'ready',
      query: { offset: 0 },
    })
    expect(mocks.eval).not.toHaveBeenCalled()
  })
  it('keeps name filtering and ordering in the database when no telemetry filter is needed', async () => {
    await listAdminConnections({ search: 'Test', name: 'Community', sort: 'name', orderBy: 'ASC' })
    expect(mocks.servers).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 25,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        where: {
          OR: [
            { id: { contains: 'Test' } },
            { name: { contains: 'Test' } },
            { gm_guild: { name: { contains: 'Test' } } },
          ],
          name: { contains: 'Community' },
        },
      }),
    )
  })
  it('sorts all candidates before pagination and reads presence in bounded batches', async () => {
    connectionsFixture(
      Array.from({ length: 260 }, (_, index) => ({
        id: `s${String(index).padStart(3, '0')}`,
        requestsPerMinute: index,
      })),
    )
    const first = await listAdminConnections({ sort: 'requestsPerMinute', orderBy: 'DESC' })
    expect(first.total).toBe(260)
    expect(first.items).toHaveLength(25)
    expect(first.items[0].id).toBe('s259')
    expect(first.items[24].id).toBe('s235')
    expect(mocks.servers).toHaveBeenCalledTimes(2)
    expect(mocks.servers.mock.calls[1][0]).toMatchObject({ cursor: { id: 's249' }, skip: 1, take: 250 })
    expect(mocks.eval.mock.calls.map((call) => call[1])).toEqual([250, 10])
    const last = await listAdminConnections({ sort: 'requestsPerMinute', orderBy: 'DESC', offset: 1000 })
    expect(last.query.offset).toBe(250)
    expect(last.items.map((row) => row.requestsPerMinute)).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1, 0])
  })
  it.each(['ASC', 'DESC'] as const)(
    'sorts nullable telemetry %s with unknown values last and stable IDs',
    async (orderBy) => {
      connectionsFixture([
        { id: 'a', requestsPerMinute: null },
        { id: 'b', requestsPerMinute: 12 },
        { id: 'c', requestsPerMinute: 0 },
        { id: 'd', requestsPerMinute: 12 },
        { id: 'e', requestsPerMinute: null },
      ])
      const page = await listAdminConnections({ sort: 'requestsPerMinute', orderBy })
      expect(page.items.map((row) => row.id)).toEqual(
        orderBy === 'ASC' ? ['c', 'b', 'd', 'a', 'e'] : ['b', 'd', 'c', 'a', 'e'],
      )
    },
  )
  it('orders numeric addon versions and puts prereleases before releases', async () => {
    connectionsFixture([
      { id: 'a', addonVersion: '2.10.0' },
      { id: 'b', addonVersion: '2.9.0' },
      { id: 'c', addonVersion: null },
      { id: 'd', addonVersion: '2.10.0-beta.2' },
      { id: 'e', addonVersion: '2.10.0-beta.10' },
      { id: 'f', addonVersion: 'v2.9.0' },
    ])
    const ascending = await listAdminConnections({ sort: 'addonVersion', orderBy: 'ASC' })
    expect(ascending.items.map((row) => row.id)).toEqual(['b', 'f', 'd', 'e', 'a', 'c'])
    const descending = await listAdminConnections({ sort: 'addonVersion', orderBy: 'DESC' })
    expect(descending.items.map((row) => row.id)).toEqual(['a', 'e', 'd', 'b', 'f', 'c'])
  })
  it('places a release after its prerelease even when the release was registered later', async () => {
    connectionsFixture([
      { id: 'a', addonVersion: '6.0.0-rc.1' },
      { id: 'b', addonVersion: '6.0.0' },
    ])
    expect((await listAdminConnections({ sort: 'addonVersion', orderBy: 'ASC' })).items.map((row) => row.id)).toEqual([
      'a',
      'b',
    ])
    expect((await listAdminConnections({ sort: 'addonVersion', orderBy: 'DESC' })).items.map((row) => row.id)).toEqual([
      'b',
      'a',
    ])
  })
  it('sorts protocol labels globally in either direction while unobserved protocols stay last', async () => {
    connectionsFixture([
      { id: 'a', protocol: 'legacy' },
      { id: 'b', protocol: null },
      { id: 'c', protocol: 'acknowledged' },
      { id: 'd', protocol: 'legacy' },
    ])
    expect((await listAdminConnections({ sort: 'protocol', orderBy: 'ASC' })).items.map((row) => row.id)).toEqual([
      'c',
      'a',
      'd',
      'b',
    ])
    expect((await listAdminConnections({ sort: 'protocol', orderBy: 'DESC' })).items.map((row) => row.id)).toEqual([
      'a',
      'd',
      'c',
      'b',
    ])
  })
  it('finishes an exact full batch without querying Redis for the empty continuation', async () => {
    connectionsFixture(
      Array.from({ length: 250 }, (_, index) => ({
        id: `s${String(index).padStart(3, '0')}`,
        requestsPerMinute: index,
      })),
    )
    const page = await listAdminConnections({ sort: 'requestsPerMinute', orderBy: 'DESC', offset: 225 })
    expect(page.total).toBe(250)
    expect(page.items.map((row) => row.requestsPerMinute)).toEqual(Array.from({ length: 25 }, (_, index) => 24 - index))
    expect(mocks.servers).toHaveBeenCalledTimes(2)
    expect(mocks.servers.mock.calls[1][0]).toMatchObject({ cursor: { id: 's249' }, skip: 1, take: 250 })
    expect(mocks.eval).toHaveBeenCalledTimes(1)
    expect(mocks.telemetry).toHaveBeenCalledTimes(1)
  })
  it('preserves measured batches but marks the aggregate observation unknown when a later telemetry batch fails', async () => {
    connectionsFixture(
      Array.from({ length: 251 }, (_, index) => ({
        id: `s${String(index).padStart(3, '0')}`,
        requestsPerMinute: index,
      })),
    )
    const measured = mocks.telemetry.getMockImplementation()!
    mocks.telemetry.mockImplementation(async (ids: string[]) => {
      if (!ids.includes('s250')) return measured(ids)
      return {
        available: false,
        observedAt: null,
        items: ids.map(() => ({
          addonVersion: null,
          protocol: null,
          lastSeenAt: null,
          lastHttpAt: null,
          lastWebsocketAt: null,
          requestsPerMinute: null,
          httpRequestsPerMinute: null,
          websocketRequestsPerMinute: null,
        })),
      }
    })
    const page = await listAdminConnections({ sort: 'requestsPerMinute', orderBy: 'DESC', limit: 500 })
    expect(page).toMatchObject({ total: 251, presence: 'ready', telemetry: 'unavailable', trafficObservedAt: null })
    expect(page.items[0]).toMatchObject({ id: 's249', requestsPerMinute: 249 })
    expect(page.items.at(-1)).toMatchObject({ id: 's250', requestsPerMinute: null })
    expect(page.items.filter((row) => row.requestsPerMinute !== null)).toHaveLength(250)
    expect(mocks.telemetry).toHaveBeenCalledTimes(2)
  })
  it('combines column filters before counting and clamps the resulting page', async () => {
    connectionsFixture([
      {
        id: 'a',
        activeSockets: 1,
        addonVersion: 'v5.2.8',
        protocol: 'legacy',
        requestsPerMinute: 12,
        lastSeenAt: new Date(now).toISOString(),
      },
      {
        id: 'b',
        activeSockets: 0,
        addonVersion: 'v5.2.8',
        protocol: 'legacy',
        requestsPerMinute: 12,
        lastSeenAt: new Date(now).toISOString(),
      },
      {
        id: 'c',
        activeSockets: 1,
        addonVersion: 'v5.2.8',
        protocol: 'acknowledged',
        requestsPerMinute: 12,
        lastSeenAt: new Date(now).toISOString(),
      },
      {
        id: 'd',
        activeSockets: 1,
        addonVersion: 'v5.3.0',
        protocol: 'legacy',
        requestsPerMinute: 12,
        lastSeenAt: new Date(now).toISOString(),
      },
      {
        id: 'e',
        activeSockets: 1,
        addonVersion: 'v5.2.8',
        protocol: 'legacy',
        requestsPerMinute: 13,
        lastSeenAt: new Date(now).toISOString(),
      },
      {
        id: 'f',
        activeSockets: 1,
        addonVersion: 'v5.2.8',
        protocol: 'legacy',
        requestsPerMinute: 12,
        lastSeenAt: new Date(now - 1000).toISOString(),
      },
      {
        id: 'g',
        activeSockets: 1,
        addonVersion: 'v5.2.8',
        protocol: 'legacy',
        requestsPerMinute: null,
        lastSeenAt: null,
      },
    ])
    const page = await listAdminConnections({
      connectionState: 'connected',
      addonVersion: 'V5.2',
      protocol: 'legacy',
      minRequestsPerMinute: '12',
      maxRequestsPerMinute: '12',
      lastSeenFrom: new Date(now).toISOString(),
      lastSeenTo: new Date(now).toISOString(),
      offset: 500,
    })
    expect(page).toMatchObject({ total: 1, query: { offset: 0 } })
    expect(page.items.map((row) => row.id)).toEqual(['a'])
  })
  it('keeps unknown presence, absent sockets, unknown protocols and zero traffic distinct', async () => {
    connectionsFixture([
      { id: 'a', activeSockets: 0, protocol: null, requestsPerMinute: 0 },
      { id: 'b', activeSockets: 1, protocol: 'legacy', requestsPerMinute: null },
    ])
    const disconnected = await listAdminConnections({ connectionState: 'disconnected', maxRequestsPerMinute: 0 })
    expect(disconnected.items.map((row) => row.id)).toEqual(['a'])
    expect((await listAdminConnections({ protocol: 'unknown' })).items.map((row) => row.id)).toEqual(['a'])
    expect((await listAdminConnections({ connectionState: 'unknown' })).total).toBe(0)
    mocks.eval.mockRejectedValueOnce(new Error('Redis unavailable'))
    const unknown = await listAdminConnections({ connectionState: 'unknown' })
    expect(unknown).toMatchObject({ presence: 'unavailable', total: 2, observedAt: null })
    expect(unknown.items.every((row) => row.activeSockets === null)).toBe(true)
  })
  it('sorts last activity by its instant and keeps unreported activity last', async () => {
    connectionsFixture([
      { id: 'a', lastSeenAt: '2026-11-22T12:00:00Z' },
      { id: 'b', lastSeenAt: null },
      { id: 'c', lastSeenAt: '2026-11-22T12:00:01.000Z' },
    ])
    expect((await listAdminConnections({ sort: 'lastSeenAt', orderBy: 'ASC' })).items.map((row) => row.id)).toEqual([
      'a',
      'c',
      'b',
    ])
    expect((await listAdminConnections({ sort: 'lastSeenAt', orderBy: 'DESC' })).items.map((row) => row.id)).toEqual([
      'c',
      'a',
      'b',
    ])
  })
  it.each([
    [{ lastSeenFrom: new Date(now).toISOString() }, ['b', 'c']],
    [{ lastSeenTo: new Date(now).toISOString() }, ['a', 'b']],
  ])('applies inclusive activity bounds and excludes unobserved activity: %j', async (filter, expected) => {
    connectionsFixture([
      { id: 'a', lastSeenAt: new Date(now - 1000).toISOString() },
      { id: 'b', lastSeenAt: new Date(now).toISOString() },
      { id: 'c', lastSeenAt: new Date(now + 1000).toISOString() },
      { id: 'd', lastSeenAt: null },
    ])
    const page = await listAdminConnections({ ...filter, sort: 'lastSeenAt', orderBy: 'ASC' })
    expect(page.items.map((row) => row.id)).toEqual(expected)
    expect(page.total).toBe(2)
  })
  it.each([null, [now, 0, now + 90_000], [now, 1, 0], [now, 0.5, now + 90_000]])(
    'marks malformed or contradictory lease counts unavailable: %j',
    async (value) => {
      mocks.eval.mockResolvedValueOnce(value)
      expect(await listAdminConnections({})).toMatchObject({
        presence: 'unavailable',
        observedAt: null,
        items: [{ activeSockets: null, leaseExpiresAt: null }],
      })
    },
  )
  it('rejects malformed filters before accessing any provider', async () => {
    for (const operation of [listAdminConnections, listAdminErrors, listAdminBugs]) {
      await expect(operation({ limit: 10_000, includeTokens: true })).rejects.toMatchObject({ status: 400 })
    }
    expect(mocks.count).not.toHaveBeenCalled()
    expect(mocks.aggregate).not.toHaveBeenCalled()
    expect(mocks.raw).not.toHaveBeenCalled()
  })
  it('bounds and escapes error aggregation and only returns redacted grouped projections', async () => {
    mocks.aggregate.mockReturnValueOnce({ toArray: async () => [{ total: 1 }] }).mockReturnValueOnce({
      toArray: async () => [
        {
          _id: {
            error: 'http://private.test/ token=secret 76561198012345678',
            realm: 'server',
            name: 'Gmod Integration',
          },
          reports: 3,
          serverCount: 2,
          occurrences: 5,
          firstSeenAt: new Date(now - 1000),
          lastSeenAt: new Date(now),
        },
      ],
    })
    const page = await listAdminErrors({ search: '(a+)+$', recurringOnly: 'true', days: '7' })
    expect(page.items[0]).toMatchObject({
      reports: 3,
      serverCount: 2,
      occurrences: 5,
      summary: '[url] [credential] [id]',
    })
    expect(page.items[0]).not.toHaveProperty('stack')
    expect(page.items[0]).not.toHaveProperty('steamID64')
    const [pipeline, options] = mocks.aggregate.mock.calls[1]
    expect(options).toEqual({ maxTimeMS: 3000, allowDiskUse: false })
    expect(JSON.stringify(pipeline)).toContain('\\\\(a\\\\+\\\\)\\\\+\\\\$')
    expect(pipeline).toContainEqual({ $match: { reports: { $gte: 2 } } })
    expect(pipeline.at(-1)).toEqual({ $limit: 25 })
  })
  it('keeps bug matching and pagination in prepared SQL with no arbitrary identifiers', async () => {
    mocks.raw.mockResolvedValueOnce([{ total: 1n }]).mockResolvedValueOnce([
      {
        signature: 'example bug',
        reports: 2n,
        serverCount: 1n,
        firstSeenAt: new Date(now),
        lastSeenAt: new Date(now),
      },
    ])
    const data = await listAdminBugs({ search: "50%_='", recurringOnly: true, sort: 'reports' })
    expect(data.items[0]).toMatchObject({ summary: 'example bug', reports: 2, serverCount: 1 })
    const sql = mocks.raw.mock.calls[1][0]
    expect(sql.sql).not.toContain("50%_='")
    expect(sql.values).toContain("%50=%=_=='%")
    expect(sql.sql).toContain("ESCAPE '='")
    expect(sql.sql).toContain('reports DESC')
    expect(sql.values.slice(-2)).toEqual([25, 0])
  })
  it.each(['client', 'menu'])(
    'keeps all-source error results grouped, normalizes realm %s and applies ascending report order',
    async (realm) => {
      mocks.aggregate.mockReturnValueOnce({ toArray: async () => [{ total: 1 }] }).mockReturnValueOnce({
        toArray: async () => [
          {
            _id: { error: 'Synthetic error', realm, name: '' },
            reports: 2,
            serverCount: 1,
            occurrences: 3,
            firstSeenAt: new Date(now),
            lastSeenAt: new Date(now),
          },
        ],
      })
      const result = await listAdminErrors({ source: 'all', sort: 'reports', orderBy: 'ASC' })
      expect(result.items[0]).toMatchObject({ realm: realm === 'client' ? 'client' : 'unknown', reports: 2 })
      const pipeline = mocks.aggregate.mock.calls[1][0]
      expect(pipeline[0].$match).not.toHaveProperty('$and')
      expect(pipeline).toContainEqual({ $sort: { reports: 1, lastSeenAt: -1, _id: 1 } })
      expect(pipeline).not.toContainEqual({ $match: { reports: { $gte: 2 } } })
    },
  )
  it('reports an empty incident collection as zero with deterministic chronological ordering', async () => {
    const errors = await listAdminErrors({ source: 'all', orderBy: 'ASC' })
    expect(errors).toMatchObject({ total: 0, items: [], query: { offset: 0 } })
    expect(mocks.aggregate.mock.calls[1][0]).toContainEqual({ $sort: { lastSeenAt: 1, _id: 1 } })
    const bugs = await listAdminBugs({ state: 'all', orderBy: 'ASC' })
    expect(bugs).toMatchObject({ total: 0, items: [], query: { offset: 0 } })
    const sql = mocks.raw.mock.calls[1][0]
    expect(sql.sql).toContain('lastSeenAt ASC, signature ASC')
    expect(sql.sql).not.toContain("status = 'open'")
    expect(sql.values).toContain(1)
  })
  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects an invalid incident aggregate rather than manufacturing a count: %s',
    async (total) => {
      mocks.raw.mockResolvedValueOnce([{ total }])
      await expect(listAdminBugs({})).rejects.toThrow('Invalid monitoring aggregate')
      expect(mocks.raw).toHaveBeenCalledOnce()
    },
  )
  it('does not turn provider failure into zero incidents', async () => {
    mocks.raw.mockRejectedValueOnce(new Error('Storage unavailable'))
    await expect(listAdminBugs({})).rejects.toThrow('Storage unavailable')
    mocks.aggregate.mockReturnValueOnce({
      toArray: async () => {
        throw new Error('History unavailable')
      },
    })
    await expect(listAdminErrors({})).rejects.toThrow('History unavailable')
  })
  it('limits summary size and removes common credential, URL, address and ID indicators', () => {
    expect(
      monitoringSummary(
        'Error 192.0.2.1:27015 password=placeholder https://example.test 333650866747867137\nraw stack',
      ),
    ).toBe('Error [address] [credential] [url] [id]')
    expect(monitoringSummary('a'.repeat(10_000))).toHaveLength(600)
  })
})
