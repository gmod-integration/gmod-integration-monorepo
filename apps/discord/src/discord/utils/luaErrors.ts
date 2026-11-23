import prisma from '@gmod/infra-prisma'
import { isErasureBlocked } from '@gmod/domain-user/privacy.js'
import type { DiscordServerErrorsChannelValidation, DiscordServerLuaErrorJob } from '@gmod/schema/bullmq.js'
import { ChannelType, EmbedBuilder, PermissionFlagsBits } from 'discord.js'
import { getGuildClient } from '../index.js'

const setting = 'lua_errors_channel'
const channelIDPattern = /^\d{17,20}$/
const codeIs = (error: unknown, code: number) =>
  !!error && typeof error === 'object' && 'code' in error && error.code === code

async function destination(serverID: string, channelID: string) {
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
export async function validateLuaErrorsChannel(
  serverID: string,
  channelID: string,
): Promise<DiscordServerErrorsChannelValidation> {
  try {
    return (await destination(serverID, channelID)).result
  } catch (error) {
    return {
      valid: false,
      reason: codeIs(error, 50001) || codeIs(error, 50013) ? 'missing_permissions' : 'provider_unavailable',
    }
  }
}

const codeBlock = (value: string, limit: number) => value.replace(/```/g, "''' ").slice(0, limit)

/** Reads the current destination at delivery time; removed destinations receive no queued history. */
export async function sendLuaError(job: DiscordServerLuaErrorJob): Promise<void> {
  try {
    const report = job.report
    if (await isErasureBlocked(undefined, report.steamID64)) return
    const configured = await prisma.gm_server_settings.findUnique({
      where: { serverID_setting: { serverID: job.serverID, setting } },
      select: { value: true },
    })
    if (!configured || !channelIDPattern.test(configured.value)) return
    const target = await destination(job.serverID, configured.value)
    if (!target.channel || !target.server) return
    const current = await prisma.gm_server_settings.findUnique({
      where: { serverID_setting: { serverID: job.serverID, setting } },
      select: { value: true },
    })
    if (current?.value !== configured.value || (await isErasureBlocked(undefined, report.steamID64))) return
    const source = report.realm === 'client' ? 'Player client' : 'Game server'
    const description = [
      `**Source:** ${source}`,
      `**Addon:** ${codeBlock(report.name || 'Unknown addon', 128)}`,
      `**Occurrences:** ${report.count} · **Uptime:** ${report.uptime}s`,
      '',
      '**Error**',
      '```',
      codeBlock(report.error, 1200),
      '```',
      '**Stack**',
      '```',
      codeBlock(report.stack, 2000),
      '```',
    ].join('\n')
    const embed = new EmbedBuilder()
      .setColor(0xef4444)
      .setTitle(`Lua error — ${target.server.name || target.server.id}`.slice(0, 256))
      .setDescription(description)
      .setFooter({ text: `Server ${target.server.id} · Report ${job.errorID}`.slice(0, 512) })
      .setTimestamp()
    await target.channel.send({ embeds: [embed], allowedMentions: { parse: [] } })
  } catch {
    // History has already been saved. Never replay an uncertain send or log report contents.
  }
}
