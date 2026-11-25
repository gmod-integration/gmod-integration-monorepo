import prisma from '@gmod/infra-prisma'

/** Administrative account selection never discloses an existing session credential. */
export async function getAllActivePanelUsers() {
  const now = new Date()
  const sessions = await prisma.gm_panelToken.findMany({
    where: {
      revoke: false,
      actorDiscordID: null,
      expirationDate: { gt: now },
      OR: [{ absoluteExpiresAt: null }, { absoluteExpiresAt: { gt: now } }],
    },
    select: { discordID: true, lastSeenAt: true, creationDate: true },
    orderBy: { createdAt: 'desc' },
  })
  const latest = new Map<string, (typeof sessions)[number]>()
  for (const session of sessions) {
    const previous = latest.get(session.discordID)
    if (!previous || (session.lastSeenAt || session.creationDate) > (previous.lastSeenAt || previous.creationDate))
      latest.set(session.discordID, session)
  }
  const accounts = [...latest.values()]
  if (!accounts.length) return []
  const users = await prisma.gm_user.findMany({
    where: { id: { in: accounts.map((session) => session.discordID) } },
    select: { id: true, username: true },
  })
  const names = new Map(users.map((user) => [user.id, user.username]))
  return accounts
    .filter((session) => names.has(session.discordID))
    .map((session) => ({
      discordID: session.discordID,
      username: names.get(session.discordID),
      lastSeenAt: (session.lastSeenAt || session.creationDate).toISOString(),
    }))
}
