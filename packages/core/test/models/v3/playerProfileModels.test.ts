import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlayerProfileResponseSchema } from '@gmod/schema/user/PlayerProfileSchema.js'

const mocks = vi.hoisted(() => ({
  viewer: vi.fn(),
  linkedUser: vi.fn(),
  storedPlayer: vi.fn(),
  aggregate: vi.fn(),
  latest: vi.fn(),
  records: vi.fn(),
  warningsTotal: vi.fn(),
  bansTotal: vi.fn(),
  warnings: vi.fn(),
  bans: vi.fn(),
  erased: vi.fn(),
  steamAvatar: vi.fn(),
  discordProfile: vi.fn(),
}))
vi.mock('@gmod/infra-prisma', () => ({
  default: {
    gm_user: { findUnique: mocks.viewer, findFirst: mocks.linkedUser },
    gm_user_steam: { findUnique: mocks.storedPlayer },
    gm_server_stat: { aggregate: mocks.aggregate, findFirst: mocks.latest, findMany: mocks.records },
    gm_server_warn: { count: mocks.warningsTotal, findMany: mocks.warnings },
    gm_server_ban: { count: mocks.bansTotal, findMany: mocks.bans },
  },
}))
vi.mock('@gmod/domain-user/privacy.js', () => ({ isErasureBlocked: mocks.erased }))
vi.mock('@gmod/infra-steam', () => ({ getSteamUserAvatarLarge: mocks.steamAvatar }))
vi.mock('../../../src/models/discordProfile.js', () => ({ getDiscordProfile: mocks.discordProfile }))

const { processGetPlayerProfile } = await import('../../../src/models/v3/playerProfileModels.js')
const steamID64 = '76561198000000001'
const now = new Date('2026-11-23T12:00:00.000Z')
const firstJoin = new Date('2026-01-01T12:00:00.000Z')
const viewer = { id: 'viewer', steam: steamID64, username: 'Account name', trust: 0 }
const targetDiscordID = '333650866747867137'
const steamAvatarURL = `https://api.example.test/avatars/steam/${steamID64}`
const discordAvatarURL = `https://api.example.test/avatars/discord/${targetDiscordID}`

function mockViewer(value: typeof viewer | { steam: null; id: string; username: string; trust: number }) {
  mocks.viewer.mockImplementation(async ({ where }) => (where.id === 'viewer' ? value : null))
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Visible player',
    rank: 'user',
    total_time: 3_600,
    total_kill: 10,
    total_death: 5,
    total_connect: 4,
    first_join: firstJoin,
    last_connect: now,
    gm_server: {
      id: 'server',
      name: 'Community server',
      image: '/server.png',
      isPublic: true,
      gm_server_status: { gameMode: 'sandbox', map: 'gm_construct', updatedAt: now },
    },
    ...overrides,
  }
}

function summary(total = 2) {
  return {
    _count: { _all: total },
    _sum: { total_time: 7_200, total_kill: 20, total_death: 10, total_connect: 8 },
    _min: { first_join: firstJoin },
    _max: { last_connect: now },
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  mockViewer(viewer)
  mocks.linkedUser.mockResolvedValue({ id: 'target', trust: 42 })
  mocks.storedPlayer.mockResolvedValue({ username: 'Stored own name', createdAt: firstJoin })
  mocks.aggregate.mockResolvedValue(summary())
  mocks.latest.mockResolvedValue({ name: 'Latest visible player name' })
  mocks.records.mockResolvedValue([row()])
  mocks.warningsTotal.mockResolvedValue(0)
  mocks.bansTotal.mockResolvedValue(0)
  mocks.warnings.mockResolvedValue([])
  mocks.bans.mockResolvedValue([])
  mocks.erased.mockResolvedValue(false)
  mocks.steamAvatar.mockResolvedValue(null)
  mocks.discordProfile.mockResolvedValue({ avatarURL: '' })
})
afterEach(() => vi.useRealTimers())

describe('player profile', () => {
  it('validates target and bounded pagination before reading an account', async () => {
    for (const target of ['bad', '123', [steamID64], null, Number(steamID64)]) {
      expect(await processGetPlayerProfile('viewer', target, {})).toEqual({
        status: 400,
        body: { error: 'invalid_player_id' },
      })
    }
    for (const query of [
      { offset: -1 },
      { offset: 1_000_001 },
      { offset: true },
      { limit: 1_000 },
      { limit: ['10'] },
      { offset: {} },
      { self: true },
    ]) {
      expect(await processGetPlayerProfile('viewer', steamID64, query)).toEqual({
        status: 400,
        body: { error: 'invalid_player_profile_query' },
      })
    }
    expect(mocks.viewer).not.toHaveBeenCalled()
  })

  it('returns the complete visible summary independently of the requested server page and preserves zero trust', async () => {
    const result = await processGetPlayerProfile('viewer', undefined, { limit: '25', offset: '25' }, now)
    expect(result.status).toBe(200)
    const body = PlayerProfileResponseSchema.parse(result.body)
    expect(body.player).toEqual({
      steamID64,
      discordID: null,
      name: 'Stored own name',
      avatarURL: null,
      discordAvatarURL: null,
      trustLevel: 0,
      registeredAt: firstJoin.toISOString(),
    })
    expect(body.summary).toEqual({
      servers: 2,
      totalTime: 7_200,
      kills: 20,
      deaths: 10,
      connections: 8,
      firstJoinedAt: firstJoin.toISOString(),
      lastSeenAt: now.toISOString(),
    })
    expect(body.pagination).toEqual({ total: 2, limit: 25, offset: 25 })
    expect(body.servers[0]).toMatchObject({ totalTime: 3_600, kills: 10, deaths: 5, connections: 4, online: true })
    expect(mocks.records.mock.calls[0][0]).toMatchObject({
      where: { steam_id: steamID64 },
      take: 25,
      skip: 25,
      orderBy: [{ last_connect: 'desc' }, { server_id: 'asc' }],
    })
    expect(mocks.records.mock.calls[0][0].where).not.toHaveProperty('gm_server')
    expect(mocks.linkedUser).not.toHaveBeenCalled()
    expect(mocks.erased).toHaveBeenLastCalledWith('viewer', steamID64)
  })

  it('limits another player to public server records for the page, name, dates and aggregates', async () => {
    mockViewer({ ...viewer, steam: '76561198000000002' })
    const result = await processGetPlayerProfile('viewer', steamID64, {}, now)
    const body = PlayerProfileResponseSchema.parse(result.body)
    expect(body.player).toEqual({
      steamID64,
      discordID: null,
      name: 'Latest visible player name',
      registeredAt: null,
      avatarURL: null,
      discordAvatarURL: null,
      trustLevel: 42,
    })
    const publicWhere = { steam_id: steamID64, gm_server: { isPublic: true } }
    for (const mock of [mocks.aggregate, mocks.latest, mocks.records]) {
      expect(mock.mock.calls[0][0].where).toEqual(publicWhere)
    }
    for (const mock of [mocks.warningsTotal, mocks.bansTotal, mocks.warnings, mocks.bans]) {
      expect(mock.mock.calls[0][0].where).toEqual({
        userSteamID64: steamID64,
        gm_server: { isPublic: true },
      })
    }
    expect(mocks.storedPlayer).not.toHaveBeenCalled()
    expect(mocks.linkedUser).toHaveBeenCalledWith({ where: { steam: steamID64 }, select: { id: true, trust: true } })
    expect(mocks.erased).toHaveBeenLastCalledWith('target', steamID64)
    const selection = JSON.stringify(mocks.records.mock.calls[0][0].select)
    for (const sensitive of ['last_ip', 'custom_values', 'bypassMaintenance', 'token', 'playersList', 'email'])
      expect(selection).not.toContain(sensitive)
    expect(JSON.stringify(body)).not.toContain('viewer')
    expect(JSON.stringify(body)).not.toContain('target')
  })

  it('does not disclose another player with only private records, including at an out-of-range offset', async () => {
    mockViewer({ ...viewer, steam: null })
    mocks.aggregate.mockResolvedValue(summary(0))
    mocks.records.mockResolvedValue([])
    expect(await processGetPlayerProfile('viewer', steamID64, { offset: 100 }, now)).toEqual({
      status: 404,
      body: { error: 'player_not_found' },
    })
    expect(mocks.steamAvatar).not.toHaveBeenCalled()
    expect(mocks.discordProfile).not.toHaveBeenCalled()
  })

  it('keeps a visible profile available when the requested page is empty', async () => {
    mockViewer({ ...viewer, steam: null })
    mocks.records.mockResolvedValue([])
    const result = await processGetPlayerProfile('viewer', steamID64, { offset: 100 }, now)
    expect(result.status).toBe(200)
    const body = PlayerProfileResponseSchema.parse(result.body)
    expect(body.servers).toEqual([])
    expect(body.player.name).toBe('Latest visible player name')
    expect(body.pagination.total).toBe(2)
  })

  it('renders a linked account with no stored Steam record or server statistics as an empty own profile', async () => {
    mocks.storedPlayer.mockResolvedValue(null)
    mocks.latest.mockResolvedValue(null)
    mocks.aggregate.mockResolvedValue({
      _count: { _all: 0 },
      _sum: { total_time: null, total_kill: null, total_death: null, total_connect: null },
      _min: { first_join: null },
      _max: { last_connect: null },
    })
    mocks.records.mockResolvedValue([])
    const result = await processGetPlayerProfile('viewer', undefined, {}, now)
    const body = PlayerProfileResponseSchema.parse(result.body)
    expect(body.player).toMatchObject({ name: 'Account name', registeredAt: null })
    expect(body.summary).toEqual({
      servers: 0,
      totalTime: 0,
      kills: 0,
      deaths: 0,
      connections: 0,
      firstJoinedAt: null,
      lastSeenAt: null,
    })
  })

  it('distinguishes no Steam link from an unknown viewer or malformed stored link', async () => {
    mocks.viewer.mockResolvedValueOnce({ ...viewer, steam: null })
    expect(await processGetPlayerProfile('viewer', undefined, {})).toEqual({
      status: 404,
      body: { error: 'steam_not_linked' },
    })
    mocks.viewer.mockResolvedValueOnce(null)
    expect(await processGetPlayerProfile('missing', undefined, {})).toEqual({
      status: 404,
      body: { error: 'player_not_found' },
    })
    mocks.viewer.mockResolvedValueOnce({ ...viewer, steam: 'invalid' })
    expect(await processGetPlayerProfile('viewer', undefined, {})).toEqual({
      status: 400,
      body: { error: 'invalid_steam_id' },
    })
    expect(mocks.aggregate).not.toHaveBeenCalled()
  })

  it('does not replace absent trust with a fabricated score', async () => {
    mockViewer({ ...viewer, steam: null })
    mocks.linkedUser.mockResolvedValue(null)
    const result = await processGetPlayerProfile('viewer', steamID64, {}, now)
    expect(PlayerProfileResponseSchema.parse(result.body).player.trustLevel).toBeNull()
  })

  it.each(['333650866747867137', '33365086674786713'])(
    'resolves Discord identity %s, including an ambiguous 17 digit snowflake',
    async (discordID) => {
      mocks.viewer.mockImplementation(async ({ where }) =>
        where.id === discordID ? { id: discordID, steam: '76561198000000002', trust: 67 } : viewer,
      )
      const result = await processGetPlayerProfile('viewer', discordID, {}, now)
      const body = PlayerProfileResponseSchema.parse(result.body)
      expect(body.player.steamID64).toBe('76561198000000002')
      expect(body.player.discordID).toBe(discordID)
      expect(body.player.trustLevel).toBe(67)
      expect(mocks.aggregate.mock.calls[0][0].where).toEqual({
        steam_id: '76561198000000002',
        gm_server: { isPublic: true },
      })
      expect(mocks.linkedUser).not.toHaveBeenCalled()
    },
  )

  it('shows the linked Discord identity when a profile is opened by Steam ID', async () => {
    mockViewer({ ...viewer, steam: null })
    mocks.linkedUser.mockResolvedValue({ id: '333650866747867137', trust: 42 })
    const result = await processGetPlayerProfile('viewer', steamID64, {}, now)
    expect(PlayerProfileResponseSchema.parse(result.body).player.discordID).toBe('333650866747867137')
  })

  it('loads both avatars for the viewed player instead of the signed-in account', async () => {
    mockViewer({ ...viewer, steam: '76561198000000002' })
    mocks.linkedUser.mockResolvedValue({ id: targetDiscordID, trust: 42 })
    mocks.steamAvatar.mockResolvedValue(steamAvatarURL)
    mocks.discordProfile.mockResolvedValue({ avatarURL: discordAvatarURL })
    const result = await processGetPlayerProfile('viewer', steamID64, {}, now)
    const body = PlayerProfileResponseSchema.parse(result.body)
    expect(body.player).toMatchObject({
      steamID64,
      discordID: targetDiscordID,
      avatarURL: steamAvatarURL,
      discordAvatarURL,
      name: 'Latest visible player name',
    })
    expect(mocks.steamAvatar).toHaveBeenCalledExactlyOnceWith(steamID64)
    expect(mocks.discordProfile).toHaveBeenCalledExactlyOnceWith(targetDiscordID)
    expect(body.summary.servers).toBe(2)
  })

  it('keeps an unlinked player’s Steam avatar without substituting the viewer’s Discord avatar', async () => {
    mockViewer({ ...viewer, steam: null })
    mocks.linkedUser.mockResolvedValue(null)
    mocks.steamAvatar.mockResolvedValue(steamAvatarURL)
    const result = await processGetPlayerProfile('viewer', steamID64, {}, now)
    expect(PlayerProfileResponseSchema.parse(result.body).player).toMatchObject({
      avatarURL: steamAvatarURL,
      discordID: null,
      discordAvatarURL: null,
    })
    expect(mocks.discordProfile).not.toHaveBeenCalled()
  })

  it.each(['steam', 'discord'] as const)(
    'preserves statistics and the other avatar when %s fails',
    async (provider) => {
      mockViewer({ ...viewer, steam: null })
      mocks.linkedUser.mockResolvedValue({ id: targetDiscordID, trust: 42 })
      mocks.steamAvatar.mockResolvedValue(steamAvatarURL)
      mocks.discordProfile.mockResolvedValue({ avatarURL: discordAvatarURL })
      const failing = provider === 'steam' ? mocks.steamAvatar : mocks.discordProfile
      failing.mockRejectedValue(new Error('Provider unavailable'))
      const result = await processGetPlayerProfile('viewer', steamID64, {}, now)
      expect(result.status).toBe(200)
      const body = PlayerProfileResponseSchema.parse(result.body)
      expect(body.player.avatarURL).toBe(provider === 'steam' ? null : steamAvatarURL)
      expect(body.player.discordAvatarURL).toBe(provider === 'discord' ? null : discordAvatarURL)
      expect(body.summary.servers).toBe(2)
      expect(body.servers).toHaveLength(1)
    },
  )

  it('bounds both stalled avatar providers concurrently while preserving the profile', async () => {
    vi.useFakeTimers()
    mockViewer({ ...viewer, steam: null })
    mocks.linkedUser.mockResolvedValue({ id: targetDiscordID, trust: 42 })
    mocks.steamAvatar.mockImplementation(() => new Promise(() => {}))
    mocks.discordProfile.mockImplementation(() => new Promise(() => {}))
    const request = processGetPlayerProfile('viewer', steamID64, {}, now)
    let completed = false
    void request.then(() => {
      completed = true
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.steamAvatar).toHaveBeenCalledExactlyOnceWith(steamID64)
    expect(mocks.discordProfile).toHaveBeenCalledExactlyOnceWith(targetDiscordID)
    await vi.advanceTimersByTimeAsync(2_999)
    expect(completed).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    const result = await request
    expect(result.status).toBe(200)
    const body = PlayerProfileResponseSchema.parse(result.body)
    expect(body.player).toMatchObject({ avatarURL: null, discordAvatarURL: null })
    expect(body.summary.servers).toBe(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('treats malformed provider avatar URLs as missing decoration', async () => {
    mockViewer({ ...viewer, steam: null })
    mocks.linkedUser.mockResolvedValue({ id: targetDiscordID, trust: 42 })
    mocks.steamAvatar.mockResolvedValue('not-a-url')
    mocks.discordProfile.mockResolvedValue({ avatarURL: '' })
    const result = await processGetPlayerProfile('viewer', steamID64, {}, now)
    expect(result.status).toBe(200)
    expect(PlayerProfileResponseSchema.parse(result.body).player).toMatchObject({
      avatarURL: null,
      discordAvatarURL: null,
    })
  })

  it('suppresses the profile when erasure begins while its avatars are loading', async () => {
    mockViewer({ ...viewer, steam: null })
    mocks.linkedUser.mockResolvedValue({ id: targetDiscordID, trust: 42 })
    let releaseAvatar!: (value: string) => void
    let avatarStarted!: () => void
    const started = new Promise<void>((resolve) => {
      avatarStarted = resolve
    })
    mocks.steamAvatar.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          releaseAvatar = resolve
          avatarStarted()
        }),
    )
    mocks.discordProfile.mockResolvedValue({ avatarURL: discordAvatarURL })
    const request = processGetPlayerProfile('viewer', steamID64, {}, now)
    await started
    mocks.erased.mockResolvedValue(true)
    releaseAvatar(steamAvatarURL)
    expect(await request).toEqual({ status: 404, body: { error: 'player_not_found' } })
    expect(mocks.erased).toHaveBeenLastCalledWith(targetDiscordID, steamID64)
  })

  it('resolves the viewer by their Discord ID without requiring any visible public server', async () => {
    const discordID = '333650866747867137'
    mocks.viewer.mockResolvedValue({ ...viewer, id: discordID })
    mocks.aggregate.mockResolvedValue(summary(0))
    const result = await processGetPlayerProfile(discordID, discordID, {}, now)
    const body = PlayerProfileResponseSchema.parse(result.body)
    expect(body.player.discordID).toBe(discordID)
    expect(body.player.steamID64).toBe(steamID64)
    expect(mocks.aggregate.mock.calls[0][0].where).toEqual({ steam_id: steamID64 })
    expect(mocks.viewer).toHaveBeenCalledTimes(1)
  })

  it('does not treat a missing explicit Discord account as a Steam identity', async () => {
    const result = await processGetPlayerProfile('viewer', '33365086674786713', {}, now, 'discord')
    expect(result).toEqual({ status: 404, body: { error: 'player_not_found' } })
    expect(mocks.aggregate).not.toHaveBeenCalled()
    expect(mocks.linkedUser).not.toHaveBeenCalled()
  })

  it('keeps an explicit Steam lookup unambiguous if an account has the same numeric Discord ID', async () => {
    mockViewer({ ...viewer, steam: '76561198000000002' })
    const result = await processGetPlayerProfile('viewer', steamID64, {}, now, 'steam')
    expect(PlayerProfileResponseSchema.parse(result.body).player.steamID64).toBe(steamID64)
    expect(mocks.viewer).toHaveBeenCalledExactlyOnceWith({
      where: { id: 'viewer' },
      select: { id: true, steam: true, username: true, trust: true },
    })
    expect(mocks.linkedUser).toHaveBeenCalled()
  })

  it('does not reveal the linked identity of an unknown, unlinked or erased Discord profile', async () => {
    const targetDiscordID = '333650866747867137'
    expect(await processGetPlayerProfile('viewer', targetDiscordID, {}, now)).toEqual({
      status: 404,
      body: { error: 'player_not_found' },
    })
    mocks.viewer.mockImplementation(async ({ where }) =>
      where.id === targetDiscordID ? { id: targetDiscordID, steam: null, trust: 50 } : viewer,
    )
    expect(await processGetPlayerProfile('viewer', targetDiscordID, {}, now)).toEqual({
      status: 404,
      body: { error: 'player_not_found' },
    })
    mocks.viewer.mockImplementation(async ({ where }) =>
      where.id === targetDiscordID ? { id: targetDiscordID, steam: '76561198000000002', trust: 50 } : viewer,
    )
    mocks.erased.mockResolvedValueOnce(true)
    expect(await processGetPlayerProfile('viewer', targetDiscordID, {}, now)).toEqual({
      status: 404,
      body: { error: 'player_not_found' },
    })
    expect(mocks.aggregate).not.toHaveBeenCalled()
  })

  it('paginates warnings and bans independently and projects reasons without moderator identities', async () => {
    const warning = {
      id: 3,
      serverID: 'server',
      reason: 'Repeated spam',
      createdAt: now,
      gm_server: { name: 'Community server' },
      adminSteamID64: 'private-moderator-id',
      userSteamID64: steamID64,
    }
    mocks.warningsTotal.mockResolvedValue(52)
    mocks.bansTotal.mockResolvedValue(82)
    mocks.warnings.mockResolvedValue([warning])
    mocks.bans.mockResolvedValue([{ ...warning, id: 4, reason: 'Cheating', time: 0 }])
    const result = await processGetPlayerProfile(
      'viewer',
      undefined,
      { limit: 25, offset: 50, warningOffset: 25, banOffset: 75 },
      now,
    )
    const body = PlayerProfileResponseSchema.parse(result.body)
    expect(body.moderation.warningsPagination).toEqual({ total: 52, limit: 25, offset: 25 })
    expect(body.moderation.bansPagination).toEqual({ total: 82, limit: 25, offset: 75 })
    expect(body.pagination.offset).toBe(50)
    expect(body.moderation.warnings).toEqual([
      {
        id: 3,
        serverID: 'server',
        serverName: 'Community server',
        reason: 'Repeated spam',
        createdAt: now.toISOString(),
      },
    ])
    expect(body.moderation.bans[0]).toMatchObject({ durationMinutes: 0, expiresAt: null, active: true })
    expect(JSON.stringify(body)).not.toContain('private-moderator-id')
    for (const [mock, skip] of [
      [mocks.warnings, 25],
      [mocks.bans, 75],
    ] as const) {
      expect(mock.mock.calls[0][0]).toMatchObject({
        where: { userSteamID64: steamID64 },
        take: 25,
        skip,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      })
      expect(mock.mock.calls[0][0].select).not.toHaveProperty('adminSteamID64')
    }
  })

  it('computes permanent, active and expired bans from minute durations, including the exact expiry boundary', async () => {
    const base = { serverID: 'server', reason: '', gm_server: { name: null } }
    mocks.bansTotal.mockResolvedValue(3)
    mocks.bans.mockResolvedValue([
      { ...base, id: 1, createdAt: firstJoin, time: 0 },
      { ...base, id: 2, createdAt: new Date(now.getTime() - 30 * 60_000), time: 90 },
      { ...base, id: 3, createdAt: new Date(now.getTime() - 60 * 60_000), time: 60 },
    ])
    const result = await processGetPlayerProfile('viewer', undefined, {}, now)
    const bans = PlayerProfileResponseSchema.parse(result.body).moderation.bans
    expect(bans[0]).toMatchObject({ durationMinutes: 0, expiresAt: null, active: true, serverName: '' })
    expect(bans[1]).toMatchObject({
      durationMinutes: 90,
      expiresAt: new Date(now.getTime() + 60 * 60_000).toISOString(),
      active: true,
    })
    expect(bans[2]).toMatchObject({ durationMinutes: 60, expiresAt: now.toISOString(), active: false })
  })

  it.each(['warnings', 'bans'] as const)('keeps public moderation-only profiles visible via their %s', async (kind) => {
    mockViewer({ ...viewer, steam: null })
    mocks.aggregate.mockResolvedValue(summary(0))
    mocks.records.mockResolvedValue([])
    mocks.latest.mockResolvedValue(null)
    if (kind === 'warnings') mocks.warningsTotal.mockResolvedValue(1)
    else mocks.bansTotal.mockResolvedValue(1)
    const result = await processGetPlayerProfile('viewer', steamID64, {}, now)
    expect(result.status).toBe(200)
    const body = PlayerProfileResponseSchema.parse(result.body)
    expect(body.player.name).toBe(steamID64)
    expect(body.servers).toEqual([])
    expect(body.moderation[kind === 'warnings' ? 'warningsPagination' : 'bansPagination'].total).toBe(1)
  })

  it.each([-1, 101, 12.5])('treats an invalid legacy trust value (%s) as unknown', async (trust) => {
    mockViewer({ ...viewer, trust })
    const result = await processGetPlayerProfile('viewer', undefined, {}, now)
    expect(PlayerProfileResponseSchema.parse(result.body).player.trustLevel).toBeNull()
  })

  it('suppresses erased Steam records before statistics are read', async () => {
    mocks.erased.mockResolvedValueOnce(true)
    expect(await processGetPlayerProfile('viewer', steamID64, {})).toEqual({
      status: 404,
      body: { error: 'player_not_found' },
    })
    expect(mocks.aggregate).not.toHaveBeenCalled()
    expect(mocks.steamAvatar).not.toHaveBeenCalled()
    expect(mocks.discordProfile).not.toHaveBeenCalled()
  })

  it('suppresses an erased linked Discord identity before statistics are read', async () => {
    mockViewer({ ...viewer, steam: null })
    mocks.erased.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    expect(await processGetPlayerProfile('viewer', steamID64, {})).toEqual({
      status: 404,
      body: { error: 'player_not_found' },
    })
    expect(mocks.aggregate).not.toHaveBeenCalled()
    expect(mocks.steamAvatar).not.toHaveBeenCalled()
    expect(mocks.discordProfile).not.toHaveBeenCalled()
  })

  it('checks erasure again after loading data so an in-flight erasure cannot return a profile', async () => {
    mocks.erased.mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    expect(await processGetPlayerProfile('viewer', steamID64, {}, now)).toEqual({
      status: 404,
      body: { error: 'player_not_found' },
    })
    expect(mocks.records).toHaveBeenCalled()
    expect(mocks.steamAvatar).not.toHaveBeenCalled()
    expect(mocks.discordProfile).not.toHaveBeenCalled()
  })

  it('keeps missing or stale server metadata offline and nullable, and avoids negative counters', async () => {
    mocks.records.mockResolvedValue([
      row({
        total_time: -1,
        total_kill: -1,
        total_death: -1,
        total_connect: -1,
        gm_server: { id: 'private', name: null, image: null, isPublic: false, gm_server_status: null },
      }),
      row({
        gm_server: {
          id: 'stale',
          name: 'Stale server',
          image: '',
          isPublic: true,
          gm_server_status: { gameMode: '', map: '', updatedAt: firstJoin },
        },
      }),
    ])
    const result = await processGetPlayerProfile('viewer', undefined, {}, now)
    const body = PlayerProfileResponseSchema.parse(result.body)
    expect(body.servers[0]).toMatchObject({
      name: '',
      image: '',
      public: false,
      online: false,
      map: null,
      gameMode: null,
      totalTime: 0,
      kills: 0,
      deaths: 0,
      connections: 0,
    })
    expect(body.servers[1]).toMatchObject({ online: false, gameMode: null, map: null })
  })

  it('propagates storage errors to the controller error handler', async () => {
    mocks.aggregate.mockRejectedValue(new Error('storage unavailable'))
    await expect(processGetPlayerProfile('viewer', undefined, {})).rejects.toThrow('storage unavailable')
  })
})
