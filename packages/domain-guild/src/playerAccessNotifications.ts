import prisma from '@gmod/infra-prisma'
import { getUserFromDiscordID } from '@gmod/domain-user/User.js'
import { wsSendToServerQueue } from '@gmod/infra-websocket/queues.js'

const setting = 'maintenance_whitelist_role'

async function notify(serverIDs: string[], steamID?: string) {
  await Promise.allSettled(
    [...new Set(serverIDs)].map((id) =>
      wsSendToServerQueue.add(
        'wsSendToServer',
        {
          id,
          data: { method: 'wsRefreshPlayerAccess', ...(steamID ? { steamID } : {}) },
        },
        { removeOnComplete: true, removeOnFail: true, attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
      ),
    ),
  )
}

/** An invalidation asks the authenticated addon to recheck; it never supplies a positive grant. */
export async function refreshGuildMemberPlayerAccess(guildID: string, discordID: string) {
  const settings = await prisma.gm_server_settings.findMany({
    where: { setting, value: { not: '' }, gm_server: { guild: guildID } },
    select: { serverID: true },
  })
  if (!settings.length) return
  const user = await getUserFromDiscordID(discordID)
  const steamID = user?.getSteamID64()
  if (!steamID || !/^\d{17}$/.test(steamID)) return
  await notify(
    settings.map((row) => row.serverID),
    steamID,
  )
}

export async function refreshGuildRolePlayerAccess(guildID: string, roleID: string) {
  const settings = await prisma.gm_server_settings.findMany({
    where: { setting, value: roleID, gm_server: { guild: guildID } },
    select: { serverID: true },
  })
  await notify(settings.map((row) => row.serverID))
}
