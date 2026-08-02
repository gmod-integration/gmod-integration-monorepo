import { describe, expect, it, vi } from 'vitest'

const getStatsMock = vi.fn()
vi.mock('@gmod/core/models/v3/mainModels.js', () => ({ getStats: getStatsMock }))

const { getActualStats } = await import('../../../src/controllers/v3/mainControllers.js')

describe('getActualStats', () => {
  it('responds with the stats payload', async () => {
    getStatsMock.mockResolvedValueOnce({ user: 1 })
    const json = vi.fn()
    await getActualStats({} as any, { json } as any)
    expect(json).toHaveBeenCalledWith({ user: 1 })
  })
})
