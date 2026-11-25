import { createHash } from 'node:crypto'
import prisma from '@gmod/infra-prisma'
import { Prisma } from '@gmod/infra-prisma/client.js'
import redis from '@gmod/infra-redis'
import { readAddonTelemetry } from '@gmod/infra-redis/addonTelemetry.js'
import { mongoClient } from '@gmod/infra-mongo'
import {
  AdminBugsQuerySchema,
  AdminBugsSchema,
  AdminConnectionsQuerySchema,
  AdminConnectionsSchema,
  AdminErrorsQuerySchema,
  AdminErrorsSchema,
  type AdminBugs,
  type AdminConnections,
  type AdminErrors,
} from '@gmod/schema/admin/AdminMonitoringSchema.js'
import type { z } from 'zod'

function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value)
  if (!result.success)
    throw Object.assign(new Error('The monitoring request is invalid.'), {
      name: 'AdminDashboardError',
      status: 400,
      code: 'invalid_request',
    })
  return result.data
}
const integer = (value: unknown) => {
  const count = Number(value)
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid monitoring aggregate.')
  return count
}
const pageOffset = (offset: number, limit: number, total: number) =>
  Math.min(offset, Math.max(0, (Math.ceil(total / limit) - 1) * limit))
const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const iso = (value: Date | string) => new Date(value).toISOString()

/** Operational summaries never return player identifiers, raw stacks, URLs or credentials. */
export function monitoringSummary(value: string): string {
  return value
    .slice(0, 4000)
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g, '[address]')
    .replace(/\b\d{17,20}\b/g, '[id]')
    .replace(/\b(?:token|secret|password|authorization|api[_-]?key)\s*[:=]\s*\S+/gi, '[credential]')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
    .split('\n')[0]
    .trim()
    .slice(0, 600)
}

// Read the gateway's existing per-socket leases without touching their TTL or using last_request.
// Redis supplies the observation clock; a crashed gateway can leave a lease for up to 90 seconds.
const readPresence = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local result = { now }
for _, key in ipairs(KEYS) do
  local count = redis.call('ZCOUNT', key, '(' .. now, '+inf')
  table.insert(result, count)
  local last = redis.call('ZREVRANGEBYSCORE', key, '+inf', '(' .. now, 'WITHSCORES', 'LIMIT', 0, 1)
  table.insert(result, #last > 0 and tonumber(last[2]) or 0)
end
return result
`

async function connectionPresence(serverIDs: string[]): Promise<{
  observedAt: string | null
  presence: 'ready' | 'unavailable'
  leases: number[] | undefined
}> {
  if (!serverIDs.length) return { observedAt: null, presence: 'ready', leases: undefined }
  try {
    const result = await redis.eval(
      readPresence,
      serverIDs.length,
      ...serverIDs.map((id) => `ws:server-presence:${id}`),
    )
    if (!Array.isArray(result) || result.length !== 1 + 2 * serverIDs.length)
      throw new Error('Invalid presence response.')
    const values = result.map(integer)
    const observedAt = new Date(values[0]).toISOString()
    const leases = values.slice(1)
    for (let i = 0; i < leases.length; i += 2) {
      if ((leases[i] === 0) !== (leases[i + 1] === 0) || (leases[i] > 0 && leases[i + 1] <= values[0]))
        throw new Error('Invalid presence lease.')
    }
    return { observedAt, presence: 'ready', leases }
  } catch {
    return { observedAt: null, presence: 'unavailable', leases: undefined }
  }
}

export async function listAdminConnections(raw: unknown): Promise<AdminConnections> {
  const query = parse(AdminConnectionsQuerySchema, raw)
  const where: Prisma.gm_serverWhereInput = {
    ...(query.guildID ? { guild: query.guildID } : {}),
    ...(query.search
      ? {
          OR: [
            { id: { contains: query.search } },
            { name: { contains: query.search } },
            { gm_guild: { name: { contains: query.search } } },
          ],
        }
      : {}),
  }
  const total = await prisma.gm_server.count({ where })
  const accepted = { ...query, offset: pageOffset(query.offset, query.limit, total) }
  const rows = await prisma.gm_server.findMany({
    where,
    select: { id: true, name: true, guild: true, gm_guild: { select: { name: true } } },
    skip: accepted.offset,
    take: accepted.limit,
    orderBy: [{ createdAt: accepted.orderBy.toLowerCase() as 'asc' | 'desc' }, { id: 'asc' }],
  })
  const serverIDs = rows.map((row) => row.id)
  const [{ observedAt, presence, leases }, traffic] = await Promise.all([
    connectionPresence(serverIDs),
    readAddonTelemetry(serverIDs),
  ])
  return AdminConnectionsSchema.parse({
    items: rows.map((row, index) => ({
      id: row.id,
      name: row.name || '',
      guildID: row.guild,
      guildName: row.gm_guild.name || '',
      activeSockets: leases ? leases[index * 2] : null,
      leaseExpiresAt: leases?.[index * 2 + 1] ? new Date(leases[index * 2 + 1]).toISOString() : null,
      ...traffic.items[index],
    })),
    total,
    query: accepted,
    presence,
    observedAt,
    leaseTtlSeconds: 90,
    telemetry: traffic.available ? 'ready' : 'unavailable',
    trafficWindowSeconds: 60,
    trafficObservedAt: traffic.observedAt,
    generatedAt: new Date().toISOString(),
  })
}

type ErrorAggregate = {
  _id: { error: string; realm: string; name: string }
  reports: number
  serverCount: number
  occurrences: number
  firstSeenAt: Date
  lastSeenAt: Date
}
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export async function listAdminErrors(raw: unknown): Promise<AdminErrors> {
  const query = parse(AdminErrorsQuerySchema, raw)
  const now = new Date()
  const since = new Date(now.getTime() - query.days * 86_400_000)
  const match: Record<string, unknown> = { createdAt: { $gte: since, $lte: now } }
  const conditions: Record<string, unknown>[] = []
  if (query.source === 'integration')
    conditions.push({
      $or: [
        { name: /gmod[ _-]integration/i },
        { error: /gmod[ _-]integration[/\\]/i },
        { stack: /gmod[ _-]integration[/\\]/i },
      ],
    })
  if (query.search) conditions.push({ error: { $regex: escapeRegex(query.search), $options: 'i' } })
  if (conditions.length) match.$and = conditions
  const text = (field: string, length: number) => ({
    $substrCP: [{ $cond: [{ $eq: [{ $type: `$${field}` }, 'string'] }, `$${field}`, ''] }, 0, length],
  })
  const pipeline = [
    { $match: match },
    {
      $project: {
        serverID: 1,
        createdAt: 1,
        error: text('error', 1000),
        name: text('name', 200),
        realm: text('realm', 20),
        occurrences: {
          $cond: [
            { $and: [{ $isNumber: '$count' }, { $gte: ['$count', 1] }, { $lte: ['$count', 1_000_000] }] },
            { $floor: '$count' },
            1,
          ],
        },
      },
    },
    {
      $group: {
        _id: { error: '$error', realm: '$realm', name: '$name', server: '$serverID' },
        reports: { $sum: 1 },
        occurrences: { $sum: '$occurrences' },
        firstSeenAt: { $min: '$createdAt' },
        lastSeenAt: { $max: '$createdAt' },
      },
    },
    {
      $group: {
        _id: { error: '$_id.error', realm: '$_id.realm', name: '$_id.name' },
        reports: { $sum: '$reports' },
        occurrences: { $sum: '$occurrences' },
        serverCount: { $sum: 1 },
        firstSeenAt: { $min: '$firstSeenAt' },
        lastSeenAt: { $max: '$lastSeenAt' },
      },
    },
    ...(query.recurringOnly ? [{ $match: { reports: { $gte: 2 } } }] : []),
  ]
  const collection = mongoClient.db('gmod_integration').collection('errors')
  const options = { maxTimeMS: 3000, allowDiskUse: false }
  const counts = await collection.aggregate<{ total: number }>([...pipeline, { $count: 'total' }], options).toArray()
  const total = integer(counts[0]?.total ?? 0)
  const accepted = { ...query, offset: pageOffset(query.offset, query.limit, total) }
  const direction = query.orderBy === 'ASC' ? 1 : -1
  const sort =
    query.sort === 'reports' ? { reports: direction, lastSeenAt: -1, _id: 1 } : { lastSeenAt: direction, _id: 1 }
  const rows = await collection
    .aggregate<ErrorAggregate>(
      [...pipeline, { $sort: sort }, { $skip: accepted.offset }, { $limit: accepted.limit }],
      options,
    )
    .toArray()
  return AdminErrorsSchema.parse({
    items: rows.map((row) => ({
      id: fingerprint(row._id),
      summary: monitoringSummary(row._id.error),
      reports: integer(row.reports),
      occurrences: integer(row.occurrences),
      serverCount: integer(row.serverCount),
      realm: row._id.realm === 'client' || row._id.realm === 'server' ? row._id.realm : 'unknown',
      firstSeenAt: iso(row.firstSeenAt),
      lastSeenAt: iso(row.lastSeenAt),
    })),
    total,
    query: accepted,
    since: since.toISOString(),
    generatedAt: now.toISOString(),
  })
}

type BugAggregate = { signature: string; reports: bigint; serverCount: bigint; firstSeenAt: Date; lastSeenAt: Date }
export async function listAdminBugs(raw: unknown): Promise<AdminBugs> {
  const query = parse(AdminBugsQuerySchema, raw)
  const now = new Date()
  const since = new Date(now.getTime() - query.days * 86_400_000)
  const filters = [Prisma.sql`createdAt >= ${since} AND createdAt <= ${now}`]
  if (query.state === 'open') filters.push(Prisma.sql`status = 'open'`)
  if (query.search)
    filters.push(Prisma.sql`description LIKE ${`%${query.search.replace(/[=%_]/g, '=$&')}%`} ESCAPE '='`)
  const group = Prisma.sql`FROM gm_server_report_bugs WHERE ${Prisma.join(filters, ' AND ')}
    GROUP BY LOWER(TRIM(SUBSTRING(description, 1, 1000))) HAVING COUNT(*) >= ${query.recurringOnly ? 2 : 1}`
  const counts = await prisma.$queryRaw<{ total: bigint }[]>(
    Prisma.sql`SELECT COUNT(*) AS total FROM (SELECT 1 ${group}) AS grouped`,
  )
  const total = integer(counts[0]?.total ?? 0)
  const accepted = { ...query, offset: pageOffset(query.offset, query.limit, total) }
  const direction = query.orderBy === 'ASC' ? Prisma.sql`ASC` : Prisma.sql`DESC`
  const sort =
    query.sort === 'reports'
      ? Prisma.sql`reports ${direction}, lastSeenAt DESC, signature ASC`
      : Prisma.sql`lastSeenAt ${direction}, signature ASC`
  const rows = await prisma.$queryRaw<
    BugAggregate[]
  >(Prisma.sql`SELECT LOWER(TRIM(SUBSTRING(description, 1, 1000))) AS signature,
    COUNT(*) AS reports, COUNT(DISTINCT serverID) AS serverCount, MIN(createdAt) AS firstSeenAt, MAX(createdAt) AS lastSeenAt
    ${group} ORDER BY ${sort} LIMIT ${accepted.limit} OFFSET ${accepted.offset}`)
  return AdminBugsSchema.parse({
    items: rows.map((row) => ({
      id: fingerprint(row.signature),
      summary: monitoringSummary(row.signature),
      reports: integer(row.reports),
      serverCount: integer(row.serverCount),
      firstSeenAt: iso(row.firstSeenAt),
      lastSeenAt: iso(row.lastSeenAt),
    })),
    total,
    query: accepted,
    since: since.toISOString(),
    generatedAt: now.toISOString(),
  })
}
