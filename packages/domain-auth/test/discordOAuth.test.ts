import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fixtures = vi.hoisted(() => ({
  row: null as null | {
    discordID: string
    accessToken: string
    refreshToken: string
    expirationDate: Date
    creationDate: Date
    version: number
  },
  blocked: false,
  cache: new Map<string, { value: string; until: number }>(),
}))
const database = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
  findMany: vi.fn(),
}))
const cache = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), eval: vi.fn(), del: vi.fn() }))
vi.mock('@gmod/config', () => ({
  ConfigAuth: { credentialEncryptionKey: 'test-credential-encryption-key-with-sufficient-entropy' },
  ConfigDiscord: { clientID: 'test-client', clientSecret: 'test-client-secret' },
}))
vi.mock('@gmod/infra-prisma', () => ({ default: { gm_discordToken: database } }))
vi.mock('@gmod/infra-prisma/privacy.js', () => ({
  isErasureBlocked: vi.fn(async () => fixtures.blocked),
  privacySubject: (_provider: string, id: string) => `hashed-${id}`,
}))
vi.mock('@gmod/infra-redis', () => ({ default: cache }))
vi.mock('@gmod/shared/logger.js', () => ({ gmLog: vi.fn() }))

import {
  exchangeDiscordCode,
  exchangeDiscordRefreshToken,
  getValidDiscordToken,
  refreshDiscordCredentials,
  saveDiscordCredentials,
  startDiscordTokenRefreshWorker,
} from '../src/discordOAuth.js'

const token = (overrides: Record<string, unknown> = {}) => ({
  access_token: 'new-access',
  refresh_token: 'new-refresh',
  token_type: 'Bearer',
  expires_in: 3_600,
  scope: 'identify guilds',
  ...overrides,
})
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((finish) => {
    resolve = finish
  })
  return { promise, resolve }
}

beforeEach(() => {
  vi.useRealTimers()
  fixtures.blocked = false
  fixtures.cache.clear()
  fixtures.row = {
    discordID: 'u1',
    accessToken: 'old-access',
    refreshToken: 'old-refresh',
    creationDate: new Date(),
    expirationDate: new Date(Date.now() - 1_000),
    version: 0,
  }
  database.findUnique
    .mockReset()
    .mockImplementation(async ({ where }) => (fixtures.row?.discordID === where.discordID ? { ...fixtures.row } : null))
  database.upsert.mockReset().mockImplementation(async ({ create, update }) => {
    fixtures.row = fixtures.row ? { ...fixtures.row, ...update, version: fixtures.row.version + 1 } : { ...create }
    return { ...fixtures.row }
  })
  database.updateMany.mockReset().mockImplementation(async ({ where, data }) => {
    if (
      !fixtures.row ||
      fixtures.row.discordID !== where.discordID ||
      fixtures.row.version !== where.version ||
      (typeof where.refreshToken === 'string' && fixtures.row.refreshToken !== where.refreshToken)
    )
      return { count: 0 }
    fixtures.row = { ...fixtures.row, ...data, version: fixtures.row.version + 1 }
    return { count: 1 }
  })
  database.deleteMany.mockReset().mockImplementation(async ({ where }) => {
    if (
      !fixtures.row ||
      fixtures.row.discordID !== where.discordID ||
      fixtures.row.version !== where.version ||
      (typeof where.refreshToken === 'string' && fixtures.row.refreshToken !== where.refreshToken)
    )
      return { count: 0 }
    fixtures.row = null
    return { count: 1 }
  })
  database.findMany.mockReset().mockResolvedValue([])
  cache.get.mockReset().mockImplementation(async (key: string) => {
    const entry = fixtures.cache.get(key)
    if (entry && entry.until > Date.now()) return entry.value
    fixtures.cache.delete(key)
    return null
  })
  cache.set
    .mockReset()
    .mockImplementation(async (key: string, value: string, mode: string, duration: number, condition?: string) => {
      const current = fixtures.cache.get(key)
      if (condition === 'NX' && current && current.until > Date.now()) return null
      fixtures.cache.set(key, { value, until: Date.now() + duration * (mode === 'EX' ? 1_000 : 1) })
      return 'OK'
    })
  cache.eval.mockReset().mockImplementation(async (_script: string, _count: number, key: string, owner: string) => {
    if (fixtures.cache.get(key)?.value !== owner) return 0
    fixtures.cache.delete(key)
    return 1
  })
  cache.del.mockReset().mockResolvedValue(1)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(token())))
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('Discord credential exchange and storage', () => {
  it('exchanges an authorization code using PKCE without putting the verifier in a URL', async () => {
    await exchangeDiscordCode('code', 'https://api.example/callback', 'verifier')
    const [url, request] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('https://discord.com/api/oauth2/token')
    const parameters = new URLSearchParams(request?.body as string)
    expect(parameters.get('code_verifier')).toBe('verifier')
    expect(parameters.get('grant_type')).toBe('authorization_code')
    expect(parameters.get('redirect_uri')).toBe('https://api.example/callback')
    expect(request?.signal).toBeInstanceOf(AbortSignal)
  })

  it('rejects malformed successful responses before they reach the database', async () => {
    vi.mocked(fetch).mockResolvedValue(response(token({ expires_in: -5 })))
    await expect(exchangeDiscordRefreshToken('refresh')).rejects.toMatchObject({
      code: 'provider_unavailable',
      status: 503,
    })
    expect(database.upsert).not.toHaveBeenCalled()
  })

  it('stores encrypted, account-bound OAuth credentials and can read them back', async () => {
    fixtures.row = null
    await saveDiscordCredentials('u1', token())
    expect(fixtures.row!.accessToken).toMatch(/^enc:v1:/)
    expect(fixtures.row!.refreshToken).toMatch(/^enc:v1:/)
    expect(JSON.stringify(fixtures.row)).not.toContain('new-access')
    expect(JSON.stringify(fixtures.row)).not.toContain('new-refresh')
    await expect(getValidDiscordToken('u1')).resolves.toBe('new-access')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('increments the credential version on a new explicit login', async () => {
    await saveDiscordCredentials('u1', token())
    expect(fixtures.row!.version).toBe(1)
    await saveDiscordCredentials('u1', token({ access_token: 'second' }))
    expect(fixtures.row!.version).toBe(2)
    expect(cache.del).toHaveBeenCalledWith('user:u1:guilds')
    expect(cache.del).toHaveBeenCalledTimes(2)
  })

  it('does not decrypt credentials copied to another account', async () => {
    await saveDiscordCredentials('u1', token())
    fixtures.row!.discordID = 'u2'
    await expect(getValidDiscordToken('u2')).rejects.toMatchObject({ code: 'provider_unavailable' })
  })

  it('keeps unencrypted historical grants readable until their next successful rotation', async () => {
    fixtures.row!.expirationDate = new Date(Date.now() + 120_000)
    await expect(getValidDiscordToken('u1')).resolves.toBe('old-access')
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('safe Discord refresh', () => {
  it.each([429, 500, 503])(
    'never invalidates a grant on HTTP %s even if its body contains invalid_grant',
    async (status) => {
      vi.mocked(fetch).mockResolvedValue(response({ error: 'invalid_grant' }, status))
      await expect(refreshDiscordCredentials('u1')).rejects.toMatchObject({ code: 'provider_unavailable' })
      expect(fixtures.row!.accessToken).toBe('old-access')
      expect(database.deleteMany).not.toHaveBeenCalled()
    },
  )
  it.each([429, 500, 503])('preserves credentials on HTTP %s and backs off repeated attempts', async (status) => {
    vi.mocked(fetch).mockResolvedValue(response({ error: 'temporarily_unavailable' }, status, { 'Retry-After': '45' }))
    await expect(refreshDiscordCredentials('u1')).rejects.toMatchObject({
      code: 'provider_unavailable',
      retryAfter: 45,
    })
    expect(fixtures.row!.accessToken).toBe('old-access')
    expect(database.deleteMany).not.toHaveBeenCalled()
    await expect(refreshDiscordCredentials('u1')).rejects.toMatchObject({ code: 'provider_unavailable' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('keeps the current grant on a rejected network request', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network down'))
    await expect(refreshDiscordCredentials('u1')).rejects.toMatchObject({ code: 'provider_unavailable' })
    expect(database.deleteMany).not.toHaveBeenCalled()
    expect(fixtures.row!.refreshToken).toBe('old-refresh')
  })

  it('does not misclassify an invalid client configuration as user revocation', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ error: 'invalid_client' }, 400))
    await expect(refreshDiscordCredentials('u1')).rejects.toMatchObject({ code: 'provider_unavailable' })
    expect(database.deleteMany).not.toHaveBeenCalled()
  })

  it('retains retry history after the cooldown expires, so repeated outages back off progressively', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    vi.mocked(fetch).mockResolvedValue(response({}, 503))
    await expect(refreshDiscordCredentials('u1')).rejects.toMatchObject({ code: 'provider_unavailable' })
    const first = JSON.parse(fixtures.cache.get('auth:discord:retry:hashed-u1:0')!.value)
    expect(first.attempt).toBe(1)
    await vi.advanceTimersByTimeAsync(3_000)
    vi.mocked(fetch).mockResolvedValue(response({}, 503))
    await expect(refreshDiscordCredentials('u1')).rejects.toMatchObject({ code: 'provider_unavailable' })
    const second = JSON.parse(fixtures.cache.get('auth:discord:retry:hashed-u1:0')!.value)
    expect(second.attempt).toBe(2)
    expect(second.until - Date.now()).toBe(4_000)
    vi.mocked(Math.random).mockRestore()
  })

  it('honors a provider Retry-After date and long cooldown without early retries', async () => {
    vi.useFakeTimers()
    const until = new Date(Date.now() + 7_200_000).toUTCString()
    vi.mocked(fetch).mockResolvedValue(response({}, 429, { 'Retry-After': until }))
    await expect(refreshDiscordCredentials('u1')).rejects.toMatchObject({
      code: 'provider_unavailable',
      retryAfter: expect.any(Number),
    })
    const schedule = JSON.parse(fixtures.cache.get('auth:discord:retry:hashed-u1:0')!.value)
    expect(schedule.until).toBeGreaterThanOrEqual(Date.now() + 7_199_000)
  })

  it('skips obsolete worker selections after another process has already rotated the grant', async () => {
    fixtures.row!.version = 1
    fixtures.row!.expirationDate = new Date(Date.now() + 120_000)
    await expect(refreshDiscordCredentials('u1', 0)).resolves.toMatchObject({ access_token: 'old-access' })
    expect(fetch).not.toHaveBeenCalled()
    expect(cache.set).not.toHaveBeenCalled()
  })

  it('invalidates only the exact rejected grant version', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ error: 'invalid_grant' }, 400))
    await expect(refreshDiscordCredentials('u1')).rejects.toMatchObject({ code: 'grant_rejected', status: 401 })
    expect(database.deleteMany).toHaveBeenCalledWith({
      where: { discordID: 'u1', version: 0, refreshToken: 'old-refresh' },
    })
    expect(fixtures.row).toBeNull()
    expect(cache.del).toHaveBeenCalledWith('user:u1:guilds')
  })

  it('does not overwrite an explicit login that completed while a refresh was in flight', async () => {
    const pending = deferred<Response>()
    vi.mocked(fetch).mockReturnValue(pending.promise)
    const refresh = refreshDiscordCredentials('u1')
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    await saveDiscordCredentials('u1', token({ access_token: 'new-login', refresh_token: 'new-login-refresh' }))
    pending.resolve(response(token({ access_token: 'old-response' })))
    await expect(refresh).resolves.toMatchObject({ access_token: 'new-login' })
    await expect(getValidDiscordToken('u1')).resolves.toBe('new-login')
  })

  it('does not delete an explicit login after a stale invalid_grant response', async () => {
    const pending = deferred<Response>()
    vi.mocked(fetch).mockReturnValue(pending.promise)
    const refresh = refreshDiscordCredentials('u1')
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    await saveDiscordCredentials('u1', token({ access_token: 'new-login' }))
    cache.del.mockClear()
    pending.resolve(response({ error: 'invalid_grant' }, 400))
    await expect(refresh).resolves.toMatchObject({ access_token: 'new-login' })
    expect(fixtures.row).not.toBeNull()
    expect(cache.del).not.toHaveBeenCalled()
  })

  it('protects a recreated grant even when its numeric version restarts at zero', async () => {
    const pending = deferred<Response>()
    vi.mocked(fetch).mockReturnValue(pending.promise)
    const refresh = refreshDiscordCredentials('u1')
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    fixtures.row = null
    await saveDiscordCredentials('u1', token({ access_token: 'recreated-login' }))
    expect(fixtures.row!.version).toBe(0)
    pending.resolve(response({ error: 'invalid_grant' }, 400))
    await expect(refresh).resolves.toMatchObject({ access_token: 'recreated-login' })
    expect(fixtures.row).not.toBeNull()
  })

  it('coalesces simultaneous refreshes for the same account', async () => {
    const pending = deferred<Response>()
    vi.mocked(fetch).mockReturnValue(pending.promise)
    const first = refreshDiscordCredentials('u1')
    const second = refreshDiscordCredentials('u1')
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    pending.resolve(response(token()))
    await expect(Promise.all([first, second])).resolves.toEqual([token(), token()])
    expect(database.updateMany).toHaveBeenCalledTimes(1)
  })

  it.each([429, 503])(
    'honors an HTTP %s cooldown written by another replica while waiting for its lease',
    async (status) => {
      vi.useFakeTimers()
      vi.resetModules()
      const replica = await import('../src/discordOAuth.js')
      const pending = deferred<Response>()
      vi.mocked(fetch)
        .mockReturnValueOnce(pending.promise)
        .mockImplementation(async () => response({}, status, { 'Retry-After': '60' }))

      const first = refreshDiscordCredentials('u1')
      const firstRejected = expect(first).rejects.toMatchObject({ code: 'provider_unavailable', retryAfter: 60 })
      await vi.advanceTimersByTimeAsync(0)
      expect(fetch).toHaveBeenCalledTimes(1)

      const second = replica.refreshDiscordCredentials('u1')
      const secondRejected = expect(second).rejects.toMatchObject({ code: 'provider_unavailable', retryAfter: 60 })
      await vi.advanceTimersByTimeAsync(0)
      const leases = () => cache.set.mock.calls.filter(([key]) => key === 'auth:discord:refresh:hashed-u1')
      expect(leases()).toHaveLength(2)
      expect(leases()[0][1]).not.toBe(leases()[1][1])

      pending.resolve(response({}, status, { 'Retry-After': '60' }))
      await firstRejected
      await vi.advanceTimersByTimeAsync(50)
      await secondRejected

      expect(fetch).toHaveBeenCalledTimes(1)
      expect(database.updateMany).not.toHaveBeenCalled()
      expect(database.deleteMany).not.toHaveBeenCalled()
      expect(JSON.parse(fixtures.cache.get('auth:discord:retry:hashed-u1:0')!.value).attempt).toBe(1)
      expect(fixtures.cache.has('auth:discord:refresh:hashed-u1')).toBe(false)
      expect(cache.eval).toHaveBeenCalledTimes(2)
    },
  )

  it('fails closed and releases its own lease if the cooldown cannot be rechecked under the lock', async () => {
    cache.get.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('Redis unavailable'))
    await expect(refreshDiscordCredentials('u1')).rejects.toMatchObject({ code: 'provider_unavailable' })
    expect(fetch).not.toHaveBeenCalled()
    expect(database.updateMany).not.toHaveBeenCalled()
    expect(database.deleteMany).not.toHaveBeenCalled()
    expect(fixtures.cache.has('auth:discord:refresh:hashed-u1')).toBe(false)
    expect(cache.eval).toHaveBeenCalledOnce()
  })

  it('uses the other process result without stealing or releasing its lease', async () => {
    vi.useFakeTimers()
    fixtures.cache.set('auth:discord:refresh:hashed-u1', { value: 'other-owner', until: Date.now() + 10_000 })
    const pending = refreshDiscordCredentials('u1')
    await vi.advanceTimersByTimeAsync(0)
    fixtures.row = {
      ...fixtures.row!,
      version: 1,
      accessToken: 'other-process',
      expirationDate: new Date(Date.now() + 120_000),
    }
    await vi.advanceTimersByTimeAsync(50)
    await expect(pending).resolves.toMatchObject({ access_token: 'other-process' })
    expect(fetch).not.toHaveBeenCalled()
    expect(cache.eval).not.toHaveBeenCalled()
    expect(fixtures.cache.get('auth:discord:refresh:hashed-u1')?.value).toBe('other-owner')
  })

  it('fails safely when the distributed lease service is unavailable', async () => {
    cache.set.mockRejectedValueOnce(new Error('Redis unavailable'))
    await expect(refreshDiscordCredentials('u1')).rejects.toMatchObject({ code: 'provider_unavailable' })
    expect(fetch).not.toHaveBeenCalled()
    expect(database.deleteMany).not.toHaveBeenCalled()
  })

  it('temporarily uses a still-valid access token when early refresh is unavailable', async () => {
    fixtures.row!.expirationDate = new Date(Date.now() + 30_000)
    vi.mocked(fetch).mockResolvedValue(response({}, 503))
    await expect(getValidDiscordToken('u1')).resolves.toBe('old-access')
    expect(database.deleteMany).not.toHaveBeenCalled()
  })

  it('never uses an already expired token after a provider failure', async () => {
    vi.mocked(fetch).mockResolvedValue(response({}, 503))
    await expect(getValidDiscordToken('u1')).rejects.toMatchObject({ code: 'provider_unavailable' })
  })

  it('does not refresh or create credentials for an erased account', async () => {
    fixtures.blocked = true
    await expect(refreshDiscordCredentials('u1')).rejects.toMatchObject({ code: 'privacy_blocked' })
    await expect(saveDiscordCredentials('u1', token())).rejects.toMatchObject({ code: 'privacy_blocked' })
    expect(fetch).not.toHaveBeenCalled()
    expect(database.upsert).not.toHaveBeenCalled()
  })

  it('does not persist a completed refresh after erasure starts', async () => {
    const pending = deferred<Response>()
    vi.mocked(fetch).mockReturnValue(pending.promise)
    const refresh = refreshDiscordCredentials('u1')
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    fixtures.blocked = true
    pending.resolve(response(token()))
    await expect(refresh).rejects.toMatchObject({ code: 'privacy_blocked' })
    expect(database.updateMany).not.toHaveBeenCalled()
  })
})

describe('explicit Discord refresh worker', () => {
  it('drains an already-started rotation before shutdown can close its database connection', async () => {
    vi.useFakeTimers()
    const pending = deferred<Response>()
    vi.mocked(fetch).mockReturnValue(pending.promise)
    database.findMany.mockResolvedValueOnce([{ discordID: 'u1', version: 0 }])
    const stop = startDiscordTokenRefreshWorker()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetch).toHaveBeenCalledTimes(1)
    let drained = false
    const stopping = stop().then(() => {
      drained = true
    })
    await Promise.resolve()
    expect(drained).toBe(false)
    pending.resolve(response(token()))
    await stopping
    expect(drained).toBe(true)
    expect(database.updateMany).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(database.findMany).toHaveBeenCalledTimes(1)
  })

  it('does no background work until explicitly started and stops scheduling after shutdown', async () => {
    vi.useFakeTimers()
    expect(database.findMany).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    const stop = startDiscordTokenRefreshWorker()
    await vi.advanceTimersByTimeAsync(0)
    expect(database.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { discordID: 'asc' }, take: 20 }))
    stop()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(database.findMany).toHaveBeenCalledTimes(1)
  })

  it('continues after a database outage instead of abandoning the worker callback', async () => {
    vi.useFakeTimers()
    database.findMany.mockRejectedValueOnce(new Error('Database unavailable'))
    const stop = startDiscordTokenRefreshWorker()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(database.findMany).toHaveBeenCalledTimes(2)
    stop()
  })

  it('advances a deterministic batch cursor instead of repeatedly selecting the same failed grants', async () => {
    vi.useFakeTimers()
    database.findMany.mockResolvedValueOnce(
      Array.from({ length: 20 }, (_, i) => ({ discordID: `account-${i.toString().padStart(2, '0')}` })),
    )
    const stop = startDiscordTokenRefreshWorker()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(database.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ discordID: { gt: 'account-19' } }) }),
    )
    stop()
  })
})
