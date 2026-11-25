import { describe, expect, it } from 'vitest'
import { ServerMapSnapshotSchema } from '../../src/server/ServerMapSchema.js'

const snapshot = {
  serverID: 'server',
  map: 'rp_rockford_v2b',
  gameMode: 'darkrp',
  players: 0,
  maxPlayers: 64,
  updatedAt: '2026-11-23T12:00:00.000Z',
  online: true,
}

describe('server map snapshot contract', () => {
  it('preserves an empty server and represents an unknown snapshot explicitly', () => {
    expect(ServerMapSnapshotSchema.parse(snapshot).players).toBe(0)
    expect(
      ServerMapSnapshotSchema.parse({
        serverID: 'server',
        map: null,
        gameMode: null,
        players: null,
        maxPlayers: null,
        updatedAt: null,
        online: false,
      }),
    ).toMatchObject({ map: null, players: null, online: false })
  })

  it.each(['.', '..', '../gm_construct', 'gm..construct', 'https://example.test/map', 'a'.repeat(129)])(
    'rejects a map name that cannot be embedded: %s',
    (map) => expect(ServerMapSnapshotSchema.safeParse({ ...snapshot, map }).success).toBe(false),
  )

  it('rejects invalid counts, dates and unintended private data', () => {
    for (const value of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(ServerMapSnapshotSchema.safeParse({ ...snapshot, players: value }).success).toBe(false)
      expect(ServerMapSnapshotSchema.safeParse({ ...snapshot, maxPlayers: value }).success).toBe(false)
    }
    expect(ServerMapSnapshotSchema.safeParse({ ...snapshot, updatedAt: 'invalid' }).success).toBe(false)
    for (const field of ['token', 'ip', 'playersList']) {
      expect(ServerMapSnapshotSchema.safeParse({ ...snapshot, [field]: 'private' }).success).toBe(false)
    }
  })
})
