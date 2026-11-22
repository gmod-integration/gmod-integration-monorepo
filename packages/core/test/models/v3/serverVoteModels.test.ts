import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), lock: vi.fn(), lastVote: vi.fn(), create: vi.fn() }))
vi.mock('@gmod/infra-prisma', () => ({ default: { $transaction: mocks.transaction } }))
const { registerCommunityServerVote } = await import('../../../src/models/v3/serverVoteModels.js')
const store = { $queryRaw: mocks.lock, gm_server_vote: { findFirst: mocks.lastVote, create: mocks.create } }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.transaction.mockImplementation(async (run) => run(store))
  mocks.lock.mockResolvedValue([{ id: 's1' }])
  mocks.lastVote.mockResolvedValue(null)
  mocks.create.mockResolvedValue({})
})
describe('atomic Discord vote registration', () => {
  it('locks the community-scoped server row before checking and inserting a vote in the same transaction', async () => {
    expect(await registerCommunityServerVote('s1', 'g1', 'u1')).toEqual({ status: 'voted' })
    expect(mocks.transaction).toHaveBeenCalledTimes(1)
    const sql = mocks.lock.mock.calls[0][0]
    expect(sql.sql).toMatch(/WHERE id = \? AND guild = \? FOR UPDATE/)
    expect(sql.values).toEqual(['s1', 'g1'])
    expect(mocks.lastVote).toHaveBeenCalledWith({
      where: { serverID: 's1', userID: 'u1' },
      orderBy: { createdAt: 'desc' },
    })
    expect(mocks.create).toHaveBeenCalledWith({ data: { serverID: 's1', userID: 'u1' } })
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(mocks.lastVote.mock.invocationCallOrder[0])
    expect(mocks.lastVote.mock.invocationCallOrder[0]).toBeLessThan(mocks.create.mock.invocationCallOrder[0])
  })
  it('does not inspect or write votes if the row was removed or moved to another community', async () => {
    mocks.lock.mockResolvedValueOnce([])
    expect(await registerCommunityServerVote('s1', 'old-guild', 'u1')).toEqual({ status: 'not_found' })
    expect(mocks.lastVote).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('keeps the three-hour cooldown and only creates an expired vote', async () => {
    mocks.lastVote.mockResolvedValueOnce({ createdAt: new Date() })
    expect(await registerCommunityServerVote('s1', 'g1', 'u1')).toMatchObject({
      status: 'cooldown',
      retryAfterSeconds: expect.any(Number),
    })
    expect(mocks.create).not.toHaveBeenCalled()
    mocks.lastVote.mockResolvedValueOnce({ createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000) })
    expect(await registerCommunityServerVote('s1', 'g1', 'u1')).toEqual({ status: 'voted' })
    expect(mocks.create).toHaveBeenCalledTimes(1)
  })
  it('propagates transaction failures without reporting a successful vote', async () => {
    mocks.create.mockRejectedValueOnce(new Error('Transaction failed'))
    await expect(registerCommunityServerVote('s1', 'g1', 'u1')).rejects.toThrow('Transaction failed')
  })
})
