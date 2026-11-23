import prisma from '@gmod/infra-prisma'
import { isErasureBlocked } from '@gmod/domain-user/privacy.js'
import {
  PlayerProfileQuerySchema,
  PlayerProfileResponseSchema,
  PlayerDiscordIDSchema,
  PlayerIdentifierSchema,
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
  provider: 'auto' | 'steam' | 'discord' = 'auto',
): Promise<ProfileResult> {
  const parsedQuery = PlayerProfileQuerySchema.safeParse(rawQuery)
  if (!parsedQuery.success) return { status: 400, body: { error: 'invalid_player_profile_query' } }
  const identifierSchema = provider === 'steam' ? PlayerSteamID64Schema : PlayerIdentifierSchema
  if (steamID64Param !== undefined && !identifierSchema.safeParse(steamID64Param).success)
    return {
      status: 400,
      body: { error: provider === 'steam' ? 'invalid_steam_id' : 'invalid_player_id' },
    }

  const viewer = await prisma.gm_user.findUnique({
    where: { id: viewerDiscordID },
    select: { id: true, steam: true, username: true, trust: true },
  })
  if (!viewer) return notFound()
  let steamID64: string | null | undefined
  let linkedUser: { id: string; trust: number | null } | null = null
  if (steamID64Param === undefined || (provider !== 'steam' && steamID64Param === viewer.id)) {
    steamID64 = viewer.steam
    linkedUser = viewer
  } else if (provider !== 'discord' && steamID64Param === viewer.steam) {
    steamID64 = viewer.steam
    linkedUser = viewer
  } else {
    const target = steamID64Param as string
    const discordUser =
      provider !== 'steam'
        ? await prisma.gm_user.findUnique({
            where: { id: target },
            select: { id: true, steam: true, trust: true },
          })
        : null
    if (discordUser) {
      linkedUser = discordUser
      steamID64 = discordUser.steam
    } else if (provider === 'discord' || !PlayerSteamID64Schema.safeParse(target).success) {
      return notFound()
    } else {
      steamID64 = target
    }
  }
  if (!steamID64)
    return steamID64Param === undefined ? { status: 404, body: { error: 'steam_not_linked' } } : notFound()
  if (!PlayerSteamID64Schema.safeParse(steamID64).success) return { status: 400, body: { error: 'invalid_steam_id' } }

  const ownProfile = viewer.steam === steamID64
  if (await isErasureBlocked(ownProfile ? viewer.id : linkedUser?.id, steamID64)) return notFound()
  linkedUser ||= ownProfile
    ? viewer
    : await prisma.gm_user.findFirst({ where: { steam: steamID64 }, select: { id: true, trust: true } })
  if (linkedUser && (await isErasureBlocked(linkedUser.id, steamID64))) return notFound()

  const where = { steam_id: steamID64, ...(ownProfile ? {} : { gm_server: { isPublic: true } }) }
  const moderationWhere = { userSteamID64: steamID64, ...(ownProfile ? {} : { gm_server: { isPublic: true } }) }
  const moderationSelect = {
    id: true,
    serverID: true,
    reason: true,
    createdAt: true,
    gm_server: { select: { name: true } },
  } as const
  const { limit, offset, warningOffset, banOffset } = parsedQuery.data
  const [storedPlayer, summary, latestVisible, records, warningsTotal, bansTotal, warnings, bans] = await Promise.all([
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
    prisma.gm_server_warn.count({ where: moderationWhere }),
    prisma.gm_server_ban.count({ where: moderationWhere }),
    prisma.gm_server_warn.findMany({
      where: moderationWhere,
      select: moderationSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      skip: warningOffset,
    }),
    prisma.gm_server_ban.findMany({
      where: moderationWhere,
      select: { ...moderationSelect, time: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      skip: banOffset,
    }),
  ])

  // An erased account, or one with only private records, has no profile for another visitor.
  if (!ownProfile && summary._count._all === 0 && warningsTotal === 0 && bansTotal === 0) return notFound()
  if (await isErasureBlocked(linkedUser?.id, steamID64)) return notFound()
  const trust = linkedUser?.trust

  const body: PlayerProfileResponse = {
    player: {
      steamID64,
      discordID: PlayerDiscordIDSchema.safeParse(linkedUser?.id).success ? linkedUser!.id : null,
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
    moderation: {
      warnings: warnings.map((warning) => ({
        id: warning.id,
        serverID: warning.serverID,
        serverName: warning.gm_server.name || '',
        reason: warning.reason || '',
        createdAt: warning.createdAt.toISOString(),
      })),
      bans: bans.map((ban) => {
        // Garry's Mod reports ban durations in minutes; zero denotes a permanent ban.
        const durationMinutes = Math.max(0, ban.time)
        const expiresAt = durationMinutes > 0 ? new Date(ban.createdAt.getTime() + durationMinutes * 60_000) : null
        return {
          id: ban.id,
          serverID: ban.serverID,
          serverName: ban.gm_server.name || '',
          reason: ban.reason || '',
          createdAt: ban.createdAt.toISOString(),
          durationMinutes,
          expiresAt: expiresAt?.toISOString() ?? null,
          active: ban.time >= 0 && (expiresAt === null || expiresAt.getTime() > now.getTime()),
        }
      }),
      warningsPagination: { total: warningsTotal, limit, offset: warningOffset },
      bansPagination: { total: bansTotal, limit, offset: banOffset },
    },
  }
  return { status: 200, body: PlayerProfileResponseSchema.parse(body) }
}
