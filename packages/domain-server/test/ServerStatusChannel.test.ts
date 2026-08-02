import { beforeEach, describe, expect, it, vi } from 'vitest'

const findFirstMock = vi.fn()
const createMock = vi.fn()
const updateManyMock = vi.fn()
const deleteManyMock = vi.fn()

vi.mock('@gmod/infra-prisma', () => ({
  default: {
    gm_server_status_channel: {
      findFirst: findFirstMock,
      create: createMock,
      updateMany: updateManyMock,
      deleteMany: deleteManyMock,
    },
  },
}))

const { ServerStatusChannel } = await import('../src/ServerStatusChannel.js')

const validRecord = {
  id: 'sc1',
  serverID: 's1',
  channelID: 'ch1',
  format: '%s players',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
}

const fakeServer = { id: 's1' } as any

describe('ServerStatusChannel', () => {
  beforeEach(() => {
    findFirstMock.mockReset()
    createMock.mockReset()
    updateManyMock.mockReset()
    deleteManyMock.mockReset()
  })

  it('from() parses a valid record', () => {
    const channel = ServerStatusChannel.from(validRecord)
    expect(channel.channelID).toBe('ch1')
    expect(channel.updatedAt).toBeInstanceOf(Date)
  })

  it('from() throws on invalid data', () => {
    expect(() => ServerStatusChannel.from({ id: 'sc1' })).toThrow()
  })

  it('get() returns the parsed record when one exists', async () => {
    findFirstMock.mockResolvedValueOnce(validRecord)
    const result = await ServerStatusChannel.get(fakeServer)
    expect(result).toBeInstanceOf(ServerStatusChannel)
    expect(findFirstMock).toHaveBeenCalledWith({ where: { serverID: 's1' } })
  })

  it('get() returns an empty placeholder record when none exists', async () => {
    findFirstMock.mockResolvedValueOnce(null)
    const result = await ServerStatusChannel.get(fakeServer)
    expect(result).toEqual(
      expect.objectContaining({ id: '', serverID: 's1', channelID: '', format: '' }),
    )
  })

  it('create() creates and returns a parsed record', async () => {
    createMock.mockResolvedValueOnce(validRecord)
    const result = await ServerStatusChannel.create(fakeServer, 'ch1', '%s players')
    expect(createMock).toHaveBeenCalledWith({ data: { serverID: 's1', channelID: 'ch1', format: '%s players' } })
    expect(result).toBeInstanceOf(ServerStatusChannel)
  })

  it('update() updates then re-fetches and returns the parsed record', async () => {
    // Prisma's updateMany() resolves to {count}, not the updated row - update() must re-fetch
    // afterward (see the comment in the source for why a single-record update() can't be used
    // here: serverID isn't the unique key on this model).
    updateManyMock.mockResolvedValueOnce({ count: 1 })
    findFirstMock.mockResolvedValueOnce({ ...validRecord, channelID: 'ch2', format: '%s online' })

    const result = await ServerStatusChannel.update(fakeServer, 'ch2', '%s online')

    expect(updateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { serverID: 's1' }, data: expect.objectContaining({ channelID: 'ch2' }) }),
    )
    expect(findFirstMock).toHaveBeenCalledWith({ where: { serverID: 's1' } })
    expect(result).toBeInstanceOf(ServerStatusChannel)
    expect(result.channelID).toBe('ch2')
  })

  it('delete() removes matching records and returns nothing', async () => {
    deleteManyMock.mockResolvedValueOnce({ count: 1 })
    await expect(ServerStatusChannel.delete(fakeServer)).resolves.toBeUndefined()
    expect(deleteManyMock).toHaveBeenCalledWith({ where: { serverID: 's1' } })
  })
})
