import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ count: vi.fn(), servers: vi.fn(), raw: vi.fn(), eval: vi.fn(), aggregate: vi.fn() }))
vi.mock('@gmod/infra-prisma', () => ({
  default: { gm_server: { count: mocks.count, findMany: mocks.servers }, $queryRaw: mocks.raw },
}))
vi.mock('@gmod/infra-redis', () => ({ default: { eval: mocks.eval } }))
vi.mock('@gmod/infra-mongo', () => ({
  mongoClient: { db: () => ({ collection: () => ({ aggregate: mocks.aggregate }) }) },
}))
const { listAdminConnections, listAdminErrors, listAdminBugs, monitoringSummary } =
  await import('../../../src/models/v6/adminMonitoring.js')
const now = new Date('2026-11-22T12:00:00Z').getTime()
beforeEach(() => {
  vi.resetAllMocks()
  mocks.count.mockResolvedValue(1)
  mocks.servers.mockResolvedValue([{ id: 's1', name: 'Test server', guild: 'g1', gm_guild: { name: 'Community' } }])
  mocks.eval.mockResolvedValue([now, 1, now + 90_000])
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
