import prisma from '@gmod/infra-prisma'
import { resolveGuildAccess } from '@gmod/domain-access/index.js'
import {
  AccessResponseSchema,
  type AccessResponse,
  type CapabilityKey,
} from '@gmod/schema/server/AccessPolicySchema.js'

/** Caller has already authorized the community/server scope; no purchaser identity is exposed. */
export async function getDashboardAccess(guildID: string, serverID?: string): Promise<AccessResponse> {
  const access = await resolveGuildAccess(guildID)
  const [servers, links, autoRoles, verificationRoles] = await Promise.all([
    prisma.gm_server.count({ where: { guild: guildID } }),
    prisma.gm_server_links.count({ where: { guild: guildID } }),
    prisma.gm_guild_auto_roles.count({ where: { guildID } }),
    prisma.gm_guild_verify_role.count({ where: { guildID } }),
  ])
  const usages: Partial<Record<CapabilityKey, number>> = {
    'guild.servers': servers,
    'guild.links': links,
    'guild.auto_roles': autoRoles,
    'verification.roles': verificationRoles,
  }
  if (serverID) {
    const [roles, nicknames, teams, filters, buttons, triggers] = await Promise.all([
      prisma.gm_server_sync_roles.count({ where: { serverID } }),
      prisma.gm_server_pseudo.count({ where: { serverID } }),
      prisma.gm_server_sync_team_roles.count({ where: { serverID } }),
      prisma.gm_server_sync_chat_filter.count({ where: { serverID } }),
      prisma.gm_status_button.count({ where: { server: serverID } }),
      prisma.gm_server_logs_triggers.count({ where: { serverID } }),
    ])
    Object.assign(usages, {
      'sync.roles.rules': roles,
      'sync.nicknames.rules': nicknames,
      'sync.teams': teams,
      'chat.filters': filters,
      'status.buttons': buttons,
      'logs.triggers': triggers,
    })
  }
  return AccessResponseSchema.parse({ ...access, usages, ...(serverID ? { serverID } : {}) })
}
