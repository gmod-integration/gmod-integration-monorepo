import prisma from '@gmod/infra-prisma'
import redis from '@gmod/infra-redis'
import { wsSendToServerQueue } from '@gmod/infra-websocket/queues.js'
import type { Server } from '@gmod/domain-server/Server.js'
import type { Guild } from '@gmod/domain-guild/Guild.js'
import {
  ServerDashboardSettingsSchema,
  GuildDashboardSettingsSchema,
} from '@gmod/schema/server/DashboardSettingsSchema.js'

export class SettingsPermissionError extends Error {
  readonly code = 'settings_forbidden'
}

const encoded = (value: unknown) =>
  typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)
function checkStorage(settings: Record<string, unknown>) {
  if (Object.values(settings).some((value) => encoded(value).length > 255))
    throw new Error('A setting exceeds its storage limit')
}

export async function saveServerDashboardSettings(server: Server, input: unknown) {
  const settings = ServerDashboardSettingsSchema.parse(input)
  checkStorage(settings)
  if (
    !(await server.isPremium()) &&
    ((settings.sync_role_direction !== undefined && settings.sync_role_direction !== 'gmod-to-discord') ||
      (settings.sync_pseudo_direction !== undefined &&
        !['gmod-to-discord', 'disable'].includes(settings.sync_pseudo_direction)) ||
      (settings.syncChatDirection !== undefined && settings.syncChatDirection !== 'gmodToDiscord') ||
      settings.chat_sync_relay_all !== undefined)
  )
    throw new SettingsPermissionError('A premium entitlement is required for these settings.')
  // Commit every validated value before dispatching external updates.
  await prisma.$transaction(async (tx) => {
    for (const [setting, value] of Object.entries(settings))
      await tx.gm_server_settings.upsert({
        where: { serverID_setting: { serverID: server.id, setting } },
        create: { serverID: server.id, setting, value: encoded(value) },
        update: { value: encoded(value) },
      })
  })
  let sync: 'applied' | 'pending' = 'applied'
  try {
    const keys = Object.keys(settings).map((setting) => `server:${server.id}:setting:${setting}`)
    if (keys.length) await redis.del(...keys)
    for (const [setting, value] of Object.entries(settings)) {
      if (setting.startsWith('ig_')) {
        // Enqueueing does not acknowledge application by the game server.
        sync = 'pending'
        await wsSendToServerQueue.add('wsSendToServer', {
          id: server.id,
          data: { method: 'wsEditSetting', setting, value: encoded(value) },
        })
      }
    }
  } catch {
    sync = 'pending'
  }
  return { settings, sync }
}

export async function saveGuildDashboardSettings(guild: Guild, input: unknown) {
  const settings = GuildDashboardSettingsSchema.parse(input)
  if (!(await guild.isPremium()))
    throw new SettingsPermissionError('A premium entitlement is required for these settings.')
  await prisma.$transaction(async (tx) => {
    for (const [setting, value] of Object.entries(settings))
      await tx.gm_guild_settings.upsert({
        where: { guildID_setting: { guildID: guild.id, setting } },
        create: { guildID: guild.id, setting, value: encoded(value) },
        update: { value: encoded(value) },
      })
  })
  let sync: 'applied' | 'pending' = 'applied'
  try {
    await redis.del(...Object.keys(settings).map((setting) => `server:${guild.id}:setting:${setting}`))
  } catch {
    sync = 'pending'
  }
  return { settings, sync }
}
