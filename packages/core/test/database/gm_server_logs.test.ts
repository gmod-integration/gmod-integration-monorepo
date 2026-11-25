import { beforeEach, describe, expect, it, vi } from 'vitest'

const isErasureBlockedMock = vi.fn().mockResolvedValue(false)
vi.mock('@gmod/domain-user/privacy.js', () => ({
  isErasureBlocked: isErasureBlockedMock,
  assertPersonalDataAllowed: async (discordID?: string, steamID64?: string) => {
    if (await isErasureBlockedMock(discordID, steamID64)) throw new Error('Personal data collection is disabled')
  },
  PRIVACY_REVOCATION_CHANNEL: 'gmi:privacy:revoked',
}))

const insertOneMock = vi.fn()
const countDocumentsMock = vi.fn()
const findMock = vi.fn()
const aggregateMock = vi.fn()
const closeMock = vi.fn()

const deleteOneMock = vi.fn()
const collectionLogs = {
  deleteOne: deleteOneMock,
  insertOne: insertOneMock,
  countDocuments: countDocumentsMock,
  find: findMock,
  aggregate: aggregateMock,
}
const collectionErrors = {}

const dbMock = { collection: vi.fn((name: string) => (name === 'logs' ? collectionLogs : collectionErrors)) }
const mongoClientMock = { db: vi.fn(() => dbMock), close: closeMock }
vi.mock('@gmod/infra-mongo', () => ({ mongoClient: mongoClientMock }))

const {
  addLog,
  getLogsCountBySteamIDList,
  getLogsBySteamIDList,
  getTotalLogsByServer,
  getLogsByServer,
  gracefulShutdownMongo,
} = await import('../../src/database/gm_server_logs.js')

describe('gm_server_logs', () => {
  beforeEach(() => {
    isErasureBlockedMock.mockReset().mockResolvedValue(false)
    deleteOneMock.mockReset()
    insertOneMock.mockReset()
    countDocumentsMock.mockReset()
    findMock.mockReset()
    aggregateMock.mockReset()
    closeMock.mockReset()
  })

  it('addLog inserts the log document', async () => {
    const log = {
      serverID: 's1',
      type: 'server_start',
      createdAt: new Date(),
      updatedAt: new Date(),
      data: {},
      playerInvolvedSteamID64: '765',
    }
    await addLog(log as any)
    expect(insertOneMock).toHaveBeenCalledWith(log)
  })

  it('does not persist a multiplayer log containing an erased identity', async () => {
    isErasureBlockedMock.mockImplementation(async (_discordID, steamID64) => steamID64 === '765-erased')
    await addLog({
      serverID: 's1',
      type: 'player_damage',
      createdAt: new Date(),
      updatedAt: new Date(),
      data: {},
      playerInvolvedSteamID64: ['765-other', '765-erased'],
    })
    expect(insertOneMock).not.toHaveBeenCalled()
  })

  it('removes exactly the log inserted while erasure started during its write', async () => {
    isErasureBlockedMock.mockResolvedValueOnce(false).mockResolvedValue(true)
    insertOneMock.mockResolvedValueOnce({ insertedId: 'late-log' })
    await expect(
      addLog({
        serverID: 's1',
        type: 'player_connect',
        createdAt: new Date(),
        updatedAt: new Date(),
        data: {},
        playerInvolvedSteamID64: ['765'],
      }),
    ).resolves.toBe(false)
    expect(deleteOneMock).toHaveBeenCalledWith({ _id: 'late-log' })
  })

  it('getLogsCountBySteamIDList counts matching documents', async () => {
    countDocumentsMock.mockResolvedValueOnce(5)
    await expect(getLogsCountBySteamIDList(['765'])).resolves.toBe(5)
    expect(countDocumentsMock).toHaveBeenCalledWith({ playerInvolvedSteamID64: { $in: ['765'] } })
  })

  it('getLogsBySteamIDList applies limit/offset and returns the array', async () => {
    const toArrayMock = vi.fn().mockResolvedValueOnce([{ id: 1 }])
    const skipMock = vi.fn(() => ({ toArray: toArrayMock }))
    const limitMock = vi.fn(() => ({ skip: skipMock }))
    findMock.mockReturnValueOnce({ limit: limitMock })

    const result = await getLogsBySteamIDList(['765'], { limit: 10, offset: 5 })

    expect(findMock).toHaveBeenCalledWith({ playerInvolvedSteamID64: { $in: ['765'] } })
    expect(limitMock).toHaveBeenCalledWith(10)
    expect(skipMock).toHaveBeenCalledWith(5)
    expect(result).toEqual([{ id: 1 }])
  })

  it('getTotalLogsByServer counts documents for the server', async () => {
    countDocumentsMock.mockResolvedValueOnce(42)
    await expect(getTotalLogsByServer('s1')).resolves.toBe(42)
    expect(countDocumentsMock).toHaveBeenCalledWith({ serverID: 's1' })
  })

  describe('getLogsByServer', () => {
    it('sorts ascending when orderBy is "asc"', async () => {
      const toArrayMock = vi.fn().mockResolvedValueOnce([])
      const skipMock = vi.fn(() => ({ toArray: toArrayMock }))
      const limitMock = vi.fn(() => ({ skip: skipMock }))
      const sortMock = vi.fn(() => ({ limit: limitMock }))
      findMock.mockReturnValueOnce({ sort: sortMock })

      await getLogsByServer('s1', { limit: 10, offset: 0, orderBy: 'asc', sort: 'createdAt' })

      expect(sortMock).toHaveBeenCalledWith({ createdAt: 1 })
    })

    it('sorts descending when orderBy is not "asc"', async () => {
      const toArrayMock = vi.fn().mockResolvedValueOnce([])
      const skipMock = vi.fn(() => ({ toArray: toArrayMock }))
      const limitMock = vi.fn(() => ({ skip: skipMock }))
      const sortMock = vi.fn(() => ({ limit: limitMock }))
      findMock.mockReturnValueOnce({ sort: sortMock })

      await getLogsByServer('s1', { limit: 10, offset: 0, orderBy: 'desc', sort: 'createdAt' })

      expect(sortMock).toHaveBeenCalledWith({ createdAt: -1 })
    })
  })

  it('gracefulShutdownMongo closes the mongo client', async () => {
    await gracefulShutdownMongo()
    expect(closeMock).toHaveBeenCalled()
  })
  it('restricts free history to the latest 500 before user sorting and pagination', async () => {
    aggregateMock.mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue([{ id: 'latest' }]) })
    expect(
      await getLogsByServer('s1', { offset: 475, limit: 100, sort: 'createdAt', orderBy: 'asc', readLimit: 500 }),
    ).toEqual([{ id: 'latest' }])
    expect(aggregateMock).toHaveBeenCalledExactlyOnceWith([
      { $match: { serverID: 's1' } },
      { $sort: { createdAt: -1, _id: -1 } },
      { $limit: 500 },
      { $sort: { createdAt: 1, _id: -1 } },
      { $skip: 475 },
      { $limit: 25 },
    ])
    expect(findMock).not.toHaveBeenCalled()
  })
  it('never turns a zero remaining free page into an unbounded Mongo limit', async () => {
    expect(
      await getLogsByServer('s1', { offset: 500, limit: 50, sort: 'createdAt', orderBy: 'desc', readLimit: 500 }),
    ).toEqual([])
    expect(aggregateMock).not.toHaveBeenCalled()
    expect(findMock).not.toHaveBeenCalled()
  })
  it('maps descending ID ordering and an omitted page size inside the entitled latest window', async () => {
    aggregateMock.mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue([{ id: 'newest' }]) })
    await expect(
      getLogsByServer('s1', { offset: 10, limit: 0, sort: 'id', orderBy: 'desc', readLimit: 500 }),
    ).resolves.toEqual([{ id: 'newest' }])
    expect(aggregateMock).toHaveBeenCalledExactlyOnceWith([
      { $match: { serverID: 's1' } },
      { $sort: { createdAt: -1, _id: -1 } },
      { $limit: 500 },
      { $sort: { _id: -1 } },
      { $skip: 10 },
      { $limit: 490 },
    ])
    expect(findMock).not.toHaveBeenCalled()
  })
})
