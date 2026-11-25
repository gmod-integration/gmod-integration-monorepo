import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), fetchUser: vi.fn() }))
vi.mock('@gmod/infra-redis', () => ({ default: { get: mocks.get, set: mocks.set } }))
vi.mock('@gmod/infra-bullmq/discordQueueAdapters.js', () => ({ enqueueMainClientFetchUser: mocks.fetchUser }))

const entries = new Map<string, string>()
const id = '123456789012345678'
const key = `gmi:auth:profile:${id}`
const user = (avatarURL: string | null = 'https://api.example.test/avatars/discord/' + id) => ({
  id,
  username: 'alice',
  displayName: 'Alice',
  avatarURL,
})
const empty = { globalName: '', displayName: '', avatarURL: '', discriminator: '' }

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  entries.clear()
  mocks.get.mockImplementation(async (cacheKey: string) => entries.get(cacheKey) ?? null)
  mocks.set.mockImplementation(async (cacheKey: string, value: string) => {
    entries.set(cacheKey, value)
    return 'OK'
  })
  mocks.fetchUser.mockResolvedValue(null)
})
afterEach(() => vi.useRealTimers())

async function loader() {
  return (await import('../../src/models/discordProfile.js')).getDiscordProfile
}

describe('Discord profile decoration', () => {
  it('uses the cached avatar without contacting Discord and returns only profile decoration', async () => {
    entries.set(
      key,
      JSON.stringify({
        ...user('https://cdn.discordapp.com/avatars/123/hash.webp'),
        globalName: 'Alice Global',
        discriminator: '0001',
        accessToken: 'never-expose',
      }),
    )
    const getProfile = await loader()
    expect(await getProfile(id)).toEqual({
      globalName: 'Alice Global',
      displayName: 'Alice',
      discriminator: '0001',
      avatarURL: 'https://cdn.discordapp.com/avatars/123/hash.webp',
    })
    expect(mocks.fetchUser).not.toHaveBeenCalled()
    expect(mocks.set).not.toHaveBeenCalled()
  })

  it('rehydrates an expired profile through the Discord worker and caches the avatar proxy', async () => {
    mocks.fetchUser.mockResolvedValue(user())
    const getProfile = await loader()
    const profile = await getProfile(id)
    expect(profile).toEqual({
      globalName: 'Alice',
      displayName: 'Alice',
      avatarURL: user().avatarURL,
      discriminator: '',
    })
    expect(mocks.fetchUser).toHaveBeenCalledWith(id, 1500)
    expect(mocks.set).toHaveBeenCalledWith(key, JSON.stringify(profile), 'EX', 3600)
  })

  it('retains the official Discord default avatar for a user without a custom avatar', async () => {
    mocks.fetchUser.mockResolvedValue(user('https://cdn.discordapp.com/embed/avatars/3.png'))
    const getProfile = await loader()
    expect(await getProfile(id)).toMatchObject({ avatarURL: 'https://cdn.discordapp.com/embed/avatars/3.png' })
  })

  it.each(['{broken', 'null', '[]', JSON.stringify({ avatarURL: 42 })])(
    'repairs malformed cached profile %s',
    async (cached) => {
      entries.set(key, cached)
      mocks.fetchUser.mockResolvedValue(user())
      const getProfile = await loader()
      expect(await getProfile(id)).toMatchObject({ avatarURL: user().avatarURL })
      expect(mocks.fetchUser).toHaveBeenCalledOnce()
    },
  )

  it('preserves cached names when the provider is unavailable and does not retry on each poll', async () => {
    entries.set(
      key,
      JSON.stringify({
        globalName: 'Cached name',
        displayName: 'Cached display',
        discriminator: '0001',
        avatarURL: 'javascript:invalid',
      }),
    )
    mocks.fetchUser.mockRejectedValue(new Error('Discord unavailable'))
    const getProfile = await loader()
    const expected = { globalName: 'Cached name', displayName: 'Cached display', discriminator: '0001', avatarURL: '' }
    expect(await getProfile(id)).toEqual(expected)
    expect(await getProfile(id)).toEqual(expected)
    expect(mocks.fetchUser).toHaveBeenCalledOnce()
    expect(mocks.set).toHaveBeenCalledWith(key, expect.any(String), 'EX', 60)
  })

  it('ignores a provider profile belonging to another identity and a missing avatar', async () => {
    mocks.fetchUser.mockResolvedValueOnce({ ...user(), id: '987654321' }).mockResolvedValueOnce(user(null))
    const getProfile = await loader()
    expect(await getProfile(id)).toEqual(empty)
    expect(await getProfile('234567890123456789')).toEqual(empty)
  })

  it('deduplicates concurrent hydration for the same Discord identity', async () => {
    let resolve!: (value: ReturnType<typeof user>) => void
    mocks.fetchUser.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const getProfile = await loader()
    const first = getProfile(id)
    const second = getProfile(id)
    expect(first).toBe(second)
    await vi.waitFor(() => expect(mocks.fetchUser).toHaveBeenCalledOnce())
    resolve(user())
    expect(await first).toEqual(await second)
  })

  it('retries after the failure cooldown expires and accepts a newly available avatar', async () => {
    vi.useFakeTimers()
    const getProfile = await loader()
    expect(await getProfile(id)).toEqual(empty)
    entries.delete(key)
    expect(await getProfile(id)).toEqual(empty)
    expect(mocks.fetchUser).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(60_001)
    mocks.fetchUser.mockResolvedValue(user())
    expect(await getProfile(id)).toMatchObject({ avatarURL: user().avatarURL })
    expect(mocks.fetchUser).toHaveBeenCalledTimes(2)
  })

  it('keeps a resolved profile even if the cache cannot be written', async () => {
    mocks.get.mockRejectedValue(new Error('Redis unavailable'))
    mocks.set.mockRejectedValue(new Error('Redis unavailable'))
    mocks.fetchUser.mockResolvedValue(user())
    const getProfile = await loader()
    expect(await getProfile(id)).toMatchObject({ avatarURL: user().avatarURL })
  })

  it('honors the local cooldown when an expired cache entry cannot be refreshed', async () => {
    entries.set(key, JSON.stringify({ retryAfter: Date.now() - 1 }))
    mocks.set.mockRejectedValue(new Error('Redis writes unavailable'))
    const getProfile = await loader()
    expect(await getProfile(id)).toEqual(empty)
    expect(await getProfile(id)).toEqual(empty)
    expect(mocks.fetchUser).toHaveBeenCalledOnce()
  })

  it('bounds stalled cache and provider calls and retains a local cooldown when Redis is offline', async () => {
    vi.useFakeTimers()
    mocks.get.mockImplementation(() => new Promise(() => {}))
    mocks.fetchUser.mockImplementation(() => new Promise(() => {}))
    mocks.set.mockImplementation(() => new Promise(() => {}))
    const getProfile = await loader()
    const first = getProfile(id)
    await vi.advanceTimersByTimeAsync(2001)
    expect(await first).toEqual(empty)
    const second = getProfile(id)
    await vi.advanceTimersByTimeAsync(251)
    expect(await second).toEqual(empty)
    expect(mocks.fetchUser).toHaveBeenCalledOnce()
  })

  it('does not fetch or cache decoration for an invalid Discord identity', async () => {
    const getProfile = await loader()
    expect(await getProfile('not-a-discord-id')).toEqual(empty)
    expect(mocks.get).not.toHaveBeenCalled()
    expect(mocks.fetchUser).not.toHaveBeenCalled()
  })
})
