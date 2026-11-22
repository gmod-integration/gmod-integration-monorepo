import prisma from '@gmod/infra-prisma'
import { Prisma } from '@gmod/infra-prisma/client.js'

const VOTE_COOLDOWN_MS = 3 * 60 * 60 * 1000
export type CommunityVoteResult =
  { status: 'not_found' } | { status: 'cooldown'; retryAfterSeconds: number } | { status: 'voted' }

/** Serialize cooldown checks and writes across Discord replicas using the existing server row. */
export async function registerCommunityServerVote(
  serverID: string,
  guildID: string,
  userID: string,
): Promise<CommunityVoteResult> {
  return prisma.$transaction(async (store) => {
    const server = await store.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id FROM gm_server WHERE id = ${serverID} AND guild = ${guildID} FOR UPDATE`,
    )
    if (!server.length) return { status: 'not_found' }
    const lastVote = await store.gm_server_vote.findFirst({
      where: { serverID, userID },
      orderBy: { createdAt: 'desc' },
    })
    const now = Date.now()
    if (lastVote) {
      const nextVoteAt = lastVote.createdAt.getTime() + VOTE_COOLDOWN_MS
      if (nextVoteAt > now) return { status: 'cooldown', retryAfterSeconds: Math.ceil((nextVoteAt - now) / 1000) }
    }
    await store.gm_server_vote.create({ data: { serverID, userID } })
    return { status: 'voted' }
  })
}
