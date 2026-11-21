import type { NextFunction, Request, Response } from 'express'
import { assertSessionRequest, resolveRequestSession, readSessionCredential } from '@gmod/domain-auth/authSessions.js'
import { getPanelUserFromDiscordID } from '@gmod/domain-user/PanelUser.js'
import { getServerFromID } from '@gmod/domain-server/Server.js'
import { Guild } from '@gmod/domain-guild/Guild.js'
import { getSingleParam } from '../../utils/requestParams.js'
import { ConfigServer } from '@gmod/config'

export async function dashboardSession(req: Request, res: Response, next: NextFunction) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.headers.origin && req.headers.origin !== new URL(ConfigServer.websiteUrl).origin)
    return res.status(403).json({ error: { code: 'origin_forbidden', message: 'This origin is not allowed.' } })
  const session = await resolveRequestSession(req, { touch: true })
  if (!session)
    return res.status(401).json({ error: { code: 'unauthorized', message: 'A valid session is required.' } })
  assertSessionRequest(req, session)
  const panel = await getPanelUserFromDiscordID(session.discordID, readSessionCredential(req) || undefined, session)
  if (!panel) return res.status(401).json({ error: { code: 'unauthorized', message: 'A valid session is required.' } })
  req.authSession = session

  req.panelUser = panel
  next()
}

export async function dashboardGuild(req: Request, res: Response, next: NextFunction) {
  const guildID = getSingleParam(req.params.guildID)
  if (!guildID || !req.panelUser || !(await req.panelUser.isAdminOfGuild(guildID)))
    return res
      .status(403)
      .json({ error: { code: 'forbidden', message: 'Community administration permission is required.' } })
  req.guild = new Guild({ id: guildID })
  next()
}

export async function dashboardServer(req: Request, res: Response, next: NextFunction) {
  const guildID = getSingleParam(req.params.guildID)
  if (!guildID || !req.panelUser || !(await req.panelUser.isAdminOfGuild(guildID)))
    return res
      .status(403)
      .json({ error: { code: 'forbidden', message: 'Community administration permission is required.' } })
  const serverID = getSingleParam(req.params.serverID)
  const server = serverID ? await getServerFromID(serverID) : null
  if (!server || server.guild !== guildID)
    return res
      .status(404)
      .json({ error: { code: 'not_found', message: 'This server was not found in this community.' } })
  req.guild = new Guild({ id: guildID })
  req.server = server
  next()
}
