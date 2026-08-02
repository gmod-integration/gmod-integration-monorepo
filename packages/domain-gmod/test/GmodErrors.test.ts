import { beforeEach, describe, expect, it, vi } from 'vitest'

const insertOneMock = vi.fn()
const countDocumentsMock = vi.fn()
const toArrayMock = vi.fn()
const skipMock = vi.fn(() => ({ toArray: toArrayMock }))
const limitMock = vi.fn(() => ({ skip: skipMock }))
const findMock = vi.fn(() => ({ limit: limitMock }))

const collectionMock = {
  insertOne: insertOneMock,
  countDocuments: countDocumentsMock,
  find: findMock,
}

vi.mock('@gmod/infra-mongo', () => ({
  mongoClient: {
    db: vi.fn(() => ({
      collection: vi.fn(() => collectionMock),
    })),
  },
}))

const { GmodErrors, getErrorsCountByServer, getErrorsCountBySteamID, getErrorsBySteamID, getErrorsByServer } =
  await import('../src/GmodErrors.js')

const validErrorInput = {
  error: 'attempt to index a nil value',
  stack: 'stack traceback: ...',
  realm: 'server',
  uptime: 3600,
  count: 1,
  serverID: 'server_123',
}

describe('GmodErrors', () => {
  beforeEach(() => {
    insertOneMock.mockReset().mockResolvedValue({ insertedId: 'id1' })
    countDocumentsMock.mockReset().mockResolvedValue(0)
    toArrayMock.mockReset().mockResolvedValue([])
  })

  it('parses valid data, defaulting optional fields to empty strings', () => {
    const errors = GmodErrors.from(validErrorInput)
    expect(errors.name).toBe('')
    expect(errors.steamID64).toBe('')
    expect(errors.workshopID).toBe('')
  })

  it('keeps provided optional fields', () => {
    const errors = GmodErrors.from({ ...validErrorInput, name: 'wsid', steamID64: '765', workshopID: '123' })
    expect(errors.name).toBe('wsid')
    expect(errors.steamID64).toBe('765')
    expect(errors.workshopID).toBe('123')
  })

  it('throws on invalid data', () => {
    expect(() => GmodErrors.from({ ...validErrorInput, realm: 'browser' })).toThrow()
  })

  it('save() inserts a document with the expected shape', async () => {
    const errors = GmodErrors.from(validErrorInput)
    await errors.save()

    expect(insertOneMock).toHaveBeenCalledWith(
      expect.objectContaining({
        error: validErrorInput.error,
        stack: validErrorInput.stack,
        serverID: validErrorInput.serverID,
        workshopID: '',
        steamID64: '',
      }),
    )
  })

  it('getErrorsCountByServer() counts by serverID', async () => {
    countDocumentsMock.mockResolvedValueOnce(5)
    await expect(getErrorsCountByServer('s1')).resolves.toBe(5)
    expect(countDocumentsMock).toHaveBeenCalledWith({ serverID: 's1' })
  })

  it('getErrorsCountBySteamID() counts by steamID64', async () => {
    countDocumentsMock.mockResolvedValueOnce(2)
    await expect(getErrorsCountBySteamID('765')).resolves.toBe(2)
    expect(countDocumentsMock).toHaveBeenCalledWith({ steamID64: '765' })
  })

  it('getErrorsBySteamID() paginates and returns the total', async () => {
    toArrayMock.mockResolvedValueOnce([{ error: 'e1' }])
    countDocumentsMock.mockResolvedValueOnce(1)

    const result = await getErrorsBySteamID('765', { offset: 0, limit: 25 })

    expect(findMock).toHaveBeenCalledWith({ steamID64: '765' })
    expect(limitMock).toHaveBeenCalledWith(25)
    expect(skipMock).toHaveBeenCalledWith(0)
    expect(result).toEqual({ errors: [{ error: 'e1' }], query: { offset: 0, limit: 25, total: 1 } })
  })

  it('getErrorsByServer() paginates and returns the total', async () => {
    toArrayMock.mockResolvedValueOnce([{ error: 'e2' }])
    countDocumentsMock.mockResolvedValueOnce(3)

    const result = await getErrorsByServer({ offset: 5, limit: 10 }, 's1')

    expect(findMock).toHaveBeenCalledWith({ serverID: 's1' })
    expect(result).toEqual({ errors: [{ error: 'e2' }], query: { offset: 5, limit: 10, total: 3 } })
  })
})
