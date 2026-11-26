import prisma from '@gmod/infra-prisma'
import type { DashboardAccessDenial } from '@gmod/schema/user/DashboardAccessSchema.js'
import type { DiscordGuild, PanelUser } from './PanelUser.js'
import { isErasureBlocked } from './privacy.js'

type Panel = Pick<PanelUser, 'discordID' | 'findGuilds'>
type Options = { fresh?: boolean; serverID?: string; permissionScope?: object }
type ServerScope = { id: string; guild: string }
export type DashboardAccessDecision = { allowed: true } | DashboardAccessDenial

function discordAdministrator(guild: DiscordGuild): boolean {
  const permissions = guild.permissions
  if (!(
    (typeof permissions === 'string' && /^\d+$/.test(permissions)) ||
    (typeof permissions === 'number' && Number.isSafeInteger(permissions) && permissions >= 0)
  ))
    return false
  // The primitive guards above allow only decimal strings or safe nonnegative integers.
  return (BigInt(permissions) & 8n) === 8n
}

async function linkedSteam(discordID: string): Promise<string | null> {
  const user = await prisma.gm_user.findUnique({ where: { id: discordID }, select: { steam: true } })
  const steam = user?.steam
  if (!steam || !/^\d{17}$/.test(steam) || (await isErasureBlocked(discordID, steam))) return null
  return steam
}

async function purchasedGuilds(steamID: string | null): Promise<Set<string>> {
  if (!steamID) return new Set()
  const purchases = await prisma.gm_gmodstore_purchases.findMany({
    where: { steamID64: steamID, revoke: false, guild: { not: '' } },
    select: { steamID64: true, guild: true, revoke: true },
  })
  return new Set(
    purchases.filter((row) => row.steamID64 === steamID && row.revoke === false && !!row.guild).map((row) => row.guild),
  )
}

function allowedRanks(value: string | undefined): Record<string, unknown> {
  if (value === undefined) return { superadmin: true }
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** These are the last ranks reported by the addon, including offline players; no presence is required. */
async function permittedServers(servers: ServerScope[], steamID: string | null): Promise<Set<string>> {
  if (!steamID || servers.length === 0) return new Set()
  const ids = servers.map((server) => server.id)
  const [players, settings] = await Promise.all([
    prisma.gm_server_stat.findMany({
      where: { steam_id: steamID, server_id: { in: ids } },
      select: { server_id: true, rank: true },
    }),
    prisma.gm_server_settings.findMany({
      where: { serverID: { in: ids }, setting: 'ig_adminRank' },
      select: { serverID: true, value: true },
    }),
  ])
  const configured = new Map(settings.map((setting) => [setting.serverID, allowedRanks(setting.value)]))
  return new Set(
    players
      .filter((player) => {
        const ranks = configured.get(player.server_id) ?? allowedRanks(undefined)
        return Object.prototype.hasOwnProperty.call(ranks, player.rank) && ranks[player.rank] === true
      })
      .map((player) => player.server_id),
  )
}

/** Durable identity, purchase, rank and configuration reads are never cached for authorization. */
export async function resolveDashboardAccess(
  panel: Panel,
  guildID: string,
  options: Options = {},
): Promise<DashboardAccessDecision> {
  if (!guildID || (await isErasureBlocked(panel.discordID))) return { allowed: false, reason: 'scope_unavailable' }
  let target: ServerScope | null = null
  if (options.serverID !== undefined) {
    target = await prisma.gm_server.findUnique({ where: { id: options.serverID }, select: { id: true, guild: true } })
    if (!target || target.guild !== guildID) return { allowed: false, reason: 'scope_unavailable' }
  }
  const steam = await linkedSteam(panel.discordID)
  if ((await purchasedGuilds(steam)).has(guildID)) return { allowed: true }
  const guild = (
    await panel.findGuilds({
      fresh: options.fresh,
      ...(options.permissionScope ? { requestScope: options.permissionScope } : {}),
    })
  ).find((row) => row.id === guildID)
  if (!guild) return { allowed: false, reason: 'discord_admin_required' }
  if (options.serverID !== undefined) {
    target = await prisma.gm_server.findUnique({ where: { id: options.serverID }, select: { id: true, guild: true } })
    if (!target || target.guild !== guildID) return { allowed: false, reason: 'scope_unavailable' }
  }
  if (guild.owner === true) return { allowed: true }
  if (!discordAdministrator(guild)) return { allowed: false, reason: 'discord_admin_required' }
  // Discord lookups can overlap a Steam relink; resolve the current identity again afterwards.
  const currentSteam = await linkedSteam(panel.discordID)
  if (!currentSteam) return { allowed: false, reason: 'steam_link_required' }
  const servers = target
    ? [target]
    : await prisma.gm_server.findMany({ where: { guild: guildID }, select: { id: true, guild: true } })
  return (await permittedServers(servers, currentSteam)).size > 0
    ? { allowed: true }
    : { allowed: false, reason: 'game_admin_required' }
}

/** Preserve the boolean contract for discovery, socket delivery and existing guards. */
export async function canAccessDashboardGuild(panel: Panel, guildID: string, options: Options = {}): Promise<boolean> {
  return (await resolveDashboardAccess(panel, guildID, options)).allowed
}

/** Discover owner/admin scopes plus purchases belonging to the currently linked Steam identity. */
export async function findDashboardGuilds(panel: Panel, options: { fresh?: boolean } = {}): Promise<DiscordGuild[]> {
  if (await isErasureBlocked(panel.discordID)) return []
  let guilds: DiscordGuild[] = []
  let providerError: unknown
  try {
    guilds = await panel.findGuilds({ fresh: options.fresh })
  } catch (error) {
    providerError = error
  }
  const steam = await linkedSteam(panel.discordID)
  const purchases = await purchasedGuilds(steam)
  if (providerError && purchases.size === 0) throw providerError
  const owners = new Set(guilds.filter((guild) => guild.owner === true).map((guild) => guild.id))
  const admins = guilds.filter(
    (guild) => !owners.has(guild.id) && !purchases.has(guild.id) && discordAdministrator(guild),
  )
  const servers =
    steam && admins.length
      ? await prisma.gm_server.findMany({
          where: { guild: { in: admins.map((guild) => guild.id) } },
          select: { id: true, guild: true },
        })
      : []
  const authorizedServers = await permittedServers(servers, steam)
  const authorized = new Set([
    ...owners,
    ...purchases,
    ...servers.filter((server) => authorizedServers.has(server.id)).map((server) => server.guild),
  ])
  const result = new Map(guilds.filter((guild) => authorized.has(guild.id)).map((guild) => [guild.id, guild]))
  const missing = [...purchases].filter((guildID) => !result.has(guildID))
  if (missing.length) {
    const stored = await prisma.gm_guild.findMany({
      where: { guild: { in: missing } },
      select: { guild: true, name: true },
    })
    const names = new Map(stored.map((guild) => [guild.guild, guild.name]))
    for (const id of missing) result.set(id, { id, name: names.get(id) || undefined, owner: false, permissions: '0' })
  }
  return [...result.values()]
}
