import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  raw: vi.fn(),
  guildCount: vi.fn(),
  guildFind: vi.fn(),
  guildAggregate: vi.fn(),
  guildLanguages: vi.fn(),
  serverCount: vi.fn(),
  serverFind: vi.fn(),
  serverList: vi.fn(),
  serverUpdate: vi.fn(),
  userCount: vi.fn(),
  userList: vi.fn(),
  steamCount: vi.fn(),
  sessionCount: vi.fn(),
  sessionGroups: vi.fn(),
  grantUpsert: vi.fn(),
  grantUpdate: vi.fn(),
  cache: vi.fn(),
  access: vi.fn(),
  invalidate: vi.fn(),
  domainServer: vi.fn(),
}))
vi.mock('@gmod/infra-prisma', () => ({
  default: {
    $queryRaw: mocks.raw,
    gm_guild: {
      count: mocks.guildCount,
      findFirst: mocks.guildFind,
      aggregate: mocks.guildAggregate,
      groupBy: mocks.guildLanguages,
    },
    gm_server: {
      count: mocks.serverCount,
      findFirst: mocks.serverFind,
      findMany: mocks.serverList,
      update: mocks.serverUpdate,
    },
    gm_user: { count: mocks.userCount, findMany: mocks.userList },
    users: { count: mocks.steamCount },
    gm_panelToken: { count: mocks.sessionCount, groupBy: mocks.sessionGroups },
    gm_guild_premium: { upsert: mocks.grantUpsert, updateMany: mocks.grantUpdate },
  },
}))
vi.mock('@gmod/infra-redis', () => ({ default: { mget: mocks.cache } }))
vi.mock('@gmod/domain-server/Server.js', () => ({ getServerFromID: mocks.domainServer }))
vi.mock('@gmod/domain-access/index.js', () => ({
  resolveGuildAccess: mocks.access,
  invalidateGuildAccess: mocks.invalidate,
}))
const {
  listAdminGuilds,
  listAdminPremium,
  listAdminServers,
  listAdminUsers,
  getAdminOverview,
  getAdminGuildDetail,
  updateAdminServer,
  deleteAdminServer,
  resetAdminServerToken,
  updateAdminPremium,
  AdminDashboardError,
} = await import('../../../src/models/v6/adminDashboard.js')

const date = new Date('2026-11-22T10:00:00.000Z')
const guild = () => ({
  id: 'g1',
  name: 'Community',
  language: 'en',
  members: 10,
  serverCount: 2n,
  manualPremium: 1n,
  gmodstore: 0,
  createdAt: date,
  updatedAt: date,
  token: 'never return',
})
const server = () => ({
  id: 's1',
  name: 'Server',
  guild: 'g1',
  gm_guild: { name: 'Community' },
  verified: false,
  isPublic: true,
  createdAt: date,
  updatedAt: date,
  token: 'server-secret',
  publicTempToken: 'secret',
})
const access = (premium = true, sources: string[] = ['legacy']) => ({
  guildID: 'g1',
  premium,
  customBot: sources.includes('gmodstore'),
  state: 'ready',
  sources,
  revision: 'test',
  validUntil: '2099-01-01T00:00:00.000Z',
})
beforeEach(() => {
  vi.resetAllMocks()
  mocks.raw.mockResolvedValue([])
  mocks.guildCount.mockResolvedValue(2)
  mocks.serverCount.mockResolvedValue(2)
  mocks.userCount.mockResolvedValue(2)
  mocks.steamCount.mockResolvedValue(2)
  mocks.sessionCount.mockResolvedValue(0)
  mocks.guildAggregate.mockResolvedValue({ _sum: { member: 0 } })
  mocks.guildLanguages.mockResolvedValue([])
  mocks.serverList.mockResolvedValue([])
  mocks.userList.mockResolvedValue([])
  mocks.sessionGroups.mockResolvedValue([])
  mocks.cache.mockImplementation(async (...keys: string[]) => keys.map(() => null))
  mocks.guildFind.mockResolvedValue({ guild: 'g1' })
  mocks.serverFind.mockResolvedValue({ id: 's1' })
  mocks.serverUpdate.mockResolvedValue(server())
  mocks.access.mockResolvedValue(access())
  mocks.invalidate.mockResolvedValue(undefined)
  mocks.grantUpsert.mockResolvedValue({})
  mocks.grantUpdate.mockResolvedValue({ count: 1 })
})

describe('platform administration projections and bounded lists', () => {
  it.each([listAdminGuilds, listAdminPremium])(
    'keeps grant filters and pagination in prepared SQL with explicit projections',
    async (list) => {
      mocks.raw.mockResolvedValueOnce([{ total: 31n }]).mockResolvedValueOnce([guild()])
      const search = "x%' OR 1=1 --"
      const result = await list({
        offset: '999',
        limit: '25',
        premium: 'manual',
        search,
        sort: 'members',
        orderBy: 'ASC',
      })
      expect(result).toMatchObject({
        total: 31,
        query: { offset: 25, limit: 25, premium: 'manual' },
        items: [{ id: 'g1', members: 10, serverCount: 2, manualPremium: true, gmodstore: false }],
      })
      expect(JSON.stringify(result)).not.toContain('never return')
      const sql = mocks.raw.mock.calls[1][0]
      expect(sql.sql).toContain('ORDER BY g.member ASC')
      expect(sql.sql).toContain('EXISTS')
      expect(sql.sql).not.toContain(search)
      expect(sql.values).toContain("%x=%' OR 1==1 --%")
      expect(sql.values.slice(-2)).toEqual([25, 25])
      expect(mocks.raw).toHaveBeenCalledTimes(2)
    },
  )
  it.each([{ limit: 999 }, { sort: 'token' }, { premium: 'discord' }, { offset: [] }, { search: 'x'.repeat(101) }])(
    'rejects invalid guild filters before any query %j',
    async (query) => {
      await expect(listAdminGuilds(query)).rejects.toMatchObject({ status: 400, code: 'invalid_request' })
      expect(mocks.raw).not.toHaveBeenCalled()
    },
  )
  it('distinguishes no recorded grant from provider-resolved effective access', async () => {
    mocks.raw.mockResolvedValueOnce([{ total: 0n }]).mockResolvedValueOnce([])
    await listAdminPremium({ premium: 'none' })
    expect(mocks.raw.mock.calls[0][0].sql).toContain('NOT EXISTS')
    expect(mocks.access).not.toHaveBeenCalled()
  })
  it('scopes and paginates server records without returning credentials', async () => {
    mocks.serverCount.mockResolvedValueOnce(31)
    mocks.serverList.mockResolvedValueOnce([server()])
    const seen = new Date().toISOString()
    mocks.cache.mockResolvedValueOnce(['v6.0.0', seen])
    const result = await listAdminServers({ offset: 999, guildID: 'g1', verified: 'unverified', visibility: 'public' })
    expect(mocks.serverList).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 25,
        take: 25,
        where: expect.objectContaining({ guild: 'g1', verified: false, isPublic: true }),
        select: expect.objectContaining({ id: true, gm_guild: { select: { name: true } } }),
      }),
    )
    expect(result.items[0]).toMatchObject({
      id: 's1',
      guildName: 'Community',
      addonVersion: 'v6.0.0',
      lastSeenAt: seen,
      recentlyActive: true,
    })
    expect(JSON.stringify(result)).not.toContain('secret')
    expect(mocks.cache).toHaveBeenCalledExactlyOnceWith('server:s1:version', 'server:s1:last_request')
  })
  it('keeps an unavailable activity cache unknown instead of claiming an offline connection', async () => {
    mocks.serverList.mockResolvedValueOnce([server()])
    mocks.cache.mockRejectedValueOnce(new Error('Unavailable'))
    expect((await listAdminServers({})).items[0]).toMatchObject({
      recentlyActive: null,
      lastSeenAt: null,
      addonVersion: null,
    })
  })
  it('rejects malformed cache versions and dates while keeping ordinary records readable', async () => {
    mocks.serverList.mockResolvedValueOnce([server()])
    mocks.cache.mockResolvedValueOnce(['private raw value', 'not-a-date'])
    expect((await listAdminServers({})).items[0]).toMatchObject({
      recentlyActive: null,
      lastSeenAt: null,
      addonVersion: null,
    })
  })
  it('reads session aggregates and cached avatars only for the selected user page', async () => {
    const user = {
      id: '123',
      username: null,
      steam: '76561198000000001',
      rank: 'user',
      createdAt: date,
      updatedAt: date,
      token: 'secret',
      email: 'secret@example.test',
    }
    mocks.userList.mockResolvedValueOnce([user])
    mocks.sessionGroups.mockResolvedValueOnce([
      { discordID: '123', _count: { _all: 2 }, _max: { lastSeenAt: date, creationDate: date } },
    ])
    mocks.cache.mockResolvedValueOnce([
      JSON.stringify({ avatarURL: 'https://cdn.discordapp.com/avatar.png', token: 'secret' }),
    ])
    const result = await listAdminUsers({ search: '123', rank: 'user' })
    expect(result.items[0]).toEqual({
      id: '123',
      username: '',
      steamID64: '76561198000000001',
      rank: 'user',
      createdAt: date.toISOString(),
      updatedAt: date.toISOString(),
      lastSeenAt: date.toISOString(),
      activeSessions: 2,
      avatarURL: 'https://cdn.discordapp.com/avatar.png',
    })
    expect(mocks.sessionGroups).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ discordID: { in: ['123'] }, revoke: false }),
        _count: { _all: true },
      }),
    )
    expect(mocks.cache).toHaveBeenCalledExactlyOnceWith('gmi:auth:profile:123')
    expect(JSON.stringify(result)).not.toContain('secret')
  })
  it('derives displayed roles from the static allowlist instead of stored ranks', async () => {
    mocks.userList.mockResolvedValueOnce([
      { id: '333650866747867137', username: 'Owner', steam: null, rank: 'user', createdAt: date, updatedAt: date },
      { id: 'unlisted', username: 'Other', steam: null, rank: 'developer', createdAt: date, updatedAt: date },
    ])
    const result = await listAdminUsers({ rank: 'developer' })
    expect(result.items.map((user) => user.rank)).toEqual(['developer', 'user'])
    expect(mocks.userList.mock.calls[0][0].where).toEqual({ id: { in: ['333650866747867137'] } })
    expect(mocks.userList.mock.calls[0][0].select.rank).toBeUndefined()
  })
  it('filters regular accounts using the allowlist rather than database role values', async () => {
    await listAdminUsers({ rank: 'user' })
    expect(mocks.userList.mock.calls[0][0].where).toEqual({ id: { notIn: ['333650866747867137'] } })
  })
  it('does not resolve profiles or query all sessions for an empty user page', async () => {
    expect((await listAdminUsers({})).items).toEqual([])
    expect(mocks.sessionGroups).not.toHaveBeenCalled()
    expect(mocks.cache).not.toHaveBeenCalled()
  })
  it('returns distinct counters and seven-day registrations without manufactured percentages', async () => {
    mocks.guildAggregate.mockResolvedValueOnce({ _sum: { member: null } })
    mocks.raw.mockResolvedValueOnce([{ manualPremium: 1n, gmodstorePremium: 2n }])
    mocks.guildLanguages.mockResolvedValueOnce([{ language: 'en', _count: { _all: 2 } }])
    const result = await getAdminOverview()
    expect(result).toMatchObject({
      totals: {
        guilds: 2,
        servers: 2,
        discordUsers: 2,
        linkedUsers: 2,
        steamProfiles: 2,
        discordMemberships: 0,
        activeSessions: 0,
        manualPremium: 1,
        gmodstorePremium: 2,
      },
      recent: { days: 7, guilds: 2, servers: 2, users: 2 },
      languages: [{ language: 'en', count: 2 }],
    })
    expect(mocks.guildCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ createdAt: expect.any(Object) }) }),
    )
    expect(mocks.sessionCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ expirationDate: expect.any(Object), OR: expect.any(Array) }),
      }),
    )
  })
  it('resolves actual entitlements only when inspecting one existing guild', async () => {
    mocks.raw.mockResolvedValueOnce([guild()])
    mocks.access.mockResolvedValueOnce(access(true, ['discord']))
    expect(await getAdminGuildDetail('g1')).toMatchObject({
      guild: { manualPremium: true },
      access: { sources: ['discord'] },
    })
    expect(mocks.access).toHaveBeenCalledExactlyOnceWith('g1')
    mocks.raw.mockResolvedValueOnce([])
    await expect(getAdminGuildDetail('missing')).rejects.toMatchObject({ status: 404 })
  })
})

describe('confirmed administrative changes', () => {
  it('updates only submitted public server properties and never returns a token', async () => {
    const result = await updateAdminServer('s1', { name: 'Renamed', verified: true, reason: 'Support request' })
    expect(mocks.serverUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 's1' }, data: { name: 'Renamed', verified: true } }),
    )
    expect(JSON.stringify(result)).not.toContain('secret')
  })
  it('rejects forbidden updates or absent targets before a write', async () => {
    await expect(updateAdminServer('s1', { token: 'replacement', reason: 'Support request' })).rejects.toBeInstanceOf(
      AdminDashboardError,
    )
    expect(mocks.serverUpdate).not.toHaveBeenCalled()
    mocks.serverFind.mockResolvedValueOnce(null)
    await expect(updateAdminServer('missing', { isPublic: false, reason: 'Support request' })).rejects.toMatchObject({
      status: 404,
    })
  })
  it('requires the exact target ID before deleting or resetting credentials', async () => {
    for (const operation of [deleteAdminServer, resetAdminServerToken])
      await expect(operation('s1', { confirm: 's2', reason: 'Support request' })).rejects.toMatchObject({ status: 400 })
    expect(mocks.domainServer).not.toHaveBeenCalled()
    const remove = vi.fn().mockResolvedValue({ token: 'secret' }),
      reset = vi.fn().mockResolvedValue(undefined)
    mocks.domainServer.mockResolvedValue({ delete: remove, regenerateToken: reset, token: 'secret' })
    expect(await deleteAdminServer('s1', { confirm: 's1', reason: 'Support request' })).toEqual({ deleted: true })
    expect(await resetAdminServerToken('s1', { confirm: 's1', reason: 'Support request' })).toEqual({ reset: true })
    expect(remove).toHaveBeenCalledOnce()
    expect(reset).toHaveBeenCalledOnce()
  })
  it('grants only the local manual source, preserving existing transaction metadata', async () => {
    expect(await updateAdminPremium('g1', { enabled: true, reason: 'Support request' })).toMatchObject({
      manualPremium: true,
      pending: false,
    })
    expect(mocks.grantUpsert).toHaveBeenCalledExactlyOnceWith({
      where: { guildID: 'g1' },
      create: { guildID: 'g1', revoked: false },
      update: { revoked: false },
    })
    expect(mocks.invalidate).toHaveBeenCalledExactlyOnceWith('g1')
  })
  it('revokes only the manual grant while preserving effective purchased or Discord access', async () => {
    mocks.access.mockResolvedValueOnce(access(true, ['gmodstore']))
    expect(await updateAdminPremium('g1', { enabled: false, reason: 'Support request' })).toMatchObject({
      manualPremium: false,
      access: { premium: true, sources: ['gmodstore'] },
      pending: false,
    })
    expect(mocks.grantUpdate).toHaveBeenCalledExactlyOnceWith({ where: { guildID: 'g1' }, data: { revoked: true } })
    expect(mocks.grantUpsert).not.toHaveBeenCalled()
  })
  it('retains legacy transaction and buyer evidence when revoking and later re-enabling a grant', async () => {
    const record = { guildID: 'g1', revoked: false, transaction: 'historical-payment', buyer: 'historical-buyer' }
    mocks.grantUpdate.mockImplementationOnce(async ({ data }) => {
      Object.assign(record, data)
      return { count: 1 }
    })
    mocks.grantUpsert.mockImplementationOnce(async ({ update }) => {
      Object.assign(record, update)
      return record
    })
    mocks.access.mockImplementation(async () => access(!record.revoked, record.revoked ? [] : ['legacy']))
    expect(await updateAdminPremium('g1', { enabled: false, reason: 'Support request' })).toMatchObject({
      manualPremium: false,
      access: { premium: false },
    })
    expect(record).toEqual({
      guildID: 'g1',
      revoked: true,
      transaction: 'historical-payment',
      buyer: 'historical-buyer',
    })
    expect(await updateAdminPremium('g1', { enabled: true, reason: 'Support request' })).toMatchObject({
      manualPremium: true,
      access: { premium: true },
    })
    expect(record).toEqual({
      guildID: 'g1',
      revoked: false,
      transaction: 'historical-payment',
      buyer: 'historical-buyer',
    })
  })
  it('acknowledges a committed manual change separately from failed entitlement synchronization', async () => {
    mocks.invalidate.mockRejectedValueOnce(new Error('Cache failure'))
    mocks.access.mockRejectedValueOnce(new Error('Provider failure'))
    expect(await updateAdminPremium('g1', { enabled: true, reason: 'Support request' })).toMatchObject({
      manualPremium: true,
      pending: true,
      access: { state: 'unknown' },
    })
    expect(mocks.grantUpsert).toHaveBeenCalledOnce()
  })
  it('does not mutate a grant when input or target validation fails', async () => {
    await expect(
      updateAdminPremium('g1', { enabled: true, transaction: 'bad', reason: 'Support request' }),
    ).rejects.toMatchObject({ status: 400 })
    mocks.guildFind.mockResolvedValueOnce(null)
    await expect(updateAdminPremium('missing', { enabled: true, reason: 'Support request' })).rejects.toMatchObject({
      status: 404,
    })
    expect(mocks.grantUpsert).not.toHaveBeenCalled()
    expect(mocks.invalidate).not.toHaveBeenCalled()
  })
})
