import prisma from '@gmod/infra-prisma'
import { isErasureBlocked } from '@gmod/domain-user/privacy.js'
import {
  PlayerProfileQuerySchema,
  PlayerProfileResponseSchema,
  PlayerSteamID64Schema,
  type PlayerProfileResponse,
} from '@gmod/schema/user/PlayerProfileSchema.js'

type ProfileResult = { status: 200; body: PlayerProfileResponse } | { status: 400 | 404; body: { error: string } }
const notFound = (): ProfileResult => ({ status: 404, body: { error: 'player_not_found' } })

/** The visible server records are the source of every aggregate, including dates and player names. */
export async function processGetPlayerProfile(
  viewerDiscordID: string,
  steamID64Param: unknown,
  rawQuery: unknown,
  now = new Date(),
): Promise<ProfileResult> {
  const parsedQuery = PlayerProfileQuerySchema.safeParse(rawQuery)
  if (!parsedQuery.success) return { status: 400, body: { error: 'invalid_player_profile_query' } }
  if (steamID64Param !== undefined && !PlayerSteamID64Schema.safeParse(steamID64Param).success)
    return { status: 400, body: { error: 'invalid_steam_id' } }

  const viewer = await prisma.gm_user.findUnique({
    where: { id: viewerDiscordID },
    select: { id: true, steam: true, username: true, trust: true },
  })
  if (!viewer) return notFound()
  const steamID64 = steamID64Param === undefined ? viewer.steam : (steamID64Param as string)
  if (!steamID64) return { status: 404, body: { error: 'steam_not_linked' } }
  if (!PlayerSteamID64Schema.safeParse(steamID64).success) return { status: 400, body: { error: 'invalid_steam_id' } }

  const ownProfile = viewer.steam === steamID64
  if (await isErasureBlocked(ownProfile ? viewer.id : undefined, steamID64)) return notFound()
  const linkedUser = ownProfile
    ? viewer
    : await prisma.gm_user.findFirst({ where: { steam: steamID64 }, select: { id: true, trust: true } })
  if (linkedUser && (await isErasureBlocked(linkedUser.id, steamID64))) return notFound()

  const where = { steam_id: steamID64, ...(ownProfile ? {} : { gm_server: { isPublic: true } }) }
  const { limit, offset } = parsedQuery.data
  const [storedPlayer, summary, latestVisible, records] = await Promise.all([
    ownProfile
      ? prisma.gm_user_steam.findUnique({
          where: { steam_id: steamID64 },
          select: { username: true, createdAt: true },
        })
      : null,
    prisma.gm_server_stat.aggregate({
      where,
      _count: { _all: true },
      _sum: { total_time: true, total_kill: true, total_death: true, total_connect: true },
      _min: { first_join: true },
      _max: { last_connect: true },
    }),
    prisma.gm_server_stat.findFirst({
      where,
      orderBy: [{ last_connect: 'desc' }, { server_id: 'asc' }],
      select: { name: true },
    }),
    prisma.gm_server_stat.findMany({
      where,
      orderBy: [{ last_connect: 'desc' }, { server_id: 'asc' }],
      take: limit,
      skip: offset,
      select: {
        name: true,
        rank: true,
        total_time: true,
        total_kill: true,
        total_death: true,
        total_connect: true,
        first_join: true,
        last_connect: true,
        gm_server: {
          select: {
            id: true,
            name: true,
            image: true,
            isPublic: true,
            gm_server_status: { select: { gameMode: true, map: true, updatedAt: true } },
          },
        },
      },
    }),
  ])

  // An erased account, or one with only private records, has no profile for another visitor.
  if (!ownProfile && summary._count._all === 0) return notFound()
  if (await isErasureBlocked(linkedUser?.id, steamID64)) return notFound()
  const trust = linkedUser?.trust

  const body: PlayerProfileResponse = {
    player: {
      steamID64,
      name:
        (ownProfile ? storedPlayer?.username || viewer.username : latestVisible?.name) ||
        latestVisible?.name ||
        steamID64,
      avatarURL: null,
      trustLevel: typeof trust === 'number' && Number.isInteger(trust) && trust >= 0 && trust <= 100 ? trust : null,
      registeredAt: storedPlayer?.createdAt.toISOString() ?? null,
    },
    summary: {
      servers: summary._count._all,
      totalTime: Math.max(0, summary._sum.total_time ?? 0),
      kills: Math.max(0, summary._sum.total_kill ?? 0),
      deaths: Math.max(0, summary._sum.total_death ?? 0),
      connections: Math.max(0, summary._sum.total_connect ?? 0),
      firstJoinedAt: summary._min.first_join?.toISOString() ?? null,
      lastSeenAt: summary._max.last_connect?.toISOString() ?? null,
    },
    servers: records.map((record) => {
      const server = record.gm_server
      const status = server.gm_server_status
      return {
        id: server.id,
        name: server.name || '',
        image: server.image || '',
        public: server.isPublic,
        gameMode: status?.gameMode || null,
        map: status?.map || null,
        online: !!status && status.updatedAt.getTime() >= now.getTime() - 5 * 60_000,
        playerName: record.name,
        rank: record.rank,
        totalTime: Math.max(0, record.total_time),
        kills: Math.max(0, record.total_kill),
        deaths: Math.max(0, record.total_death),
        connections: Math.max(0, record.total_connect),
        firstJoinedAt: record.first_join.toISOString(),
        lastSeenAt: record.last_connect.toISOString(),
      }
    }),
    pagination: { total: summary._count._all, limit, offset },
  }
  return { status: 200, body: PlayerProfileResponseSchema.parse(body) }
}
