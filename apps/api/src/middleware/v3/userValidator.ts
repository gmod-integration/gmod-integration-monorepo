import { assertSessionRequest, resolveRequestSession, readSessionCredential } from '@gmod/domain-auth/authSessions.js'
import { badArgument } from '@gmod/core/utils/tools.js'
import { getPanelUserFromDiscordID } from '@gmod/domain-user/PanelUser.js'
import { resolveDashboardAccess } from '@gmod/domain-user/dashboardAccess.js'
import { DashboardAccessDenialSchema, type DashboardAccessDenial } from '@gmod/schema/user/DashboardAccessSchema.js'
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

function denyDashboardAccess(res: Response, denial: DashboardAccessDenial) {
  const { reason } = DashboardAccessDenialSchema.parse(denial)
  res.status(403).json({ error: 'dashboard_access_denied', reason })
}

function requiresFreshPermissions(req: Request): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(req.method || 'GET')
}

async function requireGuildAdministrator(
  req: Request,
  res: Response,
  fresh = requiresFreshPermissions(req),
): Promise<string | null> {
  const guildID = getSingleParam(req.params.guildID)
  const panelUser = req.panelUser!
  if (!guildID || !panelUser) {
    denyDashboardAccess(res, { allowed: false, reason: 'scope_unavailable' })
    return null
  }
  const access = await timeRequestStep(res, 'permissions', () =>
    resolveDashboardAccess(panelUser, guildID, { fresh, permissionScope: req }),
  )
  if (!access.allowed) {
    denyDashboardAccess(res, access)
    return null
  }
  return guildID
}

/** Authorize database-only operations without waiting for a Discord bot snapshot. */
async function validateGuildScope(req: Request, res: Response, next: NextFunction, fresh: boolean): Promise<void> {
  try {
    const guildID = await requireGuildAdministrator(req, res, fresh)
    if (guildID === null) return
    req.guild = new Guild({ id: guildID })
    return next()
  } catch (error) {
    return next(error)
  }
}

export async function userAdminGuildScopeValidator(req: Request, res: Response, next: NextFunction): Promise<void> {
  return validateGuildScope(req, res, next, requiresFreshPermissions(req))
}

/** Read-only POST previews use the same bounded, revision-checked permissions as GET requests. */
export async function userAdminGuildReadOnlyValidator(req: Request, res: Response, next: NextFunction): Promise<void> {
  return validateGuildScope(req, res, next, false)
}

// Cleanup must reach the independent main-client check even if no effective bot can supply a snapshot.
export const userAdminGuildBotRemovalValidator = userAdminGuildScopeValidator

export async function userAdminGuildValidator(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const guildID = await requireGuildAdministrator(req, res)
    if (guildID === null) return
    req.guild = new Guild({ id: guildID })
    return userGuildSnapshotValidator(req, res, next)
  } catch (error) {
    return next(error)
  }
}

/** Fetch Discord metadata only for handlers that actually use it, after scope authorization. */
export async function userGuildSnapshotValidator(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const guildID = req.guild?.id
    if (!guildID) {
      denyDashboardAccess(res, { allowed: false, reason: 'scope_unavailable' })
      return
    }
    const dscGuild = await timeRequestStep(res, 'discord', () => enqueueDiscordGuildSnapshot(guildID))
    if (!dscGuild) {
      res.status(404).json({
        error: 'guild_not_found',
      })
      return
    }

    req.dscGuild = dscGuild
    return next()
  } catch (error) {
    return next(error)
  }
}

async function validateServerScope(req: Request, res: Response, next: NextFunction, fresh: boolean): Promise<void> {
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
      denyDashboardAccess(res, { allowed: false, reason: 'scope_unavailable' })
      return
    }

    const access = req.panelUser
      ? await timeRequestStep(res, 'permissions', () =>
          resolveDashboardAccess(req.panelUser!, req.guild!.id, {
            serverID,
            fresh,
            permissionScope: req,
          }),
        )
      : { allowed: false as const, reason: 'scope_unavailable' as const }
    if (!access.allowed) {
      denyDashboardAccess(res, access)
      return
    }

    req.server = server
    return next()
  } catch (error) {
    return next(error)
  }
}

export async function userServerValidator(req: Request, res: Response, next: NextFunction): Promise<void> {
  return validateServerScope(req, res, next, requiresFreshPermissions(req))
}

export async function userServerReadOnlyValidator(req: Request, res: Response, next: NextFunction): Promise<void> {
  return validateServerScope(req, res, next, false)
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
