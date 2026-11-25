import { mongoClient } from '@gmod/infra-mongo'
import { isErasureBlocked } from '@gmod/domain-user/privacy.js'

const db = mongoClient.db('gmod_integration')
const collectionLogs = db.collection('logs')

interface Log {
  serverID: string
  type: string
  createdAt: Date
  updatedAt: Date
  data: any
  playerInvolvedSteamID64: string | string[]
}

export async function addLog(log: Log) {
  const ids = Array.isArray(log.playerInvolvedSteamID64) ? log.playerInvolvedSteamID64 : [log.playerInvolvedSteamID64]
  for (const steamID64 of ids) {
    if (await isErasureBlocked(undefined, steamID64)) return false
  }
  const inserted = await collectionLogs.insertOne(log)
  for (const steamID64 of ids) {
    if (await isErasureBlocked(undefined, steamID64)) {
      await collectionLogs.deleteOne({ _id: inserted.insertedId })
      return false
    }
  }
  return true
}

export async function getLogsCountBySteamIDList(SteamIDS: string[]) {
  return await collectionLogs.countDocuments({
    playerInvolvedSteamID64: {
      $in: SteamIDS,
    },
  })
}

export async function getLogsBySteamIDList(
  SteamIDS: string[],
  options: {
    limit: number | 0
    offset: number | 0
  },
) {
  return await collectionLogs
    .find({
      playerInvolvedSteamID64: {
        $in: SteamIDS,
      },
    })
    .limit(options.limit)
    .skip(options.offset)
    .toArray()
}

export async function getTotalLogsByServer(serverID: string) {
  return await collectionLogs.countDocuments({
    serverID,
  })
}

/*
In mongoDB run
db.logs.createIndex({ serverID: 1, createdAt: -1 });
db.logs.createIndex({ serverID: 1, type: 1, createdAt: -1 });
 */
export async function getLogsByServer(
  serverID: string,
  options: {
    limit: number | 0
    offset: number | 0
    orderBy: 'asc' | 'desc'
    sort: string
    readLimit?: number | null
  },
) {
  if (options.readLimit !== undefined && options.readLimit !== null) {
    if (options.offset >= options.readLimit) return []
    // Select the entitled latest window before applying any client-selected sort or page.
    const sort = options.sort === 'id' ? '_id' : options.sort
    return collectionLogs
      .aggregate([
        { $match: { serverID } },
        { $sort: { createdAt: -1, _id: -1 } },
        { $limit: options.readLimit },
        { $sort: { [sort]: options.orderBy === 'asc' ? 1 : -1, ...(sort === '_id' ? {} : { _id: -1 }) } },
        { $skip: options.offset },
        { $limit: Math.min(options.limit || options.readLimit, options.readLimit - options.offset) },
      ])
      .toArray()
  }
  return await collectionLogs
    .find({
      serverID,
    })
    .sort({
      [options.sort]: options.orderBy === 'asc' ? 1 : -1,
    })
    .limit(options.limit)
    .skip(options.offset)
    .toArray()
}

export async function gracefulShutdownMongo() {
  await mongoClient.close()
}
