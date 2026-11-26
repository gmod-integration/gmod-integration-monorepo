import { z } from 'zod'
import { AccessSnapshotSchema } from '../server/AccessPolicySchema.js'

export const AdminIDSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(/^[a-zA-Z0-9_-]+$/)
export const AdminReasonSchema = z.string().trim().min(5).max(500)
export const AdminRankSchema = z.enum(['user', 'developer'])
export const AdminPremiumFilterSchema = z.enum(['all', 'manual', 'gmodstore', 'discord', 'none'])
const queryNumber = (value: unknown) => (typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value)
const offset = z.preprocess(queryNumber, z.number().int().min(0).max(10_000_000).default(0))
const limit = z.preprocess(
  queryNumber,
  z.union([z.literal(25), z.literal(50), z.literal(250), z.literal(500)]).default(25),
)
const baseQuery = z.object({
  offset,
  limit,
  search: z.string().trim().max(100).default(''),
  orderBy: z.enum(['ASC', 'DESC']).default('DESC'),
})

export const AdminGuildListQuerySchema = baseQuery
  .extend({
    sort: z.enum(['createdAt', 'updatedAt', 'name', 'members', 'id']).default('createdAt'),
    premium: AdminPremiumFilterSchema.default('all'),
  })
  .strict()
export const AdminServerListQuerySchema = baseQuery
  .extend({
    sort: z.enum(['createdAt', 'updatedAt', 'name', 'id']).default('createdAt'),
    guildID: AdminIDSchema.optional(),
    verified: z.enum(['all', 'verified', 'unverified']).default('all'),
    visibility: z.enum(['all', 'public', 'private']).default('all'),
  })
  .strict()
export const AdminUserListQuerySchema = baseQuery
  .extend({
    sort: z.enum(['createdAt', 'updatedAt', 'username', 'id']).default('createdAt'),
    rank: AdminRankSchema.optional(),
  })
  .strict()
export const AdminPremiumListQuerySchema = AdminGuildListQuerySchema

export interface AdminListQuery {
  offset: number
  limit: number
  search: string
  sort: string
  orderBy: 'ASC' | 'DESC'
  premium?: z.infer<typeof AdminPremiumFilterSchema>
  guildID?: string
  rank?: z.infer<typeof AdminRankSchema>
  verified?: 'all' | 'verified' | 'unverified'
  visibility?: 'all' | 'public' | 'private'
}
export interface AdminListResponse<T> {
  items: T[]
  total: number
  query: AdminListQuery
}

export const AdminGuildRowSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    language: z.string(),
    members: z.number().int().nonnegative(),
    serverCount: z.number().int().nonnegative(),
    manualPremium: z.boolean(),
    gmodstore: z.boolean(),
    discordPremium: z.boolean().nullable().default(null),
    partner: z.boolean().default(false),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()
export type AdminGuildRow = z.infer<typeof AdminGuildRowSchema>
export const AdminServerRowSchema = z
  .object({
    id: z.string(),
    guildID: z.string(),
    guildName: z.string(),
    name: z.string(),
    verified: z.boolean(),
    isPublic: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    addonVersion: z.string().nullable(),
    lastSeenAt: z.string().datetime().nullable(),
    recentlyActive: z.boolean().nullable(),
  })
  .strict()
export type AdminServerRow = z.infer<typeof AdminServerRowSchema>
export const AdminUserRowSchema = z
  .object({
    id: z.string(),
    username: z.string(),
    steamID64: z.string().nullable(),
    rank: AdminRankSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    lastSeenAt: z.string().datetime().nullable(),
    activeSessions: z.number().int().nonnegative(),
    avatarURL: z.string().url().optional(),
  })
  .strict()
export type AdminUserRow = z.infer<typeof AdminUserRowSchema>
export const AdminGuildDetailSchema = z.object({ guild: AdminGuildRowSchema, access: AccessSnapshotSchema }).strict()
export type AdminGuildDetail = z.infer<typeof AdminGuildDetailSchema>
export const AdminOverviewSchema = z
  .object({
    totals: z
      .object({
        guilds: z.number().nonnegative(),
        servers: z.number().nonnegative(),
        discordUsers: z.number().nonnegative(),
        linkedUsers: z.number().nonnegative(),
        steamProfiles: z.number().nonnegative(),
        discordMemberships: z.number().nonnegative(),
        activeSessions: z.number().nonnegative(),
        manualPremium: z.number().nonnegative(),
        gmodstorePremium: z.number().nonnegative(),
        discordPremium: z.number().int().nonnegative().nullable().default(null),
      })
      .strict(),
    recent: z
      .object({
        days: z.literal(7),
        guilds: z.number().nonnegative(),
        servers: z.number().nonnegative(),
        users: z.number().nonnegative(),
      })
      .strict(),
    languages: z.array(z.object({ language: z.string(), count: z.number().nonnegative() }).strict()),
    generatedAt: z.string().datetime(),
  })
  .strict()
export type AdminOverview = z.infer<typeof AdminOverviewSchema>

export const AdminServerUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    verified: z.boolean().optional(),
    isPublic: z.boolean().optional(),
    reason: AdminReasonSchema,
  })
  .strict()
  .refine(
    (value) => value.name !== undefined || value.verified !== undefined || value.isPublic !== undefined,
    'At least one server field is required.',
  )
export const AdminServerCommandSchema = z.object({ confirm: AdminIDSchema, reason: AdminReasonSchema }).strict()
export const AdminPremiumUpdateSchema = z.object({ enabled: z.boolean(), reason: AdminReasonSchema }).strict()
export const AdminPartnerUpdateSchema = z.object({ enabled: z.boolean(), reason: AdminReasonSchema }).strict()
export const AdminRevokeSessionsSchema = z.object({ confirm: AdminIDSchema, reason: AdminReasonSchema }).strict()
export const AdminPremiumMutationResultSchema = z
  .object({
    guildID: z.string(),
    manualPremium: z.boolean(),
    access: AccessSnapshotSchema,
    pending: z.boolean(),
  })
  .strict()
export type AdminPremiumMutationResult = z.infer<typeof AdminPremiumMutationResultSchema>
export const AdminPartnerMutationResultSchema = z.object({ guildID: z.string(), partner: z.boolean() }).strict()
export type AdminPartnerMutationResult = z.infer<typeof AdminPartnerMutationResultSchema>
