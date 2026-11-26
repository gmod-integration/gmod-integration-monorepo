import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const isErasureBlockedMock = vi.fn().mockResolvedValue(false)
vi.mock('../src/privacy.js', () => ({ isErasureBlocked: isErasureBlockedMock }))
const resolveSessionMock = vi.fn()
class FakeAuthSessionError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}
vi.mock('@gmod/domain-auth/authSessions.js', () => ({
  resolveApplicationSession: resolveSessionMock,
  AuthSessionError: FakeAuthSessionError,
}))
const getValidDiscordTokenMock = vi.fn()
const refreshDiscordCredentialsMock = vi.fn()
vi.mock('@gmod/domain-auth/discordOAuth.js', () => ({
  getValidDiscordToken: getValidDiscordTokenMock,
  refreshDiscordCredentials: refreshDiscordCredentialsMock,
}))
const panelTokenFindFirstMock = vi.fn()
vi.mock('@gmod/infra-prisma', () => ({ default: { gm_panelToken: { findFirst: panelTokenFindFirstMock } } }))
const redisGetMock = vi.fn()
const redisRetryGetMock = vi.fn()
const redisMgetMock = vi.fn()
const redisSetMock = vi.fn()
const redisDelMock = vi.fn()
const redisEvalMock = vi.fn()
vi.mock('@gmod/infra-redis', () => ({
  default: {
    mget: redisMgetMock,
    get: (key: string) => (key.endsWith(':guild-permissions-retry') ? redisRetryGetMock(key) : redisGetMock(key)),
    set: redisSetMock,
    del: redisDelMock,
    eval: redisEvalMock,
  },
}))
const getUserFromDiscordIDMock = vi.fn()
vi.mock('../src/User.js', () => ({ getUserFromDiscordID: getUserFromDiscordIDMock }))
const { PanelUser, getPanelUserFromDiscordID } = await import('../src/PanelUser.js')
const session = (overrides: Record<string, unknown> = {}) => ({
  id: 'session-a',
  discordID: 'd1',
  tokenHash: 'hash-a',
  createdAt: new Date('2026-01-01'),
  lastSeenAt: new Date(),
  expiresAt: new Date('2999-01-01'),
  absoluteExpiresAt: new Date('2999-01-01'),
  ...overrides,
})
function cachedGuilds(
  guilds: unknown,
  revision = JSON.stringify(['0', ...(Array.isArray(guilds) ? guilds : []).map((guild) => [guild.id, '0']).sort()]),
) {
  return JSON.stringify({ revision, guilds })
}
function buildPanelUser() {
  return new PanelUser({
    user: { discordID: 'd1' },
    discordID: 'd1',
    panelToken: {
      id: 'session-a',
      token: 'panel-tok',
      creationDate: new Date('2024-01-01'),
      expirationDate: new Date('2999-01-01'),
    },
  })
}
beforeEach(() => {
  vi.clearAllMocks()
  isErasureBlockedMock.mockReset().mockResolvedValue(false)
  resolveSessionMock.mockReset().mockResolvedValue(session())
  getValidDiscordTokenMock.mockReset().mockResolvedValue('fresh-token')
  refreshDiscordCredentialsMock.mockReset().mockResolvedValue({ access_token: 'fresh-token' })
  redisMgetMock.mockReset().mockResolvedValue([null, null])
  redisGetMock.mockReset().mockResolvedValue(null)
  redisRetryGetMock.mockReset().mockResolvedValue(null)
  redisSetMock.mockReset().mockResolvedValue('OK')
  redisDelMock.mockReset().mockResolvedValue(1)
  redisEvalMock.mockReset().mockResolvedValue(1)
  panelTokenFindFirstMock.mockReset()
  getUserFromDiscordIDMock.mockReset().mockResolvedValue({ discordID: 'd1' })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('application sessions are independent of Discord credentials', () => {
  it('authorizes a valid local session without contacting or checking Discord', async () => {
    getValidDiscordTokenMock.mockRejectedValue(new Error('Discord unavailable'))
    await expect(buildPanelUser().authAllowed('panel-tok')).resolves.toBe(true)
    expect(getValidDiscordTokenMock).not.toHaveBeenCalled()
  })
  it('rejects a revoked, expired or missing local session', async () => {
    resolveSessionMock.mockResolvedValue(null)
    await expect(buildPanelUser().authAllowed('panel-tok')).resolves.toBe(false)
  })
  it('rejects a valid session for a different account', async () => {
    resolveSessionMock.mockResolvedValue(session({ discordID: 'other' }))
    await expect(buildPanelUser().isValidPanelToken('other-token')).resolves.toBe(false)
  })
  it('rejects an erased account without resolving credentials', async () => {
    isErasureBlockedMock.mockResolvedValueOnce(true)
    await expect(buildPanelUser().authAllowed('panel-tok')).resolves.toBe(false)
    expect(resolveSessionMock).not.toHaveBeenCalled()
  })
  it('resolves fresh provider credentials only for a provider operation', async () => {
    await expect(buildPanelUser().getDiscordToken()).resolves.toBe('fresh-token')
    expect(getValidDiscordTokenMock).toHaveBeenCalledWith('d1')
  })
  it('marks a rejected Discord grant as integration reauthentication, not an invalid app session', async () => {
    getValidDiscordTokenMock.mockRejectedValue(Object.assign(new Error('grant rejected'), { code: 'grant_rejected' }))
    await expect(buildPanelUser().getDiscordToken()).rejects.toMatchObject({
      status: 403,
      code: 'discord_reauth_required',
    })
    await expect(buildPanelUser().authAllowed('panel-tok')).resolves.toBe(true)
    await expect(buildPanelUser().isValidDiscordToken()).resolves.toBe(false)
  })
})

describe('bounded and typed Discord permission lookup', () => {
  it('bypasses cached administrator rights for a fresh authorization decision', async () => {
    redisGetMock.mockResolvedValue(cachedGuilds([{ id: 'g1', permissions: '8' }]))
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => [{ id: 'g1', permissions: '0' }] })
    vi.stubGlobal('fetch', fetchMock)
    await expect(buildPanelUser().isAdminOfGuild('g1')).resolves.toBe(true)
    await expect(buildPanelUser().isAdminOfGuild('g1', { fresh: true })).resolves.toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('discards a cached list from a previous permission revision', async () => {
    redisGetMock.mockResolvedValueOnce(cachedGuilds([{ id: 'g1', permissions: '8' }], 'outdated'))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] }))
    await expect(buildPanelUser().isAdminOfGuild('g1')).resolves.toBe(false)
    expect(redisDelMock).toHaveBeenCalledWith('user:d1:guilds')
  })
  it('does not trust a legacy cache without a permission revision', async () => {
    redisGetMock.mockResolvedValueOnce(JSON.stringify([{ id: 'g1', permissions: '8' }]))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] }))
    await expect(buildPanelUser().findGuilds()).resolves.toEqual([])
  })
  it('rejects a lookup invalidated during its provider request without caching or returning old rights', async () => {
    redisMgetMock.mockResolvedValueOnce([null, null]).mockResolvedValueOnce([null, 'new-member-roles'])
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [{ id: 'g1', owner: true }] }),
    )
    await expect(buildPanelUser().isAdminOfGuild('g1', { fresh: true })).rejects.toMatchObject({
      status: 503,
      code: 'provider_unavailable',
    })
    expect(redisSetMock.mock.calls.filter(([key]) => key === 'user:d1:guilds')).toEqual([])
    expect(redisEvalMock).toHaveBeenCalled()
  })
  it('does not fall back to cached rights when a fresh provider check fails', async () => {
    redisGetMock.mockResolvedValue(cachedGuilds([{ id: 'g1', owner: true }]))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
    await expect(buildPanelUser().isAdminOfGuild('g1', { fresh: true })).rejects.toMatchObject({ status: 503 })
    expect(redisGetMock).not.toHaveBeenCalled()
  })
  it('returns no personal permissions for an erased account without reading the grant or caches', async () => {
    isErasureBlockedMock.mockResolvedValue(true)
    await expect(buildPanelUser().findGuilds()).resolves.toEqual([])
    expect(getValidDiscordTokenMock).not.toHaveBeenCalled()
    expect(redisGetMock).not.toHaveBeenCalled()
  })
  it('checks the grant before returning cached permissions without fetching guilds', async () => {
    redisGetMock.mockResolvedValueOnce(cachedGuilds([{ id: 'g1', owner: true }]))
    await expect(buildPanelUser().findGuilds()).resolves.toEqual([{ id: 'g1', owner: true }])
    expect(redisSetMock).not.toHaveBeenCalled()
    expect(getValidDiscordTokenMock).toHaveBeenCalledExactlyOnceWith('d1')
  })
  it('rejects cached permissions after a confirmed rejected grant while keeping the local session valid', async () => {
    redisGetMock.mockResolvedValue(cachedGuilds([{ id: 'g1', owner: true }]))
    getValidDiscordTokenMock.mockRejectedValue(Object.assign(new Error('grant rejected'), { code: 'grant_rejected' }))
    await expect(buildPanelUser().findGuilds()).rejects.toMatchObject({ status: 403, code: 'discord_reauth_required' })
    expect(redisGetMock).not.toHaveBeenCalled()
    await expect(buildPanelUser().authAllowed('panel-tok')).resolves.toBe(true)
  })
  it('preserves a temporary grant lookup failure without serving cached rights or invalidating the session', async () => {
    redisGetMock.mockResolvedValue(cachedGuilds([{ id: 'g1', owner: true }]))
    getValidDiscordTokenMock.mockRejectedValue(
      Object.assign(new Error('provider unavailable'), { code: 'provider_unavailable', status: 503 }),
    )
    await expect(buildPanelUser().findGuilds()).rejects.toMatchObject({ status: 503, code: 'provider_unavailable' })
    expect(redisDelMock).not.toHaveBeenCalled()
    await expect(buildPanelUser().authAllowed('panel-tok')).resolves.toBe(true)
  })
  it('acquires an expiring lock and releases it only by its owner', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [{ id: 'g1' }] }))
    await expect(buildPanelUser().findGuilds()).resolves.toEqual([{ id: 'g1' }])
    const [key, owner] = redisSetMock.mock.calls[0]
    expect(redisSetMock).toHaveBeenNthCalledWith(
      1,
      'user:d1:guild-permissions-lock',
      expect.any(String),
      'PX',
      30_000,
      'NX',
    )
    expect(redisEvalMock).toHaveBeenCalledWith(expect.stringContaining("redis.call('get'"), 1, key, owner)
    expect(redisSetMock).toHaveBeenCalledWith('user:d1:guilds', cachedGuilds([{ id: 'g1' }]), 'EX', 120)
  })
  it.each([429, 500, 503])(
    'returns a temporary failure for HTTP %i without a false permission denial',
    async (status) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status }))
      await expect(buildPanelUser().findGuilds()).rejects.toMatchObject({ status: 503, code: 'provider_unavailable' })
      expect(redisSetMock).not.toHaveBeenCalledWith('user:d1:guilds', '[]', 'EX', 120)
      expect(redisEvalMock).toHaveBeenCalled()
    },
  )
  it('bounds network requests and preserves a retryable network error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network error'))
    vi.stubGlobal('fetch', fetchMock)
    await expect(buildPanelUser().findGuilds()).rejects.toMatchObject({ status: 503 })
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })
  it('refreshes once after a provider401 and retries using the new credentials', async () => {
    getValidDiscordTokenMock.mockResolvedValueOnce('old-token').mockResolvedValueOnce('new-token')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [{ id: 'g1' }] })
    vi.stubGlobal('fetch', fetchMock)
    await expect(buildPanelUser().findGuilds()).resolves.toEqual([{ id: 'g1' }])
    expect(refreshDiscordCredentialsMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer new-token' }) }),
    )
  })
  it('does not loop on a second provider401 or log out the local session', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 })
    vi.stubGlobal('fetch', fetchMock)
    await expect(buildPanelUser().findGuilds()).rejects.toMatchObject({ code: 'discord_reauth_required', status: 403 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(refreshDiscordCredentialsMock).toHaveBeenCalledTimes(1)
  })
  it.each(['discord_reauth_required', 'grant_rejected', 'provider_unavailable'])(
    'preserves the meaning of a forced refresh failure (%s) and releases its guild lock',
    async (code) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }))
      refreshDiscordCredentialsMock.mockRejectedValue(
        Object.assign(new Error('refresh failed'), { code, status: code === 'provider_unavailable' ? 503 : 403 }),
      )
      await expect(buildPanelUser().findGuilds()).rejects.toMatchObject({
        code: code === 'provider_unavailable' ? 'provider_unavailable' : 'discord_reauth_required',
        status: code === 'provider_unavailable' ? 503 : 403,
      })
      expect(redisEvalMock).toHaveBeenCalled()
      await expect(buildPanelUser().authAllowed('panel-tok')).resolves.toBe(true)
    },
  )
  it('treats a malformed provider payload as unavailable, not an empty guild list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ error: 'bad body' }) }),
    )
    await expect(buildPanelUser().findGuilds()).rejects.toMatchObject({ status: 503 })
  })
  it('uses a cache populated by another request while waiting without extending the owner TTL', async () => {
    redisGetMock.mockResolvedValueOnce(null).mockResolvedValueOnce(cachedGuilds([{ id: 'g-other' }]))
    redisSetMock.mockResolvedValueOnce(null)
    await expect(buildPanelUser().findGuilds()).resolves.toEqual([{ id: 'g-other' }])
    expect(redisEvalMock).not.toHaveBeenCalled()
    expect(getValidDiscordTokenMock).toHaveBeenCalledExactlyOnceWith('d1')
  })
  it('stops waiting after the deadline and never releases another owner lock', async () => {
    vi.useFakeTimers()
    redisSetMock.mockResolvedValue(null)
    const result = buildPanelUser().findGuilds()
    const rejected = expect(result).rejects.toMatchObject({ code: 'provider_unavailable' })
    await vi.advanceTimersByTimeAsync(3_001)
    await rejected
    expect(redisEvalMock).not.toHaveBeenCalled()
    expect(getValidDiscordTokenMock).toHaveBeenCalledExactlyOnceWith('d1')
  })
  it('discards damaged cached data before obtaining fresh permissions', async () => {
    redisGetMock.mockResolvedValueOnce('{invalid')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [{ id: 'fresh' }] }))
    await expect(buildPanelUser().findGuilds()).resolves.toEqual([{ id: 'fresh' }])
    expect(redisDelMock).toHaveBeenCalledWith('user:d1:guilds')
  })
  it('removes damaged cache data observed while waiting and fetches permissions after obtaining the lease', async () => {
    redisGetMock.mockResolvedValueOnce(null).mockResolvedValueOnce('{damaged').mockResolvedValueOnce(null)
    redisSetMock.mockResolvedValueOnce(null).mockResolvedValue('OK')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [{ id: 'fresh' }] }))
    await expect(buildPanelUser().findGuilds()).resolves.toEqual([{ id: 'fresh' }])
    expect(redisDelMock).toHaveBeenCalledWith('user:d1:guilds')
    expect(redisEvalMock).toHaveBeenCalled()
  })
  it('uses a cache filled just before obtaining the lease and releases its own lease without a provider request', async () => {
    redisGetMock.mockResolvedValueOnce(null).mockResolvedValueOnce(cachedGuilds([{ id: 'concurrent' }]))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(buildPanelUser().findGuilds()).resolves.toEqual([{ id: 'concurrent' }])
    expect(fetchMock).not.toHaveBeenCalled()
    expect(redisEvalMock).toHaveBeenCalled()
  })
  it('does not save newly fetched personal data if erasure starts during lookup', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        isErasureBlockedMock.mockResolvedValue(true)
        return { ok: true, status: 200, json: async () => [{ id: 'g1' }] }
      }),
    )
    await expect(buildPanelUser().findGuilds()).resolves.toEqual([])
    expect(redisSetMock).toHaveBeenCalledTimes(1)
  })
  it('keeps admin permissions as bigint without truncating high Discord permission bits', async () => {
    redisGetMock.mockResolvedValue(
      cachedGuilds([
        { id: 'owner', owner: true, permissions: '0' },
        { id: 'admin', permissions: String(2n ** 60n + 8n) },
        { id: 'neither', permissions: '0' },
        { id: 'missing' },
        { id: 'malformed', permissions: 'invalid-bitfield' },
      ]),
    )
    expect((await buildPanelUser().findGuildsWithPerms()).map((guild) => guild.id)).toEqual(['owner', 'admin'])
    await expect(buildPanelUser().isAdminOfGuild('neither')).resolves.toBe(false)
  })
})

describe('exact panel user resolution', () => {
  it('uses the presented session A without loading the most recent B', async () => {
    const exact = session()
    const user = await getPanelUserFromDiscordID('d1', 'token-a', exact)
    expect(user?.authSession?.id).toBe('session-a')
    expect(user?.panelToken.token).toBe('token-a')
    expect(panelTokenFindFirstMock).not.toHaveBeenCalled()
  })
  it('uses a resolved ticket session without needing the original raw credential', async () => {
    const exact = session()
    const user = await getPanelUserFromDiscordID('d1', undefined, exact)
    expect(user?.authSession?.id).toBe('session-a')
    expect(user?.panelToken.token).toBe('')
    expect(panelTokenFindFirstMock).not.toHaveBeenCalled()
  })
  it('resolves a supplied credential before building the user', async () => {
    const result = await getPanelUserFromDiscordID('d1', 'token-a')
    expect(result?.authSession?.id).toBe('session-a')
    expect(resolveSessionMock).toHaveBeenCalledWith('token-a')
  })
  it('rejects a mismatching credential rather than loading the requested account', async () => {
    resolveSessionMock.mockResolvedValue(session({ discordID: 'other' }))
    await expect(getPanelUserFromDiscordID('d1', 'other-token')).resolves.toBeNull()
    expect(getUserFromDiscordIDMock).not.toHaveBeenCalled()
  })
  it('keeps internal account lookups compatible without requiring stored Discord credentials', async () => {
    panelTokenFindFirstMock.mockResolvedValue({
      id: 'a',
      discordID: 'd1',
      accessToken: 'hash',
      creationDate: new Date(),
      expirationDate: new Date('2999-01-01'),
    })
    await expect(getPanelUserFromDiscordID('d1')).resolves.toBeInstanceOf(PanelUser)
  })
  it('returns null for missing panel data, missing users or erased accounts', async () => {
    panelTokenFindFirstMock.mockResolvedValue(null)
    await expect(getPanelUserFromDiscordID('d1')).resolves.toBeNull()
    getUserFromDiscordIDMock.mockResolvedValue(null)
    await expect(getPanelUserFromDiscordID('d1', 'tok', session())).resolves.toBeNull()
    isErasureBlockedMock.mockResolvedValue(true)
    await expect(getPanelUserFromDiscordID('d1', 'tok', session())).resolves.toBeNull()
  })
})
