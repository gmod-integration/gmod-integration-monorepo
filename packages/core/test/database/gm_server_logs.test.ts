import { beforeEach, describe, expect, it, vi } from 'vitest'

const insertOneMock = vi.fn()
const countDocumentsMock = vi.fn()
const findMock = vi.fn()
const closeMock = vi.fn()

const collectionLogs = {
  insertOne: insertOneMock,
  countDocuments: countDocumentsMock,
  find: findMock,
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
    insertOneMock.mockReset()
    countDocumentsMock.mockReset()
    findMock.mockReset()
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
})
