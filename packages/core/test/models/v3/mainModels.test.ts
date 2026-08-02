import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const redisMock = { get: vi.fn(), set: vi.fn(), del: vi.fn() }
vi.mock('@gmod/infra-redis', () => ({ default: redisMock }))

const statusRoutineMock = vi.fn()
vi.mock('@gmod/domain-server/Server.js', () => ({ statusRoutine: statusRoutineMock }))

const givePremiumRoleOfMainGuildMock = vi.fn()
vi.mock('@gmod/domain-guild/discordModels.js', () => ({ givePremiumRoleOfMainGuild: givePremiumRoleOfMainGuildMock }))

const enqueueMainClientSetPresenceMock = vi.fn()
vi.mock('@gmod/infra-bullmq/discordQueueAdapters.js', () => ({
  enqueueMainClientSetPresence: enqueueMainClientSetPresenceMock,
}))

vi.mock('../../../src/utils/tools.js', () => ({ lastGmodIntegrationTag: 'v1.2.3' }))

const prismaMock: any = {
  users: { count: vi.fn() },
  gm_guild: { aggregate: vi.fn(), count: vi.fn() },
  gm_server: { count: vi.fn() },
  gm_user: { count: vi.fn() },
}
vi.mock('@gmod/infra-prisma', () => ({ default: prismaMock }))

const { getStats, routineUpdateStatus, routineServerStatusRefresh, routinePremiumRoleOfMainGuild } = await import(
  '../../../src/models/v3/mainModels.js'
)

function resetAllMocks() {
  redisMock.get.mockReset()
  redisMock.set.mockReset()
  redisMock.del.mockReset()
  statusRoutineMock.mockReset()
  givePremiumRoleOfMainGuildMock.mockReset()
  enqueueMainClientSetPresenceMock.mockReset()
  for (const table of Object.values(prismaMock)) {
    for (const fn of Object.values(table as Record<string, any>)) {
      ;(fn as ReturnType<typeof vi.fn>).mockReset()
    }
  }
}

describe('mainModels', () => {
  beforeEach(() => {
    resetAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('getStats', () => {
    it('returns the cached stats from redis when present', async () => {
      redisMock.get.mockResolvedValueOnce(JSON.stringify({ user: 1, guild: 2, server: 3, verifyUser: 4 }))
      await expect(getStats()).resolves.toEqual({ user: 1, guild: 2, server: 3, verifyUser: 4 })
      expect(prismaMock.users.count).not.toHaveBeenCalled()
    })

    it('computes, caches, and returns fresh stats when not cached', async () => {
      redisMock.get.mockResolvedValueOnce(null)
      prismaMock.users.count.mockResolvedValueOnce(10)
      prismaMock.gm_guild.aggregate.mockResolvedValueOnce({ _sum: { member: 100 } })
      prismaMock.gm_guild.count.mockResolvedValueOnce(5)
      prismaMock.gm_server.count.mockResolvedValueOnce(8)
      prismaMock.gm_user.count.mockResolvedValueOnce(3)

      const stats = await getStats()

      expect(stats).toEqual({ verifyUser: 3, user: 110, guild: 5, server: 8 })
      expect(redisMock.set).toHaveBeenCalledWith('stats', JSON.stringify(stats), 'EX', 120)
    })

    it('defaults the aggregated member sum to 0 when null', async () => {
      redisMock.get.mockResolvedValueOnce(null)
      prismaMock.users.count.mockResolvedValueOnce(10)
      prismaMock.gm_guild.aggregate.mockResolvedValueOnce({ _sum: { member: null } })
      prismaMock.gm_guild.count.mockResolvedValueOnce(5)
      prismaMock.gm_server.count.mockResolvedValueOnce(8)
      prismaMock.gm_user.count.mockResolvedValueOnce(3)

      const stats = await getStats()

      expect(stats.user).toBe(10)
    })
  })

  describe('routineUpdateStatus', () => {
    it('cycles through each status entry (user, guild, server, version) on successive interval ticks', async () => {
      vi.useFakeTimers()
      redisMock.get.mockResolvedValue(null)
      prismaMock.users.count.mockResolvedValue(10)
      prismaMock.gm_guild.aggregate.mockResolvedValue({ _sum: { member: 100 } })
      prismaMock.gm_guild.count.mockResolvedValue(5)
      prismaMock.gm_server.count.mockResolvedValue(8)
      prismaMock.gm_user.count.mockResolvedValue(3)

      await routineUpdateStatus()
      expect(enqueueMainClientSetPresenceMock).toHaveBeenNthCalledWith(1, '110 users', 3)

      await vi.advanceTimersByTimeAsync(30000)
      expect(enqueueMainClientSetPresenceMock).toHaveBeenNthCalledWith(2, '5 guilds', 3)

      await vi.advanceTimersByTimeAsync(30000)
      expect(enqueueMainClientSetPresenceMock).toHaveBeenNthCalledWith(3, '8 servers', 3)

      await vi.advanceTimersByTimeAsync(30000)
      expect(enqueueMainClientSetPresenceMock).toHaveBeenNthCalledWith(4, 'v1.2.3', 3)

      await vi.advanceTimersByTimeAsync(30000)
      expect(enqueueMainClientSetPresenceMock).toHaveBeenNthCalledWith(5, '110 users', 3)
    })
  })

  describe('routineServerStatusRefresh', () => {
    it('runs statusRoutine immediately and on a 30s interval', async () => {
      vi.useFakeTimers()
      await routineServerStatusRefresh()
      expect(statusRoutineMock).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(30000)
      expect(statusRoutineMock).toHaveBeenCalledTimes(2)
    })
  })

  describe('routinePremiumRoleOfMainGuild', () => {
    it('logs success immediately and on a 60s interval when the sync succeeds', async () => {
      vi.useFakeTimers()
      givePremiumRoleOfMainGuildMock.mockResolvedValue(true)
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      await routinePremiumRoleOfMainGuild()
      await vi.waitFor(() => expect(logSpy).toHaveBeenCalledWith('Premium checked'))

      await vi.advanceTimersByTimeAsync(60000)
      await vi.waitFor(() => expect(givePremiumRoleOfMainGuildMock).toHaveBeenCalledTimes(2))
    })

    it('logs an error when the sync reports failure (synced === false)', async () => {
      vi.useFakeTimers()
      givePremiumRoleOfMainGuildMock.mockResolvedValue(false)
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await routinePremiumRoleOfMainGuild()
      await vi.waitFor(() => expect(errorSpy).toHaveBeenCalledWith('Error checking premium'))
    })

    it('logs an error when the sync rejects', async () => {
      vi.useFakeTimers()
      givePremiumRoleOfMainGuildMock.mockRejectedValue(new Error('sync down'))
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await routinePremiumRoleOfMainGuild()
      await vi.waitFor(() => expect(errorSpy).toHaveBeenCalledWith('Error checking premium:', expect.any(Error)))
    })
  })
})
