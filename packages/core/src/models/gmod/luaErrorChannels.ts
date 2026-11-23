import prisma from '@gmod/infra-prisma'
import { enqueueDiscordServerErrorsChannelValidate } from '@gmod/infra-bullmq/discordQueueAdapters.js'
import { LuaErrorChannelRequestSchema } from '@gmod/schema/server/DashboardChannelSchema.js'

const setting = 'lua_errors_channel'

export class LuaErrorChannelError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 503,
    readonly code: string,
  ) {
    super(code)
    this.name = 'LuaErrorChannelError'
  }
}

export async function getLuaErrorChannel(serverID: string): Promise<{ channelID?: string }> {
  const row = await prisma.gm_server_settings.findUnique({
    where: { serverID_setting: { serverID, setting } },
    select: { value: true },
  })
  return row?.value && /^\d{17,20}$/.test(row.value) ? { channelID: row.value } : {}
}

export async function setLuaErrorChannel(serverID: string, body: unknown): Promise<{ channelID: string }> {
  const parsed = LuaErrorChannelRequestSchema.safeParse(body)
  if (!parsed.success) throw new LuaErrorChannelError(400, 'invalid_channel')
  const { channelID } = parsed.data
  let destination
  try {
    destination = await enqueueDiscordServerErrorsChannelValidate(serverID, channelID)
  } catch {
    throw new LuaErrorChannelError(503, 'provider_unavailable')
  }
  if (!destination.valid) {
    if (destination.reason === 'channel_not_found' || destination.reason === 'server_not_found')
      throw new LuaErrorChannelError(404, destination.reason)
    if (destination.reason === 'unsupported_channel') throw new LuaErrorChannelError(400, destination.reason)
    if (destination.reason === 'missing_permissions') throw new LuaErrorChannelError(403, destination.reason)
    throw new LuaErrorChannelError(503, 'provider_unavailable')
  }
  // Validate before replacing the destination; failures leave the previous channel intact.
  await prisma.gm_server_settings.upsert({
    where: { serverID_setting: { serverID, setting } },
    create: { serverID, setting, value: channelID },
    update: { value: channelID },
  })
  return { channelID }
}

export async function removeLuaErrorChannel(serverID: string): Promise<Record<string, never>> {
  // This only removes the local binding and never needs a Discord bot or deletes a channel.
  await prisma.gm_server_settings.deleteMany({ where: { serverID, setting } })
  return {}
}
