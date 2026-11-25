import prisma from '@gmod/infra-prisma'
import { enqueueDiscordGuildMemberRole } from '@gmod/infra-bullmq/discordQueueAdapters.js'
import { wsSendToServerQueue } from '@gmod/infra-websocket/queues.js'
import { PlayerAccessRefreshCommandSchema } from '@gmod/schema/gmod/AddonTransportSchema.js'
import type { Server } from './Server.js'

export class PlayerAccessUnavailableError extends Error {
  readonly code = 'provider_unavailable'
  readonly status = 503

  constructor() {
    super('Whitelist access verification is temporarily unavailable.')
    this.name = 'PlayerAccessUnavailableError'
  }
}

/** Manual grants remain stored separately; role membership never writes a manual exception. */
export async function getServerPlayerAccess(server: Pick<Server, 'id' | 'guild' | 'getPlayerStats'>, steamID: string) {
  try {
    const stats = await server.getPlayerStats(steamID)
    const snapshot = { ...stats, bypassMaintenance: stats?.bypassMaintenance === true, discordAdmin: false }
    if (snapshot.bypassMaintenance) return snapshot

    // Authorization reads the durable setting and link, rather than their presentation caches.
    const setting = await prisma.gm_server_settings.findUnique({
      where: { serverID_setting: { serverID: server.id, setting: 'maintenance_whitelist_role' } },
      select: { value: true },
    })
    const roleID = setting?.value ?? ''
    if (!roleID) return snapshot
    if (!/^\d{17,20}$/.test(roleID)) throw new PlayerAccessUnavailableError()
    if (!/^\d{17}$/.test(steamID)) return snapshot
    const linked = await prisma.gm_user.findFirst({ where: { steam: steamID }, select: { id: true } })
    if (!linked) return snapshot
    let membership: Awaited<ReturnType<typeof enqueueDiscordGuildMemberRole>> | undefined
    try {
      membership = await enqueueDiscordGuildMemberRole(server.guild, linked.id, roleID)
    } catch {
      // A manual grant made during a provider failure still authorizes the player.
    }
    const currentStats = await server.getPlayerStats(steamID)
    const current = {
      ...currentStats,
      bypassMaintenance: currentStats?.bypassMaintenance === true,
      discordAdmin: false,
    }
    if (current.bypassMaintenance) return current
    if (!membership?.available) throw new PlayerAccessUnavailableError()
    const [currentSetting, currentLink] = await Promise.all([
      prisma.gm_server_settings.findUnique({
        where: { serverID_setting: { serverID: server.id, setting: 'maintenance_whitelist_role' } },
        select: { value: true },
      }),
      prisma.gm_user.findFirst({ where: { steam: steamID }, select: { id: true } }),
    ])
    // A provider request can outlive a configuration/link edit. Ask again rather than apply an obsolete decision.
    if (currentSetting?.value !== roleID || currentLink?.id !== linked.id) throw new PlayerAccessUnavailableError()
    return { ...current, bypassMaintenance: membership.roleExists && membership.hasRole }
  } catch {
    throw new PlayerAccessUnavailableError()
  }
}

/** Invalidates game-side decisions; the game fetches current authorization before acting. */
export async function refreshServerPlayerAccess(serverID: string, steamID?: string): Promise<boolean> {
  const data = PlayerAccessRefreshCommandSchema.parse({
    method: 'wsRefreshPlayerAccess',
    ...(steamID !== undefined ? { steamID } : {}),
  })
  try {
    await wsSendToServerQueue.add(
      'wsSendToServer',
      { id: serverID, data },
      { removeOnComplete: true, removeOnFail: true },
    )
    return true
  } catch {
    return false
  }
}
