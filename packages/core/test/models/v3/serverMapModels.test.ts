import { beforeEach, describe, expect, it, vi } from 'vitest'

const status = vi.hoisted(() => ({ find: vi.fn() }))
vi.mock('@gmod/infra-prisma', () => ({ default: { gm_server_status: { findUnique: status.find } } }))
const { processGetServerMap } = await import('../../../src/models/v3/serverMapModels.js')

const now = new Date('2026-11-23T12:00:00.000Z')
const row = () => ({ map: 'rp_rockford_v2b', gameMode: 'darkrp', players: 0, maxPlayers: 64, updatedAt: now })

beforeEach(() => {
  vi.resetAllMocks()
  status.find.mockResolvedValue(row())
})

describe('server map snapshots', () => {
  it('queries only the requested server and minimizes returned data', async () => {
    status.find.mockResolvedValue({
      ...row(),
      token: 'private-token',
      ip: 'private-ip',
      playersList: 'private-players',
    })
    expect(await processGetServerMap('authorized-server', now)).toEqual({
      serverID: 'authorized-server',
      map: 'rp_rockford_v2b',
      gameMode: 'darkrp',
      players: 0,
      maxPlayers: 64,
      updatedAt: now.toISOString(),
      online: true,
    })
    expect(status.find).toHaveBeenCalledExactlyOnceWith({
      where: { id: 'authorized-server' },
      select: { map: true, gameMode: true, players: true, maxPlayers: true, updatedAt: true },
    })
  })

  it('returns unknown values rather than inventing a map when no snapshot exists', async () => {
    status.find.mockResolvedValue(null)
    expect(await processGetServerMap('server', now)).toEqual({
      serverID: 'server',
      map: null,
      gameMode: null,
      players: null,
      maxPlayers: null,
      updatedAt: null,
      online: false,
    })
  })

  it.each([
    [-300_001, false],
    [-300_000, true],
    [60_000, true],
    [60_001, false],
  ])('evaluates freshness with clock tolerance (%s ms)', async (delta, online) => {
    const updatedAt = new Date(now.getTime() + delta)
    status.find.mockResolvedValue({ ...row(), updatedAt })
    const snapshot = await processGetServerMap('server', now)
    expect(snapshot.online).toBe(online)
    expect(snapshot.updatedAt).toBe(updatedAt.toISOString())
    expect(snapshot.map).toBe('rp_rockford_v2b')
  })

  it.each(['.', '../gm_construct', 'gm..construct', 'https://example.test/map', 'a'.repeat(129), ''])(
    'does not return an invalid stored map name: %s',
    async (map) => {
      status.find.mockResolvedValue({ ...row(), map })
      expect((await processGetServerMap('server', now)).map).toBeNull()
    },
  )

  it('normalizes map filenames without changing case and sanitizes unknown fields', async () => {
    status.find.mockResolvedValue({
      ...row(),
      map: '  rp_Custom.BSP  ',
      gameMode: '  ',
      players: -1,
      maxPlayers: 1.5,
      updatedAt: new Date(Number.NaN),
    })
    expect(await processGetServerMap('server', now)).toMatchObject({
      map: 'rp_Custom',
      gameMode: null,
      players: null,
      maxPlayers: null,
      updatedAt: null,
      online: false,
    })
  })

  it('propagates a storage failure rather than presenting it as an offline server', async () => {
    status.find.mockRejectedValueOnce(new Error('Storage unavailable'))
    await expect(processGetServerMap('server', now)).rejects.toThrow('Storage unavailable')
  })
})
