import { beforeEach, describe, expect, it, vi } from 'vitest'

const getServerErrorsPayloadSafeMock = vi.fn()
vi.mock('@gmod/core/models/gmod/gmodErrorsModels.js', () => ({
  getServerErrorsPayloadSafe: getServerErrorsPayloadSafeMock,
}))

class TestChannelError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super('Safe destination error')
  }
}
const channel = { get: vi.fn(), set: vi.fn(), remove: vi.fn() }
vi.mock('@gmod/core/models/gmod/luaErrorChannels.js', () => ({
  getLuaErrorChannel: channel.get,
  setLuaErrorChannel: channel.set,
  removeLuaErrorChannel: channel.remove,
  LuaErrorChannelError: TestChannelError,
}))

const { getServerErrors, getServerErrorsChannel, postServerErrorsChannel, deleteServerErrorsChannel } =
  await import('../../../src/controllers/website/WebsiteErrorsControllers.js')

function makeRes() {
  const res: any = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  res.setHeader = vi.fn().mockReturnValue(res)
  return res
}

describe('getServerErrors', () => {
  it('extracts a plain-string serverID param', async () => {
    getServerErrorsPayloadSafeMock.mockResolvedValueOnce({ status: 200, body: { errors: [] } })
    const res = makeRes()

    await getServerErrors({ server: { guild: 'g1' }, params: { serverID: 's1' }, query: {} } as any, res)

    expect(getServerErrorsPayloadSafeMock).toHaveBeenCalledWith({}, 's1', 'g1')
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('extracts the first element of an array-valued serverID param', async () => {
    getServerErrorsPayloadSafeMock.mockResolvedValueOnce({ status: 200, body: { errors: [] } })
    const res = makeRes()

    await getServerErrors({ server: { guild: 'g1' }, params: { serverID: ['s1', 's2'] }, query: {} } as any, res)

    expect(getServerErrorsPayloadSafeMock).toHaveBeenCalledWith({}, 's1', 'g1')
  })
})

describe('Lua error channel controllers', () => {
  const channelID = '123456789012345678'
  const req = {
    server: { id: 'authorized-server' },
    params: { serverID: 'foreign-server' },
    body: { channelID, serverID: 'body-server' },
  } as any

  beforeEach(() => {
    for (const mock of Object.values(channel)) mock.mockReset()
  })

  it.each([{}, { channelID }])('returns the saved destination without caching: %j', async (configuration) => {
    channel.get.mockResolvedValueOnce(configuration)
    const res = makeRes()
    await getServerErrorsChannel(req, res)
    expect(channel.get).toHaveBeenCalledExactlyOnceWith('authorized-server')
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
    expect(res.json).toHaveBeenCalledWith(configuration)
  })

  it('passes the whole request body for strict validation in the authorized server scope', async () => {
    channel.set.mockResolvedValueOnce({ channelID })
    const res = makeRes()
    await postServerErrorsChannel(req, res)
    expect(channel.set).toHaveBeenCalledExactlyOnceWith('authorized-server', req.body)
    expect(res.json).toHaveBeenCalledWith({ channelID })
  })

  it.each([
    [400, 'invalid_channel'],
    [403, 'missing_permissions'],
    [404, 'channel_not_found'],
    [503, 'provider_unavailable'],
  ])('returns the safe known channel failure %s %s', async (status, code) => {
    channel.set.mockRejectedValueOnce(new TestChannelError(status, code))
    const res = makeRes()
    await postServerErrorsChannel(req, res)
    expect(res.status).toHaveBeenCalledWith(status)
    expect(res.json).toHaveBeenCalledWith({ error: code })
  })

  it('removes only the authorized server destination and returns its acknowledgement', async () => {
    channel.remove.mockResolvedValueOnce({})
    const res = makeRes()
    await deleteServerErrorsChannel(req, res)
    expect(channel.remove).toHaveBeenCalledExactlyOnceWith('authorized-server')
    expect(res.json).toHaveBeenCalledWith({})
  })

  it.each([
    [getServerErrorsChannel, 'get'],
    [postServerErrorsChannel, 'set'],
    [deleteServerErrorsChannel, 'remove'],
  ] as const)('forwards an unexpected storage failure from %s', async (handler, method) => {
    const error = new Error('Private database failure')
    channel[method].mockRejectedValueOnce(error)
    const res = makeRes()
    await expect(handler(req, res)).rejects.toBe(error)
    expect(res.json).not.toHaveBeenCalled()
  })
})
