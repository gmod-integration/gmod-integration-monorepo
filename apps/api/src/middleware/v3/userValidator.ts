import { assertSessionRequest, resolveRequestSession, readSessionCredential } from '@gmod/domain-auth/authSessions.js'
import { badArgument } from '@gmod/core/utils/tools.js'
import { getPanelUserFromDiscordID } from '@gmod/domain-user/PanelUser.js'
import { getServerFromID } from '@gmod/domain-server/Server.js'
import { Guild } from '@gmod/domain-guild/Guild.js'
import { getUserFromDiscordID } from '@gmod/domain-user/User.js'
import { type NextFunction, type Request, type Response } from 'express'
import { enqueueDiscordGuildSnapshot } from '@gmod/infra-bullmq/discordQueueAdapters.js'
import { getSingleParam } from '@/utils/requestParams.js'
import { timeRequestStep } from '@/utils/requestTiming.js'
export async function userValidator(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const discordID = getSingleParam(req.params.discordID)

    if (badArgument([discordID])) {
      res.status(400).json({
        error: 'missing_arguments',
        args: {
          discordID: discordID,
        },
      })
      return
    }

    const session = await timeRequestStep(res, 'session', () => resolveRequestSession(req, { touch: true }))
    if (!session || session.discordID !== discordID) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
    assertSessionRequest(req, session)
    const panelUser = await timeRequestStep(res, 'user', () =>
      getPanelUserFromDiscordID(discordID, readSessionCredential(req) || undefined, session),
    )
    if (!panelUser) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
    req.authSession = session

    req.panelUser = panelUser

    return next()
  } catch (error) {
    return next(error)
  }
}

async function requireGuildAdministrator(req: Request, res: Response): Promise<string | null> {
  const guildID = getSingleParam(req.params.guildID)
  const panelUser = req.panelUser!
  const allowed = await timeRequestStep(res, 'permissions', () =>
    ['GET', 'HEAD', 'OPTIONS'].includes(req.method || 'GET')
      ? panelUser.isAdminOfGuild(guildID)
      : panelUser.isAdminOfGuild(guildID, { fresh: true }),
  )
  if (!allowed) {
    res.status(403).json({ error: 'not_admin_of_guild' })
    return null
  }
  return guildID
}

/** Authorize database-only operations without waiting for a Discord bot snapshot. */
export async function userAdminGuildScopeValidator(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const guildID = await requireGuildAdministrator(req, res)
    if (guildID === null) return
    req.guild = new Guild({ id: guildID })
    return next()
  } catch (error) {
    return next(error)
  }
}

// Cleanup must reach the independent main-client check even if no effective bot can supply a snapshot.
export const userAdminGuildBotRemovalValidator = userAdminGuildScopeValidator

export async function userAdminGuildValidator(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const guildID = await requireGuildAdministrator(req, res)
    if (guildID === null) return
    const dscGuild = await timeRequestStep(res, 'discord', () => enqueueDiscordGuildSnapshot(guildID))
    if (!dscGuild) {
      res.status(404).json({
        error: 'guild_not_found',
      })
      return
    }

    // Guild's constructor never throws and always returns an instance for a plain { id }
    // object, so no falsy guard is needed here.
    const guild = new Guild({ id: guildID })

    req.guild = guild
    req.dscGuild = dscGuild
    return next()
  } catch (error) {
    return next(error)
  }
}

export async function userServerValidator(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const serverID = getSingleParam(req.params.serverID)

    const server = await timeRequestStep(res, 'server', () => getServerFromID(serverID))
    if (!server) {
      res.status(404).json({
        error: 'server_not_found',
      })
      return
    }

    if (server.getGuildID() !== req.guild!.id) {
      res.status(403).json({
        error: 'server_not_in_guild',
      })
      return
    }

    req.server = server
    return next()
  } catch (error) {
    return next(error)
  }
}

export async function userAdminValidator(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.authSession?.actorDiscordID || req.authSession?.actorSessionID) {
      res.status(403).json({ error: 'own_admin_session_required' })
      return
    }
    const panelUser = req.panelUser!

    const user = await getUserFromDiscordID(panelUser.discordID)
    if (!user) {
      res.status(404).json({
        error: 'user_not_found',
      })
      return
    }

    if (!user.isDeveloper()) {
      res.status(403).json({
        error: 'not_developer',
      })
      return
    }

    return next()
  } catch (error) {
    return next(error)
  }
}
