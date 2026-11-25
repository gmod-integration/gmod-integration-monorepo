import prisma from '@gmod/infra-prisma'
import { isErasureBlocked } from '@gmod/domain-user/privacy.js'
import type { DiscordServerLuaErrorJob } from '@gmod/schema/bullmq.js'
import { EmbedBuilder } from 'discord.js'
import { resolveReportChannel, validateReportChannel } from './reportChannels.js'

const setting = 'lua_errors_channel'
const channelIDPattern = /^\d{17,20}$/
export const validateLuaErrorsChannel = validateReportChannel

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
    const target = await resolveReportChannel(job.serverID, configured.value)
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
