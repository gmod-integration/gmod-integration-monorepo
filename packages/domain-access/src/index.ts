import { createHash } from 'node:crypto'
import { ConfigDiscord } from '@gmod/config'
import prisma from '@gmod/infra-prisma'
import redis from '@gmod/infra-redis'
import { z } from 'zod'
import {
  ACCESS_POLICY,
  AccessSnapshotSchema,
  capabilityLimit,
  hasCapability,
  type AccessSnapshot,
  type CapabilityKey,
} from '@gmod/schema/server/AccessPolicySchema.js'

export {
  ACCESS_POLICY,
  capabilityLimit,
  hasCapability,
  limitResources,
} from '@gmod/schema/server/AccessPolicySchema.js'
export type { AccessSnapshot, CapabilityKey } from '@gmod/schema/server/AccessPolicySchema.js'

export class AccessDeniedError extends Error {
  readonly status: 403 | 503
  constructor(
    readonly capability: CapabilityKey,
    readonly code: 'upgrade_required' | 'quota_reached' | 'entitlement_unknown',
    readonly limit?: number | null,
    readonly used?: number,
  ) {
    super(
      code === 'entitlement_unknown'
        ? 'Access could not be verified. Please try again.'
        : 'This action exceeds the available access.',
    )
    this.name = 'AccessDeniedError'
    this.status = code === 'entitlement_unknown' ? 503 : 403
  }
}

export function assertCapability(access: AccessSnapshot, capability: CapabilityKey): void {
  if (hasCapability(access, capability)) return
  throw new AccessDeniedError(
    capability,
    access.state === 'unknown' && ACCESS_POLICY[capability].entitlement !== 'gmodstore'
      ? 'entitlement_unknown'
      : 'upgrade_required',
  )
}

export function assertQuota(access: AccessSnapshot, capability: CapabilityKey, used: number): void {
  assertCapability(access, capability)
  const limit = capabilityLimit(access, capability)
  if (limit !== null && used >= limit)
    throw new AccessDeniedError(
      capability,
      access.state === 'unknown' ? 'entitlement_unknown' : 'quota_reached',
      limit,
      used,
    )
}

const serverRestrictions: Record<
  string,
  { capability: CapabilityKey; fallback: unknown; free: (value: unknown) => boolean }
> = {
  sync_role_direction: {
    capability: 'sync.roles.reverse',
    fallback: 'gmod-to-discord',
    free: (value) => value === 'gmod-to-discord',
  },
  sync_pseudo_direction: {
    capability: 'sync.nicknames.reverse',
    fallback: 'gmod-to-discord',
    free: (value) => value === 'gmod-to-discord' || value === 'disable',
  },
  syncChatDirection: {
    capability: 'chat.reverse',
    fallback: 'gmodToDiscord',
    free: (value) => value === 'gmodToDiscord',
  },
  chat_sync_relay_all: { capability: 'chat.relay_default', fallback: true, free: (value) => value === true },
  show_status_chart: { capability: 'status.chart', fallback: false, free: (value) => value === false },
}
const guildRestrictions: Record<
  string,
  { capability: CapabilityKey; fallback: unknown; free: (value: unknown) => boolean }
> = {
  verification_dont_mp: { capability: 'verification.preferences', fallback: false, free: (value) => value === false },
  verification_dont_join_support: {
    capability: 'verification.preferences',
    fallback: false,
    free: (value) => value === false,
  },
  bot_status: { capability: 'bot.presence', fallback: 'disabled', free: (value) => value === 'disabled' },
}

export function serverSettingCapability(setting: string): CapabilityKey | undefined {
  return serverRestrictions[setting]?.capability
}
export function guildSettingCapability(setting: string): CapabilityKey | undefined {
  return guildRestrictions[setting]?.capability
}
export function effectiveServerSetting<T>(access: AccessSnapshot, setting: string, stored: T): T {
  const restriction = serverRestrictions[setting]
  return restriction && !hasCapability(access, restriction.capability) && !restriction.free(stored)
    ? (restriction.fallback as T)
    : stored
}
export function effectiveGuildSetting<T>(access: AccessSnapshot, setting: string, stored: T): T {
  const restriction = guildRestrictions[setting]
  return restriction && !hasCapability(access, restriction.capability) && !restriction.free(stored)
    ? (restriction.fallback as T)
    : stored
}
export function assertServerSettingChange(
  access: AccessSnapshot,
  setting: string,
  next: unknown,
  previous: unknown,
): void {
  const restriction = serverRestrictions[setting]
  if (restriction && JSON.stringify(next) !== JSON.stringify(previous) && !restriction.free(next))
    assertCapability(access, restriction.capability)
}
export function assertGuildSettingChange(
  access: AccessSnapshot,
  setting: string,
  next: unknown,
  previous: unknown,
): void {
  const restriction = guildRestrictions[setting]
  if (restriction && JSON.stringify(next) !== JSON.stringify(previous) && !restriction.free(next))
    assertCapability(access, restriction.capability)
}

const DiscordEntitlementSchema = z
  .object({
    id: z.string().min(1),
    application_id: z.string().min(1),
    sku_id: z.string().min(1),
    guild_id: z.string().optional(),
    deleted: z.boolean(),
    user_id: z.string().optional(),
    type: z.number().int().optional(),
    starts_at: z.string().datetime({ offset: true }).nullable().optional(),
    ends_at: z.string().datetime({ offset: true }).nullable().optional(),
    consumed: z.boolean().optional(),
  })
  .passthrough()
export type DiscordEntitlement = z.infer<typeof DiscordEntitlementSchema>

/** Discord's list includes expired entitlements; never infer validity from guild_id alone.
 * Contract: https://docs.discord.com/developers/resources/entitlement#list-entitlements */
export async function getDiscordEntitlements(guildID?: string): Promise<DiscordEntitlement[]> {
  if (!ConfigDiscord.clientID || !ConfigDiscord.botToken || !ConfigDiscord.subscriptionSKUID)
    throw new Error('Discord entitlement verification is unavailable')
  const entitlements: DiscordEntitlement[] = []
  let after: string | undefined
  const visited = new Set<string>()
  for (let page = 0; page < 1000; page++) {
    const url = new URL(`https://discord.com/api/v10/applications/${ConfigDiscord.clientID}/entitlements`)
    url.searchParams.set('limit', '100')
    url.searchParams.set('sku_ids', ConfigDiscord.subscriptionSKUID)
    url.searchParams.set('exclude_ended', 'true')
    url.searchParams.set('exclude_deleted', 'true')
    if (guildID) url.searchParams.set('guild_id', guildID)
    if (after) url.searchParams.set('after', after)
    const response = await fetch(url, {
      headers: { Authorization: `Bot ${ConfigDiscord.botToken}` },
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) throw new Error('Discord entitlement verification is unavailable')
    const entries = z.array(DiscordEntitlementSchema).parse(await response.json())
    entitlements.push(...entries)
    if (entries.length < 100)
      return entitlements.filter((entitlement) =>
        activeEntitlement(entitlement, guildID ?? entitlement.guild_id ?? '', Date.now()),
      )
    after = entries.at(-1)!.id
    if (visited.has(after)) throw new Error('Discord entitlement pagination did not advance')
    visited.add(after)
  }
  throw new Error('Discord entitlement pagination exceeded its bound')
}

function activeEntitlement(entitlement: DiscordEntitlement, guildID: string, now: number): boolean {
  return (
    entitlement.guild_id === guildID &&
    entitlement.application_id === ConfigDiscord.clientID &&
    entitlement.sku_id === ConfigDiscord.subscriptionSKUID &&
    !entitlement.deleted &&
    !entitlement.consumed &&
    (entitlement.starts_at == null || Date.parse(entitlement.starts_at) <= now) &&
    (entitlement.ends_at == null || Date.parse(entitlement.ends_at) > now)
  )
}

const cacheKey = (guildID: string) => `guild:${guildID}:access:v1`
const generations = new Map<string, number>()
const inFlight = new Map<string, Promise<AccessSnapshot>>()
const bypassCache = new Set<string>()
export async function invalidateGuildAccess(guildID: string): Promise<void> {
  generations.set(guildID, (generations.get(guildID) || 0) + 1)
  bypassCache.add(guildID)
  inFlight.delete(guildID)
  await redis.del(cacheKey(guildID), `guild:${guildID}:premium`)
}

export async function resolveGuildAccess(guildID: string): Promise<AccessSnapshot> {
  if (!guildID) throw new Error('A community is required to resolve access')
  const existing = inFlight.get(guildID)
  if (existing) return existing
  const generation = generations.get(guildID) || 0
  const operation: Promise<AccessSnapshot> = resolve(guildID, generation).then((snapshot) => {
    if (generation !== (generations.get(guildID) || 0)) {
      // An invalidation while a provider request was in flight supersedes its result as well as its cache write.
      if (inFlight.get(guildID) === operation) inFlight.delete(guildID)
      return resolveGuildAccess(guildID)
    }
    return snapshot
  })
  inFlight.set(guildID, operation)
  try {
    return await operation
  } finally {
    if (inFlight.get(guildID) === operation) inFlight.delete(guildID)
  }
}

async function resolve(guildID: string, generation: number): Promise<AccessSnapshot> {
  try {
    const raw = bypassCache.has(guildID) ? null : await redis.get(cacheKey(guildID))
    if (raw) {
      const parsed = AccessSnapshotSchema.safeParse(JSON.parse(raw))
      if (
        parsed.success &&
        parsed.data.guildID === guildID &&
        parsed.data.state === 'ready' &&
        Date.parse(parsed.data.validUntil) > Date.now()
      )
        return parsed.data
    }
  } catch {
    /* A cache outage cannot remove a database entitlement. */
  }
  const [legacy, purchase] = await Promise.all([
    prisma.gm_guild_premium.findFirst({ where: { guildID } }),
    prisma.gm_gmodstore_purchases.findFirst({ where: { guild: guildID, revoke: false } }),
  ])
  const sources: AccessSnapshot['sources'] = []
  if (legacy) sources.push('legacy')
  if (purchase) sources.push('gmodstore')
  let state: AccessSnapshot['state'] = 'ready'
  let expires = Infinity
  if (!sources.length) {
    try {
      const resolved = await getDiscordEntitlements(guildID)
      const now = Date.now()
      const entitlements = resolved.filter((entitlement) => activeEntitlement(entitlement, guildID, now))
      if (entitlements.length) {
        sources.push('discord')
        // The last valid source determines union validity; no single expired source revokes another.
        const latestEnd = Math.max(
          ...entitlements.map((entitlement) =>
            entitlement.ends_at == null ? Infinity : Date.parse(entitlement.ends_at),
          ),
        )
        expires = Math.min(expires, latestEnd)
      }
    } catch {
      state = 'unknown'
    }
  }
  // Network and database reads can span an entitlement boundary; cache validity starts at resolution.
  expires = Math.min(Date.now() + 60_000, expires)
  const values = {
    guildID,
    premium: sources.length > 0,
    customBot: !!purchase,
    state,
    sources,
    validUntil: new Date(expires).toISOString(),
  }
  const snapshot: AccessSnapshot = {
    ...values,
    revision: createHash('sha256').update(JSON.stringify(values)).digest('hex'),
  }
  if (state === 'ready' && generation === (generations.get(guildID) || 0)) {
    try {
      await redis.set(
        cacheKey(guildID),
        JSON.stringify(snapshot),
        'EX',
        Math.max(1, Math.ceil((expires - Date.now()) / 1000)),
      )
      if (generation === (generations.get(guildID) || 0)) bypassCache.delete(guildID)
      else await redis.del(cacheKey(guildID))
    } catch {
      /* Rights have already been resolved from their authoritative sources. */
    }
  }
  return snapshot
}
