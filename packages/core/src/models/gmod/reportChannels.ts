import prisma from '@gmod/infra-prisma'
import { enqueueDiscordServerErrorsChannelValidate } from '@gmod/infra-bullmq/discordQueueAdapters.js'
import { ReportChannelRequestSchema } from '@gmod/schema/server/DashboardChannelSchema.js'

type ReportChannelSetting = 'lua_errors_channel' | 'bug_reports_channel'

export class ReportChannelError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 503,
    readonly code: string,
  ) {
    super(code)
    this.name = 'ReportChannelError'
  }
}

export async function getReportChannel(
  serverID: string,
  setting: ReportChannelSetting,
): Promise<{ channelID?: string }> {
  const row = await prisma.gm_server_settings.findUnique({
    where: { serverID_setting: { serverID, setting } },
    select: { value: true },
  })
  return row?.value && /^\d{17,20}$/.test(row.value) ? { channelID: row.value } : {}
}

export async function setReportChannel(
  serverID: string,
  setting: ReportChannelSetting,
  body: unknown,
): Promise<{ channelID: string }> {
  const parsed = ReportChannelRequestSchema.safeParse(body)
  if (!parsed.success) throw new ReportChannelError(400, 'invalid_channel')
  const { channelID } = parsed.data
  let destination
  try {
    destination = await enqueueDiscordServerErrorsChannelValidate(serverID, channelID)
  } catch {
    throw new ReportChannelError(503, 'provider_unavailable')
  }
  if (!destination.valid) {
    if (destination.reason === 'channel_not_found' || destination.reason === 'server_not_found')
      throw new ReportChannelError(404, destination.reason)
    if (destination.reason === 'unsupported_channel') throw new ReportChannelError(400, destination.reason)
    if (destination.reason === 'missing_permissions') throw new ReportChannelError(403, destination.reason)
    throw new ReportChannelError(503, 'provider_unavailable')
  }
  // Validate before replacing the destination; failures leave the previous channel intact.
  await prisma.gm_server_settings.upsert({
    where: { serverID_setting: { serverID, setting } },
    create: { serverID, setting, value: channelID },
    update: { value: channelID },
  })
  return { channelID }
}

export async function removeReportChannel(
  serverID: string,
  setting: ReportChannelSetting,
): Promise<Record<string, never>> {
  // This only removes the local binding and never needs a Discord bot or deletes a channel.
  await prisma.gm_server_settings.deleteMany({ where: { serverID, setting } })
  return {}
}
