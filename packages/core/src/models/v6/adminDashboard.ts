import prisma from '@gmod/infra-prisma'
import { developerDiscordIDs, getPlatformRank } from '@gmod/config/developers.js'
import { Prisma } from '@gmod/infra-prisma/client.js'
import redis from '@gmod/infra-redis'
import { getServerFromID } from '@gmod/domain-server/Server.js'
import { invalidateGuildAccess, resolveGuildAccess } from '@gmod/domain-access/index.js'
import type { AccessSnapshot } from '@gmod/schema/server/AccessPolicySchema.js'
import {
  AdminGuildListQuerySchema,
  AdminServerListQuerySchema,
  AdminUserListQuerySchema,
  AdminIDSchema,
  AdminServerUpdateSchema,
  AdminServerCommandSchema,
  AdminPremiumUpdateSchema,
  type AdminGuildRow,
  type AdminGuildDetail,
  type AdminServerRow,
  type AdminUserRow,
  type AdminOverview,
  type AdminListQuery,
  type AdminListResponse,
  type AdminPremiumMutationResult,
} from '@gmod/schema/admin/AdminDashboardSchema.js'

export class AdminDashboardError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message = code,
  ) {
    super(message)
    this.name = 'AdminDashboardError'
  }
}

const invalid = () => new AdminDashboardError(400, 'invalid_request', 'The administrative request is invalid.')
const missing = () => new AdminDashboardError(404, 'not_found', 'This record was not found.')
const iso = (value: Date | string) => new Date(value).toISOString()
const count = (value: unknown) => Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Number(value) || 0))
const id = (value: unknown) => {
  const parsed = AdminIDSchema.safeParse(value)
  if (!parsed.success) throw invalid()
  return parsed.data
}
const clamped = <T extends AdminListQuery>(query: T, total: number): T => ({
  ...query,
  offset: Math.min(query.offset, Math.max(0, (Math.ceil(total / query.limit) - 1) * query.limit)),
})
const activeSessions = (now: Date): Prisma.gm_panelTokenWhereInput => ({
  revoke: false,
  expirationDate: { gt: now },
  OR: [{ absoluteExpiresAt: null }, { absoluteExpiresAt: { gt: now } }],
})

type GuildRecord = {
  id: string
  name: string
  language: string
  members: number
  serverCount: number | bigint
  manualPremium: boolean | bigint | number
  gmodstore: boolean | bigint | number
  createdAt: Date | string
  updatedAt: Date | string
}
const guildRow = (row: GuildRecord): AdminGuildRow => ({
  id: row.id,
  name: row.name || '',
  language: row.language || 'en',
  members: count(row.members),
  serverCount: count(row.serverCount),
  manualPremium: !!Number(row.manualPremium),
  gmodstore: !!Number(row.gmodstore),
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
})

const manualGrant = Prisma.sql`EXISTS (SELECT 1 FROM gm_guild_premium p WHERE p.guildID = g.guild AND p.revoked = false)`
const storeGrant = Prisma.sql`EXISTS (SELECT 1 FROM gm_gmodstore_purchases p WHERE p.guild = g.guild AND p.revoke = false)`
const guildSelect = Prisma.sql`g.guild AS id, g.name, g.language, g.member AS members, g.createdAt, g.updatedAt,
  (SELECT COUNT(*) FROM gm_server s WHERE s.guild = g.guild) AS serverCount,
  ${manualGrant} AS manualPremium, ${storeGrant} AS gmodstore`

/** Prepared predicates keep Premium filtering inside the bounded DB page rather than fetching IDs. */
function guildWhere(query: AdminListQuery) {
  const filters: Prisma.Sql[] = [Prisma.sql`1 = 1`]
  if (query.search) {
    const search = `%${query.search.replace(/[=%_]/g, '=$&')}%`
    filters.push(Prisma.sql`(g.name LIKE ${search} ESCAPE '=' OR g.guild LIKE ${search} ESCAPE '=')`)
  }
  if (query.premium === 'manual') filters.push(manualGrant)
  else if (query.premium === 'gmodstore') filters.push(storeGrant)
  else if (query.premium === 'none') filters.push(Prisma.sql`NOT ${manualGrant} AND NOT ${storeGrant}`)
  return Prisma.join(filters, ' AND ')
}

export async function listAdminGuilds(rawQuery: unknown): Promise<AdminListResponse<AdminGuildRow>> {
  const parsed = AdminGuildListQuerySchema.safeParse(rawQuery)
  if (!parsed.success) throw invalid()
  const where = guildWhere(parsed.data)
  const totals = await prisma.$queryRaw<{ total: bigint }[]>(
    Prisma.sql`SELECT COUNT(*) AS total FROM gm_guild g WHERE ${where}`,
  )
  const total = count(totals[0]?.total)
  const query = clamped(parsed.data, total)
  const columns = {
    id: 'g.guild',
    name: 'g.name',
    members: 'g.member',
    createdAt: 'g.createdAt',
    updatedAt: 'g.updatedAt',
  }
  // Both raw fragments come exclusively from the validated enum and fixed identifier map.
  const order = Prisma.raw(columns[query.sort])
  const direction = Prisma.raw(query.orderBy)
  const rows = await prisma.$queryRaw<GuildRecord[]>(Prisma.sql`SELECT ${guildSelect} FROM gm_guild g
    WHERE ${where} ORDER BY ${order} ${direction}, g.guild ASC LIMIT ${query.limit} OFFSET ${query.offset}`)
  return { items: rows.map(guildRow), total, query }
}

export const listAdminPremium = listAdminGuilds

export async function getAdminGuildDetail(guildID: string): Promise<AdminGuildDetail> {
  const guild = id(guildID)
  const rows = await prisma.$queryRaw<GuildRecord[]>(
    Prisma.sql`SELECT ${guildSelect} FROM gm_guild g WHERE g.guild = ${guild} LIMIT 1`,
  )
  if (!rows[0]) throw missing()
  return { guild: guildRow(rows[0]), access: await resolveGuildAccess(guild) }
}

const serverSelect = {
  id: true,
  guild: true,
  name: true,
  verified: true,
  isPublic: true,
  createdAt: true,
  updatedAt: true,
  gm_guild: { select: { name: true } },
} satisfies Prisma.gm_serverSelect
type ServerRecord = Prisma.gm_serverGetPayload<{ select: typeof serverSelect }>

async function cacheValues(keys: string[]): Promise<{ available: boolean; values: (string | null)[] }> {
  if (!keys.length) return { available: true, values: [] }
  try {
    const values = await redis.mget(...keys)
    if (!Array.isArray(values) || values.length !== keys.length) throw new Error('Invalid cache response')
    return { available: true, values }
  } catch {
    return { available: false, values: keys.map(() => null) }
  }
}

async function serverRows(rows: ServerRecord[]): Promise<AdminServerRow[]> {
  const cache = await cacheValues(rows.flatMap((row) => [`server:${row.id}:version`, `server:${row.id}:last_request`]))
  const now = Date.now()
  return rows.map((row, index) => {
    const version = cache.values[index * 2]
    const activity = cache.values[index * 2 + 1]
    const lastSeen = activity && activity.length < 64 ? Date.parse(activity) : NaN
    const validSeen = Number.isFinite(lastSeen)
    return {
      id: row.id,
      guildID: row.guild,
      guildName: row.gm_guild.name || '',
      name: row.name || '',
      verified: row.verified,
      isPublic: row.isPublic,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
      addonVersion:
        version && version.length <= 64 && /^v?\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/.test(version) ? version : null,
      lastSeenAt: validSeen ? new Date(lastSeen).toISOString() : null,
      recentlyActive:
        !cache.available || (activity !== null && !validSeen)
          ? null
          : validSeen && now - lastSeen <= 120_000 && now - lastSeen >= -30_000,
    }
  })
}

export async function listAdminServers(rawQuery: unknown): Promise<AdminListResponse<AdminServerRow>> {
  const parsed = AdminServerListQuerySchema.safeParse(rawQuery)
  if (!parsed.success) throw invalid()
  const query = parsed.data
  const where: Prisma.gm_serverWhereInput = {
    ...(query.guildID ? { guild: query.guildID } : {}),
    ...(query.verified !== 'all' ? { verified: query.verified === 'verified' } : {}),
    ...(query.visibility !== 'all' ? { isPublic: query.visibility === 'public' } : {}),
    ...(query.search
      ? {
          OR: [
            { id: { contains: query.search } },
            { name: { contains: query.search } },
            { guild: { contains: query.search } },
            { gm_guild: { name: { contains: query.search } } },
          ],
        }
      : {}),
  }
  const total = await prisma.gm_server.count({ where })
  const accepted = clamped(query, total)
  const rows = await prisma.gm_server.findMany({
    where,
    select: serverSelect,
    skip: accepted.offset,
    take: accepted.limit,
    orderBy: [{ [accepted.sort]: accepted.orderBy.toLowerCase() }, { id: 'asc' }],
  })
  return { items: await serverRows(rows), total, query: accepted }
}

function cachedAvatar(value: string | null): string | undefined {
  if (!value || value.length > 16_384) return
  try {
    const profile: unknown = JSON.parse(value)
    if (
      !profile ||
      typeof profile !== 'object' ||
      !('avatarURL' in profile) ||
      typeof profile.avatarURL !== 'string' ||
      profile.avatarURL.length > 2048
    )
      return
    const url = new URL(profile.avatarURL)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined
  } catch {
    return
  }
}

export async function listAdminUsers(rawQuery: unknown): Promise<AdminListResponse<AdminUserRow>> {
  const parsed = AdminUserListQuerySchema.safeParse(rawQuery)
  if (!parsed.success) throw invalid()
  const query = parsed.data
  const where: Prisma.gm_userWhereInput = {
    ...(query.rank
      ? { id: query.rank === 'developer' ? { in: [...developerDiscordIDs] } : { notIn: [...developerDiscordIDs] } }
      : {}),
    ...(query.search
      ? {
          OR: [
            { id: { contains: query.search } },
            { username: { contains: query.search } },
            { steam: { contains: query.search } },
          ],
        }
      : {}),
  }
  const total = await prisma.gm_user.count({ where })
  const accepted = clamped(query, total)
  const rows = await prisma.gm_user.findMany({
    where,
    select: { id: true, username: true, steam: true, createdAt: true, updatedAt: true },
    skip: accepted.offset,
    take: accepted.limit,
    orderBy: [{ [accepted.sort]: accepted.orderBy.toLowerCase() }, { id: 'asc' }],
  })
  const [sessions, avatars] = await Promise.all([
    rows.length
      ? prisma.gm_panelToken.groupBy({
          by: ['discordID'],
          where: { ...activeSessions(new Date()), discordID: { in: rows.map((row) => row.id) } },
          _count: { _all: true },
          _max: { lastSeenAt: true, creationDate: true },
        })
      : [],
    cacheValues(rows.map((row) => `gmi:auth:profile:${row.id}`)),
  ])
  const activity = new Map(sessions.map((session) => [session.discordID, session]))
  return {
    items: rows.map((row, index) => {
      const session = activity.get(row.id)
      const seen = session
        ? Math.max(session._max.lastSeenAt?.getTime() || 0, session._max.creationDate?.getTime() || 0)
        : 0
      const avatarURL = cachedAvatar(avatars.values[index])
      return {
        id: row.id,
        username: row.username || '',
        steamID64: row.steam || null,
        rank: getPlatformRank(row.id),
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
        lastSeenAt: seen ? new Date(seen).toISOString() : null,
        activeSessions: session?._count._all || 0,
        ...(avatarURL ? { avatarURL } : {}),
      }
    }),
    total,
    query: accepted,
  }
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const now = new Date()
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const [
    guilds,
    servers,
    discordUsers,
    linkedUsers,
    steamProfiles,
    memberships,
    sessions,
    recentGuilds,
    recentServers,
    recentUsers,
    languages,
    premium,
  ] = await Promise.all([
    prisma.gm_guild.count(),
    prisma.gm_server.count(),
    prisma.gm_user.count(),
    prisma.gm_user.count({ where: { AND: [{ steam: { not: null } }, { steam: { not: '' } }] } }),
    prisma.users.count(),
    prisma.gm_guild.aggregate({ _sum: { member: true } }),
    prisma.gm_panelToken.count({ where: activeSessions(now) }),
    prisma.gm_guild.count({ where: { createdAt: { gte: since } } }),
    prisma.gm_server.count({ where: { createdAt: { gte: since } } }),
    prisma.gm_user.count({ where: { createdAt: { gte: since } } }),
    prisma.gm_guild.groupBy({ by: ['language'], _count: { _all: true }, orderBy: { language: 'asc' } }),
    prisma.$queryRaw<{ manualPremium: bigint; gmodstorePremium: bigint }[]>(Prisma.sql`SELECT
      (SELECT COUNT(*) FROM gm_guild g WHERE ${manualGrant}) AS manualPremium,
      (SELECT COUNT(*) FROM gm_guild g WHERE ${storeGrant}) AS gmodstorePremium`),
  ])
  return {
    totals: {
      guilds,
      servers,
      discordUsers,
      linkedUsers,
      steamProfiles,
      discordMemberships: count(memberships._sum.member),
      activeSessions: sessions,
      manualPremium: count(premium[0]?.manualPremium),
      gmodstorePremium: count(premium[0]?.gmodstorePremium),
    },
    recent: { days: 7, guilds: recentGuilds, servers: recentServers, users: recentUsers },
    languages: languages.map((language) => ({ language: language.language, count: language._count._all })),
    generatedAt: now.toISOString(),
  }
}

export async function updateAdminServer(serverID: string, input: unknown): Promise<AdminServerRow> {
  const target = id(serverID)
  const parsed = AdminServerUpdateSchema.safeParse(input)
  if (!parsed.success) throw invalid()
  const current = await prisma.gm_server.findFirst({ where: { id: target }, select: { id: true } })
  if (!current) throw missing()
  const { reason: _reason, ...data } = parsed.data
  return (await serverRows([await prisma.gm_server.update({ where: { id: target }, data, select: serverSelect })]))[0]
}

async function serverCommand(serverID: string, input: unknown) {
  const target = id(serverID)
  const parsed = AdminServerCommandSchema.safeParse(input)
  if (!parsed.success || parsed.data.confirm !== target) throw invalid()
  const server = await getServerFromID(target)
  if (!server) throw missing()
  return server
}
export async function deleteAdminServer(serverID: string, input: unknown): Promise<{ deleted: true }> {
  const server = await serverCommand(serverID, input)
  await server.delete()
  return { deleted: true }
}
export async function resetAdminServerToken(serverID: string, input: unknown): Promise<{ reset: true }> {
  const server = await serverCommand(serverID, input)
  await server.regenerateToken()
  return { reset: true }
}

function unavailableAccess(guildID: string): AccessSnapshot {
  return {
    guildID,
    premium: false,
    customBot: false,
    state: 'unknown',
    sources: [],
    revision: 'unavailable',
    validUntil: new Date().toISOString(),
  }
}

export async function updateAdminPremium(guildID: string, input: unknown): Promise<AdminPremiumMutationResult> {
  const target = id(guildID)
  const parsed = AdminPremiumUpdateSchema.safeParse(input)
  if (!parsed.success) throw invalid()
  const current = await prisma.gm_guild.findFirst({ where: { guild: target }, select: { guild: true } })
  if (!current) throw missing()
  if (parsed.data.enabled)
    await prisma.gm_guild_premium.upsert({
      where: { guildID: target },
      create: { guildID: target, revoked: false },
      update: { revoked: false },
    })
  else await prisma.gm_guild_premium.updateMany({ where: { guildID: target }, data: { revoked: true } })
  let pending = false
  try {
    await invalidateGuildAccess(target)
  } catch {
    pending = true
  }
  let access: AccessSnapshot
  try {
    access = await resolveGuildAccess(target)
  } catch {
    access = unavailableAccess(target)
    pending = true
  }
  return { guildID: target, manualPremium: parsed.data.enabled, access, pending: pending || access.state !== 'ready' }
}
