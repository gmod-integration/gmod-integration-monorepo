import crypto from 'crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getServerFromIDMock = vi.fn()
vi.mock('@gmod/domain-server/Server.js', () => ({ getServerFromID: getServerFromIDMock }))

const badArgumentMock = vi.fn()
vi.mock('@gmod/core/utils/tools.js', () => ({ badArgument: badArgumentMock }))

const redisMock = { get: vi.fn(), set: vi.fn(), incr: vi.fn() }
vi.mock('@gmod/infra-redis', () => ({ default: redisMock }))

const { default: clientValidator } = await import('../../../src/middleware/v3/clientValidator.js')

function makeRes() {
  const res: any = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res
}

function tokenFor(clientID64: string, publicToken: string, token: string, userID: string) {
  const hash = crypto.createHash('sha256')
  hash.update(`${clientID64}-${publicToken}-${token}-${userID}`)
  return hash.digest('hex')
}

function makeReq(overrides: Record<string, any> = {}) {
  return {
    params: { serverID: 's1', clientID64: '765' },
    headers: { authorization: 'Bearer sometoken userid1' },
    ...overrides,
  } as any
}

describe('clientValidator', () => {
  beforeEach(() => {
    getServerFromIDMock.mockReset()
    badArgumentMock.mockReset().mockReturnValue(false)
    redisMock.get.mockReset()
    redisMock.set.mockReset()
    redisMock.incr.mockReset()
  })

  it('returns 400 when required fields are missing', async () => {
    badArgumentMock.mockReturnValueOnce(true)
    const res = makeRes()
    const next = vi.fn()

    await clientValidator(makeReq(), res, next)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 400 when authorization is missing the Bearer prefix', async () => {
    const res = makeRes()
    await clientValidator(makeReq({ headers: { authorization: 'sometoken' } }), res, vi.fn())
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'invalid_authorization' })
  })

  it('returns 404 when the server is not found', async () => {
    getServerFromIDMock.mockResolvedValueOnce(null)
    const res = makeRes()
    await clientValidator(makeReq(), res, vi.fn())
    expect(res.status).toHaveBeenCalledWith(404)
  })

  it('returns 401 when the token hash does not match', async () => {
    getServerFromIDMock.mockResolvedValueOnce({
      getPublicToken: () => 'pub1',
      getToken: () => 'tok1',
      guild: 'g1',
    })
    const res = makeRes()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await clientValidator(makeReq({ headers: { authorization: 'Bearer wrong-token userid1' } }), res, vi.fn())

    expect(res.status).toHaveBeenCalledWith(401)
    expect(errorSpy).toHaveBeenCalled()
  })

  it('returns 429 when the client is currently blocked', async () => {
    const validToken = tokenFor('765', 'pub1', 'tok1', 'userid1')
    getServerFromIDMock.mockResolvedValueOnce({ getPublicToken: () => 'pub1', getToken: () => 'tok1', guild: 'g1' })
    redisMock.get
      .mockResolvedValueOnce(null) // count5s
      .mockResolvedValueOnce(null) // count60s
      .mockResolvedValueOnce('1') // block

    const res = makeRes()
    await clientValidator(
      makeReq({ headers: { authorization: `Bearer ${validToken} userid1` } }),
      res,
      vi.fn(),
    )

    expect(res.status).toHaveBeenCalledWith(429)
  })

  it('initializes both counters on the first request and calls next', async () => {
    const validToken = tokenFor('765', 'pub1', 'tok1', 'userid1')
    const server = { getPublicToken: () => 'pub1', getToken: () => 'tok1', guild: 'g1' }
    getServerFromIDMock.mockResolvedValueOnce(server)
    redisMock.get.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(null)

    const req = makeReq({ headers: { authorization: `Bearer ${validToken} userid1` } })
    const next = vi.fn()
    await clientValidator(req, makeRes(), next)

    expect(redisMock.set).toHaveBeenCalledWith('client_request_count_1s_765', 1, 'EX', 1)
    expect(redisMock.set).toHaveBeenCalledWith('client_request_count_60s_765', 1, 'EX', 60)
    expect(req.server).toBe(server)
    expect(req.headers.guild).toBe('g1')
    expect(next).toHaveBeenCalledWith()
  })

  it('increments both counters on subsequent requests', async () => {
    const validToken = tokenFor('765', 'pub1', 'tok1', 'userid1')
    getServerFromIDMock.mockResolvedValueOnce({ getPublicToken: () => 'pub1', getToken: () => 'tok1', guild: 'g1' })
    redisMock.get.mockResolvedValueOnce('1').mockResolvedValueOnce('1').mockResolvedValueOnce(null)

    await clientValidator(makeReq({ headers: { authorization: `Bearer ${validToken} userid1` } }), makeRes(), vi.fn())

    expect(redisMock.incr).toHaveBeenCalledWith('client_request_count_1s_765')
    expect(redisMock.incr).toHaveBeenCalledWith('client_request_count_60s_765')
  })

  it('blocks for 60s and returns 429 when the 5s count exceeds 3', async () => {
    const validToken = tokenFor('765', 'pub1', 'tok1', 'userid1')
    getServerFromIDMock.mockResolvedValueOnce({ getPublicToken: () => 'pub1', getToken: () => 'tok1', guild: 'g1' })
    redisMock.get.mockResolvedValueOnce('4').mockResolvedValueOnce('1').mockResolvedValueOnce(null)

    const res = makeRes()
    await clientValidator(makeReq({ headers: { authorization: `Bearer ${validToken} userid1` } }), res, vi.fn())

    expect(redisMock.set).toHaveBeenCalledWith('client_request_block_765', 1, 'EX', 60)
    expect(res.status).toHaveBeenCalledWith(429)
  })

  it('blocks for 24h and returns 429 when the 60s count exceeds 10', async () => {
    const validToken = tokenFor('765', 'pub1', 'tok1', 'userid1')
    getServerFromIDMock.mockResolvedValueOnce({ getPublicToken: () => 'pub1', getToken: () => 'tok1', guild: 'g1' })
    redisMock.get.mockResolvedValueOnce('1').mockResolvedValueOnce('11').mockResolvedValueOnce(null)

    const res = makeRes()
    await clientValidator(makeReq({ headers: { authorization: `Bearer ${validToken} userid1` } }), res, vi.fn())

    expect(redisMock.set).toHaveBeenCalledWith('client_request_block_765', 1, 'EX', 60 * 60 * 24)
    expect(res.status).toHaveBeenCalledWith(429)
  })

  it('forwards a thrown error to next', async () => {
    badArgumentMock.mockImplementationOnce(() => {
      throw new Error('boom')
    })
    const next = vi.fn()
    await clientValidator(makeReq(), makeRes(), next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})
