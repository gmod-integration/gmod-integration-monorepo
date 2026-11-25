import prisma from '@gmod/infra-prisma'
import { Prisma } from '@gmod/infra-prisma/client.js'
import {
  AdminAnalyticsQuerySchema,
  AdminAnalyticsSchema,
  type AdminAnalytics,
  type AdminDailyRegistrations,
} from '@gmod/schema/admin/AdminAnalyticsSchema.js'

const DAY_MS = 86_400_000
type CountRow = { date: string; count: bigint | number }

/** Registration dates of records currently stored; this is not an immutable event ledger. */
export async function getAdminAnalytics(rawQuery: unknown): Promise<AdminAnalytics> {
  const query = AdminAnalyticsQuerySchema.safeParse(rawQuery)
  if (!query.success)
    throw Object.assign(new Error('Choose a supported analytics period.'), {
      name: 'AdminDashboardError',
      status: 400,
      code: 'invalid_request',
    })
  const now = new Date()
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const start = new Date(today - (query.data.days - 1) * DAY_MS)
  // The table fragments are fixed identifiers; every time boundary remains a prepared SQL parameter.
  const sources = [
    { metric: 'communities', table: Prisma.sql`gm_guild` },
    { metric: 'servers', table: Prisma.sql`gm_server` },
    { metric: 'accounts', table: Prisma.sql`gm_user` },
  ] as const
  const counts = await Promise.all(
    sources.map(async (source) => ({
      metric: source.metric,
      rows: await prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT DATE_FORMAT(createdAt, '%Y-%m-%d') AS date, COUNT(*) AS count
      FROM ${source.table}
      WHERE createdAt >= ${start} AND createdAt <= ${now}
      GROUP BY DATE(createdAt) ORDER BY date ASC
    `),
    })),
  )
  const registrations: AdminDailyRegistrations[] = Array.from({ length: query.data.days }, (_, index) => ({
    date: new Date(start.getTime() + index * DAY_MS).toISOString().slice(0, 10),
    communities: 0,
    servers: 0,
    accounts: 0,
  }))
  const byDate = new Map(registrations.map((point) => [point.date, point]))
  for (const result of counts)
    for (const row of result.rows) {
      const point = byDate.get(row.date)
      const amount = Number(row.count)
      if (!point || !Number.isSafeInteger(amount) || amount < 0) throw new Error('Invalid registration aggregate.')
      point[result.metric] = amount
    }
  return AdminAnalyticsSchema.parse({
    days: query.data.days,
    timeZone: 'UTC',
    startDate: registrations[0].date,
    endDate: registrations.at(-1)!.date,
    registrations,
    generatedAt: now.toISOString(),
  })
}
