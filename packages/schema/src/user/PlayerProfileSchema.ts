import { z } from 'zod'

const instant = z.string().datetime()
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const queryNumber = z.union([z.string().regex(/^\d+$/), z.number()]).pipe(z.coerce.number().int())

export const PlayerSteamID64Schema = z.string().regex(/^\d{17}$/)
export const PlayerDiscordIDSchema = z.string().regex(/^\d{17,20}$/)
export const PlayerIdentifierSchema = z.string().regex(/^\d{17,20}$/)

const offset = queryNumber.refine((value) => value >= 0 && value <= 1_000_000).default(0)

export const PlayerProfileQuerySchema = z
  .object({
    limit: queryNumber.refine((value) => [10, 25, 50].includes(value)).default(10),
    offset,
    warningOffset: offset,
    banOffset: offset,
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

const pagination = z.object({ total: count, limit: z.number().int().positive().max(50), offset: count }).strict()

export const PlayerProfileWarningSchema = z
  .object({
    id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    serverID: z.string(),
    serverName: z.string(),
    reason: z.string(),
    createdAt: instant,
  })
  .strict()

export const PlayerProfileBanSchema = PlayerProfileWarningSchema.extend({
  durationMinutes: count,
  expiresAt: instant.nullable(),
  active: z.boolean(),
}).strict()

export const PlayerProfileResponseSchema = z
  .object({
    player: z
      .object({
        steamID64: PlayerSteamID64Schema,
        discordID: PlayerDiscordIDSchema.nullable(),
        name: z.string(),
        avatarURL: z.string().url().nullable(),
        discordAvatarURL: z.string().url().nullable().optional(),
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
    pagination,
    moderation: z
      .object({
        warnings: z.array(PlayerProfileWarningSchema).max(50),
        bans: z.array(PlayerProfileBanSchema).max(50),
        warningsPagination: pagination,
        bansPagination: pagination,
      })
      .strict(),
  })
  .strict()

export type PlayerProfileQuery = z.infer<typeof PlayerProfileQuerySchema>
export type PlayerProfileResponse = z.infer<typeof PlayerProfileResponseSchema>
export type PlayerProfileServer = z.infer<typeof PlayerProfileServerSchema>
export type PlayerProfileWarning = z.infer<typeof PlayerProfileWarningSchema>
export type PlayerProfileBan = z.infer<typeof PlayerProfileBanSchema>
