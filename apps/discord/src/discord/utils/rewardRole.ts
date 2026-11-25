import type { DiscordRewardRoleInput } from '@gmod/schema/bullmq.js'
import { getServerFromID } from '@gmod/domain-server/Server.js'
import { getGuildClient } from '../index.js'

type Result = { status: 'delivered' | 'failed' | 'uncertain'; reason?: string }

/** Add only the frozen role of a currently authorized grant; never replace the member's roles. */
export async function deliverRewardRole(input: DiscordRewardRoleInput): Promise<Result> {
  try {
    const { authorizeDiscordRewardAction } = await import('@gmod/core/models/v6/rewards.js')
    if (!(await authorizeDiscordRewardAction(input))) return { status: 'failed', reason: 'reward_unavailable' }
    const server = await getServerFromID(input.serverID)
    if (!server) return { status: 'failed', reason: 'server_not_found' }
    const guildID = server.getGuildID()
    const client = await getGuildClient(guildID, false)
    const guild = await client.guilds.fetch({ guild: guildID, force: true })
    if (!guild || guild.id !== guildID) return { status: 'uncertain', reason: 'provider_unavailable' }
    const role = await guild.roles.fetch(input.roleID, { force: true })
    if (!role || role.id !== input.roleID || role.guild.id !== guildID || role.id === guildID || role.managed)
      return { status: 'failed', reason: 'role_unavailable' }
    const member = await guild.members.fetch({ user: input.discordID, force: true, cache: false })
    if (member.partial || member.id !== input.discordID || member.guild.id !== guildID)
      return { status: 'uncertain', reason: 'provider_unavailable' }
    // Already granted is a successful, repeatable operation after an uncertain provider response.
    if (member.roles.cache.has(input.roleID)) return { status: 'delivered' }
    await guild.members.fetchMe({ force: true })
    if (!role.editable) return { status: 'failed', reason: 'role_not_manageable' }
    if (!(await authorizeDiscordRewardAction(input))) return { status: 'failed', reason: 'reward_unavailable' }
    await member.roles.add(input.roleID, 'Gmod Integration reward')
    return { status: 'delivered' }
  } catch {
    // A provider error can occur after Discord applied the role. Rechecking is idempotent.
    return { status: 'uncertain', reason: 'provider_unavailable' }
  }
}
