import { z } from 'zod'

export const PublicServerRankingQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .refine((value) => [10, 25, 50].includes(value))
    .default(10),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
  search: z.string().trim().max(100).default(''),
  gameMode: z.string().trim().max(100).default(''),
  status: z.enum(['all', 'online', 'offline']).default('all'),
})

export const PublicServerActivityPointSchema = z.object({
  at: z.string().datetime(),
  players: z.number().int().nonnegative(),
})

export const DiscordInviteUrlSchema = z
  .string()
  .regex(/^https:\/\/(?:discord\.gg\/|discord\.com\/invite\/)[A-Za-z0-9_-]+\/?$/)

export const PublicRankedServerSchema = z.object({
  id: z.string(),
  guild: z.string(),
  name: z.string(),
  description: z.string(),
  image: z.string(),
  ip: z.string(),
  port: z.string(),
  vote: z.number().int().nonnegative(),
  rank: z.number().int().positive(),
  online: z.boolean(),
  discordUrl: DiscordInviteUrlSchema.nullable(),
  lastSeenAt: z.string().datetime().nullable(),
  status: z
    .object({
      hostname: z.string(),
      players: z.number().int().nonnegative(),
      maxPlayers: z.number().int().nonnegative(),
      gameMode: z.string(),
      map: z.string(),
    })
    .nullable(),
  activity: z.array(PublicServerActivityPointSchema),
})

export const PublicServerRankingResponseSchema = z.object({
  servers: z.array(PublicRankedServerSchema),
  pagination: z.object({
    total: z.number().int().nonnegative(),
    offset: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
  }),
  filters: z.object({ gameModes: z.array(z.string()) }),
})

export type PublicServerRankingQuery = z.infer<typeof PublicServerRankingQuerySchema>
export type PublicServerActivityPoint = z.infer<typeof PublicServerActivityPointSchema>
export type PublicRankedServer = z.infer<typeof PublicRankedServerSchema>
export type PublicServerRankingResponse = z.infer<typeof PublicServerRankingResponseSchema>
