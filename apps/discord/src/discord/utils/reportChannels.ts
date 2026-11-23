import prisma from '@gmod/infra-prisma'
import type { DiscordServerErrorsChannelValidation } from '@gmod/schema/bullmq.js'
import { ChannelType, PermissionFlagsBits } from 'discord.js'
import { getGuildClient } from '../index.js'

const codeIs = (error: unknown, code: number) =>
  !!error && typeof error === 'object' && 'code' in error && error.code === code

export async function resolveReportChannel(serverID: string, channelID: string) {
  const server = await prisma.gm_server.findUnique({
    where: { id: serverID },
    select: { id: true, guild: true, name: true },
  })
  if (!server) return { result: { valid: false, reason: 'server_not_found' } as const }
  const client = await getGuildClient(server.guild, false)
  const guild = await client.guilds.fetch({ guild: server.guild, force: true })
  if (!guild || guild.id !== server.guild) return { result: { valid: false, reason: 'provider_unavailable' } as const }
  const channel = await guild.channels.fetch(channelID, { force: true, cache: false }).catch((error: unknown) => {
    if (codeIs(error, 10003)) return null
    throw error
  })
  if (!channel || channel.id !== channelID || channel.guild.id !== server.guild)
    return { result: { valid: false, reason: 'channel_not_found' } as const }
  if (channel.type !== ChannelType.GuildText)
    return { result: { valid: false, reason: 'unsupported_channel' } as const }
  // Both role permissions and the bot's own role membership may change independently of the channel.
  await guild.roles.fetch()
  const member = await guild.members.fetchMe({ force: true })
  if (
    member.guild.id !== server.guild ||
    member.id !== client.user?.id ||
    !channel
      .permissionsFor(member)
      ?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])
  )
    return { result: { valid: false, reason: 'missing_permissions' } as const }
  return { result: { valid: true } as const, channel, server }
}

/** Provider details and credentials must never be returned by a configuration failure. */
export async function validateReportChannel(
  serverID: string,
  channelID: string,
): Promise<DiscordServerErrorsChannelValidation> {
  try {
    return (await resolveReportChannel(serverID, channelID)).result
  } catch (error) {
    return {
      valid: false,
      reason: codeIs(error, 50001) || codeIs(error, 50013) ? 'missing_permissions' : 'provider_unavailable',
    }
  }
}
