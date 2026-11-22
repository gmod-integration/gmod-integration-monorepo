import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  lock: vi.fn(),
  update: vi.fn(),
  findUser: vi.fn(),
  sessions: vi.fn(),
  blocked: vi.fn(),
  revoke: vi.fn(),
  log: vi.fn(),
}))
vi.mock('@gmod/infra-prisma', () => ({
  default: {
    $transaction: mocks.transaction,
    gm_user: { findFirst: mocks.findUser },
    gm_panelToken: { findMany: mocks.sessions },
  },
}))
vi.mock('@gmod/domain-user/privacy.js', () => ({ isErasureBlocked: mocks.blocked }))
vi.mock('@gmod/domain-auth/authSessions.js', () => ({ revokeApplicationSession: mocks.revoke }))
vi.mock('@gmod/shared/logger.js', () => ({ gmLog: mocks.log }))

const { changeAdminUserRank, revokeAdminUserSessions } = await import('../../../src/models/v6/adminUserManagement.js')
const reason = 'Support ticket investigation'
const identities = [
  { id: 'operator', rank: 'developer' },
  { id: 'target', rank: 'user' },
]
beforeEach(() => {
  vi.resetAllMocks()
  mocks.blocked.mockResolvedValue(false)
  mocks.lock.mockResolvedValue(identities.map((identity) => ({ ...identity })))
  mocks.update.mockResolvedValue({ id: 'target', rank: 'developer', token: 'never disclose' })
  mocks.findUser.mockImplementation(async ({ where }: { where: { id: string } }) =>
    where.id === 'operator' ? { rank: 'developer' } : { id: 'target' },
  )
  mocks.sessions.mockResolvedValue([])
  mocks.revoke.mockResolvedValue(true)
  mocks.transaction.mockImplementation((operation) =>
    operation({ $queryRaw: mocks.lock, gm_user: { update: mocks.update } }),
  )
})
afterEach(() => vi.useRealTimers())

describe('administrative account protection and rank changes', () => {
  it.each([changeAdminUserRank, revokeAdminUserSessions])(
    'protects the operator own account before any side effect',
    async (operation) => {
      await expect(
        operation('operator', 'operator', { rank: 'user', confirm: 'operator', reason }),
      ).rejects.toMatchObject({ status: 400 })
      const body = operation === changeAdminUserRank ? { rank: 'user', reason } : { confirm: 'operator', reason }
      await expect(operation('operator', 'operator', body)).rejects.toMatchObject({
        status: 403,
        code: 'own_account_protected',
      })
      expect(mocks.transaction).not.toHaveBeenCalled()
      expect(mocks.revoke).not.toHaveBeenCalled()
    },
  )
  it('rejects noncanonical identifiers rather than allowing SQL trailing-space comparison to bypass self protection', async () => {
    await expect(changeAdminUserRank('operator', 'operator ', { rank: 'user', reason })).rejects.toMatchObject({
      status: 400,
      code: 'invalid_request',
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it.each([
    { rank: 'owner', reason },
    { rank: 'developer', reason: 'test' },
    { rank: 'developer', reason: 'x'.repeat(501) },
    { rank: 'developer', reason, token: 'injected' },
  ])('validates the complete rank request before database operations %j', async (body) => {
    await expect(changeAdminUserRank('operator', 'target', body)).rejects.toMatchObject({
      status: 400,
      code: 'invalid_request',
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('refuses an erased or erasing target before rank or session mutation', async () => {
    mocks.blocked.mockResolvedValue(true)
    await expect(changeAdminUserRank('operator', 'target', { rank: 'developer', reason })).rejects.toMatchObject({
      status: 404,
    })
    await expect(revokeAdminUserSessions('operator', 'target', { confirm: 'target', reason })).rejects.toMatchObject({
      status: 404,
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.findUser).not.toHaveBeenCalled()
    expect(mocks.sessions).not.toHaveBeenCalled()
  })
  it('rechecks the actor rank under ordered row locks before promoting a target', async () => {
    mocks.lock.mockResolvedValueOnce([
      { id: 'operator', rank: 'user' },
      { id: 'target', rank: 'user' },
      { id: 'other', rank: 'developer' },
    ])
    await expect(changeAdminUserRank('operator', 'target', { rank: 'developer', reason })).rejects.toMatchObject({
      status: 403,
    })
    expect(mocks.lock.mock.calls[0][0].join('?')).toContain('ORDER BY id FOR UPDATE')
    expect(mocks.lock.mock.calls[0].slice(1)).toEqual(['operator', 'target'])
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.log).not.toHaveBeenCalled()
  })
  it('rejects a target removed before the locked mutation', async () => {
    mocks.lock.mockResolvedValueOnce([{ id: 'operator', rank: 'developer' }])
    await expect(changeAdminUserRank('operator', 'missing', { rank: 'developer', reason })).rejects.toMatchObject({
      status: 404,
    })
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it('promotes and demotes only the selected rank and returns a safe outcome', async () => {
    expect(await changeAdminUserRank('operator', 'target', { rank: 'developer', reason })).toEqual({
      changed: true,
      rank: 'developer',
    })
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 'target' }, data: { rank: 'developer' } })
    mocks.lock.mockResolvedValueOnce([
      { id: 'operator', rank: 'developer' },
      { id: 'target', rank: 'developer' },
    ])
    expect(await changeAdminUserRank('operator', 'target', { rank: 'user', reason })).toEqual({
      changed: true,
      rank: 'user',
    })
    expect(mocks.update).toHaveBeenLastCalledWith({ where: { id: 'target' }, data: { rank: 'user' } })
    const audit = JSON.parse(mocks.log.mock.calls[0][1])
    expect(audit).toMatchObject({
      action: 'user_rank_changed',
      actor: 'operator',
      target: 'target',
      reason,
      changed: true,
    })
    expect(mocks.log.mock.calls.flat().join('')).not.toContain('never disclose')
  })
  it('keeps an unchanged role idempotent without touching the account', async () => {
    expect(await changeAdminUserRank('operator', 'target', { rank: 'user', reason })).toEqual({
      changed: false,
      rank: 'user',
    })
    expect(mocks.update).not.toHaveBeenCalled()
    expect(JSON.parse(mocks.log.mock.calls[0][1])).toMatchObject({ changed: false })
  })
  it('does not report a successful change when the transaction fails', async () => {
    mocks.update.mockRejectedValueOnce(new Error('Write failed'))
    await expect(changeAdminUserRank('operator', 'target', { rank: 'developer', reason })).rejects.toThrow(
      'Write failed',
    )
    expect(mocks.log).not.toHaveBeenCalled()
  })
})

describe('administrative session revocation', () => {
  it.each([
    { confirm: 'other', reason },
    { confirm: 'target', reason: 'test' },
    { confirm: 'target', reason, accessToken: 'injected' },
  ])('requires exact confirmation and a reason %j', async (body) => {
    await expect(revokeAdminUserSessions('operator', 'target', body)).rejects.toMatchObject({ status: 400 })
    expect(mocks.findUser).not.toHaveBeenCalled()
    expect(mocks.sessions).not.toHaveBeenCalled()
    expect(mocks.revoke).not.toHaveBeenCalled()
  })
  it.each([null, { rank: 'user' }])(
    'revalidates the current actor role before selecting sessions %j',
    async (actor) => {
      mocks.findUser.mockImplementation(async ({ where }: { where: { id: string } }) =>
        where.id === 'operator' ? actor : { id: 'target' },
      )
      await expect(revokeAdminUserSessions('operator', 'target', { confirm: 'target', reason })).rejects.toMatchObject({
        status: 403,
      })
      expect(mocks.sessions).not.toHaveBeenCalled()
    },
  )
  it('rejects a missing target without revoking another account sessions', async () => {
    mocks.findUser.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === 'operator' ? { rank: 'developer' } : null,
    )
    await expect(revokeAdminUserSessions('operator', 'missing', { confirm: 'missing', reason })).rejects.toMatchObject({
      status: 404,
    })
    expect(mocks.sessions).not.toHaveBeenCalled()
  })
  it('uses a bounded stable cursor and the domain revoker for own and delegated target sessions', async () => {
    vi.useFakeTimers()
    const cutoff = new Date('2026-11-22T12:00:00.000Z')
    vi.setSystemTime(cutoff)
    const first = Array.from({ length: 250 }, (_, index) => ({ id: String(index).padStart(4, '0') }))
    const last = [{ id: '0250' }, { id: '0251' }]
    mocks.sessions.mockResolvedValueOnce(first).mockResolvedValueOnce(last)
    expect(await revokeAdminUserSessions('operator', 'target', { confirm: 'target', reason })).toEqual({
      revoked: true,
    })
    expect(mocks.sessions).toHaveBeenCalledTimes(2)
    expect(mocks.sessions.mock.calls[0][0]).toEqual({
      where: {
        revoke: false,
        creationDate: { lte: cutoff },
        expirationDate: { gt: cutoff },
        OR: [{ discordID: 'target' }, { actorDiscordID: 'target' }],
      },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: 250,
    })
    expect(mocks.sessions.mock.calls[1][0].where.id).toEqual({ gt: '0249' })
    expect(mocks.revoke).toHaveBeenCalledTimes(252)
    expect(mocks.revoke).toHaveBeenCalledWith('0000')
    expect(mocks.revoke).toHaveBeenCalledWith('0251')
    expect(JSON.parse(mocks.log.mock.calls[0][1])).toEqual({
      action: 'user_sessions_revoked',
      actor: 'operator',
      target: 'target',
      selected: 252,
      reason,
    })
  })
  it('finishes cleanly when the account has no active sessions', async () => {
    expect(await revokeAdminUserSessions('operator', 'target', { confirm: 'target', reason })).toEqual({
      revoked: true,
    })
    expect(mocks.sessions).toHaveBeenCalledOnce()
    expect(mocks.revoke).not.toHaveBeenCalled()
  })
  it('stops after revocation storage fails and never audits a completed success', async () => {
    mocks.sessions.mockResolvedValueOnce([{ id: 'session-1' }, { id: 'session-2' }])
    mocks.revoke.mockRejectedValueOnce(new Error('Revocation unavailable'))
    await expect(revokeAdminUserSessions('operator', 'target', { confirm: 'target', reason })).rejects.toThrow(
      'Revocation unavailable',
    )
    expect(mocks.revoke).toHaveBeenCalledOnce()
    expect(mocks.log).not.toHaveBeenCalled()
  })
})
