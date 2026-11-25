import prisma from '@gmod/infra-prisma'
import { Prisma } from '@gmod/infra-prisma/client.js'
import {
  ServerStatisticsQuerySchema,
  ServerStatisticsResponseSchema,
  type ServerStatisticsResponse,
} from '@gmod/schema/server/ServerStatisticsSchema.js'
import { getServerCountryStatistics } from './serverCountryStatistics.js'

const HOUR = 3_600_000
const DAY = 24 * HOUR
const CLOCK_TOLERANCE = 60_000
type Numeric = number | bigint | { toString(): string }
type PopulationRow = { at: string; average: Numeric; peak: Numeric; samples: Numeric }
type NewPlayersRow = { at: string; newPlayers: Numeric }
type ActivityRow = { at: string; sessions: Numeric; playedSeconds: Numeric }
type HeatmapRow = { day: Numeric; hour: Numeric; average: Numeric; samples: Numeric }
type SessionSummaryRow = {
  completedSessions: Numeric
  playedSeconds: Numeric | null
  activePlayers: Numeric
  medianSessionSeconds: Numeric | null
}
type DurationRow = {
  under15m: Numeric | null
  mediumSessions: Numeric | null
  longSessions: Numeric | null
  over3h: Numeric | null
}
type TopPlayerRow = { steamID64: string; name: string; playedSeconds: Numeric; sessions: Numeric }
type InvalidQuery = { status: 400; body: { error: string; issues: { path: string; message: string }[] } }

const invalidQuery = (issues: { path: string; message: string }[]): InvalidQuery => ({
  status: 400,
  body: { error: 'Invalid server statistics query', issues },
})
const numeric = (value: Numeric | null): number => (value === null ? 0 : Number(value.toString()))

function branchesFromSnapshot(serialized: string | null): ServerStatisticsResponse['live']['branches'] {
  if (!serialized) return []
  let rows: unknown
  try {
    rows = JSON.parse(serialized)
  } catch {
    return []
  }
  if (!Array.isArray(rows)) return []
  const branches = new Map<string, number>()
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const value: unknown = (row as { branch?: unknown }).branch
    const branch = typeof value === 'string' ? value.trim().toLowerCase() : ''
    const name = branch && branch.length <= 32 ? branch : 'unknown'
    branches.set(name, (branches.get(name) ?? 0) + 1)
  }
  return [...branches]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/** Aggregates retained records. Session metrics belong to the interval in which the session ended. */
export async function processGetServerStatistics(
  serverID: string,
  rawQuery: unknown,
  now = new Date(),
): Promise<{ status: 200; body: ServerStatisticsResponse } | InvalidQuery> {
  const parsed = ServerStatisticsQuerySchema.safeParse(rawQuery)
  if (!parsed.success)
    return invalidQuery(parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })))
  const query = parsed.data
  const requestedTo = query.period === 'custom' ? new Date(query.to!) : now
  const from =
    query.period === 'custom'
      ? new Date(query.from!)
      : new Date(now.getTime() - (query.period === '24h' ? DAY : query.period === '30d' ? 30 * DAY : 7 * DAY))
  if (requestedTo.getTime() > now.getTime() + CLOCK_TOLERANCE || from >= now)
    return invalidQuery([{ path: 'to', message: 'Statistics cannot include future dates.' }])
  // A browser's clock can run slightly ahead. Never query beyond the actual generation time.
  const to = new Date(Math.min(requestedTo.getTime(), now.getTime()))
  if (from >= to) return invalidQuery([{ path: 'from', message: 'The start must precede the end.' }])
  const bucket = to.getTime() - from.getTime() <= 2 * DAY ? 'hour' : 'day'
  const interval = bucket === 'hour' ? HOUR : DAY
  // All SQL fragments are fixed expressions; identifiers and date boundaries are never user SQL.
  const populationBucket =
    bucket === 'hour'
      ? Prisma.sql`DATE_FORMAT(createdAt, '%Y-%m-%dT%H:00:00.000Z')`
      : Prisma.sql`DATE_FORMAT(createdAt, '%Y-%m-%dT00:00:00.000Z')`
  const arrivalBucket =
    bucket === 'hour'
      ? Prisma.sql`DATE_FORMAT(first_join, '%Y-%m-%dT%H:00:00.000Z')`
      : Prisma.sql`DATE_FORMAT(first_join, '%Y-%m-%dT00:00:00.000Z')`
  const sessionBucket =
    bucket === 'hour'
      ? Prisma.sql`DATE_FORMAT(sessionEndTimeStamp, '%Y-%m-%dT%H:00:00.000Z')`
      : Prisma.sql`DATE_FORMAT(sessionEndTimeStamp, '%Y-%m-%dT00:00:00.000Z')`
  const sessionFilter = Prisma.sql`serverID = ${serverID} AND sessionEndTimeStamp >= ${from} AND sessionEndTimeStamp < ${to}`
  const [
    registeredPlayers,
    populationRows,
    arrivalRows,
    sessionRows,
    summaryRows,
    heatmapRows,
    durationRows,
    topRows,
    snapshot,
    countries,
  ] = await Promise.all([
    prisma.gm_server_stat.count({ where: { server_id: serverID } }),
    prisma.$queryRaw<PopulationRow[]>(Prisma.sql`
        SELECT ${populationBucket} AS at, AVG(GREATEST(players, 0)) AS average,
          MAX(GREATEST(players, 0)) AS peak, COUNT(*) AS samples
        FROM gm_server_status_history
        WHERE serverID = ${serverID} AND createdAt >= ${from} AND createdAt < ${to}
        GROUP BY at ORDER BY at ASC
      `),
    prisma.$queryRaw<NewPlayersRow[]>(Prisma.sql`
        SELECT ${arrivalBucket} AS at, COUNT(*) AS newPlayers FROM gm_server_stat
        WHERE server_id = ${serverID} AND first_join >= ${from} AND first_join < ${to}
        GROUP BY at ORDER BY at ASC
      `),
    prisma.$queryRaw<ActivityRow[]>(Prisma.sql`
        SELECT ${sessionBucket} AS at, COUNT(*) AS sessions, SUM(GREATEST(time, 0)) AS playedSeconds
        FROM gm_server_stat_session WHERE ${sessionFilter} GROUP BY at ORDER BY at ASC
      `),
    prisma.$queryRaw<SessionSummaryRow[]>(Prisma.sql`
        WITH scoped_sessions AS (
          SELECT time, steamID64, id
          FROM gm_server_stat_session WHERE ${sessionFilter}
        ), ranked_durations AS (
          SELECT time AS duration, ROW_NUMBER() OVER (ORDER BY time, id) AS sessionRank, COUNT(*) OVER () AS total
          FROM scoped_sessions WHERE time >= 0
        )
        SELECT COUNT(*) AS completedSessions, SUM(GREATEST(time, 0)) AS playedSeconds,
          COUNT(DISTINCT steamID64) AS activePlayers,
          (SELECT AVG(duration) FROM ranked_durations
            WHERE sessionRank IN (FLOOR((total + 1) / 2), FLOOR((total + 2) / 2))) AS medianSessionSeconds
        FROM scoped_sessions
      `),
    prisma.$queryRaw<HeatmapRow[]>(Prisma.sql`
        SELECT DAYOFWEEK(createdAt) - 1 AS day, HOUR(createdAt) AS hour,
          AVG(GREATEST(players, 0)) AS average, COUNT(*) AS samples
        FROM gm_server_status_history
        WHERE serverID = ${serverID} AND createdAt >= ${from} AND createdAt < ${to}
        GROUP BY day, hour ORDER BY day, hour
      `),
    prisma.$queryRaw<DurationRow[]>(Prisma.sql`
        SELECT SUM(time >= 0 AND time < 900) AS under15m, SUM(time >= 900 AND time < 3600) AS mediumSessions,
          SUM(time >= 3600 AND time < 10800) AS longSessions, SUM(time >= 10800) AS over3h
        FROM gm_server_stat_session WHERE ${sessionFilter}
      `),
    prisma.$queryRaw<TopPlayerRow[]>(Prisma.sql`
        SELECT sessions.steamID64, COALESCE(player.name, '') AS name, sessions.playedSeconds, sessions.sessions
        FROM (
          SELECT steamID64, SUM(GREATEST(time, 0)) AS playedSeconds, COUNT(*) AS sessions
          FROM gm_server_stat_session WHERE ${sessionFilter} AND steamID64 IS NOT NULL
          GROUP BY steamID64
        ) AS sessions
        LEFT JOIN gm_server_stat AS player ON player.server_id = ${serverID} AND player.steam_id = sessions.steamID64
        ORDER BY sessions.playedSeconds DESC, sessions.sessions DESC, sessions.steamID64 ASC LIMIT 10
      `),
    prisma.gm_server_status.findUnique({
      where: { id: serverID },
      select: { updatedAt: true, players: true, maxPlayers: true, playersList: true },
    }),
    getServerCountryStatistics(serverID, from, to),
  ])
  const populationByTime = new Map(populationRows.map((row) => [row.at, row]))
  const arrivalsByTime = new Map(arrivalRows.map((row) => [row.at, row]))
  const sessionsByTime = new Map(sessionRows.map((row) => [row.at, row]))
  const instants: string[] = []
  for (let at = Math.floor(from.getTime() / interval) * interval; at < to.getTime(); at += interval)
    instants.push(new Date(at).toISOString())
  const population = instants.map((at) => {
    const row = populationByTime.get(at)
    return {
      at,
      average: row ? numeric(row.average) : null,
      peak: row ? numeric(row.peak) : null,
      samples: row ? numeric(row.samples) : 0,
    }
  })
  const activity = instants.map((at) => ({
    at,
    newPlayers: numeric(arrivalsByTime.get(at)?.newPlayers ?? null),
    sessions: numeric(sessionsByTime.get(at)?.sessions ?? null),
    playedSeconds: numeric(sessionsByTime.get(at)?.playedSeconds ?? null),
  }))
  const heatmapByCell = new Map(heatmapRows.map((row) => [`${numeric(row.day)}:${numeric(row.hour)}`, row]))
  const heatmap = Array.from({ length: 168 }, (_, index) => {
    const day = Math.floor(index / 24)
    const hour = index % 24
    const row = heatmapByCell.get(`${day}:${hour}`)
    return { day, hour, average: row ? numeric(row.average) : null, samples: row ? numeric(row.samples) : 0 }
  })
  const sampleCount = population.reduce((sum, point) => sum + point.samples, 0)
  const summary = summaryRows[0]
  const online =
    !!snapshot &&
    snapshot.updatedAt.getTime() >= now.getTime() - 5 * 60_000 &&
    snapshot.updatedAt.getTime() <= now.getTime() + CLOCK_TOLERANCE
  return {
    status: 200,
    body: ServerStatisticsResponseSchema.parse({
      period: { from: from.toISOString(), to: to.toISOString(), bucket, timeZone: 'UTC' },
      summary: {
        registeredPlayers,
        newPlayers: activity.reduce((sum, point) => sum + point.newPlayers, 0),
        peakPlayers: sampleCount
          ? Math.max(...population.filter((point) => point.peak !== null).map((point) => point.peak!))
          : null,
        averagePlayers: sampleCount
          ? population.reduce((sum, point) => sum + (point.average ?? 0) * point.samples, 0) / sampleCount
          : null,
        completedSessions: numeric(summary?.completedSessions ?? null),
        playedSeconds: numeric(summary?.playedSeconds ?? null),
        medianSessionSeconds: summary?.medianSessionSeconds == null ? null : numeric(summary.medianSessionSeconds),
        activePlayers: numeric(summary?.activePlayers ?? null),
      },
      population,
      activity,
      heatmap,
      sessionDurations: (
        [
          ['under15m', 'under15m'],
          ['15to60m', 'mediumSessions'],
          ['1to3h', 'longSessions'],
          ['over3h', 'over3h'],
        ] as const
      ).map(([key, field]) => ({ key, count: numeric(durationRows[0]?.[field] ?? null) })),
      topPlayers: topRows.map((row) => ({
        ...row,
        playedSeconds: numeric(row.playedSeconds),
        sessions: numeric(row.sessions),
      })),
      countries,
      live: {
        updatedAt: snapshot?.updatedAt.toISOString() ?? null,
        online,
        players: online ? Math.max(0, snapshot.players) : 0,
        maxPlayers: Math.max(0, snapshot?.maxPlayers ?? 0),
        branches: online ? branchesFromSnapshot(snapshot.playersList) : [],
      },
    }),
  }
}
