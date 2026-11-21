import prisma from '@gmod/infra-prisma'
import redis from '@gmod/infra-redis'
import type { Server } from '@gmod/domain-server/Server.js'
import type { Guild } from '@gmod/domain-guild/Guild.js'
import { assertCapability, assertQuota, resolveGuildAccess } from '@gmod/domain-access/index.js'
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

/** Legacy empty forms and complete dashboard forms share authorization and atomic quotas. */
export async function createDashboardServerEntity(
  server: Server,
  kind: 'role' | 'team' | 'pseudo' | 'chatFilter',
  input: unknown,
  roleID?: string,
  legacy = false,
): Promise<Result> {
  if (kind === 'role') {
    const parsed = DashboardRoleSchema.safeParse(input)
    if ((!legacy && !parsed.success) || !roleID) return invalid()
    const data = parsed.success ? parsed.data : { userGroup: '', enable: false }
    const access = await resolveGuildAccess(server.guild)
    return prisma.$transaction(async (tx) => {
      await tx.gm_server.update({ where: { id: server.id }, data: { updatedAt: new Date() } })
      assertQuota(access, 'sync.roles.rules', await tx.gm_server_sync_roles.count({ where: { serverID: server.id } }))
      return {
        status: 200,
        body: await tx.gm_server_sync_roles.create({ data: { serverID: server.id, roleID, ...data } }),
      }
    })
  }
  if (kind === 'team') {
    const parsed = DashboardTeamSchema.safeParse(input)
    if ((!legacy && !parsed.success) || !roleID) return invalid()
    const data = parsed.success ? parsed.data : { teamName: '', enable: false }
    const access = await resolveGuildAccess(server.guild)
    assertCapability(access, 'sync.teams')
    return prisma.$transaction(async (tx) => {
      await tx.gm_server.update({ where: { id: server.id }, data: { updatedAt: new Date() } })
      assertQuota(access, 'sync.teams', await tx.gm_server_sync_team_roles.count({ where: { serverID: server.id } }))
      return {
        status: 200,
        body: await tx.gm_server_sync_team_roles.create({ data: { serverID: server.id, roleID, ...data } }),
      }
    })
  }
  if (kind === 'pseudo') {
    const parsed = DashboardPseudoSchema.safeParse(input)
    if (!legacy && !parsed.success) return invalid()
    const data = parsed.success ? parsed.data : { role: '', name: '', prefix: '', enabled: false }
    const access = await resolveGuildAccess(server.guild)
    return prisma.$transaction(async (tx) => {
      await tx.gm_server.update({ where: { id: server.id }, data: { updatedAt: new Date() } })
      assertQuota(access, 'sync.nicknames.rules', await tx.gm_server_pseudo.count({ where: { serverID: server.id } }))
      return { status: 200, body: await tx.gm_server_pseudo.create({ data: { serverID: server.id, ...data } }) }
    })
  }
  const parsed = DashboardChatFilterSchema.safeParse(input)
  if (!legacy && !parsed.success) return invalid()
  const access = await resolveGuildAccess(server.guild)
  assertCapability(access, 'chat.filters')
  const data = parsed.success
    ? parsed.data
    : {
        element: 'message' as const,
        operator: 'startWith' as const,
        trigger: '',
        action: 'block' as const,
        active: false,
      }
  const body = await prisma.gm_server_sync_chat_filter.create({ data: { serverID: server.id, ...data } })
  // The row is durable; a transient cache failure must not invite duplicate creation.
  try {
    await redis.del(`server:${server.id}:gmodToDiscordFilter`)
  } catch {
    /* Cache expires after 60 seconds. */
  }
  return { status: 200, body }
}

export async function createDashboardLink(guild: Guild, input: unknown, legacy = false): Promise<Result> {
  const parsed = DashboardLinkSchema.safeParse(input)
  if (!legacy && !parsed.success) return invalid()
  const access = await resolveGuildAccess(guild.id)
  const data = parsed.success ? parsed.data : { alias: 'Example', url: 'https://example.com', active: false }
  return prisma.$transaction(async (tx) => {
    await tx.gm_guild.update({ where: { guild: guild.id }, data: { updatedAt: new Date() } })
    assertQuota(access, 'guild.links', await tx.gm_server_links.count({ where: { guild: guild.id } }))
    return { status: 200, body: await tx.gm_server_links.create({ data: { guild: guild.id, ...data } }) }
  })
}

export async function createDashboardVerificationRole(
  guild: Guild,
  roleID: string,
  input: unknown,
  legacy = false,
): Promise<Result> {
  const parsed = DashboardVerificationRoleSchema.safeParse(input)
  if (!legacy && !parsed.success) return invalid()
  const access = await resolveGuildAccess(guild.id)
  const data = parsed.success ? parsed.data : { isGiveRole: true, enabled: false }
  return prisma.$transaction(async (tx) => {
    await tx.gm_guild.update({ where: { guild: guild.id }, data: { updatedAt: new Date() } })
    const existing = await tx.gm_guild_verify_role.findFirst({ where: { guildID: guild.id, roleID } })
    if (existing) return { status: 409, body: { error: 'role already exists' } }
    assertQuota(access, 'verification.roles', await tx.gm_guild_verify_role.count({ where: { guildID: guild.id } }))
    return { status: 200, body: await tx.gm_guild_verify_role.create({ data: { guildID: guild.id, roleID, ...data } }) }
  })
}
