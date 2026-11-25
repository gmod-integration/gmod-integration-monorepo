import { z } from 'zod'
import { AdminIDSchema } from './AdminDashboardSchema.js'

const number = (value: unknown) => (typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value)
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const pagination = z.object({
  offset: z.preprocess(number, count.max(10_000_000).default(0)),
  limit: z.preprocess(number, z.union([z.literal(25), z.literal(50), z.literal(250), z.literal(500)]).default(25)),
  search: z.string().trim().max(100).default(''),
  guildID: AdminIDSchema.optional(),
  sort: z.enum(['createdAt', 'reports']).default('createdAt'),
  orderBy: z.enum(['ASC', 'DESC']).default('DESC'),
})
const period = z.preprocess(number, z.union([z.literal(7), z.literal(30), z.literal(90)]).default(7))
const recurring = z.preprocess(
  (value) => (value === 'true' ? true : value === 'false' ? false : value),
  z.boolean().default(false),
)

export const AdminConnectionsQuerySchema = pagination
  .omit({ sort: true })
  .extend({ sort: z.literal('createdAt').default('createdAt') })
  .strict()
export const AdminErrorsQuerySchema = pagination
  .omit({ guildID: true })
  .extend({
    days: period,
    source: z.enum(['integration', 'all']).default('integration'),
    recurringOnly: recurring,
  })
  .strict()
export const AdminBugsQuerySchema = pagination
  .omit({ guildID: true })
  .extend({
    days: period,
    state: z.enum(['open', 'all']).default('open'),
    recurringOnly: recurring,
  })
  .strict()

export const AdminConnectionRowSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    guildID: z.string(),
    guildName: z.string(),
    activeSockets: count.nullable(),
    leaseExpiresAt: z.string().datetime().nullable(),
    addonVersion: z
      .string()
      .max(64)
      .regex(/^v?\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/)
      .nullable()
      .default(null),
    lastSeenAt: z.string().datetime().nullable().default(null),
    lastHttpAt: z.string().datetime().nullable().default(null),
    lastWebsocketAt: z.string().datetime().nullable().default(null),
    protocol: z.enum(['legacy', 'acknowledged']).nullable().default(null),
    httpRequestsPerMinute: count.nullable().default(null),
    websocketRequestsPerMinute: count.nullable().default(null),
    requestsPerMinute: count.nullable().default(null),
  })
  .strict()
export const AdminConnectionsSchema = z
  .object({
    items: z.array(AdminConnectionRowSchema).max(500),
    total: count,
    query: AdminConnectionsQuerySchema,
    presence: z.enum(['ready', 'unavailable']),
    observedAt: z.string().datetime().nullable(),
    leaseTtlSeconds: z.literal(90),
    telemetry: z.enum(['ready', 'unavailable']).default('unavailable'),
    trafficWindowSeconds: z.literal(60).default(60),
    trafficObservedAt: z.string().datetime().nullable().default(null),
    generatedAt: z.string().datetime(),
  })
  .strict()

export const AdminIncidentRowSchema = z
  .object({
    id: z.string().regex(/^[a-f0-9]{64}$/),
    summary: z.string().max(600),
    reports: count,
    serverCount: count,
    firstSeenAt: z.string().datetime(),
    lastSeenAt: z.string().datetime(),
  })
  .strict()
export const AdminErrorGroupSchema = AdminIncidentRowSchema.extend({
  realm: z.enum(['client', 'server', 'unknown']),
  occurrences: count,
}).strict()
export const AdminErrorsSchema = z
  .object({
    items: z.array(AdminErrorGroupSchema).max(500),
    total: count,
    query: AdminErrorsQuerySchema,
    since: z.string().datetime(),
    generatedAt: z.string().datetime(),
  })
  .strict()
export const AdminBugsSchema = z
  .object({
    items: z.array(AdminIncidentRowSchema).max(500),
    total: count,
    query: AdminBugsQuerySchema,
    since: z.string().datetime(),
    generatedAt: z.string().datetime(),
  })
  .strict()

export type AdminConnections = z.infer<typeof AdminConnectionsSchema>
export type AdminErrors = z.infer<typeof AdminErrorsSchema>
export type AdminBugs = z.infer<typeof AdminBugsSchema>
export type AdminIncident = z.infer<typeof AdminIncidentRowSchema>
