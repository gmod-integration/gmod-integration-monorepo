import { beforeEach, describe, expect, it, vi } from 'vitest'

const findFirstMock = vi.fn()
vi.mock('@gmod/infra-prisma', () => ({ default: { banUsers: { findFirst: findFirstMock } } }))

const { isGlobalBanIP, isGlobalBanSteamID64, isGlobalBanDiscordID, isGlobalBan } = await import('../src/bansModels.js')

describe('bansModels', () => {
  beforeEach(() => {
    findFirstMock.mockReset()
  })

  it('isGlobalBanIP queries by ip', async () => {
    findFirstMock.mockResolvedValueOnce({ id: 1 })
    await expect(isGlobalBanIP('1.2.3.4')).resolves.toEqual({ id: 1 })
    expect(findFirstMock).toHaveBeenCalledWith({ where: { ip: '1.2.3.4' } })
  })

  it('isGlobalBanSteamID64 queries by steamID64', async () => {
    findFirstMock.mockResolvedValueOnce({ id: 2 })
    await expect(isGlobalBanSteamID64('765')).resolves.toEqual({ id: 2 })
    expect(findFirstMock).toHaveBeenCalledWith({ where: { steamID64: '765' } })
  })

  it('isGlobalBanDiscordID queries by discordID', async () => {
    findFirstMock.mockResolvedValueOnce({ id: 3 })
    await expect(isGlobalBanDiscordID('d1')).resolves.toEqual({ id: 3 })
    expect(findFirstMock).toHaveBeenCalledWith({ where: { discordID: 'd1' } })
  })

  describe('isGlobalBan', () => {
    it('returns false without querying when all identifiers are absent', async () => {
      await expect(isGlobalBan(null, undefined, null)).resolves.toBe(false)
      expect(findFirstMock).not.toHaveBeenCalled()
    })

    it('returns the IP ban and does not check discordID/steamID64', async () => {
      findFirstMock.mockResolvedValueOnce({ id: 1, ip: '1.2.3.4' })
      const result = await isGlobalBan('1.2.3.4', 'd1', '765')
      expect(result).toEqual({ id: 1, ip: '1.2.3.4' })
      expect(findFirstMock).toHaveBeenCalledTimes(1)
    })

    it('falls through to the discordID ban when the IP is clean', async () => {
      findFirstMock.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 2, discordID: 'd1' })
      const result = await isGlobalBan('1.2.3.4', 'd1', '765')
      expect(result).toEqual({ id: 2, discordID: 'd1' })
      expect(findFirstMock).toHaveBeenCalledTimes(2)
    })

    it('falls through to the steamID64 ban when IP and discordID are clean', async () => {
      findFirstMock.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 3 })
      const result = await isGlobalBan('1.2.3.4', 'd1', '765')
      expect(result).toEqual({ id: 3 })
      expect(findFirstMock).toHaveBeenCalledTimes(3)
    })

    it('returns false when nothing matches', async () => {
      findFirstMock.mockResolvedValue(null)
      await expect(isGlobalBan('1.2.3.4', 'd1', '765')).resolves.toBe(false)
    })

    it('only checks the identifiers that are provided (steamID64 only)', async () => {
      findFirstMock.mockResolvedValueOnce(null)
      await isGlobalBan(null, null, '765')
      expect(findFirstMock).toHaveBeenCalledTimes(1)
      expect(findFirstMock).toHaveBeenCalledWith({ where: { steamID64: '765' } })
    })

    it('skips the steamID64 check when it is not provided', async () => {
      findFirstMock.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
      await isGlobalBan('1.2.3.4', 'd1', null)
      expect(findFirstMock).toHaveBeenCalledTimes(2)
      expect(findFirstMock).not.toHaveBeenCalledWith({ where: { steamID64: expect.anything() } })
    })
  })
})
