import { z } from 'zod'

type CapabilityPolicy = {
  scope: 'guild' | 'server'
  entitlement: 'free' | 'premium' | 'gmodstore'
  freeLimit: number | null
  premiumLimit: number | null
}

/** Commercial limits, shared by enforcement, dashboard controls and the plan comparison. */
export const ACCESS_POLICY = {
  'guild.servers': { scope: 'guild', entitlement: 'free', freeLimit: 1, premiumLimit: null },
  'guild.links': { scope: 'guild', entitlement: 'free', freeLimit: 2, premiumLimit: null },
  'guild.auto_roles': { scope: 'guild', entitlement: 'free', freeLimit: 3, premiumLimit: null },
  'verification.roles': { scope: 'guild', entitlement: 'free', freeLimit: 2, premiumLimit: null },
  'sync.roles.rules': { scope: 'server', entitlement: 'free', freeLimit: 4, premiumLimit: null },
  'sync.nicknames.rules': { scope: 'server', entitlement: 'free', freeLimit: 3, premiumLimit: null },
  'status.buttons': { scope: 'server', entitlement: 'free', freeLimit: 3, premiumLimit: 25 },
  'sync.teams': { scope: 'server', entitlement: 'premium', freeLimit: 0, premiumLimit: null },
  'chat.filters': { scope: 'server', entitlement: 'premium', freeLimit: 0, premiumLimit: null },
  'status.chart': { scope: 'server', entitlement: 'premium', freeLimit: 0, premiumLimit: 1 },
  'logs.triggers': { scope: 'server', entitlement: 'premium', freeLimit: 0, premiumLimit: null },
  'sync.roles.reverse': { scope: 'server', entitlement: 'premium', freeLimit: 0, premiumLimit: 1 },
  'sync.nicknames.reverse': { scope: 'server', entitlement: 'premium', freeLimit: 0, premiumLimit: 1 },
  'chat.reverse': { scope: 'server', entitlement: 'premium', freeLimit: 0, premiumLimit: 1 },
  'chat.relay_default': { scope: 'server', entitlement: 'premium', freeLimit: 0, premiumLimit: 1 },
  'verification.preferences': { scope: 'guild', entitlement: 'premium', freeLimit: 0, premiumLimit: 1 },
  'bot.presence': { scope: 'guild', entitlement: 'premium', freeLimit: 0, premiumLimit: 1 },
  'bot.custom': { scope: 'guild', entitlement: 'gmodstore', freeLimit: 0, premiumLimit: 1 },
  'console.rcon': { scope: 'server', entitlement: 'premium', freeLimit: 0, premiumLimit: 1 },
  'rewards.rules': { scope: 'server', entitlement: 'premium', freeLimit: 0, premiumLimit: null },
  'logs.history': { scope: 'server', entitlement: 'free', freeLimit: 500, premiumLimit: null },
  'errors.history': { scope: 'server', entitlement: 'free', freeLimit: 50, premiumLimit: null },
  'sync.nicknames.format': { scope: 'server', entitlement: 'free', freeLimit: null, premiumLimit: null },
} as const satisfies Record<string, CapabilityPolicy>

export type CapabilityKey = keyof typeof ACCESS_POLICY
export const CapabilityKeySchema = z.enum(Object.keys(ACCESS_POLICY) as [CapabilityKey, ...CapabilityKey[]])
export const AccessSnapshotSchema = z
  .object({
    guildID: z.string().min(1),
    premium: z.boolean(),
    customBot: z.boolean(),
    state: z.enum(['ready', 'unknown']),
    sources: z.array(z.enum(['legacy', 'gmodstore', 'discord'])),
    revision: z.string().min(1),
    validUntil: z.string().datetime(),
  })
  .strict()
export type AccessSnapshot = z.infer<typeof AccessSnapshotSchema>
export type AccessIdentity = Pick<AccessSnapshot, 'premium' | 'customBot' | 'state'>

export function hasCapability(access: AccessIdentity, capability: CapabilityKey): boolean {
  const policy = ACCESS_POLICY[capability]
  return policy.entitlement === 'free' || (policy.entitlement === 'gmodstore' ? access.customBot : access.premium)
}

/** null means no commercial count limit; operational safety limits remain separate. */
export function capabilityLimit(access: AccessIdentity, capability: CapabilityKey): number | null {
  const policy = ACCESS_POLICY[capability]
  if (!hasCapability(access, capability)) return 0
  return (policy.entitlement === 'gmodstore' ? access.customBot : access.premium)
    ? policy.premiumLimit
    : policy.freeLimit
}

export const AccessDecisionSchema = z
  .object({
    allowed: z.boolean(),
    limit: z.number().int().nonnegative().nullable(),
    used: z.number().int().nonnegative().nullable(),
    reason: z.enum(['upgrade_required', 'quota_reached', 'entitlement_unknown']).optional(),
  })
  .strict()
export const AccessResponseSchema = AccessSnapshotSchema.extend({
  usages: z.record(CapabilityKeySchema, z.number().int().nonnegative()),
  serverID: z.string().min(1).optional(),
})
export type AccessResponse = z.infer<typeof AccessResponseSchema>

/** Callers supply a deterministic saved order; policy never deletes excess resources. */
export function limitResources<T>(access: AccessIdentity, capability: CapabilityKey, rows: T[]): T[] {
  const limit = capabilityLimit(access, capability)
  return limit === null ? rows : rows.slice(0, limit)
}
