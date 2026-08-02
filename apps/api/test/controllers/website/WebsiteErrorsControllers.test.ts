import { describe, expect, it, vi } from 'vitest'

const getServerErrorsPayloadSafeMock = vi.fn()
vi.mock('@gmod/core/models/gmod/gmodErrorsModels.js', () => ({
  getServerErrorsPayloadSafe: getServerErrorsPayloadSafeMock,
}))

const { getServerErrors } = await import('../../../src/controllers/website/WebsiteErrorsControllers.js')

function makeRes() {
  const res: any = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res
}

describe('getServerErrors', () => {
  it('extracts a plain-string serverID param', async () => {
    getServerErrorsPayloadSafeMock.mockResolvedValueOnce({ status: 200, body: { errors: [] } })
    const res = makeRes()

    await getServerErrors({ params: { serverID: 's1' }, query: {} } as any, res)

    expect(getServerErrorsPayloadSafeMock).toHaveBeenCalledWith({}, 's1')
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('extracts the first element of an array-valued serverID param', async () => {
    getServerErrorsPayloadSafeMock.mockResolvedValueOnce({ status: 200, body: { errors: [] } })
    const res = makeRes()

    await getServerErrors({ params: { serverID: ['s1', 's2'] }, query: {} } as any, res)

    expect(getServerErrorsPayloadSafeMock).toHaveBeenCalledWith({}, 's1')
  })
})
