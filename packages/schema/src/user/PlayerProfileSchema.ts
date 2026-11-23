import { z } from 'zod'

const instant = z.string().datetime()
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const queryNumber = z.union([z.string().regex(/^\d+$/), z.number()]).pipe(z.coerce.number().int())

export const PlayerSteamID64Schema = z.string().regex(/^\d{17}$/)

export const PlayerProfileQuerySchema = z
  .object({
    limit: queryNumber.refine((value) => [10, 25, 50].includes(value)).default(10),
    offset: queryNumber.refine((value) => value >= 0 && value <= 1_000_000).default(0),
  })
  .strict()

export const PlayerProfileServerSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    image: z.string(),
    public: z.boolean(),
    gameMode: z.string().nullable(),
    map: z.string().nullable(),
    online: z.boolean(),
    playerName: z.string(),
    rank: z.string(),
    totalTime: count,
    kills: count,
    deaths: count,
    connections: count,
    firstJoinedAt: instant,
    lastSeenAt: instant,
  })
  .strict()

export const PlayerProfileResponseSchema = z
  .object({
    player: z
      .object({
        steamID64: PlayerSteamID64Schema,
        name: z.string(),
        avatarURL: z.string().url().nullable(),
        trustLevel: z.number().int().min(0).max(100).nullable(),
        registeredAt: instant.nullable(),
      })
      .strict(),
    summary: z
      .object({
        servers: count,
        totalTime: count,
        kills: count,
        deaths: count,
        connections: count,
        firstJoinedAt: instant.nullable(),
        lastSeenAt: instant.nullable(),
      })
      .strict(),
    servers: z.array(PlayerProfileServerSchema).max(50),
    pagination: z.object({ total: count, limit: z.number().int().positive().max(50), offset: count }).strict(),
  })
  .strict()

export type PlayerProfileQuery = z.infer<typeof PlayerProfileQuerySchema>
export type PlayerProfileResponse = z.infer<typeof PlayerProfileResponseSchema>
export type PlayerProfileServer = z.infer<typeof PlayerProfileServerSchema>
