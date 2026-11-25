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
const toArrayMock = vi.fn()
const skipMock = vi.fn(() => ({ toArray: toArrayMock }))
const limitMock = vi.fn(() => ({ skip: skipMock }))
const aggregateMock = vi.fn()
const findMock = vi.fn(() => ({ limit: limitMock }))

const deleteOneMock = vi.fn()
const collectionMock = {
  deleteOne: deleteOneMock,
  insertOne: insertOneMock,
  countDocuments: countDocumentsMock,
  find: findMock,
  aggregate: aggregateMock,
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
    isErasureBlockedMock.mockReset().mockResolvedValue(false)
    deleteOneMock.mockReset()
    insertOneMock.mockReset().mockResolvedValue({ insertedId: 'id1' })
    countDocumentsMock.mockReset().mockResolvedValue(0)
    toArrayMock.mockReset().mockResolvedValue([])
    aggregateMock.mockReset().mockReturnValue({ toArray: toArrayMock })
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

  it('does not store client diagnostics for a suppressed player', async () => {
    isErasureBlockedMock.mockResolvedValue(true)
    await GmodErrors.from({ ...validErrorInput, steamID64: '765' }).save()
    expect(insertOneMock).not.toHaveBeenCalled()
  })

  it('deletes only the diagnostic inserted during an erasure race', async () => {
    isErasureBlockedMock.mockResolvedValueOnce(false).mockResolvedValue(true)
    await GmodErrors.from({ ...validErrorInput, steamID64: '765' }).save()
    expect(deleteOneMock).toHaveBeenCalledWith({ _id: 'id1' })
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

describe('error history commercial window', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    countDocumentsMock.mockResolvedValue(1000)
    aggregateMock.mockReturnValue({ toArray: vi.fn().mockResolvedValue([{ id: 'latest' }]) })
  })
  it('selects the latest 50 before sorting and paging', async () => {
    const result = await getErrorsByServer({ offset: 40, limit: 25, sort: 'count', orderBy: 'ASC' }, 's1', 50)
    expect(result).toMatchObject({ errors: [{ id: 'latest' }], query: { total: 50 } })
    expect(aggregateMock).toHaveBeenCalledWith([
      { $match: { serverID: 's1' } },
      { $sort: { createdAt: -1, _id: -1 } },
      { $limit: 50 },
      { $sort: { count: 1, _id: -1 } },
      { $skip: 40 },
      { $limit: 10 },
    ])
  })
  it('returns no rows outside the accessible window', async () => {
    expect(await getErrorsByServer({ offset: 50, limit: 25 }, 's1', 50)).toMatchObject({
      errors: [],
      query: { total: 50 },
    })
    expect(aggregateMock).not.toHaveBeenCalled()
  })
  it.each([undefined, '$where'])(
    'falls back from unsupported sort %s while preserving the commercial history window',
    async (sort) => {
      const result = await getErrorsByServer({ offset: 5, limit: 10, sort, orderBy: 'DESC' }, 's1', 50)
      expect(result).toMatchObject({ query: { total: 50 } })
      expect(aggregateMock).toHaveBeenCalledWith([
        { $match: { serverID: 's1' } },
        { $sort: { createdAt: -1, _id: -1 } },
        { $limit: 50 },
        { $sort: { createdAt: -1, _id: -1 } },
        { $skip: 5 },
        { $limit: 10 },
      ])
      expect(findMock).not.toHaveBeenCalled()
    },
  )
})
