import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PublicServerRankingResponseSchema } from '@gmod/schema/server/PublicServerRankingSchema.js'

const prismaMock = {
  $queryRaw: vi.fn(),
  gm_server_status: { findMany: vi.fn() },
  gm_server: { findMany: vi.fn() },
}
vi.mock('@gmod/infra-prisma', () => ({ default: prismaMock }))

const inviteMock = vi.fn()
vi.mock('@gmod/infra-bullmq/discordQueueAdapters.js', () => ({ enqueueDiscordGuildPublicInvite: inviteMock }))

const accessMock = vi.fn()
vi.mock('@gmod/domain-access/index.js', () => ({ resolveGuildAccess: accessMock }))

const { processGetPublicServerRanking } = await import('../../../src/models/v3/publicServerRankingModels.js')
const now = new Date('2026-11-20T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000

function access(overrides: Record<string, unknown> = {}) {
  return {
    guildID: 'community',
    premium: false,
    customBot: false,
    state: 'ready',
    sources: [],
    revision: 'rev',
    validUntil: new Date(now.getTime() + 60_000).toISOString(),
    ...overrides,
  }
}

function record(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    guild: 'community',
    name: `Server ${id}`,
    description: 'Public community',
    image: '/server.svg',
    ip: '192.0.2.10',
    port: '27015',
    gm_guild: { isPartner: false },
    gm_server_status: {
      hostname: `Hostname ${id}`,
      players: 12,
      maxPlayers: 32,
      gameMode: 'sandbox',
      map: 'gm_construct',
      updatedAt: now,
    },
    ...overrides,
  }
}

function setupPage(records = [record('s1'), record('s2')], total = records.length) {
  prismaMock.$queryRaw
    .mockResolvedValueOnce(
      records.map((row, index) => ({ id: row.id, vote: BigInt(99 - index), rankingPosition: BigInt(index + 1) })),
    )
    .mockResolvedValueOnce([{ total: BigInt(total) }])
    .mockResolvedValueOnce([
      { serverID: 's1', bucketAt: '2026-11-14T00:00:00.000Z', players: 14 },
      { serverID: 's1', bucketAt: '2026-11-20T00:00:00.000Z', players: 22 },
    ])
  prismaMock.gm_server.findMany.mockResolvedValueOnce(records)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
  prismaMock.$queryRaw.mockReset()
  prismaMock.gm_server.findMany.mockReset()
  prismaMock.gm_server_status.findMany
    .mockReset()
    .mockResolvedValue([{ gameMode: '' }, { gameMode: 'darkrp' }, { gameMode: 'sandbox' }])
  inviteMock.mockReset().mockResolvedValue('https://discord.gg/dev-community')
  accessMock.mockReset().mockResolvedValue(access())
})

afterEach(() => vi.useRealTimers())

describe('public server ranking', () => {
  it('rejects malformed or unbounded query values before reading data or contacting Discord', async () => {
    for (const query of [
      { limit: 1000 },
      { limit: -1 },
      { offset: -1 },
      { offset: 1_000_001 },
      { offset: 1.2 },
      { status: 'maybe' },
      { search: 'x'.repeat(101) },
      { gameMode: 'x'.repeat(101) },
      { limit: ['10', '25'] },
      { search: { unsafe: true } },
    ]) {
      const result = await processGetPublicServerRanking(query)
      expect(result.status).toBe(400)
      expect(result.body).toMatchObject({ error: 'Invalid server ranking query' })
    }
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled()
    expect(inviteMock).not.toHaveBeenCalled()
    expect(accessMock).not.toHaveBeenCalled()
  })

  it('returns a bounded page, serializable vote counts, real activity gaps and one invitation per community', async () => {
    setupPage()
    const result = await processGetPublicServerRanking({})
    expect(result.status).toBe(200)
    const body = PublicServerRankingResponseSchema.parse(result.body)
    expect(body.pagination).toEqual({ total: 2, offset: 0, limit: 10 })
    expect(body.filters.gameModes).toEqual(['darkrp', 'sandbox'])
    expect(body.servers.map((row) => [row.id, row.vote, row.rank])).toEqual([
      ['s1', 99, 1],
      ['s2', 98, 2],
    ])
    expect(body.servers.every((row) => row.online && row.discordUrl === 'https://discord.gg/dev-community')).toBe(true)
    expect(body.servers[0].activity).toEqual([
      { at: '2026-11-14T00:00:00.000Z', players: 14 },
      { at: '2026-11-20T00:00:00.000Z', players: 22 },
    ])
    expect(body.servers[1].activity).toEqual([])
    expect(inviteMock).toHaveBeenCalledExactlyOnceWith('community')
    expect(accessMock).toHaveBeenCalledExactlyOnceWith('community')
    expect(body.servers.every((row) => row.premium === false && row.partner === false)).toBe(true)
    const rankingQuery = prismaMock.$queryRaw.mock.calls[0][0]
    expect(rankingQuery.sql).toContain('ROW_NUMBER() OVER (ORDER BY vote DESC, id ASC)')
    expect(rankingQuery.sql).toContain('LIMIT ? OFFSET ?')
    expect(rankingQuery.values.slice(-2)).toEqual([10, 0])
    const voteSince = new Date(now.getTime() - 30 * DAY)
    expect(rankingQuery.values).toContainEqual(voteSince)
    const activityQuery = prismaMock.$queryRaw.mock.calls[2][0]
    expect(activityQuery.sql).toContain('MAX(players)')
    expect(activityQuery.sql).toContain('GROUP BY serverID, DATE(createdAt)')
    expect(activityQuery.values).toEqual(['s1', 's2', new Date(now.getTime() - 7 * DAY), now])
    const select = prismaMock.gm_server.findMany.mock.calls[0][0]
    expect(select.where).toEqual({ id: { in: ['s1', 's2'] }, isPublic: true })
    expect(select.select.token).toBeUndefined()
    expect(select.select.gm_server_status.select.playersList).toBeUndefined()
    expect(select.select.gm_guild).toEqual({ select: { isPartner: true } })
  })

  it.each(['discord', 'gmodstore', 'legacy'])(
    'uses authoritative %s Premium access without inferring partnership',
    async (source) => {
      setupPage([record('s1')])
      accessMock.mockResolvedValueOnce(access({ premium: true, customBot: source === 'gmodstore', sources: [source] }))

      const result = await processGetPublicServerRanking({})
      const body = PublicServerRankingResponseSchema.parse(result.body)

      expect(body.servers[0]).toMatchObject({ premium: true, partner: false })
    },
  )

  it('keeps partner and Premium flags independent without changing vote-based order or pagination', async () => {
    setupPage(
      [
        record('free-partner', { guild: 'partner', gm_guild: { isPartner: true } }),
        record('paid', { guild: 'paid' }),
        record('both', { guild: 'both', gm_guild: { isPartner: true } }),
      ],
      50,
    )
    accessMock.mockImplementation(async (guildID: string) => access({ guildID, premium: guildID !== 'partner' }))

    const result = await processGetPublicServerRanking({})
    const body = PublicServerRankingResponseSchema.parse(result.body)

    expect(body.servers.map(({ id, rank, vote, premium, partner }) => ({ id, rank, vote, premium, partner }))).toEqual([
      { id: 'free-partner', rank: 1, vote: 99, premium: false, partner: true },
      { id: 'paid', rank: 2, vote: 98, premium: true, partner: false },
      { id: 'both', rank: 3, vote: 97, premium: true, partner: true },
    ])
    expect(body.pagination).toEqual({ total: 50, offset: 0, limit: 10 })
  })

  it('does not advertise Premium when entitlement resolution is uncertain', async () => {
    setupPage()
    accessMock.mockResolvedValueOnce(access({ premium: true, state: 'unknown' }))

    const result = await processGetPublicServerRanking({})
    const body = PublicServerRankingResponseSchema.parse(result.body)

    expect(body.servers.every((server) => server.premium === false)).toBe(true)
    expect(body.servers.every((server) => server.discordUrl === 'https://discord.gg/dev-community')).toBe(true)
    expect(accessMock).toHaveBeenCalledExactlyOnceWith('community')
  })

  it('does not advertise Premium that expires while its invitation is pending', async () => {
    setupPage()
    let finishInvite!: (invite: string) => void
    inviteMock.mockImplementationOnce(() => new Promise<string>((resolve) => (finishInvite = resolve)))
    accessMock.mockResolvedValueOnce(
      access({ premium: true, validUntil: new Date(now.getTime() + 1000).toISOString() }),
    )
    const pending = processGetPublicServerRanking({})
    await vi.waitFor(() => expect(accessMock).toHaveBeenCalledTimes(1))

    vi.setSystemTime(new Date(now.getTime() + 2000))
    finishInvite('https://discord.gg/dev-community')
    const result = await pending
    const body = PublicServerRankingResponseSchema.parse(result.body)

    expect(body.servers.every((server) => server.premium === false)).toBe(true)
    expect(body.servers.every((server) => server.discordUrl === 'https://discord.gg/dev-community')).toBe(true)
    expect(accessMock).toHaveBeenCalledExactlyOnceWith('community')
  })

  it.each(['invalid', '2026-11-20T11:59:59.000Z'])(
    'does not advertise an invalid or expired Premium deadline: %s',
    async (validUntil) => {
      setupPage()
      accessMock.mockResolvedValueOnce(access({ premium: true, validUntil }))

      const result = await processGetPublicServerRanking({})

      expect(
        PublicServerRankingResponseSchema.parse(result.body).servers.every((server) => server.premium === false),
      ).toBe(true)
    },
  )

  it('preserves the directory and partner badge if access lookup fails', async () => {
    setupPage([record('s1', { gm_guild: { isPartner: true } })])
    accessMock.mockRejectedValueOnce(new Error('Entitlement provider unavailable'))

    const result = await processGetPublicServerRanking({})
    const body = PublicServerRankingResponseSchema.parse(result.body)

    expect(result.status).toBe(200)
    expect(body.servers[0]).toMatchObject({
      premium: false,
      partner: true,
      discordUrl: 'https://discord.gg/dev-community',
    })
  })

  it('preserves Premium and partner badges if the independent invitation lookup fails', async () => {
    setupPage([record('s1', { gm_guild: { isPartner: true } })])
    accessMock.mockResolvedValueOnce(access({ premium: true }))
    inviteMock.mockRejectedValueOnce(new Error('Discord unavailable'))

    const result = await processGetPublicServerRanking({})

    expect(PublicServerRankingResponseSchema.parse(result.body).servers[0]).toMatchObject({
      premium: true,
      partner: true,
      discordUrl: null,
    })
  })

  it('uses bound literal search patterns, exact mode filters and a fresh snapshot cutoff for online pages', async () => {
    setupPage([record('s1')], 50)
    const result = await processGetPublicServerRanking({
      search: '  50%_name=match  ',
      gameMode: 'sandbox',
      status: 'online',
      limit: '25',
      offset: '25',
    })
    expect(result.status).toBe(200)
    const query = prismaMock.$queryRaw.mock.calls[0][0]
    expect(query.sql).not.toContain('50%_name=match')
    expect(query.sql).toContain('LOWER(COALESCE(st.hostname')
    expect(query.sql).toContain('LOWER(COALESCE(st.map')
    expect(query.sql).toContain('LOWER(COALESCE(g.name')
    expect(query.sql).toContain('st.gameMode = ?')
    expect(query.sql).toContain('st.updatedAt >= ?')
    expect(query.values).toContain('%50=%=_name==match%')
    expect(query.values).toContain('sandbox')
    expect(query.values).toContainEqual(new Date(now.getTime() - 5 * 60 * 1000))
    expect(query.values.slice(-2)).toEqual([25, 25])
  })

  it('keeps historical metadata and charts visible when a server is offline', async () => {
    const updatedAt = new Date(now.getTime() - DAY)
    setupPage([
      record('s1', {
        gm_server_status: {
          hostname: 'Previous hostname',
          gameMode: 'darkrp',
          map: 'rp_downtown',
          players: -1,
          maxPlayers: -2,
          updatedAt,
        },
      }),
    ])
    const result = await processGetPublicServerRanking({ status: 'offline' })
    const body = PublicServerRankingResponseSchema.parse(result.body)
    expect(body.servers[0]).toMatchObject({
      online: false,
      lastSeenAt: updatedAt.toISOString(),
      status: { hostname: 'Previous hostname', gameMode: 'darkrp', map: 'rp_downtown', players: 0, maxPlayers: 0 },
    })
    expect(body.servers[0].activity).toHaveLength(2)
    expect(prismaMock.$queryRaw.mock.calls[0][0].sql).toContain('st.id IS NULL OR st.updatedAt < ?')
  })

  it('handles missing server information, unknown status, zero votes and absent activity without inventing data', async () => {
    const missing = record('s1', {
      name: null,
      description: null,
      image: null,
      ip: null,
      port: null,
      gm_server_status: null,
    })
    prismaMock.$queryRaw
      .mockResolvedValueOnce([{ id: 's1', vote: 0, rankingPosition: 51 }])
      .mockResolvedValueOnce([{ total: 51 }])
      .mockResolvedValueOnce([])
    prismaMock.gm_server.findMany.mockResolvedValueOnce([missing])
    const result = await processGetPublicServerRanking({ offset: 50 })
    const body = PublicServerRankingResponseSchema.parse(result.body)
    expect(body.servers[0]).toMatchObject({
      name: '',
      description: '',
      image: '',
      ip: '',
      port: '',
      vote: 0,
      rank: 51,
      online: false,
      status: null,
      lastSeenAt: null,
      activity: [],
    })
  })

  it('returns accurate totals for empty or out-of-range pages without loading details, histories or invitations', async () => {
    for (const total of [0, 100]) {
      prismaMock.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total }])
      const result = await processGetPublicServerRanking({ offset: 100 })
      expect(result.body).toEqual({
        servers: [],
        pagination: { total, offset: 100, limit: 10 },
        filters: { gameModes: ['darkrp', 'sandbox'] },
      })
    }
    expect(prismaMock.gm_server.findMany).not.toHaveBeenCalled()
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(4)
    expect(inviteMock).not.toHaveBeenCalled()
    expect(accessMock).not.toHaveBeenCalled()
  })

  it('keeps the directory available if Discord fails and never returns arbitrary or unsafe invitation URLs', async () => {
    setupPage([record('s1', { guild: 'missing' }), record('s2', { guild: 'unsafe' }), record('s3', { guild: 'none' })])
    inviteMock
      .mockRejectedValueOnce(new Error('Missing bot permission'))
      .mockResolvedValueOnce('https://discord.gg.evil.test/invite')
      .mockResolvedValueOnce(null)
    const result = await processGetPublicServerRanking({})
    const body = PublicServerRankingResponseSchema.parse(result.body)
    expect(body.servers).toHaveLength(3)
    expect(body.servers.every((server) => server.discordUrl === null)).toBe(true)
    expect(inviteMock).toHaveBeenCalledTimes(3)
  })

  it('omits a server that became private between ranking and detail reads', async () => {
    prismaMock.$queryRaw
      .mockResolvedValueOnce([
        { id: 's1', vote: 2, rankingPosition: 1 },
        { id: 'private-now', vote: 1, rankingPosition: 2 },
      ])
      .mockResolvedValueOnce([{ total: 2 }])
      .mockResolvedValueOnce([{ serverID: 's1', bucketAt: '2026-11-20T00:00:00.000Z', players: -8 }])
    prismaMock.gm_server.findMany.mockResolvedValueOnce([record('s1')])
    const result = await processGetPublicServerRanking({})
    const body = PublicServerRankingResponseSchema.parse(result.body)
    expect(body.servers.map((row) => row.id)).toEqual(['s1'])
    expect(body.servers[0].activity[0].players).toBe(0)
    expect(accessMock).toHaveBeenCalledExactlyOnceWith('community')
  })
})
