import { getConnectionPromise } from '../../database/connection.js';

export class User {
  constructor(obj = {}) {
    this.steamID64 = obj.steamID64 || null;
    this.discordID = obj.discordID || null;
    this.rank = obj.rank;
    this.lastVerification = obj.lastVerification;
    this.trustLevel = obj.trustLevel || 50;
  }

  getDiscordID() {
    return this.discordID;
  }

  getSteamID64() {
    return this.steamID64;
  }
}

export async function getUserFromSteamID64(steamID64) {
  const connection = await getConnectionPromise();
  const query = `SELECT *
                 FROM gm_user
                 WHERE steam = ?`;
  const [rows] = await connection.execute(query, [steamID64]);
  if (rows.length === 0) {
    return null;
  }

  return new User({
    steamID64: rows[0].steam,
    discordID: rows[0].id,
    rank: rows[0].rank,
    lastVerification: rows[0].last_oauth,
    trustLevel: rows[0].trust,
  });
}

export async function getUserFromDiscordID(discordID) {
  const connection = await getConnectionPromise();
  const query = `SELECT *
                 FROM gm_user
                 WHERE id = ?`;
  const [rows] = await connection.execute(query, [discordID]);
  if (rows.length === 0) {
    return null;
  }

  return new User({
    steamID64: rows[0].steam,
    discordID: rows[0].id,
    rank: rows[0].rank,
    lastVerification: rows[0].last_oauth,
    trustLevel: rows[0].trust,
  });
}
