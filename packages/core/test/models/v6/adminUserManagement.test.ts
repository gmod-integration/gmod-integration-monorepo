import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  sessions: vi.fn(),
  blocked: vi.fn(),
  revoke: vi.fn(),
  log: vi.fn(),
}))
vi.mock('@gmod/infra-prisma', () => ({
  default: { gm_user: { findFirst: mocks.findUser }, gm_panelToken: { findMany: mocks.sessions } },
}))
vi.mock('@gmod/domain-user/privacy.js', () => ({ isErasureBlocked: mocks.blocked }))
vi.mock('@gmod/domain-auth/authSessions.js', () => ({ revokeApplicationSession: mocks.revoke }))
vi.mock('@gmod/shared/logger.js', () => ({ gmLog: mocks.log }))
const { revokeAdminUserSessions } = await import('../../../src/models/v6/adminUserManagement.js')
const operator = '333650866747867137'
const reason = 'Support ticket investigation'
beforeEach(() => {
  vi.resetAllMocks()
  mocks.blocked.mockResolvedValue(false)
  mocks.findUser.mockResolvedValue({ id: 'target' })
  mocks.sessions.mockResolvedValue([])
  mocks.revoke.mockResolvedValue(true)
})
afterEach(() => vi.useRealTimers())

describe('administrative session revocation from the root allowlist', () => {
  it('protects the operator own account before any side effect', async () => {
    await expect(revokeAdminUserSessions(operator, operator, { confirm: operator, reason })).rejects.toMatchObject({
      status: 403,
      code: 'own_account_protected',
    })
    expect(mocks.revoke).not.toHaveBeenCalled()
  })
  it('rejects normalized aliases rather than relying on SQL string comparison', async () => {
    await expect(
      revokeAdminUserSessions(operator, operator + ' ', { confirm: operator + ' ', reason }),
    ).rejects.toMatchObject({ status: 400 })
    expect(mocks.findUser).not.toHaveBeenCalled()
  })
  it.each([
    { confirm: 'other', reason },
    { confirm: 'target', reason: 'test' },
    { confirm: 'target', reason, accessToken: 'injected' },
  ])('requires exact confirmation and a reason %j', async (body) => {
    await expect(revokeAdminUserSessions(operator, 'target', body)).rejects.toMatchObject({ status: 400 })
    expect(mocks.findUser).not.toHaveBeenCalled()
    expect(mocks.revoke).not.toHaveBeenCalled()
  })
  it('refuses an erased target before session mutation', async () => {
    mocks.blocked.mockResolvedValue(true)
    await expect(revokeAdminUserSessions(operator, 'target', { confirm: 'target', reason })).rejects.toMatchObject({
      status: 404,
    })
    expect(mocks.sessions).not.toHaveBeenCalled()
  })
  it('refuses a database developer who is absent from the static list', async () => {
    mocks.findUser.mockResolvedValue({ id: 'unlisted', rank: 'developer' })
    await expect(revokeAdminUserSessions('unlisted', 'target', { confirm: 'target', reason })).rejects.toMatchObject({
      status: 403,
    })
    expect(mocks.findUser).not.toHaveBeenCalled()
    expect(mocks.sessions).not.toHaveBeenCalled()
  })
  it('rejects a missing target without revoking another account sessions', async () => {
    mocks.findUser.mockResolvedValue(null)
    await expect(revokeAdminUserSessions(operator, 'missing', { confirm: 'missing', reason })).rejects.toMatchObject({
      status: 404,
    })
    expect(mocks.sessions).not.toHaveBeenCalled()
  })
  it('protects the canonical target account returned by the database', async () => {
    mocks.findUser.mockResolvedValue({ id: operator })
    await expect(revokeAdminUserSessions(operator, 'target', { confirm: 'target', reason })).rejects.toMatchObject({
      status: 403,
    })
    expect(mocks.sessions).not.toHaveBeenCalled()
  })
  it('uses a bounded cursor and the domain revoker for target sessions and outgoing support sessions', async () => {
    vi.useFakeTimers()
    const cutoff = new Date('2026-11-22T12:00:00.000Z')
    vi.setSystemTime(cutoff)
    const first = Array.from({ length: 250 }, (_, index) => ({ id: String(index).padStart(4, '0') }))
    mocks.sessions.mockResolvedValueOnce(first).mockResolvedValueOnce([{ id: '0250' }, { id: '0251' }])
    expect(await revokeAdminUserSessions(operator, 'target', { confirm: 'target', reason })).toEqual({ revoked: true })
    expect(mocks.findUser).toHaveBeenCalledExactlyOnceWith({ where: { id: 'target' }, select: { id: true } })
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
    expect(JSON.parse(mocks.log.mock.calls[0][1])).toEqual({
      action: 'user_sessions_revoked',
      actor: operator,
      target: 'target',
      selected: 252,
      reason,
    })
  })
  it('finishes cleanly when the account has no active sessions', async () => {
    expect(await revokeAdminUserSessions(operator, 'target', { confirm: 'target', reason })).toEqual({ revoked: true })
    expect(mocks.revoke).not.toHaveBeenCalled()
  })
  it('never audits completed success after a revocation failure', async () => {
    mocks.sessions.mockResolvedValueOnce([{ id: 'session-1' }, { id: 'session-2' }])
    mocks.revoke.mockRejectedValueOnce(new Error('Revocation unavailable'))
    await expect(revokeAdminUserSessions(operator, 'target', { confirm: 'target', reason })).rejects.toThrow(
      'Revocation unavailable',
    )
    expect(mocks.revoke).toHaveBeenCalledOnce()
    expect(mocks.log).not.toHaveBeenCalled()
  })
})
