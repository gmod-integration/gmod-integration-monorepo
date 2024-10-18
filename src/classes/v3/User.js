import gm_user from '../../database/schema/gm_user.js';

export class User {
  constructor(obj = {}) {
    this.steamID64 = obj.steamID64;
    this.discordID = obj.discordID;
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

  isDeveloper() {
    return this.rank === 'developer';
  }
}

export async function getUserFromSteamID64(steamID64) {
  const user = await gm_user.findOne({
    where: {
      steam: steamID64,
    },
  });

  if (!user) {
    return null;
  }

  return new User({
    steamID64: user.steam,
    discordID: user.id,
    rank: user.rank,
    lastVerification: user.last_oauth,
    trustLevel: user.trust,
  });
}

export async function getUserFromDiscordID(discordID) {
  const user = await gm_user.findOne({
    where: {
      id: discordID,
    },
  });

  if (!user) {
    return null;
  }

  return new User({
    steamID64: user.steam,
    discordID: user.id,
    rank: user.rank,
    lastVerification: user.last_oauth,
    trustLevel: user.trust,
  });
}
