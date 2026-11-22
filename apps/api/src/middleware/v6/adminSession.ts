import type { NextFunction, Request, Response } from 'express'
import {
  AuthSessionError,
  assertSessionRequest,
  assertTrustedOrigin,
  resolveRequestSession,
} from '@gmod/domain-auth/authSessions.js'
import prisma from '@gmod/infra-prisma'

/** Platform administration requires the operator's own live session and current database rank. */
export async function adminSession(req: Request, res: Response, next: NextFunction) {
  res.setHeader('Cache-Control', 'no-store')
  assertTrustedOrigin(req)
  const session = await resolveRequestSession(req, { touch: true })
  if (!session) throw new AuthSessionError(401, 'unauthorized', 'A valid session is required.')
  assertSessionRequest(req, session)
  if (session.actorDiscordID || session.actorSessionID)
    throw new AuthSessionError(
      403,
      'own_admin_session_required',
      'Return to your own account to administer the platform.',
    )
  const operator = await prisma.gm_user.findFirst({
    where: { id: session.discordID },
    select: { id: true, rank: true },
  })
  if (operator?.rank !== 'developer')
    throw new AuthSessionError(403, 'forbidden', 'Platform administrator access is required.')
  req.authSession = session
  next()
}
