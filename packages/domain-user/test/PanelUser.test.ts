import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const findManyMock = vi.fn()
const panelTokenFindFirstMock = vi.fn()
const discordTokenFindFirstMock = vi.fn()
vi.mock('@gmod/infra-prisma', () => ({
  default: {
    gm_panelToken: { findMany: findManyMock, findFirst: panelTokenFindFirstMock },
    gm_discordToken: { findFirst: discordTokenFindFirstMock },
  },
}))

const redisGetMock = vi.fn()
const redisSetMock = vi.fn()
const redisSetnxMock = vi.fn()
const redisExpireMock = vi.fn()
const redisDelMock = vi.fn()
vi.mock('@gmod/infra-redis', () => ({
  default: { get: redisGetMock, set: redisSetMock, setnx: redisSetnxMock, expire: redisExpireMock, del: redisDelMock },
}))

const getUserFromDiscordIDMock = vi.fn()
vi.mock('../src/User.js', () => ({ getUserFromDiscordID: getUserFromDiscordIDMock }))

const { PanelUser, getPanelUserFromDiscordID } = await import('../src/PanelUser.js')

function buildPanelUser(overrides: Partial<{ discordExpiration: Date }> = {}) {
  return new PanelUser({
    user: { discordID: 'd1' },
    discordID: 'd1',
    panelToken: { token: 'panel-tok', creationDate: new Date('2024-01-01'), expirationDate: new Date('2999-01-01') },
    discordToken: {
      token: 'discord-tok',
      refreshToken: 'refresh-tok',
      creationDate: new Date('2024-01-01'),
      expirationDate: overrides.discordExpiration ?? new Date('2999-01-01'),
    },
  })
}

describe('PanelUser', () => {
  beforeEach(() => {
    findManyMock.mockReset()
    redisGetMock.mockReset()
    redisSetMock.mockReset()
    redisSetnxMock.mockReset()
    redisExpireMock.mockReset()
    redisDelMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('getDiscordToken() returns the stored token', () => {
    expect(buildPanelUser().getDiscordToken()).toBe('discord-tok')
  })

  it('isValidDiscordToken() is true when the discord token has not expired', () => {
    expect(buildPanelUser({ discordExpiration: new Date('2999-01-01') }).isValidDiscordToken()).toBe(true)
  })

  it('isValidDiscordToken() is false when the discord token has expired', () => {
    expect(buildPanelUser({ discordExpiration: new Date('2000-01-01') }).isValidDiscordToken()).toBe(false)
  })

  it('isValidPanelToken() is true when a matching, non-revoked token is found', async () => {
    findManyMock.mockResolvedValueOnce([{ id: 1 }])
    await expect(buildPanelUser().isValidPanelToken('panel-tok')).resolves.toBe(true)
  })

  it('isValidPanelToken() is false when no matching token is found', async () => {
    findManyMock.mockResolvedValueOnce([])
    await expect(buildPanelUser().isValidPanelToken('panel-tok')).resolves.toBe(false)
  })

  it('authAllowed() is true only when both the panel token and discord token are valid', async () => {
    findManyMock.mockResolvedValueOnce([{ id: 1 }])
    await expect(buildPanelUser({ discordExpiration: new Date('2999-01-01') }).authAllowed('panel-tok')).resolves.toBe(
      true,
    )
  })

  it('authAllowed() is false when the panel token is invalid', async () => {
    findManyMock.mockResolvedValueOnce([])
    await expect(buildPanelUser().authAllowed('panel-tok')).resolves.toBe(false)
  })

  it('authAllowed() is false when the discord token has expired', async () => {
    findManyMock.mockResolvedValueOnce([{ id: 1 }])
    await expect(buildPanelUser({ discordExpiration: new Date('2000-01-01') }).authAllowed('panel-tok')).resolves.toBe(
      false,
    )
  })

  describe('findGuilds', () => {
    it('returns the cached guilds without acquiring a lock', async () => {
      redisGetMock.mockResolvedValueOnce(JSON.stringify([{ id: 'g1' }]))
      const guilds = await buildPanelUser().findGuilds()
      expect(guilds).toEqual([{ id: 'g1' }])
      expect(redisSetnxMock).not.toHaveBeenCalled()
    })

    it('acquires the lock, fetches from Discord, caches, and releases the lock', async () => {
      redisGetMock.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
      redisSetnxMock.mockResolvedValueOnce(true)
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, json: async () => [{ id: 'g1' }] }),
      )

      const guilds = await buildPanelUser().findGuilds()

      expect(guilds).toEqual([{ id: 'g1' }])
      expect(redisSetMock).toHaveBeenCalledWith('user:d1:guilds', JSON.stringify([{ id: 'g1' }]), 'EX', 120)
      expect(redisDelMock).toHaveBeenCalledWith('user:d1:isWaitingGuilds')
    })

    it('returns [] and logs when the Discord fetch fails', async () => {
      redisGetMock.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
      redisSetnxMock.mockResolvedValueOnce(true)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, statusText: 'Unauthorized' }))
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const guilds = await buildPanelUser().findGuilds()

      expect(guilds).toEqual([])
      expect(errorSpy).toHaveBeenCalledWith('Error fetching guilds:', 'Unauthorized')
      expect(redisDelMock).toHaveBeenCalledWith('user:d1:isWaitingGuilds')
    })

    it('waits and retries when the lock is not immediately available', async () => {
      redisGetMock.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
      redisSetnxMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }))

      await buildPanelUser().findGuilds()

      expect(redisSetnxMock).toHaveBeenCalledTimes(2)
      expect(redisExpireMock).toHaveBeenCalledWith('user:d1:isWaitingGuilds', 120)
    })

    it('returns the cache if it was populated while waiting for the lock', async () => {
      redisGetMock.mockResolvedValueOnce(null).mockResolvedValueOnce(JSON.stringify([{ id: 'race' }]))
      redisSetnxMock.mockResolvedValueOnce(true)

      const guilds = await buildPanelUser().findGuilds()

      expect(guilds).toEqual([{ id: 'race' }])
      expect(redisDelMock).toHaveBeenCalledWith('user:d1:isWaitingGuilds')
    })
  })

  describe('findGuildsWithPerms / isAdminOfGuild', () => {
    it('includes guilds the user owns or has admin permission bit on, excludes others', async () => {
      redisGetMock.mockResolvedValueOnce(
        JSON.stringify([
          { id: 'owned', owner: true, permissions: 0 },
          { id: 'admin', owner: false, permissions: 0x8 },
          { id: 'neither', owner: false, permissions: 0 },
        ]),
      )

      const guilds = await buildPanelUser().findGuildsWithPerms()
      expect(guilds.map((g: any) => g.id)).toEqual(['owned', 'admin'])
    })

    it('isAdminOfGuild() is true when the guild is in the perms list', async () => {
      redisGetMock.mockResolvedValueOnce(JSON.stringify([{ id: 'g1', owner: true, permissions: 0 }]))
      await expect(buildPanelUser().isAdminOfGuild('g1')).resolves.toBe(true)
    })

    it('isAdminOfGuild() is false when the guild is not in the perms list', async () => {
      redisGetMock.mockResolvedValueOnce(JSON.stringify([{ id: 'other', owner: true, permissions: 0 }]))
      await expect(buildPanelUser().isAdminOfGuild('g1')).resolves.toBe(false)
    })
  })
})

describe('getPanelUserFromDiscordID', () => {
  beforeEach(() => {
    panelTokenFindFirstMock.mockReset()
    discordTokenFindFirstMock.mockReset()
    getUserFromDiscordIDMock.mockReset()
  })

  const panelInfo = { discordID: 'd1', accessToken: 'panel-tok', creationDate: new Date(), expirationDate: new Date() }
  const discordInfo = {
    accessToken: 'discord-tok',
    refreshToken: 'refresh-tok',
    creationDate: new Date(),
    expirationDate: new Date(),
  }
  const user = { discordID: 'd1' }

  it('returns a PanelUser when panel info, discord info, and user all exist', async () => {
    panelTokenFindFirstMock.mockResolvedValueOnce(panelInfo)
    discordTokenFindFirstMock.mockResolvedValueOnce(discordInfo)
    getUserFromDiscordIDMock.mockResolvedValueOnce(user)

    const result = await getPanelUserFromDiscordID('d1')
    expect(result).toBeInstanceOf(PanelUser)
    expect(result?.discordID).toBe('d1')
  })

  it('returns null when panel info is missing', async () => {
    panelTokenFindFirstMock.mockResolvedValueOnce(null)
    discordTokenFindFirstMock.mockResolvedValueOnce(discordInfo)
    getUserFromDiscordIDMock.mockResolvedValueOnce(user)

    await expect(getPanelUserFromDiscordID('d1')).resolves.toBeNull()
  })

  it('returns null when discord info is missing', async () => {
    panelTokenFindFirstMock.mockResolvedValueOnce(panelInfo)
    discordTokenFindFirstMock.mockResolvedValueOnce(null)
    getUserFromDiscordIDMock.mockResolvedValueOnce(user)

    await expect(getPanelUserFromDiscordID('d1')).resolves.toBeNull()
  })

  it('returns null when the user is missing', async () => {
    panelTokenFindFirstMock.mockResolvedValueOnce(panelInfo)
    discordTokenFindFirstMock.mockResolvedValueOnce(discordInfo)
    getUserFromDiscordIDMock.mockResolvedValueOnce(null)

    await expect(getPanelUserFromDiscordID('d1')).resolves.toBeNull()
  })
})
