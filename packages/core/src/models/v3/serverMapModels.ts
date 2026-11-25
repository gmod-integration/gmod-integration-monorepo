import prisma from '@gmod/infra-prisma'
import { ServerMapSnapshotSchema, type ServerMapSnapshot } from '@gmod/schema/server/ServerMapSchema.js'

const MAX_SNAPSHOT_AGE_MS = 5 * 60_000
const CLOCK_TOLERANCE_MS = 60_000

function normalizeMapName(value: string | null | undefined): string | null {
  const name = typeof value === 'string' ? value.trim().replace(/\.bsp$/i, '') : ''
  return /^[A-Za-z0-9_.-]{1,128}$/.test(name) && name !== '.' && !name.includes('..') ? name : null
}

function count(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

/** Callers authorize guild/server membership before reading this database-only snapshot. */
export async function processGetServerMap(serverID: string, now = new Date()): Promise<ServerMapSnapshot> {
  const snapshot = await prisma.gm_server_status.findUnique({
    where: { id: serverID },
    select: { map: true, gameMode: true, players: true, maxPlayers: true, updatedAt: true },
  })
  const updatedAt =
    snapshot?.updatedAt instanceof Date && Number.isFinite(snapshot.updatedAt.getTime()) ? snapshot.updatedAt : null
  const age = updatedAt === null ? Number.POSITIVE_INFINITY : now.getTime() - updatedAt.getTime()

  return ServerMapSnapshotSchema.parse({
    serverID,
    map: normalizeMapName(snapshot?.map),
    gameMode: typeof snapshot?.gameMode === 'string' && snapshot.gameMode.trim() ? snapshot.gameMode.trim() : null,
    players: count(snapshot?.players),
    maxPlayers: count(snapshot?.maxPlayers),
    updatedAt: updatedAt?.toISOString() ?? null,
    online: age >= -CLOCK_TOLERANCE_MS && age <= MAX_SNAPSHOT_AGE_MS,
  })
}
