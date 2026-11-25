import { beforeEach, describe, expect, it, vi } from 'vitest'

const isErasureBlockedMock = vi.fn().mockResolvedValue(false)
vi.mock('../src/privacy.js', () => ({ isErasureBlocked: isErasureBlockedMock }))

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

  it('isDeveloper() depends only on the root allowlist, never a stored rank', () => {
    const dev = new User({
      steamID64: null,
      discordID: '333650866747867137',
      rank: 'user',
      lastVerification: null,
      trustLevel: 50,
    })
    const notDev = new User({
      steamID64: null,
      discordID: 'd1',
      rank: 'developer',
      lastVerification: null,
      trustLevel: 50,
    })
    expect(dev.rank).toBe('developer')
    expect(notDev.rank).toBe('user')
    notDev.rank = 'developer'
    expect(dev.isDeveloper()).toBe(true)
    expect(notDev.isDeveloper()).toBe(false)
  })
})

describe('getUserFromSteamID64', () => {
  beforeEach(() => {
    isErasureBlockedMock.mockReset().mockResolvedValue(false)
    findFirstMock.mockReset()
  })

  it('returns null when no user is found', async () => {
    findFirstMock.mockResolvedValueOnce(null)
    await expect(getUserFromSteamID64('765')).resolves.toBeNull()
    expect(findFirstMock).toHaveBeenCalledWith({ where: { steam: '765' } })
  })

  it('does not expose a linked Steam profile while either verified identity is suppressed', async () => {
    findFirstMock.mockResolvedValueOnce({ steam: '765', id: 'd1', rank: 'user', last_oauth: null, trust: 0 })
    isErasureBlockedMock.mockResolvedValueOnce(true)
    await expect(getUserFromSteamID64('765')).resolves.toBeNull()
    expect(isErasureBlockedMock).toHaveBeenCalledExactlyOnceWith('d1', '765')
  })

  it('uses the neutral trust default for legacy Steam profiles without a stored score', async () => {
    findFirstMock.mockResolvedValueOnce({ steam: '765', id: 'd1', rank: 'user', last_oauth: null, trust: null })
    const user = await getUserFromSteamID64('765')
    expect(user?.trustLevel).toBe(50)
  })

  it('returns a User with the DB trust level when set', async () => {
    findFirstMock.mockResolvedValueOnce({ steam: '765', id: 'd1', rank: 'user', last_oauth: null, trust: 80 })
    const user = await getUserFromSteamID64('765')
    expect(user?.trustLevel).toBe(80)
  })

  it('preserves a zero trust level', async () => {
    findFirstMock.mockResolvedValueOnce({ steam: '765', id: 'd1', rank: 'user', last_oauth: null, trust: 0 })
    const user = await getUserFromSteamID64('765')
    expect(user?.trustLevel).toBe(0)
  })
})

describe('getUserFromDiscordID', () => {
  beforeEach(() => {
    isErasureBlockedMock.mockReset().mockResolvedValue(false)
    findFirstMock.mockReset()
  })

  it('returns null when no user is found', async () => {
    findFirstMock.mockResolvedValueOnce(null)
    await expect(getUserFromDiscordID('d1')).resolves.toBeNull()
    expect(findFirstMock).toHaveBeenCalledWith({ where: { id: 'd1' } })
  })

  it('does not expose an existing profile while its identity is suppressed', async () => {
    findFirstMock.mockResolvedValueOnce({ id: 'd1', steam: '765', trust: 0 })
    isErasureBlockedMock.mockResolvedValueOnce(true)
    await expect(getUserFromDiscordID('d1')).resolves.toBeNull()
  })

  it('returns a User with the DB trust level when set', async () => {
    findFirstMock.mockResolvedValueOnce({ steam: '765', id: 'd1', rank: 'user', last_oauth: null, trust: 15 })
    const user = await getUserFromDiscordID('d1')
    expect(user?.trustLevel).toBe(15)
  })

  it('uses the neutral trust default for legacy Discord profiles without a stored score', async () => {
    findFirstMock.mockResolvedValueOnce({ steam: null, id: 'd1', rank: 'user', last_oauth: null, trust: null })
    const user = await getUserFromDiscordID('d1')
    expect(user?.trustLevel).toBe(50)
    expect(user?.steamID64).toBeNull()
  })

  it('preserves a zero trust level', async () => {
    findFirstMock.mockResolvedValueOnce({ steam: '765', id: 'd1', rank: 'user', last_oauth: null, trust: 0 })
    const user = await getUserFromDiscordID('d1')
    expect(user?.trustLevel).toBe(0)
  })
})
