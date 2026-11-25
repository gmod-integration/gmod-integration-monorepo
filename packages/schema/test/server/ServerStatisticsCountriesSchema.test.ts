import { describe, expect, it } from 'vitest'
import { ServerStatisticsCountriesSchema } from '../../src/server/ServerStatisticsSchema.js'

describe('server country statistics contract', () => {
  it('distinguishes an empty period from an unavailable data source and includes unlocated players', () => {
    for (const available of [true, false])
      expect(ServerStatisticsCountriesSchema.parse({ available, totalPlayers: 0, items: [] })).toEqual({
        available,
        totalPlayers: 0,
        items: [],
      })
    expect(
      ServerStatisticsCountriesSchema.parse({
        available: true,
        totalPlayers: 3,
        items: [
          { country: 'FR', players: 2 },
          { country: null, players: 1 },
        ],
      }).totalPlayers,
    ).toBe(3)
  })

  it('rejects inconsistent distributions, invalid countries and private player data', () => {
    const distribution = { available: true, totalPlayers: 2, items: [{ country: 'FR', players: 2 }] }
    for (const value of [
      { ...distribution, totalPlayers: 3 },
      { ...distribution, available: false },
      {
        ...distribution,
        items: [
          { country: 'FR', players: 1 },
          { country: 'FR', players: 1 },
        ],
      },
      { ...distribution, items: [{ country: 'fr', players: 2 }] },
      { ...distribution, items: [{ country: 'France', players: 2 }] },
      { ...distribution, items: [{ country: 'FR', players: -1 }] },
      { ...distribution, items: [{ country: 'FR', players: 1.5 }] },
      { ...distribution, items: [{ country: 'FR', players: 2, ip: '203.0.113.5' }] },
      { ...distribution, steamID64: '76561198000000001' },
    ])
      expect(ServerStatisticsCountriesSchema.safeParse(value).success).toBe(false)
  })
})
