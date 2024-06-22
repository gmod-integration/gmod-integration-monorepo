import Ban from '../../database/schema/Ban.js';

export async function isGlobalBanIP(IP) {
  return Ban.findOne({
    where: {
      IP,
    },
  });
}

export function isGlobalBanSteamID64(steamID64) {
  return Ban.findOne({
    where: {
      steamID64,
    },
  });
}

export function isGlobalBanDiscordID(discordID) {
  return Ban.findOne({
    where: {
      discordID,
    },
  });
}

export async function isGlobalBan(IP, discordID, steamID64) {
  const banIP = await isGlobalBanIP(IP);
  if (banIP) return banIP;

  const banDiscordID = await isGlobalBanDiscordID(discordID);
  if (banDiscordID) return banDiscordID;

  const banSteamID64 = await isGlobalBanSteamID64(steamID64);
  if (banSteamID64) return banSteamID64;

  return false;
}
