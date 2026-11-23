import { beforeEach, describe, expect, it, vi } from 'vitest'

const statistics = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@gmod/core/models/v3/serverStatisticsModels.js', () => ({ processGetServerStatistics: statistics.get }))

const { getServerStatistics } = await import('../../../src/controllers/website/WebsiteStatisticsControllers.js')

function makeRes() {
  const res: any = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  res.setHeader = vi.fn().mockReturnValue(res)
  return res
}

describe('getServerStatistics', () => {
  beforeEach(() => vi.resetAllMocks())

  it('uses the authorized server and delegates validation of the unmodified query', async () => {
    const req = {
      server: { getID: () => 'authorized-server' },
      params: { serverID: 'route-server' },
      body: { serverID: 'body-server' },
      query: { period: '30d', serverID: 'query-server' },
    } as any
    const body = { period: '30d', traffic: [] }
    statistics.get.mockResolvedValueOnce({ status: 200, body })
    const res = makeRes()

    await getServerStatistics(req, res)

    expect(statistics.get).toHaveBeenCalledExactlyOnceWith('authorized-server', req.query)
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(body)
  })

  it('preserves the model validation status and body', async () => {
    const body = { error: 'invalid_query' }
    statistics.get.mockResolvedValueOnce({ status: 400, body })
    const res = makeRes()

    await getServerStatistics({ server: { getID: () => 's1' }, query: { period: ['7d', '30d'] } } as any, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(body)
  })

  it('propagates unexpected storage errors to the shared error handler', async () => {
    const error = new Error('Storage unavailable')
    statistics.get.mockRejectedValueOnce(error)
    const res = makeRes()

    await expect(getServerStatistics({ server: { getID: () => 's1' }, query: {} } as any, res)).rejects.toBe(error)

    expect(res.json).not.toHaveBeenCalled()
  })
})
