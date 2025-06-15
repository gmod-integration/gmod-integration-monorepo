import { mongoClient } from '../services/mongo/index.js';

const db = mongoClient.db('gmod_integration');
const collection = db.collection('logs');

interface Log {
  serverID: string;
  type: string;
  createdAt: Date;
  updatedAt: Date;
  data: any;
  playerInvolvedSteamID64: string;
}

export async function addLog(log: Log) {
  await collection.insertOne(log);
}

export async function getLogsCountByServerAndSteamIDList(serverID: string, SteamIDS: string[]) {
  return await collection.countDocuments({
    serverID,
    playerInvolvedSteamID64: {
      $in: SteamIDS,
    },
  });
}

export async function getLogsByServerAndSteamIDList(
  serverID: string,
  SteamIDS: string[],
  options: {
    limit: number | 0;
    offset: number | 0;
  },
) {
  return await collection
    .find({
      serverID,
      playerInvolvedSteamID64: {
        $in: SteamIDS,
      },
    })
    .toArray();
}

export async function getTotalLogsByServer(serverID: string) {
  return await collection.countDocuments({
    serverID,
  });
}

/*
In mongoDB run
db.logs.createIndex({ serverID: 1, createdAt: -1 });
db.logs.createIndex({ serverID: 1, type: 1, createdAt: -1 });
 */
export async function getLogsByServer(
  serverID: string,
  options: {
    limit: number | 0;
    offset: number | 0;
    orderBy: 'asc' | 'desc';
    sort: string;
  },
) {
  return await collection
    .find({
      serverID,
    })
    .sort({
      [options.sort]: options.orderBy === 'asc' ? 1 : -1,
    })
    .limit(options.limit)
    .skip(options.offset)
    .toArray();
}

export async function gracefulShutdownMongo() {
  await mongoClient.close();
}
