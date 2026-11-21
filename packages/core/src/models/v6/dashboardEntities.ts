import prisma from '@gmod/infra-prisma'
import redis from '@gmod/infra-redis'
import type { Server } from '@gmod/domain-server/Server.js'
import type { Guild } from '@gmod/domain-guild/Guild.js'
import {
  DashboardLinkSchema,
  DashboardRoleSchema,
  DashboardTeamSchema,
  DashboardPseudoSchema,
  DashboardChatFilterSchema,
  DashboardVerificationRoleSchema,
} from '@gmod/schema/server/DashboardEntitiesSchema.js'

type Result = { status: number; body: unknown }
const invalid = (): Result => ({ status: 400, body: { error: 'invalid_values' } })
const limit = (): Result => ({ status: 403, body: { error: 'limit_reached' } })

/** Creation receives the same complete value set as editing; there is no placeholder row. */
export async function createDashboardServerEntity(
  server: Server,
  kind: 'role' | 'team' | 'pseudo' | 'chatFilter',
  input: unknown,
  roleID?: string,
): Promise<Result> {
  const premium = await server.isPremium()
  if (kind === 'role') {
    const parsed = DashboardRoleSchema.safeParse(input)
    if (!parsed.success || !roleID) return invalid()
    return prisma.$transaction(async (tx) => {
      // Lock the aggregate before counting, so concurrent requests cannot share the last free slot.
      await tx.gm_server.update({ where: { id: server.id }, data: { updatedAt: new Date() } })
      if (!premium && (await tx.gm_server_sync_roles.count({ where: { serverID: server.id } })) >= 3) return limit()
      return {
        status: 200,
        body: await tx.gm_server_sync_roles.create({ data: { serverID: server.id, roleID, ...parsed.data } }),
      }
    })
  }
  if (kind === 'team') {
    const parsed = DashboardTeamSchema.safeParse(input)
    if (!parsed.success || !roleID) return invalid()
    return prisma.$transaction(async (tx) => {
      // Lock the aggregate before counting, so concurrent requests cannot share the last free slot.
      await tx.gm_server.update({ where: { id: server.id }, data: { updatedAt: new Date() } })
      if (!premium && (await tx.gm_server_sync_team_roles.count({ where: { serverID: server.id } })) >= 3)
        return limit()
      return {
        status: 200,
        body: await tx.gm_server_sync_team_roles.create({ data: { serverID: server.id, roleID, ...parsed.data } }),
      }
    })
  }
  if (kind === 'pseudo') {
    const parsed = DashboardPseudoSchema.safeParse(input)
    if (!parsed.success) return invalid()
    return prisma.$transaction(async (tx) => {
      // Lock the aggregate before counting, so concurrent requests cannot share the last free slot.
      await tx.gm_server.update({ where: { id: server.id }, data: { updatedAt: new Date() } })
      if (!premium && (await tx.gm_server_pseudo.count({ where: { serverID: server.id } })) >= 3) return limit()
      return { status: 200, body: await tx.gm_server_pseudo.create({ data: { serverID: server.id, ...parsed.data } }) }
    })
  }
  const parsed = DashboardChatFilterSchema.safeParse(input)
  if (!parsed.success) return invalid()
  if (!premium) return limit()
  const body = await prisma.gm_server_sync_chat_filter.create({ data: { serverID: server.id, ...parsed.data } })
  // The row is committed. A cache outage must not turn retry into a second creation;
  // this cache expires after 60 seconds even if invalidation is temporarily unavailable.
  try {
    await redis.del(`server:${server.id}:gmodToDiscordFilter`)
  } catch {
    /* Redis TTL provides recovery. */
  }
  return { status: 200, body }
}

export async function createDashboardLink(guild: Guild, input: unknown): Promise<Result> {
  const parsed = DashboardLinkSchema.safeParse(input)
  if (!parsed.success) return invalid()
  return { status: 200, body: await prisma.gm_server_links.create({ data: { guild: guild.id, ...parsed.data } }) }
}

export async function createDashboardVerificationRole(guild: Guild, roleID: string, input: unknown): Promise<Result> {
  const parsed = DashboardVerificationRoleSchema.safeParse(input)
  if (!parsed.success) return invalid()
  return {
    status: 200,
    body: await prisma.gm_guild_verify_role.create({ data: { guildID: guild.id, roleID, ...parsed.data } }),
  }
}
