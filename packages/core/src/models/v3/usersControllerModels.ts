import { getUserFromDiscordID, getUserFromSteamID64 } from '@gmod/domain-user/User.js'
import { generateToken, badArgument } from '../../utils/tools.js'
import { createServer, getServersFromDiscordGuildID } from '@gmod/domain-server/Server.js'
import { type Guild } from '@gmod/domain-guild/Guild.js'
import {
  enqueueDiscordGuildReloadBotInstance,
  enqueueMainClientHasGuild,
} from '@gmod/infra-bullmq/discordQueueAdapters.js'
import redis from '@gmod/infra-redis'
import prisma from '@gmod/infra-prisma'
import { getLogsByServer, getTotalLogsByServer } from '../../database/gm_server_logs.js'

type EndpointResult = {
  status: number
  body: unknown
}

function ok(body: unknown = { success: true }): EndpointResult {
  return { status: 200, body }
}

function bad(body: unknown): EndpointResult {
  return { status: 400, body }
}

function notFound(body: unknown): EndpointResult {
  return { status: 404, body }
}

function forbidden(body: unknown): EndpointResult {
  return { status: 403, body }
}

function conflict(body: unknown): EndpointResult {
  return { status: 409, body }
}

function toQueryString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value[0] ? String(value[0]) : fallback
  if (value === null || value === undefined) return fallback
  return String(value)
}

function toQueryNumber(value: unknown, fallback: number): number {
  if (Array.isArray(value)) {
    const parsed = Number(value[0])
    return Number.isFinite(parsed) ? parsed : fallback
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export async function processGetProfile(steamID64: unknown, discordID: unknown): Promise<EndpointResult> {
  if (discordID) {
    const user = await getUserFromDiscordID(String(discordID))
    if (!user) {
      return notFound({ error: 'User not found' })
    }

    return ok(user)
  }

  if (steamID64) {
    const user = await getUserFromSteamID64(String(steamID64))
    if (!user) {
      return notFound({ error: 'User not found' })
    }

    return ok(user)
  }

  return bad({ error: 'Missing required query parameter' })
}

export async function processGetUserSessions(discordID: string): Promise<EndpointResult> {
  const sessions = await prisma.gm_panelToken.findMany({
    where: {
      revoke: false,
      discordID,
    },
  })

  // findMany() always resolves to an array (never null), so no falsy fallback is needed here.
  return ok(sessions)
}

export async function processDeleteUserSession(discordID: string, sessionID: string): Promise<EndpointResult> {
  const session = await prisma.gm_panelToken.findFirst({
    where: {
      discordID,
      id: sessionID,
      revoke: false,
    },
  })

  if (!session) {
    return notFound({ error: 'Session not found' })
  }

  await prisma.gm_panelToken.update({
    where: {
      id: sessionID,
    },
    data: {
      revoke: true,
    },
  })

  // session was already null-checked above (returning 404), so it's always truthy here.
  return ok(session)
}

export async function processLogOut(discordID: string, accessToken: string): Promise<EndpointResult> {
  const sessionToken = await prisma.gm_panelToken.findFirst({
    where: {
      discordID,
      accessToken,
      revoke: false,
    },
  })

  if (sessionToken) {
    await prisma.gm_panelToken.update({
      where: {
        id: sessionToken.id,
      },
      data: {
        revoke: true,
      },
    })
  }

  return ok(sessionToken || {})
}

export async function processCreateNewServer(guild: any): Promise<EndpointResult> {
  const isPremium = await guild.isPremium()
  const servers = await guild.getServers()

  if (servers.length >= 1 && !isPremium) {
    return forbidden({ error: 'Server limit reached' })
  }

  const newServer = await createServer(guild.id)
  return ok(newServer)
}

export async function processPutGmodToDiscordFilter(
  server: any,
  filterID: unknown,
  payload: {
    element: unknown
    operator: unknown
    trigger: unknown
    action: unknown
    active: unknown
  },
): Promise<EndpointResult> {
  const { element, operator, trigger, action, active } = payload

  if (badArgument([element, operator, trigger, action, active])) {
    return bad({ error: 'missing arguments' })
  }

  const filter = await prisma.gm_server_sync_chat_filter.findFirst({
    where: {
      id: Number(filterID),
      serverID: server.id,
    },
  })

  if (!filter) {
    return notFound({ error: 'filter not found' })
  }

  const filterData: any = {
    element: element !== undefined ? element : filter.element,
    operator: operator !== undefined ? operator : filter.operator,
    trigger: trigger !== undefined ? trigger : filter.trigger,
    action: action !== undefined ? action : filter.action,
    active: active !== undefined ? active : filter.active,
  }

  const updatedFilter = await prisma.gm_server_sync_chat_filter.update({
    where: {
      id: Number(filterID),
    },
    data: filterData,
  })

  await redis.del(`server:${server.id}:gmodToDiscordFilter`)
  return ok(updatedFilter)
}

export async function processDeleteGmodToDiscordFilter(server: any, filterID: unknown): Promise<EndpointResult> {
  const filter = await prisma.gm_server_sync_chat_filter.findFirst({
    where: {
      id: Number(filterID),
      serverID: server.id,
    },
  })

  if (!filter) {
    return notFound({ error: 'filter not found' })
  }

  await redis.del(`server:${server.id}:gmodToDiscordFilter`)
  await prisma.gm_server_sync_chat_filter.delete({
    where: {
      id: Number(filterID),
    },
  })

  return ok(filter)
}

export async function processGetServerPlayers(
  serverID: string,
  query: {
    limit?: unknown
    offset?: unknown
    order?: unknown
    searchColum?: unknown
    search?: unknown
  },
): Promise<EndpointResult> {
  const limit = toQueryNumber(query.limit, 50)
  const offset = toQueryNumber(query.offset, 0)
  const order = toQueryString(query.order, 'desc')
  const searchColum = toQueryString(query.searchColum, 'total_time')
  const search = toQueryString(query.search, '')

  const allowedSearch = ['total_time', 'total_connect', 'rank', 'name', 'bypassMaintenance']
  if (!allowedSearch.includes(searchColum)) {
    return bad({ error: 'invalid searchColum query' })
  }

  const allowedOrder = ['asc', 'desc']
  if (!allowedOrder.includes(order)) {
    return bad({ error: 'invalid order query' })
  }

  const whereClause = {
    server_id: serverID,
    OR: [
      {
        name: {
          contains: search,
        },
      },
      {
        steam_id: {
          contains: search,
        },
      },
      {
        rank: {
          contains: search,
        },
      },
    ],
  }

  const players = await prisma.gm_server_stat.findMany({
    where: whereClause,
    orderBy: {
      [searchColum]: order,
    },
    take: limit,
    skip: offset,
  })

  const total = await prisma.gm_server_stat.count({
    where: whereClause,
  })

  return ok({
    rows: players,
    query: {
      limit,
      offset,
      order,
      total,
      searchColum,
    },
  })
}

export async function processPutPlayerBypassMaintenance(
  server: any,
  playerID: string,
  bypassMaintenance: unknown,
): Promise<EndpointResult> {
  if (badArgument([bypassMaintenance])) {
    return bad({ error: 'missing arguments' })
  }

  const player = await server.getPlayerStats(playerID)
  if (!player) {
    return notFound({ error: 'player not found' })
  }

  player.bypassMaintenance = bypassMaintenance !== undefined ? bypassMaintenance : player.bypassMaintenance

  const editPlayer = await prisma.gm_server_stat.update({
    where: {
      server_id_steam_id: {
        steam_id: player.steam_id,
        server_id: server.id,
      },
    },
    data: {
      bypassMaintenance: player.bypassMaintenance,
    },
  })

  return ok(editPlayer)
}

export async function processPostUserStartVerification(discordID: string): Promise<EndpointResult> {
  const user = await prisma.gm_user.findFirst({
    where: {
      id: discordID,
    },
  })

  if (!user) {
    return notFound({ error: 'User not found' })
  }

  const newUser = await prisma.gm_user.update({
    where: {
      id: discordID,
    },
    data: {
      token: generateToken(16),
      token_expires: new Date(Date.now() + 1000 * 60 * 7),
    },
  })

  return ok({
    token: newUser.token,
    expires: newUser.token_expires,
  })
}

export async function processPostAutoRoles(guildID: string, roleID: string): Promise<EndpointResult> {
  const existingAutoRole = await prisma.gm_guild_auto_roles.findFirst({
    where: {
      guildID,
      roleID,
    },
  })

  if (existingAutoRole) {
    return conflict({ error: 'Auto role already exists' })
  }

  const autoRole = await prisma.gm_guild_auto_roles.create({
    data: {
      guildID,
      roleID,
    },
  })

  return ok(autoRole)
}

export async function processDeleteAutoRoles(guildID: string, roleID: string): Promise<EndpointResult> {
  const autoRole = await prisma.gm_guild_auto_roles.findFirst({
    where: {
      guildID,
      roleID,
    },
  })

  if (!autoRole) {
    return notFound({ error: 'Auto role not found' })
  }

  await prisma.gm_guild_auto_roles.delete({
    where: {
      roleID,
      guildID,
    },
  })

  return ok(autoRole)
}

export async function processGetAutoRoles(guildID: string): Promise<EndpointResult> {
  const autoRoles = await prisma.gm_guild_auto_roles.findMany({
    where: {
      guildID,
    },
  })

  // findMany() always resolves to an array (never null), so no falsy fallback is needed here.
  return ok(autoRoles)
}

export async function processGetAdminInformations(): Promise<EndpointResult> {
  const data: any = {
    guild: {},
    server: {},
    user: {},
  }

  data.guild.total = await prisma.gm_guild.count()
  data.guild.language = (
    await prisma.gm_guild.groupBy({
      by: ['language'],
      _count: {
        language: true,
      },
    })
  ).map((lang) => ({
    label: lang.language,
    value: lang._count.language,
  }))

  data.server.total = await prisma.gm_server.count()
  data.user.totalDiscordMembers =
    (
      await prisma.gm_guild.aggregate({
        _sum: {
          member: true,
        },
      })
    )._sum.member || 0
  data.user.totalDiscordUser = await prisma.gm_user.count()
  data.user.totalSteamUser = await prisma.users.count()
  data.user.totalVerified = await prisma.gm_user.count({
    where: {
      steam: {
        not: null,
      },
    },
  })
  data.user.totalUnverified = data.user.totalDiscordMembers - data.user.totalVerified
  data.user.total = data.user.totalDiscordMembers + data.user.totalSteamUser

  return ok(data)
}

export async function processPostGmodPurchase(
  guildID: string,
  discordID: string,
  guild: any,
  panelUser: any,
): Promise<EndpointResult> {
  const user = await getUserFromDiscordID(discordID)
  if (!user || !user.getSteamID64()) {
    return notFound({ error: 'User not found or not linked' })
  }

  const purchase = await prisma.gm_gmodstore_purchases.findFirst({
    where: {
      steamID64: user.getSteamID64()!,
    },
  })

  if (!purchase) {
    return notFound({ error: 'Purchase not found' })
  }

  await prisma.gm_gmodstore_purchases.update({
    where: {
      steamID64: user.getSteamID64()!,
    },
    data: {
      guild: guildID,
    },
  })

  return ok((await guild.getBotClientInfo(panelUser.user)) || {})
}

export async function processDeleteGmodPurchase(discordID: string, guild: any): Promise<EndpointResult> {
  if (!(await guild.mainBotOnGuild())) {
    return bad({ error: 'Main bot not on guild' })
  }

  const user = await getUserFromDiscordID(discordID)
  if (!user || !user.getSteamID64()) {
    return notFound({ error: 'User not found or not linked' })
  }

  const purchase = await prisma.gm_gmodstore_purchases.findFirst({
    where: {
      steamID64: user.getSteamID64()!,
    },
  })

  if (!purchase) {
    return notFound({ error: 'Purchase not found' })
  }

  const savedPurchase = await prisma.gm_gmodstore_purchases.update({
    where: {
      steamID64: user.getSteamID64()!,
    },
    data: {
      guild: '',
      token: '',
    },
  })

  await guild.reloadBotInstance()
  return ok(savedPurchase)
}

export async function processDeleteUserGmodPurchase(discordID: string, guildID: string): Promise<EndpointResult> {
  const user = await getUserFromDiscordID(discordID)
  if (!user || !user.getSteamID64()) {
    return notFound({ error: 'User not found or not linked' })
  }

  const purchase = await prisma.gm_gmodstore_purchases.findFirst({
    where: {
      steamID64: user.getSteamID64()!,
    },
  })

  if (!purchase) {
    return notFound({ error: 'Purchase not found' })
  }

  if (!purchase.guild) {
    return conflict({ error: 'Purchase is not linked to a guild' })
  }

  if (purchase.guild !== guildID) {
    return notFound({ error: 'Guild is not linked to this purchase' })
  }

  const savedPurchase = await prisma.gm_gmodstore_purchases.update({
    where: {
      steamID64: user.getSteamID64()!,
    },
    data: {
      guild: '',
      token: '',
    },
  })

  // The purchase is already unlinked at this point. A Discord worker failure must
  // not prevent users from recovering a purchase attached to an inaccessible guild.
  await enqueueDiscordGuildReloadBotInstance(guildID).catch(() => false)

  return ok(savedPurchase)
}

export async function processGetUserGmodStorePurchases(discordID: string): Promise<EndpointResult> {
  const user = await getUserFromDiscordID(discordID)
  if (!user || !user.getSteamID64()) {
    return notFound({ error: 'User not found or not linked' })
  }

  const purchases: any = await prisma.gm_gmodstore_purchases.findFirst({
    where: {
      steamID64: user.getSteamID64()!,
    },
  })

  if (purchases && purchases.guild) {
    purchases.hasMainBot = await enqueueMainClientHasGuild(purchases.guild).catch(() => false)
  }

  return ok(purchases || {})
}

export async function processPutServerPseudo(
  serverID: string,
  roleID: unknown,
  payload: {
    role: unknown
    name: unknown
    prefix: unknown
    enabled: unknown
  },
): Promise<EndpointResult> {
  const pseudo = await prisma.gm_server_pseudo.findFirst({
    where: {
      serverID,
      id: Number(roleID),
    },
  })

  if (!pseudo) {
    return notFound({ error: 'Pseudo not found' })
  }

  const { role, name, prefix, enabled } = payload

  const pseudoData: any = {
    name: name !== undefined ? name : pseudo.name,
    prefix: prefix !== undefined ? prefix : pseudo.prefix,
    role: role !== undefined ? role : pseudo.role,
    enabled: enabled !== undefined ? enabled : pseudo.enabled,
  }

  const updatePseudo = await prisma.gm_server_pseudo.update({
    where: {
      id: pseudo.id,
      serverID,
    },
    data: pseudoData,
  })

  return ok(updatePseudo)
}

export async function processDeleteServerPseudo(serverID: string, roleID: unknown): Promise<EndpointResult> {
  const pseudo = await prisma.gm_server_pseudo.findFirst({
    where: {
      serverID,
      id: Number(roleID),
    },
  })

  if (!pseudo) {
    return notFound({ error: 'Pseudo not found' })
  }

  await prisma.gm_server_pseudo.delete({
    where: {
      id: pseudo.id,
      serverID,
    },
  })

  return ok(pseudo)
}

export async function processPatchUserNotifications(
  discordID: string,
  notificationID: unknown,
): Promise<EndpointResult> {
  const notification = await prisma.gm_users_notifications.findFirst({
    where: {
      id: Number(notificationID),
      discordID,
    },
  })

  if (!notification) {
    return notFound({ error: 'Notification not found' })
  }

  const updated = await prisma.gm_users_notifications.update({
    where: {
      id: notification.id,
      discordID,
    },
    data: {
      read: true,
    },
  })

  return ok(updated)
}

export async function processGetServerLogs(
  serverID: string,
  query: {
    offset?: unknown
    limit?: unknown
    sort?: unknown
    orderBy?: unknown
  },
): Promise<EndpointResult> {
  const rawOffset = query.offset?.toString() || '0'
  const rawLimit = query.limit?.toString() || '50'
  const rawSort = query.sort?.toString() || 'createdAt'
  const rawOrderBy = query.orderBy?.toString().toUpperCase() || 'DESC'

  let offset = parseInt(rawOffset, 10)
  let limit = parseInt(rawLimit, 10)

  if (isNaN(offset) || offset < 0) offset = 0
  if (isNaN(limit) || limit < 1) limit = 50
  if (limit > 500) limit = 500

  const allowedColumns = ['createdAt', 'updatedAt', 'id', 'data', 'playerInvolvedSteamID64', 'type', 'serverID']
  const sort = rawSort
  if (!allowedColumns.includes(sort)) {
    return bad({ error: 'Invalid sort column' })
  }

  const orderBy = rawOrderBy === 'ASC' ? 'asc' : 'desc'

  const total = await getTotalLogsByServer(serverID)
  const logs = await getLogsByServer(serverID, {
    offset,
    limit,
    orderBy,
    sort,
  })

  return ok({
    logs,
    query: {
      offset,
      limit,
      sort,
      orderBy: orderBy.toUpperCase(),
      total,
    },
  })
}

export async function processGetServerWarns(
  serverID: string,
  query: {
    offset?: unknown
    limit?: unknown
    sort?: unknown
    orderBy?: unknown
  },
): Promise<EndpointResult> {
  const rawOffset = query.offset?.toString() || '0'
  const rawLimit = query.limit?.toString() || '50'
  const rawSort = query.sort?.toString() || 'createdAt'
  const rawOrderBy = query.orderBy?.toString().toUpperCase() || 'DESC'

  let offset = parseInt(rawOffset, 10)
  let limit = parseInt(rawLimit, 10)

  if (isNaN(offset) || offset < 0) offset = 0
  if (isNaN(limit) || limit < 1) limit = 50
  if (limit > 500) limit = 500

  const allowedColumns = ['createdAt', 'updatedAt', 'userSteamID64', 'adminSteamID64', 'reason']
  const sort = rawSort
  if (!allowedColumns.includes(sort)) {
    return bad({ error: 'Invalid sort column' })
  }

  const orderBy = rawOrderBy === 'ASC' ? 'asc' : 'desc'

  const total = await prisma.gm_server_warn.count({
    where: {
      serverID,
    },
  })

  const warns = await prisma.gm_server_warn.findMany({
    where: {
      serverID,
    },
    skip: offset,
    take: limit,
    orderBy: {
      [sort]: orderBy,
    },
  })

  return ok({
    warns,
    query: {
      offset,
      limit,
      sort,
      orderBy: orderBy.toUpperCase(),
      total,
    },
  })
}

// Capped rather than paginated: a paginated view can't correctly flag "also banned on the other
// platform" without loading the full Discord ban list to cross-check against anyway, and per-guild
// ban counts are realistically in the dozens-to-low-hundreds range.
const GUILD_BANS_ROW_CAP = 1000

export async function processGetGuildBans(guild: Guild): Promise<EndpointResult> {
  const servers = await getServersFromDiscordGuildID(guild.id)
  const serverIDs = servers.map((server) => server.getID())

  const gmodBansRaw = serverIDs.length
    ? await prisma.gm_server_ban.findMany({
        where: { serverID: { in: serverIDs } },
        orderBy: { createdAt: 'desc' },
        take: GUILD_BANS_ROW_CAP,
      })
    : []

  const discordBansRaw = await guild.getDiscordBans()

  const discordBannedIDs = new Set(discordBansRaw.map((ban) => ban.id))
  const gmodBannedSteamIDs = new Set(gmodBansRaw.map((ban) => ban.userSteamID64))

  const gmodBans = await Promise.all(
    gmodBansRaw.map(async (ban) => {
      const linkedUser = await getUserFromSteamID64(ban.userSteamID64)
      const linkedDiscordID = linkedUser?.getDiscordID() || null
      return {
        ...ban,
        linkedDiscordID,
        discordAlsoBanned: linkedDiscordID ? discordBannedIDs.has(linkedDiscordID) : false,
      }
    }),
  )

  const discordBans = await Promise.all(
    discordBansRaw.map(async (ban) => {
      const linkedUser = await getUserFromDiscordID(ban.id)
      const linkedSteamID64 = linkedUser?.getSteamID64() || null
      return {
        ...ban,
        linkedSteamID64,
        gmodAlsoBanned: linkedSteamID64 ? gmodBannedSteamIDs.has(linkedSteamID64) : false,
      }
    }),
  )

  return ok({ gmodBans, discordBans })
}

export async function processGetScreenshotsList(
  serverID: string,
  query: {
    offset?: unknown
    limit?: unknown
    orderBy?: unknown
  },
): Promise<EndpointResult> {
  const rawOffset = query.offset?.toString() || '0'
  const rawLimit = query.limit?.toString() || '50'
  const rawSort = 'createdAt'
  const rawOrderBy = query.orderBy?.toString().toUpperCase() || 'DESC'

  let offset = parseInt(rawOffset, 10)
  let limit = parseInt(rawLimit, 10)

  if (isNaN(offset) || offset < 0) offset = 0
  if (isNaN(limit) || limit < 1) limit = 50
  if (limit > 500) limit = 500

  const screenshots = await prisma.gm_server_screenshots.findMany({
    where: {
      serverID,
    },
    skip: offset,
    take: limit,
    orderBy: {
      [rawSort]: rawOrderBy === 'ASC' ? 'asc' : 'desc',
    },
  })

  const total = await prisma.gm_server_screenshots.count({
    where: {
      serverID,
    },
  })

  return ok({
    screenshots,
    query: {
      offset,
      limit,
      sort: rawSort,
      orderBy: rawOrderBy.toUpperCase(),
      total,
    },
  })
}

export async function processPostServerLogsTrigger(
  server: any,
  payload: {
    action: unknown
    compare: unknown
    channelID: unknown
    value: unknown
    operator: unknown
    message: unknown
    log_type: unknown
  },
): Promise<EndpointResult> {
  if (!(await server.isPremium())) {
    return forbidden({ error: 'Server is not premium' })
  }

  const { action, compare, channelID, value, operator, message, log_type } = payload
  if (badArgument([action, compare, channelID, value, operator, message, log_type])) {
    return bad({ error: 'Missing required arguments' })
  }

  return ok(await server.createLogsTrigger(action, compare, channelID, value, operator, message, log_type))
}

export async function processPutServerLogsTrigger(
  server: any,
  triggerID: unknown,
  payload: {
    action: unknown
    compare: unknown
    channelID: unknown
    value: unknown
    operator: unknown
    message: unknown
    log_type: unknown
  },
): Promise<EndpointResult> {
  if (!(await server.isPremium())) {
    return forbidden({ error: 'Server is not premium' })
  }

  const { action, compare, channelID, value, operator, message, log_type } = payload
  if (badArgument([action, compare, channelID, value, operator, message, log_type])) {
    return bad({ error: 'Missing required arguments' })
  }

  return ok(
    await server.updateLogsTrigger(Number(triggerID), action, compare, channelID, value, operator, message, log_type),
  )
}

export async function processDeleteServerLogsTrigger(server: any, triggerID: unknown): Promise<EndpointResult> {
  if (!(await server.isPremium())) {
    return forbidden({ error: 'Server is not premium' })
  }

  return ok(await server.deleteLogsTrigger(Number(triggerID)))
}
