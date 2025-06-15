import prisma from '../../services/prisma/prisma.js';

export async function isGlobalBanIP(IP: string) {
  return prisma.banUsers.findFirst({
    where: {
      ip: IP,
    },
  });
}

export function isGlobalBanSteamID64(steamID64: string) {
  return prisma.banUsers.findFirst({
    where: {
      steamID64,
    },
  });
}

export function isGlobalBanDiscordID(discordID: string) {
  return prisma.banUsers.findFirst({
    where: {
      discordID,
    },
  });
}

export async function isGlobalBan(
  IP: string | null | undefined,
  discordID: string | null | undefined,
  steamID64: string | null | undefined,
) {
  if (!IP && !discordID && !steamID64) return false;

  if (IP) {
    const banIP = await isGlobalBanIP(IP);
    if (banIP) return banIP;
  }

  if (discordID) {
    const banDiscordID = await isGlobalBanDiscordID(discordID);
    if (banDiscordID) return banDiscordID;
  }

  if (steamID64) {
    const banSteamID64 = await isGlobalBanSteamID64(steamID64);
    if (banSteamID64) return banSteamID64;
  }

  return false;
}
