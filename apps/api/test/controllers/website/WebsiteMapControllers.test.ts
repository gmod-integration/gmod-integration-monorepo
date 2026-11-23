import { beforeEach, describe, expect, it, vi } from 'vitest'

const map = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@gmod/core/models/v3/serverMapModels.js', () => ({ processGetServerMap: map.get }))
const { getServerMap } = await import('../../../src/controllers/website/WebsiteMapControllers.js')

function response() {
  const res: any = {}
  res.setHeader = vi.fn().mockReturnValue(res)
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res
}

describe('server map controller', () => {
  beforeEach(() => vi.resetAllMocks())

  it('uses the authorized server and prevents caching instead of trusting caller overrides', async () => {
    const snapshot = { serverID: 'authorized-server', map: 'gm_construct' }
    map.get.mockResolvedValueOnce(snapshot)
    const res = response()
    await getServerMap(
      {
        server: { getID: () => 'authorized-server' },
        params: { serverID: 'route-server' },
        query: { serverID: 'query-server', map: 'gm_bigcity' },
        body: { serverID: 'body-server' },
      } as any,
      res,
    )
    expect(map.get).toHaveBeenCalledExactlyOnceWith('authorized-server')
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(snapshot)
  })

  it('forwards storage failures to the shared error handler', async () => {
    map.get.mockRejectedValueOnce(new Error('Unavailable'))
    const res = response()
    await expect(getServerMap({ server: { getID: () => 'server' } } as any, res)).rejects.toThrow('Unavailable')
    expect(res.json).not.toHaveBeenCalled()
  })
})
