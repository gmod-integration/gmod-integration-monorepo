import type { DiscordGuildMemberRoleResult } from '@gmod/schema/bullmq.js'
import { getGuildClient } from '../index.js'

const unavailable: DiscordGuildMemberRoleResult = { available: false, hasRole: false, roleExists: false }
const codeIs = (error: unknown, code: number) =>
  !!error && typeof error === 'object' && 'code' in error && error.code === code

/** Every answer comes from fresh provider reads, never a cached membership or event's role data. */
export async function getGuildMemberRole(
  guildID: string,
  discordID: string,
  roleID: string,
): Promise<DiscordGuildMemberRoleResult> {
  try {
    const client = await getGuildClient(guildID, false)
    const guild = await client.guilds.fetch({ guild: guildID, force: true })
    if (!guild || guild.id !== guildID) return unavailable
    const role = await guild.roles.fetch(roleID, { force: true, cache: true }).catch((error: unknown) => {
      if (codeIs(error, 10011)) return null
      throw error
    })
    if (role === null) return { available: true, hasRole: false, roleExists: false }
    if (role.id !== roleID || role.guild.id !== guildID) return unavailable
    const member = await guild.members.fetch({ user: discordID, force: true, cache: false }).catch((error: unknown) => {
      if (codeIs(error, 10007)) return null
      throw error
    })
    if (member === null) return { available: true, hasRole: false, roleExists: true }
    if (member.partial || member.id !== discordID || member.guild.id !== guildID) return unavailable
    return { available: true, hasRole: member.roles.cache.has(roleID), roleExists: true }
  } catch {
    return unavailable
  }
}
