import prisma from '@gmod/infra-prisma'

const running = new Map<string, Promise<void>>()
let lastWarning = 0
function unavailable() {
  if (Date.now() - lastWarning < 60_000) return
  lastWarning = Date.now()
  console.warn('Rewards evaluation is temporarily unavailable; pending rewards will be reconciled later.')
}

/** Source events stay successful if rewards are unavailable; the addon also reconciles durable facts. */
export function notifyPlayerRewards(serverID: string, steamID64: string): Promise<void> {
  const key = `${serverID}:${steamID64}`
  const existing = running.get(key)
  if (existing) return existing
  if (running.size >= 1024) return Promise.resolve()
  const operation = (async () => {
    const rewards = await import('./rewards.js')
    await rewards.reconcilePlayerRewards(serverID, steamID64)
    await rewards.processPendingDiscordRewards(serverID)
  })()
    .catch(unavailable)
    .finally(() => running.delete(key))
  running.set(key, operation)
  return operation
}

export async function notifyVoteRewards(serverID: string, discordID: string): Promise<void> {
  try {
    const user = await prisma.gm_user.findUnique({ where: { id: discordID }, select: { steam: true } })
    if (user?.steam) await notifyPlayerRewards(serverID, user.steam)
  } catch {
    unavailable()
  }
}

export async function notifyVerifiedRewards(guildID: string, steamID64: string): Promise<void> {
  try {
    const servers = await prisma.gm_server.findMany({ where: { guild: guildID }, select: { id: true }, take: 1000 })
    // Bound simultaneous work when one community owns many game servers.
    for (let offset = 0; offset < servers.length; offset += 4)
      await Promise.all(servers.slice(offset, offset + 4).map((server) => notifyPlayerRewards(server.id, steamID64)))
  } catch {
    unavailable()
  }
}
