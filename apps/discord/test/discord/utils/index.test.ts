import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getTranslateMock = vi.fn(async (key: string) => key)
vi.mock('@gmod/core/utils/localizations.js', () => ({ getTranslate: getTranslateMock }))

const prismaMock: any = {
  gm_server_status_history: { findMany: vi.fn() },
  gm_server_status: { findFirst: vi.fn() },
  gm_server_stat_session: { findMany: vi.fn() },
  gm_server_stat: { findFirst: vi.fn() },
  gm_server_stat_team_time: { groupBy: vi.fn() },
}
vi.mock('@gmod/infra-prisma', () => ({ default: prismaMock }))

const redisMock = { get: vi.fn(), set: vi.fn() }
vi.mock('@gmod/infra-redis', () => ({ default: redisMock }))

const createBucketIfNotExistsMock = vi.fn()
const s3SendMock = vi.fn()
vi.mock('@gmod/infra-minio', () => ({
  createBucketIfNotExists: createBucketIfNotExistsMock,
  s3: { send: s3SendMock },
}))

// sharp does real native PNG rendering — mock it so tests don't depend on / exercise libvips,
// per the task's convention for actual image/chart rendering libs.
const sharpToBufferMock = vi.fn(async () => Buffer.from('fake-png-bytes'))
const sharpMock = vi.fn(() => ({ png: () => ({ toBuffer: sharpToBufferMock }) }))
vi.mock('sharp', () => ({ default: sharpMock }))

const { getTrustRank, dateToDiscordTimestamp, secToTime, getServerChart, playerConnectionChart, playerTeamTimeChat } =
  await import('../../../src/discord/utils/index.js')

function makeServer(id = 'srv1') {
  return { getID: () => id } as any
}

function readableFrom(chunks: Buffer[]) {
  return Readable.from(chunks)
}

function resetAllMocks() {
  getTranslateMock.mockClear()
  for (const table of Object.values(prismaMock)) {
    for (const fn of Object.values(table as Record<string, any>)) {
      ;(fn as ReturnType<typeof vi.fn>).mockReset()
    }
  }
  redisMock.get.mockReset()
  redisMock.set.mockReset()
  createBucketIfNotExistsMock.mockReset().mockResolvedValue(undefined)
  s3SendMock.mockReset()
  sharpToBufferMock.mockClear()
  sharpMock.mockClear()
}

describe('discord/utils/index', () => {
  beforeEach(() => {
    resetAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getTrustRank', () => {
    it.each([
      [-5, 'dangerous'],
      [0, 'dangerous'],
      [15, 'dangerous'],
      [16, 'untrusted'],
      [30, 'untrusted'],
      [31, 'semi-untrusted'],
      [40, 'semi-untrusted'],
      [41, 'neutral'],
      [60, 'neutral'],
      [61, 'semi-trusted'],
      [70, 'semi-trusted'],
      [71, 'trusted'],
      [85, 'trusted'],
      [86, 'exemplary'],
      [100, 'exemplary'],
    ])('maps trust %i to %s', async (trust, expected) => {
      const result = await getTrustRank(trust, 'en')
      expect(result).toBe(expected)
      expect(getTranslateMock).toHaveBeenCalledWith(expected, 'en')
    })

    it('falls back to unknown_rank when trust exceeds every threshold', async () => {
      const result = await getTrustRank(101, 'en')
      expect(result).toBe('unknown_rank')
      expect(getTranslateMock).toHaveBeenCalledWith('unknown_rank', 'en')
    })
  })

  describe('dateToDiscordTimestamp', () => {
    it('formats a date as a relative discord timestamp', () => {
      const date = new Date(1700000000000)
      expect(dateToDiscordTimestamp(date)).toBe(`<t:${Math.floor(1700000000000 / 1000)}:R>`)
    })
  })

  describe('secToTime', () => {
    it('formats every unit when all are present', () => {
      const sec = 7 * 604800 + 2 * 86400 + 3 * 3600 + 4 * 60 + 5
      expect(secToTime(sec)).toBe('7w 2d 3h 4m 5s')
    })

    it('omits units that are zero', () => {
      expect(secToTime(65)).toBe('1m 5s')
      expect(secToTime(0)).toBe('')
    })

    it('applies precision by truncating the trimmed parts list', () => {
      const sec = 2 * 604800 + 1 * 86400 + 5 * 3600 + 6 * 60 + 7
      expect(secToTime(sec, 2)).toBe('2w 1d')
      expect(secToTime(sec, -1)).toBe('2w 1d 5h 6m 7s')
    })
  })

  describe('getServerChart', () => {
    it('returns the cached PNG straight from MinIO when a cache entry exists', async () => {
      redisMock.get.mockResolvedValueOnce('1')
      s3SendMock.mockResolvedValueOnce({ Body: readableFrom([Buffer.from('a'), Buffer.from('b')]) })

      const result = await getServerChart(makeServer())

      expect(result).toEqual(Buffer.concat([Buffer.from('a'), Buffer.from('b')]))
      expect(prismaMock.gm_server_status_history.findMany).not.toHaveBeenCalled()
      expect(sharpMock).not.toHaveBeenCalled()
    })

    it('falls through to regenerating the chart when fetching the cached PNG throws', async () => {
      redisMock.get.mockResolvedValueOnce('1')
      s3SendMock.mockRejectedValueOnce(new Error('minio down'))
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      prismaMock.gm_server_status_history.findMany.mockResolvedValueOnce([])
      prismaMock.gm_server_status.findFirst.mockResolvedValueOnce({ maxPlayers: 10 })
      s3SendMock.mockResolvedValueOnce(undefined) // the regeneration's PutObjectCommand

      const result = await getServerChart(makeServer())

      expect(errorSpy).toHaveBeenCalledWith('Error fetching server chart from MinIO:', expect.any(Error))
      expect(result).toEqual(Buffer.from('fake-png-bytes'))
      expect(redisMock.set).toHaveBeenCalledWith('server:srv1:chart', true, 'EX', 240)
    })

    it('regenerates the chart when there is no cache entry, defaulting maxPlayers when absent', async () => {
      redisMock.get.mockResolvedValueOnce(null)
      const now = Date.now()
      prismaMock.gm_server_status_history.findMany.mockResolvedValueOnce([
        // mid-range bucket: two rows land on the same bucket index, second (lower) players
        // value exercises the "no update needed" branch of `result[index].value < d.players`.
        { createdAt: new Date(now - 62400000), players: 80 },
        { createdAt: new Date(now - 62400000), players: 20 },
        // out-of-range in both directions -> exercises the bucket-index bounds check.
        { createdAt: new Date(now + 5_000_000), players: 99 },
        { createdAt: new Date(0), players: 99 },
      ])
      prismaMock.gm_server_status.findFirst.mockResolvedValueOnce(null)
      s3SendMock.mockResolvedValueOnce(undefined)

      const result = await getServerChart(makeServer())

      expect(result).toEqual(Buffer.from('fake-png-bytes'))
      expect(s3SendMock).toHaveBeenCalledTimes(1)
    })

    it('logs and swallows an error when uploading the freshly rendered chart fails', async () => {
      redisMock.get.mockResolvedValueOnce(null)
      prismaMock.gm_server_status_history.findMany.mockResolvedValueOnce([])
      prismaMock.gm_server_status.findFirst.mockResolvedValueOnce({ maxPlayers: 20 })
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      s3SendMock.mockRejectedValueOnce(new Error('upload failed'))

      const result = await getServerChart(makeServer())

      expect(result).toEqual(Buffer.from('fake-png-bytes'))
      expect(errorSpy).toHaveBeenCalledWith('Error uploading server chart to MinIO:', expect.any(Error))
    })
  })

  describe('playerConnectionChart', () => {
    it('returns the cached PNG straight from MinIO when a cache entry exists', async () => {
      redisMock.get.mockResolvedValueOnce('1')
      s3SendMock.mockResolvedValueOnce({ Body: readableFrom([Buffer.from('x')]) })

      const result = await playerConnectionChart(makeServer(), '765', 'en')

      expect(result).toEqual(Buffer.from('x'))
      expect(prismaMock.gm_server_stat_session.findMany).not.toHaveBeenCalled()
    })

    it('falls through to regenerating when fetching the cached PNG throws', async () => {
      redisMock.get.mockResolvedValueOnce('1')
      s3SendMock.mockRejectedValueOnce(new Error('minio down'))
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      prismaMock.gm_server_stat_session.findMany.mockResolvedValueOnce([])
      prismaMock.gm_server_stat.findFirst.mockResolvedValueOnce(null)
      s3SendMock.mockResolvedValueOnce(undefined)

      const result = await playerConnectionChart(makeServer(), '765', 'en', 'time', 5)

      expect(errorSpy).toHaveBeenCalledWith('Error fetching player connection chart from MinIO:', expect.any(Error))
      expect(result).toEqual(Buffer.from('fake-png-bytes'))
    })

    it('throws when steamID64 is missing', async () => {
      redisMock.get.mockResolvedValueOnce(null)
      await expect(playerConnectionChart(makeServer(), '', 'en')).rejects.toThrow('Missing parameters')
    })

    it('throws when the stat is not one of the allowed focus stats', async () => {
      redisMock.get.mockResolvedValueOnce(null)
      await expect(playerConnectionChart(makeServer(), '765', 'en', 'not-a-stat' as any)).rejects.toThrow(
        'Invalid focus stat',
      )
    })

    it('aggregates sessions per day, including a day outside the seeded range, with duration<=8 (short tick format)', async () => {
      redisMock.get.mockResolvedValueOnce(null)
      const farOutsideRange = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
      prismaMock.gm_server_stat_session.findMany.mockResolvedValueOnce([
        { createdAt: new Date(), time: 100, kills: 4, deaths: 2 },
        { createdAt: new Date(), time: 50, kills: 3, deaths: 0 },
        { createdAt: farOutsideRange, time: 10, kills: 1, deaths: 1 },
        // deaths stays 0 for this whole bucket -> exercises kd's "deaths === 0" branch.
        { createdAt: yesterday, time: 5, kills: 2, deaths: 0 },
      ])
      prismaMock.gm_server_stat.findFirst.mockResolvedValueOnce({ name: 'Bob' })
      s3SendMock.mockResolvedValueOnce(undefined)

      const result = await playerConnectionChart(makeServer(), '765', 'en', 'kills', 5)

      expect(result).toEqual(Buffer.from('fake-png-bytes'))
      expect(getTranslateMock).toHaveBeenCalledWith('last_days_of', 'en', ['5', 'Bob', 'kills'])
    })

    it('renders with the medium tick-density branch (8 < duration <= 40) and falls back to the steamID64 title when no player name is found', async () => {
      redisMock.get.mockResolvedValueOnce(null)
      prismaMock.gm_server_stat_session.findMany.mockResolvedValueOnce([])
      prismaMock.gm_server_stat.findFirst.mockResolvedValueOnce(null)
      s3SendMock.mockResolvedValueOnce(undefined)

      const result = await playerConnectionChart(makeServer(), '765', 'en', 'time', 20)

      expect(result).toEqual(Buffer.from('fake-png-bytes'))
      expect(getTranslateMock).toHaveBeenCalledWith('last_days_of', 'en', ['20', '765', 'time'])
    })

    it('renders with the sparse tick-density branch (duration > 40)', async () => {
      redisMock.get.mockResolvedValueOnce(null)
      prismaMock.gm_server_stat_session.findMany.mockResolvedValueOnce([])
      prismaMock.gm_server_stat.findFirst.mockResolvedValueOnce(null)
      s3SendMock.mockResolvedValueOnce(undefined)

      const result = await playerConnectionChart(makeServer(), '765', 'en', 'deaths', 50)

      expect(result).toEqual(Buffer.from('fake-png-bytes'))
    })

    it('logs and swallows an error when uploading the freshly rendered chart fails', async () => {
      redisMock.get.mockResolvedValueOnce(null)
      prismaMock.gm_server_stat_session.findMany.mockResolvedValueOnce([])
      prismaMock.gm_server_stat.findFirst.mockResolvedValueOnce(null)
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      s3SendMock.mockRejectedValueOnce(new Error('upload failed'))

      const result = await playerConnectionChart(makeServer(), '765', 'en')

      expect(result).toEqual(Buffer.from('fake-png-bytes'))
      expect(errorSpy).toHaveBeenCalledWith('Error uploading player connection chart to MinIO:', expect.any(Error))
    })
  })

  describe('playerTeamTimeChat', () => {
    it('returns the cached PNG straight from MinIO when a cache entry exists', async () => {
      redisMock.get.mockResolvedValueOnce('1')
      s3SendMock.mockResolvedValueOnce({ Body: readableFrom([Buffer.from('y')]) })

      const result = await playerTeamTimeChat(makeServer(), '765', 'en')

      expect(result).toEqual(Buffer.from('y'))
      expect(prismaMock.gm_server_stat_team_time.groupBy).not.toHaveBeenCalled()
    })

    it('falls through to regenerating when fetching the cached PNG throws', async () => {
      redisMock.get.mockResolvedValueOnce('1')
      s3SendMock.mockRejectedValueOnce(new Error('minio down'))
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      prismaMock.gm_server_stat_team_time.groupBy.mockResolvedValueOnce([{ team: 'red', _sum: { time: 120 } }])
      prismaMock.gm_server_stat.findFirst.mockResolvedValueOnce({ name: 'Bob' })
      s3SendMock.mockResolvedValueOnce(undefined)

      const result = await playerTeamTimeChat(makeServer(), '765', 'en', 7)

      expect(errorSpy).toHaveBeenCalledWith('Error fetching team time chart from MinIO:', expect.any(Error))
      expect(result).toEqual(Buffer.from('fake-png-bytes'))
    })

    it('throws when no matching gm_server_stat user is found', async () => {
      redisMock.get.mockResolvedValueOnce(null)
      prismaMock.gm_server_stat_team_time.groupBy.mockResolvedValueOnce([])
      prismaMock.gm_server_stat.findFirst.mockResolvedValueOnce(null)

      await expect(playerTeamTimeChat(makeServer(), '765', 'en')).rejects.toThrow('User not found')
    })

    it('defaults a null _sum.time to 0, renders slices >= 5% and < 5% of the total, with duration > 0', async () => {
      redisMock.get.mockResolvedValueOnce(null)
      prismaMock.gm_server_stat_team_time.groupBy.mockResolvedValueOnce([
        { team: 'red', _sum: { time: 950 } },
        { team: 'blue', _sum: { time: 50 } },
        { team: 'green', _sum: { time: null } },
      ])
      prismaMock.gm_server_stat.findFirst.mockResolvedValueOnce({ name: 'Bob' })
      s3SendMock.mockResolvedValueOnce(undefined)

      const result = await playerTeamTimeChat(makeServer(), '765', 'en', 7)

      expect(result).toEqual(Buffer.from('fake-png-bytes'))
      expect(getTranslateMock).toHaveBeenCalledWith('pie_team', 'en', ['Bob', '7 days'])
    })

    it('uses the "max" wording and skips the days translation when duration is 0', async () => {
      redisMock.get.mockResolvedValueOnce(null)
      prismaMock.gm_server_stat_team_time.groupBy.mockResolvedValueOnce([{ team: 'red', _sum: { time: 10 } }])
      prismaMock.gm_server_stat.findFirst.mockResolvedValueOnce({ name: 'Bob' })
      s3SendMock.mockResolvedValueOnce(undefined)

      const result = await playerTeamTimeChat(makeServer(), '765', 'en', 0)

      expect(result).toEqual(Buffer.from('fake-png-bytes'))
      expect(getTranslateMock).toHaveBeenCalledWith('pie_team', 'en', ['Bob', 'max '])
      expect(prismaMock.gm_server_stat_team_time.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ createdAt: undefined }) }),
      )
    })

    it('logs and swallows an error when uploading the freshly rendered chart fails', async () => {
      redisMock.get.mockResolvedValueOnce(null)
      prismaMock.gm_server_stat_team_time.groupBy.mockResolvedValueOnce([{ team: 'red', _sum: { time: 10 } }])
      prismaMock.gm_server_stat.findFirst.mockResolvedValueOnce({ name: 'Bob' })
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      s3SendMock.mockRejectedValueOnce(new Error('upload failed'))

      const result = await playerTeamTimeChat(makeServer(), '765', 'en', 3)

      expect(result).toEqual(Buffer.from('fake-png-bytes'))
      expect(errorSpy).toHaveBeenCalledWith('Error uploading team time chart to MinIO:', expect.any(Error))
    })
  })
})
