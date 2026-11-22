import prisma from '@gmod/infra-prisma'
import { isErasureBlocked } from '@gmod/domain-user/privacy.js'
import { revokeApplicationSession } from '@gmod/domain-auth/authSessions.js'
import { gmLog } from '@gmod/shared/logger.js'
import {
  AdminIDSchema,
  AdminRankChangeSchema,
  AdminRevokeSessionsSchema,
} from '@gmod/schema/admin/AdminDashboardSchema.js'

export class AdminUserActionError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'AdminUserActionError'
  }
}

const invalid = () => new AdminUserActionError(400, 'invalid_request', 'Choose a valid account and provide a reason.')
const denied = () => new AdminUserActionError(403, 'forbidden', 'Platform administrator access is required.')
const missing = () => new AdminUserActionError(404, 'not_found', 'This account is unavailable.')

async function targetAccount(actorID: string, targetID: string) {
  const actor = AdminIDSchema.safeParse(actorID)
  const target = AdminIDSchema.safeParse(targetID)
  if (!actor.success || !target.success || actor.data !== actorID || target.data !== targetID) throw invalid()
  if (actorID === targetID)
    throw new AdminUserActionError(403, 'own_account_protected', 'Manage your own account from Account settings.')
  if (await isErasureBlocked(targetID)) throw missing()
}

export async function changeAdminUserRank(actorID: string, targetID: string, body: unknown) {
  const input = AdminRankChangeSchema.safeParse(body)
  if (!input.success) throw invalid()
  await targetAccount(actorID, targetID)
  const result = await prisma.$transaction(async (tx) => {
    // Lock the developer set and both identities in a stable order. Concurrent administrators cannot
    // demote one another using ranks that were read before the first transaction committed.
    const accounts = await tx.$queryRaw<{ id: string; rank: string }[]>`
      SELECT id, rank FROM gm_user
      WHERE rank = 'developer' OR id = ${actorID} OR id = ${targetID}
      ORDER BY id FOR UPDATE
    `
    if (accounts.find((account) => account.id === actorID)?.rank !== 'developer') throw denied()
    const target = accounts.find((account) => account.id === targetID)
    if (!target) throw missing()
    if (target.rank === input.data.rank) return { changed: false, rank: target.rank }
    if (target.rank === 'developer' && accounts.filter((account) => account.rank === 'developer').length < 2)
      throw new AdminUserActionError(409, 'last_administrator', 'The last platform administrator must be retained.')
    await tx.gm_user.update({ where: { id: targetID }, data: { rank: input.data.rank } })
    return { changed: true, rank: input.data.rank }
  })
  gmLog(
    'admin',
    JSON.stringify({
      action: 'user_rank_changed',
      actor: actorID,
      target: targetID,
      rank: result.rank,
      changed: result.changed,
      reason: input.data.reason,
    }),
  )
  return result
}

export async function revokeAdminUserSessions(actorID: string, targetID: string, body: unknown) {
  const input = AdminRevokeSessionsSchema.safeParse(body)
  if (!input.success || input.data.confirm !== targetID) throw invalid()
  await targetAccount(actorID, targetID)
  const [actor, target] = await Promise.all([
    prisma.gm_user.findFirst({ where: { id: actorID }, select: { rank: true } }),
    prisma.gm_user.findFirst({ where: { id: targetID }, select: { id: true } }),
  ])
  if (actor?.rank !== 'developer') throw denied()
  if (!target) throw missing()
  if (target.id === actorID)
    throw new AdminUserActionError(403, 'own_account_protected', 'Manage your own account from Account settings.')
  const cutoff = new Date()
  let cursor: string | undefined
  let selected = 0
  while (true) {
    const sessions = await prisma.gm_panelToken.findMany({
      where: {
        revoke: false,
        creationDate: { lte: cutoff },
        expirationDate: { gt: cutoff },
        OR: [{ discordID: targetID }, { actorDiscordID: targetID }],
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: 250,
    })
    if (!sessions.length) break
    for (const session of sessions) await revokeApplicationSession(session.id)
    selected += sessions.length
    cursor = sessions.at(-1)!.id
    if (sessions.length < 250) break
  }
  gmLog(
    'admin',
    JSON.stringify({
      action: 'user_sessions_revoked',
      actor: actorID,
      target: targetID,
      selected,
      reason: input.data.reason,
    }),
  )
  return { revoked: true }
}
