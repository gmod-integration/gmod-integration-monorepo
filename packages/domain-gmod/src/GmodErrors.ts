import { type GmodErrorsInput, GmodErrorsSchema } from '@gmod/schema/gmod/GmodErrorsSchema.js'
import { mongoClient } from '@gmod/infra-mongo'
import { isErasureBlocked } from '@gmod/domain-user/privacy.js'

interface OffsetLimitQuery {
  offset: number
  limit: number
  sort?: string
  orderBy?: 'ASC' | 'DESC'
}

const db = mongoClient.db('gmod_integration')
const collection = db.collection('errors')

export class GmodErrors {
  public readonly serverID: string
  public readonly count: number
  public readonly realm: string
  public readonly error: string
  public readonly stack: string
  public readonly name: string
  public readonly steamID64: string
  public readonly workshopID: string
  public readonly uptime: number

  private constructor(data: GmodErrorsInput) {
    const parsed = GmodErrorsSchema.parse(data)
    this.serverID = parsed.serverID
    this.count = parsed.count
    this.realm = parsed.realm
    this.error = parsed.error
    this.stack = parsed.stack
    this.name = parsed.name || ''
    this.steamID64 = parsed.steamID64 || ''
    this.workshopID = parsed.workshopID || ''
    this.uptime = parsed.uptime
  }

  public static from(data: unknown): GmodErrors {
    return new GmodErrors(data as GmodErrorsInput)
  }

  public async save() {
    if (await isErasureBlocked(undefined, this.steamID64)) return
    const inserted = await collection.insertOne({
      error: this.error,
      stack: this.stack,
      workshopID: this.workshopID || '',
      serverID: this.serverID,
      name: this.name,
      realm: this.realm,
      steamID64: this.steamID64 || '',
      uptime: this.uptime,
      count: this.count,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    if (await isErasureBlocked(undefined, this.steamID64)) {
      await collection.deleteOne({ _id: inserted.insertedId })
      return
    }
    return inserted
  }
}

export async function getErrorsCountByServer(serverID: string) {
  return await collection.countDocuments({
    serverID,
  })
}

export async function getErrorsCountBySteamID(steamID64: string) {
  return await collection.countDocuments({
    steamID64,
  })
}

export async function getErrorsBySteamID(steamID64: string, query: OffsetLimitQuery) {
  return {
    errors: await collection
      .find({
        steamID64,
      })
      .limit(query.limit)
      .skip(query.offset)
      .toArray(),
    query: {
      ...query,
      total: await collection.countDocuments({
        steamID64,
      }),
    },
  }
}

export async function getErrorsByServer(query: OffsetLimitQuery, serverID: string, readLimit?: number | null) {
  if (readLimit !== undefined && readLimit !== null) {
    const total = Math.min(await collection.countDocuments({ serverID }), readLimit)
    if (query.offset >= total) return { errors: [], query: { ...query, total } }
    const allowedSort = new Set(['createdAt', 'updatedAt', 'count', 'name', 'realm', 'uptime', 'error', 'workshopID'])
    const sort = query.sort && allowedSort.has(query.sort) ? query.sort : 'createdAt'
    const errors = await collection
      .aggregate([
        { $match: { serverID } },
        { $sort: { createdAt: -1, _id: -1 } },
        { $limit: readLimit },
        { $sort: { [sort]: query.orderBy === 'ASC' ? 1 : -1, _id: -1 } },
        { $skip: query.offset },
        { $limit: Math.min(query.limit, total - query.offset) },
      ])
      .toArray()
    return { errors, query: { ...query, total } }
  }
  return {
    errors: await collection
      .find({
        serverID,
      })
      .limit(query.limit)
      .skip(query.offset)
      .toArray(),
    query: {
      ...query,
      total: await collection.countDocuments({
        serverID,
      }),
    },
  }
}
