import { z } from 'zod'

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable()
const mapName = z
  .string()
  .regex(/^[A-Za-z0-9_.-]{1,128}$/)
  .refine((value) => value !== '.' && !value.includes('..'))

/** An authorized server's latest map snapshot, without credentials or player telemetry. */
export const ServerMapSnapshotSchema = z
  .object({
    serverID: z.string().min(1),
    map: mapName.nullable(),
    gameMode: z.string().nullable(),
    players: count,
    maxPlayers: count,
    updatedAt: z.string().datetime().nullable(),
    online: z.boolean(),
  })
  .strict()

export type ServerMapSnapshot = z.infer<typeof ServerMapSnapshotSchema>
