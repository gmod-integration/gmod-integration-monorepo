import { mongoClient } from '@gmod/infra-mongo'
import { lookupCountry } from '@gmod/infra-geoip'
import type { ServerStatisticsResponse } from '@gmod/schema/server/ServerStatisticsSchema.js'

type CountryStatistics = ServerStatisticsResponse['countries']
type ConnectionIPs = { ip: unknown; players: number }
// Match the shared PlayerSteamID64Schema, including IDs beyond the historical 7656119 prefix.
const STEAM_ID_PATTERN = '^[0-9]{17}$'

/** Counts each player once, using their latest retained connection on this server within the period. */
export async function getServerCountryStatistics(serverID: string, from: Date, to: Date): Promise<CountryStatistics> {
  try {
    const rows = await mongoClient
      .db('gmod_integration')
      .collection('logs')
      .aggregate<ConnectionIPs>(
        [
          { $match: { serverID, type: 'player_connect', createdAt: { $gte: from, $lt: to } } },
          { $sort: { createdAt: -1, _id: -1 } },
          {
            $project: {
              // New logs identify the joining player explicitly. A legacy subject list can contain
              // IDs found inside the name, so only an unambiguous single subject is a safe fallback.
              steamID64: {
                $let: {
                  vars: {
                    candidate: {
                      $cond: [
                        { $eq: [{ $type: '$data.steamID64' }, 'missing'] },
                        {
                          $cond: [
                            { $isArray: '$playerInvolvedSteamID64' },
                            {
                              $cond: [
                                { $eq: [{ $size: '$playerInvolvedSteamID64' }, 1] },
                                { $arrayElemAt: ['$playerInvolvedSteamID64', 0] },
                                null,
                              ],
                            },
                            '$playerInvolvedSteamID64',
                          ],
                        },
                        '$data.steamID64',
                      ],
                    },
                  },
                  in: {
                    $cond: [{ $eq: [{ $type: '$$candidate' }, 'string'] }, '$$candidate', null],
                  },
                },
              },
              ip: {
                $cond: [{ $eq: [{ $type: '$data.ip' }, 'string'] }, '$data.ip', null],
              },
            },
          },
          { $match: { steamID64: { $type: 'string', $regex: STEAM_ID_PATTERN } } },
          { $group: { _id: '$steamID64', ip: { $first: '$ip' } } },
          { $group: { _id: '$ip', players: { $sum: 1 } } },
          { $project: { _id: 0, ip: '$_id', players: 1 } },
        ],
        { maxTimeMS: 5_000, timeoutMS: 5_000, allowDiskUse: true },
      )
      .toArray()

    const counts = new Map<string | null, number>()
    let totalPlayers = 0
    for (const row of rows) {
      if (!Number.isSafeInteger(row.players) || row.players <= 0) throw new Error('Invalid country aggregate')
      const country = lookupCountry(row.ip)
      counts.set(country, (counts.get(country) ?? 0) + row.players)
      totalPlayers += row.players
    }

    // Raw addresses and player identities never leave this aggregation boundary.
    return {
      available: true,
      totalPlayers,
      items: [...counts]
        .map(([country, players]) => ({ country, players }))
        .sort((a, b) => b.players - a.players || (a.country ?? 'ZZZ').localeCompare(b.country ?? 'ZZZ')),
    }
  } catch {
    // A missing or slow log store must not hide the independently stored server statistics.
    return { available: false, totalPlayers: 0, items: [] }
  }
}
