import { describe, expect, it } from 'vitest'
import {
  DiscordInviteUrlSchema,
  PublicRankedServerSchema,
  PublicServerRankingQuerySchema,
  PublicServerRankingResponseSchema,
} from '../../src/server/PublicServerRankingSchema.js'

function server() {
  return {
    id: 'server-1',
    guild: 'guild-1',
    name: 'Server',
    description: '',
    image: '',
    ip: '192.0.2.1',
    port: '27015',
    vote: 4,
    rank: 1,
    online: false,
    premium: false,
    partner: false,
    discordUrl: null,
    lastSeenAt: '2026-11-20T10:00:00.000Z',
    status: { hostname: 'Server', players: 2, maxPlayers: 32, gameMode: 'sandbox', map: 'gm_construct' },
    activity: [{ at: '2026-11-19T00:00:00.000Z', players: 12 }],
  }
}

describe('public server ranking contract', () => {
  it('defaults to ten rows and validates bounded filters and page sizes', () => {
    expect(PublicServerRankingQuerySchema.parse({})).toEqual({
      limit: 10,
      offset: 0,
      search: '',
      gameMode: '',
      status: 'all',
    })
    expect(
      PublicServerRankingQuerySchema.parse({
        limit: '25',
        offset: '50',
        search: '  downtown  ',
        gameMode: 'darkrp',
        status: 'offline',
      }),
    ).toEqual({ limit: 25, offset: 50, search: 'downtown', gameMode: 'darkrp', status: 'offline' })
    expect(PublicServerRankingQuerySchema.parse({ limit: 50 }).limit).toBe(50)
    for (const query of [
      { limit: 100 },
      { limit: -1 },
      { offset: -10 },
      { offset: 1.5 },
      { offset: 1_000_001 },
      { limit: 'NaN' },
      { search: 'a'.repeat(101) },
      { gameMode: 'a'.repeat(101) },
      { status: 'unknown' },
    ]) {
      expect(PublicServerRankingQuerySchema.safeParse(query).success).toBe(false)
    }
  })

  it('only accepts HTTPS invitations on Discord invite domains', () => {
    for (const url of [
      'https://discord.gg/Example-123_',
      'https://discord.com/invite/Example/',
      'https://discord.gg/a',
    ]) {
      expect(DiscordInviteUrlSchema.safeParse(url).success).toBe(true)
    }
    for (const url of [
      'javascript:alert(1)',
      'http://discord.gg/example',
      'https://discord.gg.evil.test/code',
      'https://discord.gg@example.test/code',
      'https://example.test/invite/code',
      'https://discord.com/channels/123/456',
      'https://discord.gg/',
    ]) {
      expect(DiscordInviteUrlSchema.safeParse(url).success).toBe(false)
    }
  })

  it('represents historical activity for an offline server without a Discord invitation', () => {
    const ranked = server()
    const response = {
      servers: [ranked],
      pagination: { total: 1, limit: 10, offset: 0 },
      filters: { gameModes: ['sandbox'] },
    }
    expect(PublicServerRankingResponseSchema.parse(response)).toEqual(response)
    expect(PublicServerRankingResponseSchema.parse({ ...response, servers: [] }).servers).toEqual([])
    expect(
      PublicServerRankingResponseSchema.safeParse({
        ...response,
        servers: [{ ...ranked, activity: [{ at: 'invalid-date', players: -1 }] }],
      }).success,
    ).toBe(false)
    expect(
      PublicServerRankingResponseSchema.safeParse({ ...response, servers: [{ ...ranked, rank: 0 }] }).success,
    ).toBe(false)
  })

  it('defaults missing badges from an older API response to false', () => {
    const older = { ...server(), premium: undefined, partner: undefined }

    expect(PublicRankedServerSchema.parse(older)).toMatchObject({ premium: false, partner: false })
  })

  it.each([
    { premium: true, partner: false },
    { premium: false, partner: true },
    { premium: true, partner: true },
  ])('preserves distinct Premium and partner flags: %j', (badges) => {
    expect(PublicRankedServerSchema.parse({ ...server(), ...badges })).toMatchObject(badges)
  })

  it.each(['premium', 'partner'])('requires a boolean for %s instead of coercing truthy values', (flag) => {
    for (const value of ['true', 'false', 1, 0, null, {}]) {
      expect(PublicRankedServerSchema.safeParse({ ...server(), [flag]: value }).success).toBe(false)
    }
  })
})
