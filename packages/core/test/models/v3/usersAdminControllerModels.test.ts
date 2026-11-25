import { beforeEach, describe, expect, it, vi } from 'vitest'

const findSessionsMock = vi.fn()
const findUsersMock = vi.fn()
vi.mock('@gmod/infra-prisma', () => ({
  default: {
    gm_panelToken: { findMany: findSessionsMock },
    gm_user: { findMany: findUsersMock },
  },
}))
const { getAllActivePanelUsers } = await import('../../../src/models/v3/usersAdminControllerModels.js')
beforeEach(() => {
  findSessionsMock.mockReset()
  findUsersMock.mockReset()
})

describe('administrative impersonation account selection', () => {
  it('does not select credentials, revoked sessions or delegated sessions', async () => {
    findSessionsMock.mockResolvedValueOnce([])
    await expect(getAllActivePanelUsers()).resolves.toEqual([])
    const query = findSessionsMock.mock.calls[0][0]
    expect(query.where).toMatchObject({ revoke: false, actorDiscordID: null, expirationDate: { gt: expect.any(Date) } })
    expect(query.where.OR).toEqual([{ absoluteExpiresAt: null }, { absoluteExpiresAt: { gt: expect.any(Date) } }])
    expect(query.select).not.toHaveProperty('accessToken')
    expect(findUsersMock).not.toHaveBeenCalled()
  })
  it('returns one safe account target per user instead of each live session', async () => {
    const created = new Date('2026-01-01T00:00:00.000Z')
    findSessionsMock.mockResolvedValueOnce([
      { discordID: 'd1', lastSeenAt: created, creationDate: created, accessToken: 'must-not-leak' },
      { discordID: 'd1', lastSeenAt: null, creationDate: created, accessToken: 'also-private' },
      { discordID: 'removed-user', lastSeenAt: created, creationDate: created },
    ])
    findUsersMock.mockResolvedValueOnce([{ id: 'd1', username: 'Alice' }])
    const result = await getAllActivePanelUsers()
    expect(result).toEqual([{ discordID: 'd1', username: 'Alice', lastSeenAt: created.toISOString() }])
    expect(JSON.stringify(result)).not.toMatch(/accessToken|must-not-leak|also-private/)
  })
  it('uses legacy creation timestamps until a newer activity timestamp supersedes them', async () => {
    const created = new Date('2026-01-01T00:00:00.000Z')
    const recent = new Date('2026-02-01T00:00:00.000Z')
    findSessionsMock.mockResolvedValueOnce([
      { discordID: 'd1', lastSeenAt: null, creationDate: created },
      { discordID: 'd1', lastSeenAt: recent, creationDate: created },
      { discordID: 'legacy', lastSeenAt: null, creationDate: created },
    ])
    findUsersMock.mockResolvedValueOnce([
      { id: 'd1', username: 'Alice' },
      { id: 'legacy', username: 'Legacy' },
    ])
    await expect(getAllActivePanelUsers()).resolves.toEqual([
      { discordID: 'd1', username: 'Alice', lastSeenAt: recent.toISOString() },
      { discordID: 'legacy', username: 'Legacy', lastSeenAt: created.toISOString() },
    ])
  })
})
