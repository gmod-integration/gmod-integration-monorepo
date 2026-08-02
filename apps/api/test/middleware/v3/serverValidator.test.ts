import { beforeEach, describe, expect, it, vi } from 'vitest'

const getServerFromIDMock = vi.fn()
vi.mock('@gmod/domain-server/Server.js', () => ({ getServerFromID: getServerFromIDMock }))

const redisMock = { set: vi.fn() }
vi.mock('@gmod/infra-redis', () => ({ default: redisMock }))

const { default: serverValidator } = await import('../../../src/middleware/v3/serverValidator.js')

function makeRes() {
  const res: any = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res
}

function makeReq(overrides: Record<string, any> = {}) {
  return {
    params: { serverID: 's1' },
    headers: { authorization: 'Bearer tok1' },
    ...overrides,
  } as any
}

describe('serverValidator', () => {
  beforeEach(() => {
    getServerFromIDMock.mockReset()
    redisMock.set.mockReset()
  })

  it('returns 400 when authorization is missing the Bearer prefix', async () => {
    const res = makeRes()
    await serverValidator(makeReq({ headers: {} }), res, vi.fn())
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('returns 404 when the server is not found', async () => {
    getServerFromIDMock.mockResolvedValueOnce(null)
    const res = makeRes()
    await serverValidator(makeReq(), res, vi.fn())
    expect(res.status).toHaveBeenCalledWith(404)
  })

  it('returns 401 when the token is invalid', async () => {
    getServerFromIDMock.mockResolvedValueOnce({ isValidToken: () => false })
    const res = makeRes()
    await serverValidator(makeReq(), res, vi.fn())
    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('stores the version/last_request and calls next on success', async () => {
    const server = { isValidToken: () => true }
    getServerFromIDMock.mockResolvedValueOnce(server)
    const req = makeReq({ headers: { authorization: 'Bearer tok1', 'gmod-integrations-version': '1.2.3' } })
    const next = vi.fn()

    await serverValidator(req, makeRes(), next)

    expect(redisMock.set).toHaveBeenCalledWith('server:s1:version', '1.2.3')
    expect(redisMock.set).toHaveBeenCalledWith('server:s1:last_request', expect.any(String))
    expect(req.server).toBe(server)
    expect(next).toHaveBeenCalledWith()
  })

  it('forwards a thrown error to next', async () => {
    getServerFromIDMock.mockRejectedValueOnce(new Error('db down'))
    const next = vi.fn()
    await serverValidator(makeReq(), makeRes(), next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})
