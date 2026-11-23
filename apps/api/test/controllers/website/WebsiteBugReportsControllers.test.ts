import { beforeEach, describe, expect, it, vi } from 'vitest'

class TestChannelError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super('Safe destination error')
  }
}
const channel = { get: vi.fn(), set: vi.fn(), remove: vi.fn() }
vi.mock('@gmod/core/models/gmod/bugReportChannels.js', () => ({
  getBugReportChannel: channel.get,
  setBugReportChannel: channel.set,
  removeBugReportChannel: channel.remove,
  BugReportChannelError: TestChannelError,
}))

const { getServerBugReportsChannel, postServerBugReportsChannel, deleteServerBugReportsChannel } =
  await import('../../../src/controllers/website/WebsiteBugReportsControllers.js')

function makeRes() {
  const res: any = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  res.setHeader = vi.fn().mockReturnValue(res)
  return res
}

describe('Bug report channel controllers', () => {
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
    await getServerBugReportsChannel(req, res)
    expect(channel.get).toHaveBeenCalledExactlyOnceWith('authorized-server')
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
    expect(res.json).toHaveBeenCalledWith(configuration)
  })

  it('passes the whole request body for strict validation in the authorized server scope', async () => {
    channel.set.mockResolvedValueOnce({ channelID })
    const res = makeRes()
    await postServerBugReportsChannel(req, res)
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
    await postServerBugReportsChannel(req, res)
    expect(res.status).toHaveBeenCalledWith(status)
    expect(res.json).toHaveBeenCalledWith({ error: code })
  })

  it('removes only the authorized server destination and returns its acknowledgement', async () => {
    channel.remove.mockResolvedValueOnce({})
    const res = makeRes()
    await deleteServerBugReportsChannel(req, res)
    expect(channel.remove).toHaveBeenCalledExactlyOnceWith('authorized-server')
    expect(res.json).toHaveBeenCalledWith({})
  })

  it.each([
    [getServerBugReportsChannel, 'get'],
    [postServerBugReportsChannel, 'set'],
    [deleteServerBugReportsChannel, 'remove'],
  ] as const)('forwards an unexpected storage failure from %s', async (handler, method) => {
    const error = new Error('Private database failure')
    channel[method].mockRejectedValueOnce(error)
    const res = makeRes()
    await expect(handler(req, res)).rejects.toBe(error)
    expect(res.json).not.toHaveBeenCalled()
  })
})
