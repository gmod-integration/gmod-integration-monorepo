import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  values: new Map<string, { value: string; expires?: number }>(),
  blocked: false,
  token: vi.fn(),
  cacheWrite: vi.fn(),
}))
vi.mock('../src/privacy.js', () => ({ isErasureBlocked: async () => state.blocked }))
vi.mock('../src/User.js', () => ({ getUserFromDiscordID: vi.fn() }))
vi.mock('@gmod/domain-auth/authSessions.js', () => ({
  resolveApplicationSession: vi.fn(),
  AuthSessionError: class extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
    ) {
      super(code)
    }
  },
}))
vi.mock('@gmod/domain-auth/discordOAuth.js', () => ({
  getValidDiscordToken: state.token,
  refreshDiscordCredentials: vi.fn(),
}))
vi.mock('@gmod/infra-prisma', () => ({ default: {} }))
vi.mock('@gmod/infra-redis', () => {
  const get = async (key: string) => {
    const entry = state.values.get(key)
    if (entry?.expires !== undefined && entry.expires <= Date.now()) {
      state.values.delete(key)
      return null
    }
    return entry?.value ?? null
  }
  return {
    default: {
      get,
      mget: async (...keys: string[]) => Promise.all(keys.map(get)),
      set: async (key: string, value: string, ...options: (string | number)[]) => {
        if (options.includes('NX') && (await get(key)) !== null) return null
        const index = options.findIndex((option) => option === 'PX' || option === 'EX')
        const expires =
          index < 0 ? undefined : Date.now() + Number(options[index + 1]) * (options[index] === 'EX' ? 1000 : 1)
        state.values.set(key, { value, expires })
        if (/^user:.*:guilds$/.test(key)) await state.cacheWrite()
        return 'OK'
      },
      del: async (key: string) => Number(state.values.delete(key)),
      eval: async (_script: string, count: number, key: string, owner: string, revision?: string) => {
        if (count === 2) {
          state.values.set(key, { value: revision! })
          state.values.set(owner, { value: revision! })
          return 1
        }
        return (await get(key)) === owner ? Number(state.values.delete(key)) : 0
      },
      publish: async () => 1,
    },
  }
})

const { PanelUser } = await import('../src/PanelUser.js')
const { invalidateDiscordGuildPermissions } = await import('../src/guildPermissions.js')
const panel = (id = 'member') => new PanelUser({ user: {}, discordID: id, panelToken: {} })
const ok = (guilds = [{ id: 'guild', owner: true }]) => new Response(JSON.stringify(guilds))
const limited = (retryAfter = '60') => new Response('{}', { status: 429, headers: { 'Retry-After': retryAfter } })

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-26T00:00:00Z'))
  state.values.clear()
  state.blocked = false
  state.token.mockReset().mockResolvedValue('provider-token')
  state.cacheWrite.mockReset().mockResolvedValue(undefined)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('provider request sharing and rate limiting', () => {
  it('shares a 429 cooldown between independent account instances and retries after it expires', async () => {
    const network = vi.fn().mockImplementation(async () => limited())
    vi.stubGlobal('fetch', network)
    for (let index = 0; index < 3; index++) {
      await expect(panel().findGuilds({ fresh: true })).rejects.toMatchObject({
        code: 'provider_unavailable',
        retryAfter: 60,
      })
    }
    expect(network).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(60_001)
    network.mockImplementation(async () => ok())
    await expect(panel().findGuilds()).resolves.toHaveLength(1)
    expect(network).toHaveBeenCalledTimes(2)
    expect(state.values.has('user:member:guild-permissions-retry')).toBe(false)
  })

  it('checks the shared cooldown after acquiring a lease held during another replica 429', async () => {
    let finish!: (response: Response) => void
    const network = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve
        }),
    )
    vi.stubGlobal('fetch', network)
    const first = panel()
      .findGuilds({ fresh: true })
      .catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(0)
    const second = panel()
      .findGuilds({ fresh: true })
      .catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(0)
    finish(limited())
    expect(await first).toMatchObject({ retryAfter: 60 })
    await vi.advanceTimersByTimeAsync(50)
    expect(await second).toMatchObject({ retryAfter: 60 })
    expect(network).toHaveBeenCalledTimes(1)
  })

  it.each([
    [new Response('{"retry_after":1.5}', { status: 429 }), 2],
    [limited('Thu, 26 Nov 2026 00:01:00 GMT'), 60],
  ])('uses provider JSON or HTTP-date retry instructions', async (response, seconds) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
    await expect(panel().findGuilds()).rejects.toMatchObject({ retryAfter: seconds })
  })

  it('reuses a fresh lookup only inside the same request, checking the current grant each time', async () => {
    const network = vi.fn().mockImplementation(async () => ok())
    vi.stubGlobal('fetch', network)
    const account = panel(),
      requestScope = {}
    await account.findGuilds({ fresh: true, requestScope })
    await account.findGuilds({ fresh: true, requestScope })
    expect(network).toHaveBeenCalledTimes(1)
    expect(state.token).toHaveBeenCalledTimes(2)
    await account.findGuilds({ fresh: true, requestScope: {} })
    expect(network).toHaveBeenCalledTimes(2)
    state.token.mockRejectedValueOnce(Object.assign(new Error('revoked'), { code: 'grant_rejected' }))
    await expect(account.findGuilds({ fresh: true, requestScope })).rejects.toMatchObject({
      code: 'discord_reauth_required',
    })
  })

  it('does not upgrade a cached read to a fresh write within the same request', async () => {
    const network = vi.fn().mockImplementation(async () => ok())
    vi.stubGlobal('fetch', network)
    await panel().findGuilds()
    const account = panel(),
      requestScope = {}
    await account.findGuilds({ requestScope })
    await account.findGuilds({ fresh: true, requestScope })
    expect(network).toHaveBeenCalledTimes(2)
  })

  it('coalesces concurrent fresh lookups only for the same request scope', async () => {
    const network = vi.fn().mockImplementation(async () => ok())
    vi.stubGlobal('fetch', network)
    const account = panel(),
      requestScope = {}
    await Promise.all([
      account.findGuilds({ fresh: true, requestScope }),
      account.findGuilds({ fresh: true, requestScope }),
    ])
    expect(network).toHaveBeenCalledTimes(1)
    expect(state.token).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(120_001)
    await account.findGuilds({ fresh: true, requestScope })
    expect(network).toHaveBeenCalledTimes(2)
  })

  it('revalidates request-local rights after a guild revision changes', async () => {
    const network = vi.fn().mockResolvedValueOnce(ok()).mockResolvedValueOnce(ok([]))
    vi.stubGlobal('fetch', network)
    const account = panel(),
      requestScope = {}
    await account.findGuilds({ fresh: true, requestScope })
    await invalidateDiscordGuildPermissions({ guildID: 'guild' })
    await expect(account.findGuilds({ fresh: true, requestScope })).resolves.toEqual([])
    expect(network).toHaveBeenCalledTimes(2)
  })

  it('does not fall back to fresh rights after a provider refusal, while valid bounded reads remain available', async () => {
    const network = vi
      .fn()
      .mockResolvedValueOnce(ok())
      .mockImplementation(async () => limited())
    vi.stubGlobal('fetch', network)
    await panel().findGuilds()
    await expect(panel().findGuilds({ fresh: true })).rejects.toMatchObject({ retryAfter: 60 })
    await expect(panel().findGuilds()).resolves.toHaveLength(1)
    expect(network).toHaveBeenCalledTimes(2)
  })
})

describe('guild-scoped permission invalidation', () => {
  it('refreshes newly granted rights for an uncached bot member without refetching an unrelated account', async () => {
    const network = vi
      .fn()
      .mockResolvedValueOnce(ok([{ id: 'guild', owner: false }]))
      .mockResolvedValueOnce(ok([{ id: 'unrelated', owner: true }]))
      .mockResolvedValueOnce(ok())
    vi.stubGlobal('fetch', network)
    await panel('affected').findGuilds()
    await panel('other').findGuilds()
    await invalidateDiscordGuildPermissions({ guildID: 'guild' })
    await expect(panel('other').findGuilds()).resolves.toEqual([{ id: 'unrelated', owner: true }])
    expect(network).toHaveBeenCalledTimes(2)
    await expect(panel('affected').findGuilds()).resolves.toEqual([{ id: 'guild', owner: true }])
    expect(network).toHaveBeenCalledTimes(3)
  })

  it('rejects a provider result invalidated before its previously unknown membership scope returned', async () => {
    let finish!: (response: Response) => void
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve
          }),
      ),
    )
    const lookup = panel()
      .findGuilds()
      .catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(0)
    await invalidateDiscordGuildPermissions({ guildID: 'guild' })
    finish(ok())
    expect(await lookup).toMatchObject({ code: 'provider_unavailable' })
    expect(state.values.has('user:member:guilds')).toBe(false)
  })
  it('does not return or memoize a provider result invalidated while its cache write awaited Redis', async () => {
    const network = vi.fn().mockImplementation(async () => ok())
    vi.stubGlobal('fetch', network)
    state.cacheWrite.mockImplementationOnce(() => invalidateDiscordGuildPermissions({ guildID: 'guild' }))
    const account = panel(),
      requestScope = {}
    await expect(account.findGuilds({ fresh: true, requestScope })).rejects.toMatchObject({
      code: 'provider_unavailable',
    })
    await expect(account.findGuilds({ fresh: true, requestScope })).resolves.toHaveLength(1)
    expect(network).toHaveBeenCalledTimes(2)
  })
})
