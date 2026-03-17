import { type GmodErrorsInput, GmodErrorsSchema } from '@gmod/schema/gmod/GmodErrorsSchema.js';
import { mongoClient } from '@gmod/infra-mongo';

interface OffsetLimitQuery {
  offset: number;
  limit: number;
}

const db = mongoClient.db('gmod_integration');
const collection = db.collection('errors');

export class GmodErrors {
  public readonly serverID: string;
  public readonly count: number;
  public readonly realm: string;
  public readonly error: string;
  public readonly stack: string;
  public readonly name: string;
  public readonly steamID64: string;
  public readonly workshopID: string;
  public readonly uptime: number;

  private constructor(data: GmodErrorsInput) {
    const parsed = GmodErrorsSchema.parse(data);
    this.serverID = parsed.serverID;
    this.count = parsed.count;
    this.realm = parsed.realm;
    this.error = parsed.error;
    this.stack = parsed.stack;
    this.name = parsed.name || '';
    this.steamID64 = parsed.steamID64 || '';
    this.workshopID = parsed.workshopID || '';
    this.uptime = parsed.uptime;
  }

  public static from(data: unknown): GmodErrors {
    return new GmodErrors(data as GmodErrorsInput);
  }

  public async save() {
    return await collection.insertOne({
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
    });
  }
}

export async function getErrorsCountByServer(serverID: string) {
  return await collection.countDocuments({
    serverID,
  });
}

export async function getErrorsCountBySteamID(steamID64: string) {
  return await collection.countDocuments({
    steamID64,
  });
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
  };
}

export async function getErrorsByServer(query: OffsetLimitQuery, serverID: string) {
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
  };
}
