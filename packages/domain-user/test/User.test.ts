import { beforeEach, describe, expect, it, vi } from 'vitest'

const findFirstMock = vi.fn()
vi.mock('@gmod/infra-prisma', () => ({
  default: { gm_user: { findFirst: findFirstMock } },
}))

const { User, getUserFromSteamID64, getUserFromDiscordID } = await import('../src/User.js')

describe('User', () => {
  it('exposes getDiscordID/getSteamID64', () => {
    const user = new User({ steamID64: '765', discordID: 'd1', rank: 'user', lastVerification: null, trustLevel: 50 })
    expect(user.getDiscordID()).toBe('d1')
    expect(user.getSteamID64()).toBe('765')
  })

  it('isDeveloper() is true only for rank "developer"', () => {
    const dev = new User({ steamID64: null, discordID: 'd1', rank: 'developer', lastVerification: null, trustLevel: 50 })
    const notDev = new User({ steamID64: null, discordID: 'd1', rank: 'user', lastVerification: null, trustLevel: 50 })
    expect(dev.isDeveloper()).toBe(true)
    expect(notDev.isDeveloper()).toBe(false)
  })
})

describe('getUserFromSteamID64', () => {
  beforeEach(() => {
    findFirstMock.mockReset()
  })

  it('returns null when no user is found', async () => {
    findFirstMock.mockResolvedValueOnce(null)
    await expect(getUserFromSteamID64('765')).resolves.toBeNull()
    expect(findFirstMock).toHaveBeenCalledWith({ where: { steam: '765' } })
  })

  it('returns a User with the DB trust level when set', async () => {
    findFirstMock.mockResolvedValueOnce({ steam: '765', id: 'd1', rank: 'user', last_oauth: null, trust: 80 })
    const user = await getUserFromSteamID64('765')
    expect(user?.trustLevel).toBe(80)
  })

  it('falls back to trustLevel 50 when the DB trust is falsy', async () => {
    findFirstMock.mockResolvedValueOnce({ steam: '765', id: 'd1', rank: 'user', last_oauth: null, trust: 0 })
    const user = await getUserFromSteamID64('765')
    expect(user?.trustLevel).toBe(50)
  })
})

describe('getUserFromDiscordID', () => {
  beforeEach(() => {
    findFirstMock.mockReset()
  })

  it('returns null when no user is found', async () => {
    findFirstMock.mockResolvedValueOnce(null)
    await expect(getUserFromDiscordID('d1')).resolves.toBeNull()
    expect(findFirstMock).toHaveBeenCalledWith({ where: { id: 'd1' } })
  })

  it('returns a User with the DB trust level when set', async () => {
    findFirstMock.mockResolvedValueOnce({ steam: '765', id: 'd1', rank: 'user', last_oauth: null, trust: 15 })
    const user = await getUserFromDiscordID('d1')
    expect(user?.trustLevel).toBe(15)
  })

  it('falls back to trustLevel 50 when the DB trust is falsy', async () => {
    findFirstMock.mockResolvedValueOnce({ steam: '765', id: 'd1', rank: 'user', last_oauth: null, trust: 0 })
    const user = await getUserFromDiscordID('d1')
    expect(user?.trustLevel).toBe(50)
  })
})
