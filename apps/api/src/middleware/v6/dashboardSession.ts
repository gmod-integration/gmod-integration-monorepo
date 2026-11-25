import type { NextFunction, Request, Response } from 'express'
import {
  assertSessionRequest,
  assertTrustedOrigin,
  resolveRequestSession,
  readSessionCredential,
} from '@gmod/domain-auth/authSessions.js'
import { getPanelUserFromDiscordID } from '@gmod/domain-user/PanelUser.js'
import { resolveDashboardAccess } from '@gmod/domain-user/dashboardAccess.js'
import { DashboardAccessDenialSchema, type DashboardAccessDenial } from '@gmod/schema/user/DashboardAccessSchema.js'
import { getServerFromID } from '@gmod/domain-server/Server.js'
import { Guild } from '@gmod/domain-guild/Guild.js'
import { getSingleParam } from '../../utils/requestParams.js'
import { timeRequestStep } from '../../utils/requestTiming.js'

export async function dashboardSession(req: Request, res: Response, next: NextFunction) {
  res.setHeader('Cache-Control', 'no-store')
  assertTrustedOrigin(req)
  const session = await timeRequestStep(res, 'session', () => resolveRequestSession(req, { touch: true }))
  if (!session)
    return res.status(401).json({ error: { code: 'unauthorized', message: 'A valid session is required.' } })
  assertSessionRequest(req, session)
  const panel = await timeRequestStep(res, 'user', () =>
    getPanelUserFromDiscordID(session.discordID, readSessionCredential(req) || undefined, session),
  )
  if (!panel) return res.status(401).json({ error: { code: 'unauthorized', message: 'A valid session is required.' } })
  req.authSession = session

  req.panelUser = panel
  next()
}

export async function dashboardGuild(req: Request, res: Response, next: NextFunction) {
  const guildID = getSingleParam(req.params.guildID)
  if (!guildID || !req.panelUser) return denyDashboardAccess(res, { allowed: false, reason: 'scope_unavailable' })
  const access = await timeRequestStep(res, 'permissions', () => resolveRequestAccess(req, guildID))
  if (!access.allowed) return denyDashboardAccess(res, access)
  req.guild = new Guild({ id: guildID })
  next()
}

export async function dashboardServer(req: Request, res: Response, next: NextFunction) {
  const guildID = getSingleParam(req.params.guildID)
  if (!guildID || !req.panelUser) return denyDashboardAccess(res, { allowed: false, reason: 'scope_unavailable' })
  const serverID = getSingleParam(req.params.serverID)
  const access = await timeRequestStep(res, 'permissions', () => resolveRequestAccess(req, guildID, serverID))
  if (!access.allowed) return denyDashboardAccess(res, access)
  const server = serverID ? await timeRequestStep(res, 'server', () => getServerFromID(serverID)) : null
  if (!server || server.guild !== guildID)
    return res
      .status(404)
      .json({ error: { code: 'not_found', message: 'This server was not found in this community.' } })
  req.guild = new Guild({ id: guildID })
  req.server = server
  next()
}

function denyDashboardAccess(res: Response, denial: DashboardAccessDenial) {
  const { reason } = DashboardAccessDenialSchema.parse(denial)
  return res
    .status(403)
    .json({ error: { code: 'dashboard_access_denied', reason, message: 'Access to this dashboard is not permitted.' } })
}

async function resolveRequestAccess(req: Request, guildID: string, serverID?: string) {
  return resolveDashboardAccess(req.panelUser!, guildID, {
    fresh: !['GET', 'HEAD', 'OPTIONS'].includes(req.method || 'GET'),
    ...(serverID ? { serverID } : {}),
  })
}
