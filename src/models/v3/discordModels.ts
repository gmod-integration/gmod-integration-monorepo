import { getUserFromDiscordID, getUserFromSteamID64 } from '../../classes/v3/User.js';
import { getServersFromDiscordGuildID } from '../../classes/v3/Server.js';
import { getGuildClient, getMainClient } from '../../discord/index.js';
import { getDiscordEntitlements, isGuildPremium } from '../../classes/v3/Guild.js';
import { discordConfig } from '../../config/index.js';
import { generateToken } from '../../utils/tools.js';
import { wsSendToServer } from '../../websockets/index.js';
import redis from '../../redis/index.js';
import prisma from '../../prisma.js';
import { Guild, GuildMember } from 'discord.js';
import { PanelUser } from '../../classes/v3/PanelUser.js';

export async function updateRolesToGmod(member: GuildMember, oldMember: GuildMember, newMember: GuildMember) {
  const guildBotInstance = await getGuildClient(member.guild.id, false);
  if (!guildBotInstance.user) throw new Error('Bot not found');
  if (guildBotInstance.user.id !== member.guild.client.user.id) {
    return;
  }

  const addedRoles = newMember.roles.cache.filter((role) => !oldMember.roles.cache.has(role.id));
  const removedRoles = oldMember.roles.cache.filter((role) => !newMember.roles.cache.has(role.id));

  const servers = await getServersFromDiscordGuildID(member.guild.id);
  if (!servers || servers.length === 0) {
    return;
  }

  const user = await getUserFromDiscordID(member.id);
  if (!user || !user.getSteamID64()) {
    return;
  }

  for (const server of servers) {
    const syncDirection = await server.getSetting('sync_role_direction');
    if (syncDirection !== 'both' && syncDirection !== 'discord-to-gmod') {
      continue;
    }

    const syncRoles = await server.getSyncRoles();
    if (!syncRoles || syncRoles.length === 0) {
      continue;
    }

    // skip for now
    const redisKey = `sync-role:gmod:server:${server.id}:user:${user.getSteamID64()}`;
    const redisData = await redis.get(redisKey);
    const data = redisData ? JSON.parse(redisData) : { removeIDs: [], addIDs: [] };

    // add roles
    for (const roleCollection of addedRoles) {
      const role = roleCollection[1];
      if (data && data.addIDs.includes(role.id)) {
        continue;
      }

      const roleData = syncRoles.find((syncRole) => syncRole.roleID === role.id);
      if (!roleData) {
        continue;
      }

      // remove all roles except the one we are adding
      const userRoles = member.roles.cache;
      const rolesToRemove = userRoles.filter(
        (role) => syncRoles.some((syncRole) => syncRole.roleID === role.id) && role.id !== roleData?.roleID,
      );

      if (rolesToRemove.size > 0) {
        data.removeIDs.push(...rolesToRemove.map((role) => role.id));
        await redis.set(redisKey, JSON.stringify(data), 'EX', 120);
        await member.roles.remove(rolesToRemove);
      }

      wsSendToServer(server.getID(), {
        method: 'wsPlayerUpdateGroup',
        steamID64: user.getSteamID64(),
        group: roleData.userGroup,
        add: true,
      });
    }

    for (const roleCollection of removedRoles) {
      const role = roleCollection[1];
      if (data && data.removeIDs.includes(role.id)) {
        continue;
      }

      const roleData = syncRoles.find((syncRole) => syncRole.roleID === role.id);
      if (!roleData) {
        continue;
      }

      if (data.addIDs.includes(roleData.roleID)) {
        data.addIDs = data.addIDs.filter((id: string) => id !== roleData.roleID);
        await redis.set(redisKey, JSON.stringify(data), 'EX', 120);
      }

      wsSendToServer(server.getID(), {
        method: 'wsPlayerUpdateGroup',
        steamID64: user.getSteamID64(),
        group: roleData.userGroup,
        add: false,
      });
    }

    // if no sync role anymore check id a 'user' role is present in sync and add it
    const userRoles = member.roles.cache;
    const syncedRole = userRoles.filter((role) => syncRoles.some((syncRole) => syncRole.roleID === role.id));
    if (syncedRole.size === 0 && data.addIDs.length === 0) {
      const userRole = syncRoles.find((syncRole) => syncRole.userGroup === 'user');
      if (userRole) {
        data.addIDs.push(userRole.roleID);
        await redis.set(redisKey, JSON.stringify(data), 'EX', 2);
        await member.roles.add(userRole.roleID);
      }
    }
  }
}

export async function updateGuildStat(guild: Guild) {
  let guildDB = await prisma.gm_guild.findUnique({
    where: {
      guild: guild.id,
    },
  });

  if (!guildDB) {
    await prisma.gm_guild.create({
      data: {
        guild: guild.id,
        name: guild.name,
        member: guild.memberCount,
        language: guild.preferredLocale,
      },
    });
  } else {
    await prisma.gm_guild.update({
      where: {
        guild: guild.id,
      },
      data: {
        member: guild.memberCount,
        language: guild.preferredLocale,
        name: guild.name,
        updatedAt: new Date(),
      },
    });
  }
}

export async function addAutoRoleToUser(guild: Guild, member: GuildMember) {
  const roles = await prisma.gm_guild_auto_roles.findMany({
    where: {
      guildID: guild.id,
    },
  });

  if (!roles) {
    return;
  }

  for (const roleData of roles) {
    const roleDiscord = guild.roles.cache.get(roleData.roleID);
    if (!roleDiscord) {
      await prisma.gm_guild_auto_roles.delete({
        where: {
          roleID: roleData.roleID,
          guildID: guild.id,
        },
      });
      continue;
    }

    if (member.roles.cache.has(roleData.roleID)) continue;
    await member.roles.add(roleDiscord);
  }

  return true;
}

export async function addNotVerifiedRoleToUser(guild: Guild, member: GuildMember) {
  const roles = await prisma.gm_guild_not_verify_role.findMany({
    where: {
      guildID: guild.id,
    },
  });

  if (!roles) {
    return;
  }

  for (const roleData of roles) {
    const roleDiscord = guild.roles.cache.get(roleData.roleID);
    if (!roleDiscord) {
      await prisma.gm_guild_not_verify_role.delete({
        where: {
          roleID: roleData.roleID,
          guildID: guild.id,
        },
      });
      continue;
    }

    if (member.roles.cache.has(roleData.roleID)) continue;
    await member.roles.add(roleDiscord);
  }
}

export async function removeNotVerifiedRoleToUser(guild: Guild, member: GuildMember) {
  const roles = await prisma.gm_guild_not_verify_role.findMany({
    where: {
      guildID: guild.id,
    },
  });

  if (!roles) {
    return;
  }

  for (const roleData of roles) {
    const roleDiscord = guild.roles.cache.get(roleData.roleID);
    if (!roleDiscord) {
      await prisma.gm_guild_not_verify_role.delete({
        where: {
          roleID: roleData.roleID,
          guildID: guild.id,
        },
      });
      continue;
    }

    if (!member.roles.cache.has(roleData.roleID)) continue;
    await member.roles.remove(roleDiscord);
  }
}

export async function addVerifyRoleToUser(guild: Guild, member: GuildMember) {
  const role = await prisma.gm_guild_verify_role.findMany({
    where: {
      guildID: guild.id,
    },
  });

  if (!role) {
    return;
  }

  for (const roleData of role) {
    const roleDiscord = guild.roles.cache.get(roleData.roleID);
    if (!roleDiscord) {
      await prisma.gm_guild_verify_role.delete({
        where: {
          id: roleData.id,
        },
      });
      continue;
    }

    // if not enabled skip
    if (!roleData.enabled) continue;

    // give or remove role
    if (roleData.isGiveRole) {
      if (member.roles.cache.has(roleData.roleID)) continue;
      await member.roles.add(roleDiscord);
    } else {
      if (!member.roles.cache.has(roleData.roleID)) continue;
      await member.roles.remove(roleDiscord);
    }
  }
}

export async function verifyUser(guild: Guild, member: GuildMember) {
  const user = await getUserFromDiscordID(member.id);
  if (!user || !user.getSteamID64()) {
    await addNotVerifiedRoleToUser(guild, member);
    return false;
  }

  await removeNotVerifiedRoleToUser(guild, member);
  await addVerifyRoleToUser(guild, member);
  return true;
}

export async function getUserGuildsWithPermsForPanel(panelUser: PanelUser) {
  const guilds = [];
  const permGuilds = await panelUser.findGuildsWithPerms();
  const permGuildsID = permGuilds.map((guild) => guild.id);

  const rows = await prisma.gm_guild.findMany({
    where: {
      guild: {
        in: permGuildsID,
      },
    },
  });

  const hasBotGuildsID = [];
  for (const guildData of rows) {
    hasBotGuildsID.push(guildData.guild);
  }

  for (const guildData of permGuilds) {
    const guildID = guildData.id;

    if (!permGuildsID.includes(guildID)) {
      continue;
    }

    guilds.push({
      id: guildID,
      name: guildData.name,
      icon: guildData.icon,
      hasBot: hasBotGuildsID.includes(guildID),
      isOwner: guildData.owner,
      isPremium: hasBotGuildsID.includes(guildID) ? await isGuildPremium(guildID) : false,
    });
  }

  return guilds;
}

export async function getUserTokenFromCode(code: string, redirectURI: string) {
  const discordRequest = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: discordConfig.clientID!,
      client_secret: discordConfig.clientSecret!,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectURI,
      // scope: 'identify guilds.join email guilds',
      scope: 'identify guilds',
    }).toString(),
  });

  if (!discordRequest.ok) {
    return null;
  }

  return await discordRequest.json();
}

export async function getUserFromToken(token: string) {
  const discordRequest = await fetch('https://discord.com/api/users/@me', {
    headers: {
      authorization: token,
    },
  });

  if (!discordRequest.ok) {
    return null;
  }

  return await discordRequest.json();
}

export async function saveUser(id: string, username: string) {
  const user = await prisma.gm_user.findFirst({
    where: {
      id,
    },
  });

  if (!user) {
    await prisma.gm_user.create({
      data: {
        id,
        username,
      },
    });
  } else {
    await prisma.gm_user.update({
      where: {
        id,
      },
      data: {
        username,
      },
    });
  }

  return true;
}

export async function saveUserPanel(discordID: string, discordUserToken: any, sessionData: any) {
  const discordToken = await prisma.gm_discordToken.findFirst({
    where: {
      discordID,
    },
  });

  if (!discordToken) {
    await prisma.gm_discordToken.create({
      data: {
        discordID,
        accessToken: discordUserToken.access_token,
        refreshToken: discordUserToken.refresh_token,
        creationDate: discordUserToken.creationDate,
        expirationDate: discordUserToken.expirationDate,
      },
    });
  } else {
    await prisma.gm_discordToken.update({
      where: {
        discordID,
      },
      data: {
        accessToken: discordUserToken.access_token,
        refreshToken: discordUserToken.refresh_token,
        creationDate: discordUserToken.creationDate,
        expirationDate: discordUserToken.expirationDate,
      },
    });
  }

  const panelAccessToken = generateToken(32);

  await prisma.gm_panelToken.create({
    data: {
      discordID,
      accessToken: panelAccessToken,
      creationDate: discordUserToken.creationDate,
      expirationDate: discordUserToken.expirationDate,
      os: sessionData.os,
      ip: sessionData.ip,
      browser: sessionData.browser,
      country: sessionData.country,
    },
  });

  return panelAccessToken;
}

export async function addUserToGuild(guildID: string, userID: string, userToken: string) {
  const response = await fetch(`https://discord.com/api/guilds/${guildID}/members/${userID}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bot ${discordConfig.botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      access_token: userToken,
    }),
  });

  return response.ok;
}

export async function getDiscordUserFromID(discordID: string) {
  const client = await getMainClient();
  return client.users.fetch(discordID);
}

export async function updatePseudoToGmod(member: GuildMember, oldMember: GuildMember, newMember: GuildMember) {
  const guildBotInstance = await getGuildClient(member.guild.id, false);
  if (guildBotInstance.user!.id !== member.guild.client.user.id) {
    return;
  }

  const servers = await getServersFromDiscordGuildID(member.guild.id);
  if (!servers || servers.length === 0) return;

  const user = await getUserFromDiscordID(member.id);
  if (!user || !user.getSteamID64()) return;

  for (const server of servers) {
    const pseudoDirection = await server.getSetting('sync_pseudo_direction');
    if (pseudoDirection !== 'both' && pseudoDirection !== 'discord-to-gmod') return;

    const redisKey = `sync-pseudo:gmod:server:${server.id}:user:${user.getSteamID64()}`;
    const redisData = await redis.get(redisKey);
    if (redisData === newMember.nickname || redisData === newMember.user.username) return;

    const pseudo = newMember.nickname || newMember.user.username;
    wsSendToServer(server.getID(), {
      method: 'wsSyncName',
      steamID64: user.getSteamID64(),
      name: pseudo,
    });
  }
}

export async function givePremiumRoleOfMainGuild() {
  try {
    const mainClient = await getMainClient();
    if (!mainClient) return;

    const guild = mainClient.guilds.cache.get(discordConfig.guildID!);
    if (!guild) return;

    const gmodStoreBuyers = await prisma.gm_gmodstore_purchases.findMany();
    if (!gmodStoreBuyers) return;

    let subscriptionBuyers: any = [];
    const dscEntitlements = await getDiscordEntitlements();
    if (dscEntitlements) {
      for (const entitlement of dscEntitlements) {
        if (!subscriptionBuyers.includes(entitlement.user_id)) {
          subscriptionBuyers.push(entitlement.user_id);
        }
      }
    }

    if (!discordConfig.premiumRoleID || !discordConfig.gmodStorePremiumRoleID || !discordConfig.discordPremiumRoleID)
      return;
    const premiumRole = guild.roles.cache.get(discordConfig.premiumRoleID);
    const gmodStorePremiumRole = guild.roles.cache.get(discordConfig.gmodStorePremiumRoleID);
    const discordPremiumRole = guild.roles.cache.get(discordConfig.discordPremiumRoleID);
    if (!premiumRole || !gmodStorePremiumRole || !discordPremiumRole) return;

    premiumRole.members.map(async (member) => {
      const user = await getUserFromDiscordID(member.id);
      if (
        !user ||
        (!subscriptionBuyers.includes(member.id) &&
          !gmodStoreBuyers.find((buyer) => buyer.steamID64 === user.getSteamID64()))
      ) {
        await member.roles.remove(premiumRole);
      }
    });

    gmodStorePremiumRole.members.map(async (member) => {
      const user = await getUserFromDiscordID(member.id);
      if (!user || !gmodStoreBuyers.find((buyer) => buyer.steamID64 === user.getSteamID64())) {
        await member.roles.remove(gmodStorePremiumRole);
      }
    });

    discordPremiumRole.members.map(async (member) => {
      if (!subscriptionBuyers.includes(member.id)) {
        await member.roles.remove(discordPremiumRole);
      }
    });

    for (const buyer of gmodStoreBuyers) {
      const user = await getUserFromSteamID64(buyer.steamID64);
      if (!user) continue;

      const member = await guild.members.fetch(user.getDiscordID()).catch(() => null);
      if (!member) continue;

      if (!member.roles.cache.has(discordConfig.premiumRoleID)) {
        await member.roles.add(premiumRole);
      }

      if (!member.roles.cache.has(discordConfig.gmodStorePremiumRoleID)) {
        await member.roles.add(gmodStorePremiumRole);
      }
    }

    for (const buyer of subscriptionBuyers) {
      const member = await guild.members.fetch(buyer).catch(() => null);
      if (!member) continue;

      if (!member.roles.cache.has(discordConfig.premiumRoleID)) {
        await member.roles.add(premiumRole);
      }

      if (!member.roles.cache.has(discordConfig.discordPremiumRoleID)) {
        await member.roles.add(discordPremiumRole);
      }
    }
  } catch (err) {
    console.error('Error checking premium:', err);
    return err;
  }
}
