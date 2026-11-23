import prisma from '@gmod/infra-prisma'
import { Prisma } from '@gmod/infra-prisma/client.js'
import { enqueueDiscordGuildPublicInvite } from '@gmod/infra-bullmq/discordQueueAdapters.js'
import { resolveGuildAccess } from '@gmod/domain-access/index.js'
import {
  DiscordInviteUrlSchema,
  PublicServerRankingQuerySchema,
  type PublicRankedServer,
  type PublicServerRankingResponse,
} from '@gmod/schema/server/PublicServerRankingSchema.js'

const DAY = 24 * 60 * 60 * 1000
const ONLINE_WINDOW = 5 * 60 * 1000

type RankedRow = { id: string; vote: bigint | number; rankingPosition: bigint | number }
type CountRow = { total: bigint | number }
type ActivityRow = { serverID: string; bucketAt: string; players: number }

/** Paginate the ranking in SQL; never expose server credentials or private server rows. */
export async function processGetPublicServerRanking(
  query: unknown,
): Promise<
  | { status: 200; body: PublicServerRankingResponse }
  | { status: 400; body: { error: string; issues: { path: string; message: string }[] } }
> {
  const parsed = PublicServerRankingQuerySchema.safeParse(query)
  if (!parsed.success) {
    return {
      status: 400,
      body: {
        error: 'Invalid server ranking query',
        issues: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      },
    }
  }
  const { search, gameMode, status, offset, limit } = parsed.data
  const now = new Date()
  const onlineSince = new Date(now.getTime() - ONLINE_WINDOW)
  const voteSince = new Date(now.getTime() - 30 * DAY)
  const historySince = new Date(now.getTime() - 7 * DAY)
  // ESCAPE '=' makes user-entered SQL LIKE metacharacters literal while keeping the entire value bound.
  const pattern = `%${search.replace(/[=%_]/g, (character) => `=${character}`)}%`
  const searchFilter = search
    ? Prisma.sql`AND (
        LOWER(COALESCE(s.name, '')) LIKE LOWER(${pattern}) ESCAPE '='
        OR LOWER(COALESCE(s.description, '')) LIKE LOWER(${pattern}) ESCAPE '='
        OR LOWER(COALESCE(st.hostname, '')) LIKE LOWER(${pattern}) ESCAPE '='
        OR LOWER(COALESCE(st.map, '')) LIKE LOWER(${pattern}) ESCAPE '='
        OR LOWER(COALESCE(g.name, '')) LIKE LOWER(${pattern}) ESCAPE '='
        OR LOWER(COALESCE(s.ip, '')) LIKE LOWER(${pattern}) ESCAPE '='
      )`
    : Prisma.empty
  const modeFilter = gameMode ? Prisma.sql`AND st.gameMode = ${gameMode}` : Prisma.empty
  const stateFilter =
    status === 'online'
      ? Prisma.sql`AND st.updatedAt >= ${onlineSince}`
      : status === 'offline'
        ? Prisma.sql`AND (st.id IS NULL OR st.updatedAt < ${onlineSince})`
        : Prisma.empty
  const ranking = Prisma.sql`
    SELECT s.id, COALESCE(v.recentVotes, 0) AS vote
    FROM gm_server AS s
    JOIN gm_guild AS g ON g.guild = s.guild
    LEFT JOIN gm_server_status AS st ON st.id = s.id
    LEFT JOIN (
      SELECT serverID, COUNT(*) AS recentVotes
      FROM gm_server_vote
      WHERE createdAt > ${voteSince} AND createdAt <= ${now}
      GROUP BY serverID
    ) AS v ON v.serverID = s.id
    WHERE s.isPublic = TRUE ${searchFilter} ${modeFilter} ${stateFilter}
  `
  const [ranked, counts, modeRows] = await Promise.all([
    prisma.$queryRaw<RankedRow[]>(Prisma.sql`
      WITH ranking AS (${ranking})
      SELECT id, vote, ROW_NUMBER() OVER (ORDER BY vote DESC, id ASC) AS rankingPosition
      FROM ranking ORDER BY vote DESC, id ASC LIMIT ${limit} OFFSET ${offset}
    `),
    prisma.$queryRaw<CountRow[]>(Prisma.sql`WITH ranking AS (${ranking}) SELECT COUNT(*) AS total FROM ranking`),
    prisma.gm_server_status.findMany({
      where: { gm_server: { isPublic: true } },
      select: { gameMode: true },
      distinct: ['gameMode'],
      orderBy: { gameMode: 'asc' },
    }),
  ])
  const total = Number(counts[0].total)
  const gameModes = modeRows.map((row) => row.gameMode).filter(Boolean)
  if (!ranked.length) {
    return { status: 200, body: { servers: [], pagination: { total, offset, limit }, filters: { gameModes } } }
  }

  const ids = ranked.map((row) => row.id)
  const [records, history] = await Promise.all([
    prisma.gm_server.findMany({
      where: { id: { in: ids }, isPublic: true },
      select: {
        id: true,
        guild: true,
        name: true,
        description: true,
        image: true,
        ip: true,
        port: true,
        gm_guild: { select: { isPartner: true } },
        gm_server_status: {
          select: { hostname: true, players: true, maxPlayers: true, gameMode: true, map: true, updatedAt: true },
        },
      },
    }),
    prisma.$queryRaw<ActivityRow[]>(Prisma.sql`
      SELECT serverID, DATE_FORMAT(createdAt, '%Y-%m-%dT00:00:00.000Z') AS bucketAt, MAX(players) AS players
      FROM gm_server_status_history
      WHERE serverID IN (${Prisma.join(ids)}) AND createdAt >= ${historySince} AND createdAt <= ${now}
      GROUP BY serverID, DATE(createdAt) ORDER BY serverID, bucketAt ASC
    `),
  ])
  const guilds = [...new Set(records.map((row) => row.guild))]
  const guildMetadata = new Map(
    await Promise.all(
      guilds.map(async (guild) => {
        const [inviteResult, accessResult] = await Promise.allSettled([
          enqueueDiscordGuildPublicInvite(guild),
          resolveGuildAccess(guild),
        ])
        const invite = inviteResult.status === 'fulfilled' ? DiscordInviteUrlSchema.safeParse(inviteResult.value) : null
        // Optional community metadata must not make the public ranking unavailable.
        return [
          guild,
          {
            discordUrl: invite?.success ? invite.data : null,
            premiumUntil:
              accessResult.status === 'fulfilled' &&
              accessResult.value.state === 'ready' &&
              accessResult.value.premium === true
                ? Date.parse(accessResult.value.validUntil)
                : 0,
          },
        ] as const
      }),
    ),
  )
  const recordsById = new Map(records.map((record) => [record.id, record]))
  const servers: PublicRankedServer[] = []
  for (const row of ranked) {
    const record = recordsById.get(row.id)
    // A server can have become private between the ranking and details reads.
    if (!record) continue
    const snapshot = record.gm_server_status
    const metadata = guildMetadata.get(record.guild)
    const premiumUntil = metadata?.premiumUntil ?? 0
    servers.push({
      id: record.id,
      guild: record.guild,
      name: record.name || '',
      description: record.description || '',
      image: record.image || '',
      ip: record.ip || '',
      port: record.port || '',
      vote: Number(row.vote),
      rank: Number(row.rankingPosition),
      online: !!snapshot && snapshot.updatedAt >= onlineSince,
      premium: Number.isFinite(premiumUntil) && premiumUntil > Date.now(),
      partner: record.gm_guild.isPartner === true,
      lastSeenAt: snapshot?.updatedAt.toISOString() || null,
      discordUrl: metadata?.discordUrl || null,
      status: snapshot
        ? {
            hostname: snapshot.hostname,
            players: Math.max(0, snapshot.players),
            maxPlayers: Math.max(0, snapshot.maxPlayers),
            gameMode: snapshot.gameMode,
            map: snapshot.map,
          }
        : null,
      activity: history
        .filter((point) => point.serverID === record.id)
        .map((point) => ({ at: point.bucketAt, players: Math.max(0, point.players) })),
    })
  }
  return { status: 200, body: { servers, pagination: { total, offset, limit }, filters: { gameModes } } }
}
