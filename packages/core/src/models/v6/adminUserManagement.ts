import prisma from '@gmod/infra-prisma'
import { isDeveloper } from '@gmod/config/developers.js'
import { isErasureBlocked } from '@gmod/domain-user/privacy.js'
import { revokeApplicationSession } from '@gmod/domain-auth/authSessions.js'
import { gmLog } from '@gmod/shared/logger.js'
import { AdminIDSchema, AdminRevokeSessionsSchema } from '@gmod/schema/admin/AdminDashboardSchema.js'

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

export async function revokeAdminUserSessions(actorID: string, targetID: string, body: unknown) {
  const input = AdminRevokeSessionsSchema.safeParse(body)
  if (!input.success || input.data.confirm !== targetID) throw invalid()
  await targetAccount(actorID, targetID)
  if (!isDeveloper(actorID)) throw denied()
  const target = await prisma.gm_user.findFirst({ where: { id: targetID }, select: { id: true } })
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
