import { ConfigServer } from '@gmod/config'
import prisma from '@gmod/infra-prisma'
import { isErasureBlocked } from '@gmod/domain-user/privacy.js'
import type { DiscordServerBugReportJob } from '@gmod/schema/bullmq.js'
import { EmbedBuilder } from 'discord.js'
import { resolveReportChannel } from './reportChannels.js'

const setting = 'bug_reports_channel'
const channelIDPattern = /^\d{17,20}$/
const text = (value: string, limit: number) => value.replace(/```/g, "''' ").slice(0, limit) || 'Not provided'
const screenshotPattern =
  /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_(\d{17})_[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}\.(?:jpeg|png)$/

function screenshotURL(filename: string, steamID64: string) {
  if (screenshotPattern.exec(filename)?.[1] !== steamID64) return
  try {
    const url = new URL(`/screenshots/${encodeURIComponent(filename)}`, ConfigServer.domain)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return
    return url.href
  } catch {
    return
  }
}

/** Reads current stored content and destination; never republishes deleted or erased reports. */
export async function sendBugReport(job: DiscordServerBugReportJob): Promise<void> {
  try {
    const where = { id: job.reportID, serverID: job.serverID }
    const report = await prisma.gm_server_report_bugs.findFirst({ where })
    if (!report || report.serverID !== job.serverID || report.id !== job.reportID) return
    if (await isErasureBlocked(undefined, report.steamID64)) return
    const configured = await prisma.gm_server_settings.findUnique({
      where: { serverID_setting: { serverID: job.serverID, setting } },
      select: { value: true },
    })
    if (!configured || !channelIDPattern.test(configured.value)) return
    const target = await resolveReportChannel(job.serverID, configured.value)
    if (!target.channel || !target.server) return
    const [currentBinding, current] = await Promise.all([
      prisma.gm_server_settings.findUnique({
        where: { serverID_setting: { serverID: job.serverID, setting } },
        select: { value: true },
      }),
      prisma.gm_server_report_bugs.findFirst({ where }),
    ])
    if (
      currentBinding?.value !== configured.value ||
      !current ||
      current.serverID !== job.serverID ||
      current.id !== job.reportID ||
      current.steamID64 !== report.steamID64 ||
      (await isErasureBlocked(undefined, current.steamID64))
    )
      return

    const embed = new EmbedBuilder()
      .setColor(0xf59e0b)
      .setTitle(`Bug report — ${target.server.name || target.server.id}`.slice(0, 256))
      .setDescription(`\`\`\`\n${text(current.description, 1400)}\n\`\`\``)
      .addFields(
        { name: 'Player', value: text(current.steamID64, 64), inline: true },
        { name: 'Importance', value: text(current.importance, 32), inline: true },
        { name: 'Steps to reproduce', value: `\`\`\`\n${text(current.steps, 900)}\n\`\`\`` },
        { name: 'Expected result', value: `\`\`\`\n${text(current.expected, 900)}\n\`\`\`` },
        { name: 'Actual result', value: `\`\`\`\n${text(current.actual, 900)}\n\`\`\`` },
      )
      .setFooter({ text: `Server ${target.server.id} · Report #${job.reportID}`.slice(0, 512) })
      .setTimestamp(current.createdAt)
    const image = screenshotURL(current.screenshot, current.steamID64)
    if (image) embed.setImage(image)
    await target.channel.send({ embeds: [embed], allowedMentions: { parse: [] } })
  } catch {
    // Stored reports and screenshots remain available. Never replay an uncertain Discord send.
  }
}
