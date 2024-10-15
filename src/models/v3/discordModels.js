import { getUserFromDiscordID, getUserFromSteamID64 } from '../../classes/v3/User.js';
import { getServersFromDiscordGuildID } from '../../classes/v3/Server.js';
import { getGuildClient, getMainClient } from '../../discord/index.js';
import { getDiscordEntitlements, isGuildPremium } from '../../classes/v3/Guild.js';
import { discordConfig } from '../../config/index.js';
import { generateToken } from '../../utils/tools.js';
import gm_guild from '../../database/schema/gm_guild.js';
import gm_guild_verify_role from '../../database/schema/gm_guild_verify_role.js';
import gm_guild_not_verify_role from '../../database/schema/gm_guild_not_verify_role.js';
import gm_user from '../../database/schema/gm_user.js';
import gm_discordToken from '../../database/schema/gm_discordToken.js';
import gm_panelToken from '../../database/schema/gm_panelToken.js';
import gm_guild_auto_roles from '../../database/schema/gm_guild_auto_roles.js';
import { wsSendToServer } from '../../websockets/index.js';
import redis from '../../redis/index.js';
import GmodStorePurchases from '../../database/schema/GmodStorePurchases.js';

export async function updateRolesToGmod(member, oldMember, newMember) {
  const guildBotInstance = await getGuildClient(member.guild.id, false);
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
        data.addIDs = data.addIDs.filter((id) => id !== roleData.roleID);
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

export async function updateGuildStat(guild) {
  let guildDB = await gm_guild.findOne({
    where: {
      guild: guild.id,
    },
  });

  if (!guildDB) {
    await gm_guild.create({
      guild: guild.id,
      name: guild.name,
      member: guild.memberCount,
      language: guild.preferredLocale,
    });
  } else {
    guildDB.member = guild.memberCount;
    guildDB.language = guild.preferredLocale;
    guildDB.name = guild.name;
    guildDB.changed('updatedAt', true);
    await guildDB.save();
  }
}

export async function addAutoRoleToUser(guild, member) {
  const roles = await gm_guild_auto_roles.findAll({
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
      await roleData.destroy();
      continue;
    }

    if (member.roles.cache.has(roleData.roleID)) continue;
    await member.roles.add(roleDiscord);
  }

  return true;
}

export async function addNotVerifiedRoleToUser(guild, member) {
  const roles = await gm_guild_not_verify_role.findAll({
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
      await roleData.destroy();
      continue;
    }

    if (await member.roles.cache.has(roleData.roleID)) continue;
    await member.roles.add(roleDiscord);
  }
}

export async function removeNotVerifiedRoleToUser(guild, member) {
  const roles = await gm_guild_not_verify_role.findAll({
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
      await roleData.destroy();
      continue;
    }

    if (!(await member.roles.cache.has(roleData.roleID))) continue;
    await member.roles.remove(roleDiscord);
  }
}

export async function addVerifyRoleToUser(guild, member) {
  const role = await gm_guild_verify_role.findAll({
    where: {
      guildID: guild.id,
    },
  });

  if (!role) {
    return;
  }

  for (const roleData of role) {
    // if not exist role delete
    const roleDiscord = guild.roles.cache.get(roleData.roleID);
    if (!roleDiscord) {
      await roleData.destroy();
      continue;
    }

    // if not enabled skip
    if (!roleData.enabled) continue;

    // give or remove role
    if (roleData.isGiveRole) {
      if (await member.roles.cache.has(roleData.roleID)) continue;
      await member.roles.add(roleDiscord);
    } else {
      if (!(await member.roles.cache.has(roleData.roleID))) continue;
      await member.roles.remove(roleDiscord);
    }
  }
}

export async function verifyUser(guild, member) {
  const user = await getUserFromDiscordID(member.id);
  if (!user || !user.getSteamID64()) {
    await addNotVerifiedRoleToUser(guild, member);
    return false;
  }

  await removeNotVerifiedRoleToUser(guild, member);
  await addVerifyRoleToUser(guild, member);
  return true;
}

export async function getUserGuildsWithPermsForPanel(panelUser) {
  const guilds = [];
  const permGuilds = await panelUser.findGuildsWithPerms();
  const permGuildsID = permGuilds.map((guild) => guild.id);

  const rows = await gm_guild.findAll({
    where: {
      guild: permGuildsID,
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

export async function getUserTokenFromCode(code, redirectURI) {
  const discordRequest = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: discordConfig.clientID,
      client_secret: discordConfig.clientSecret,
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

export async function getUserFromToken(token) {
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

export async function saveUser(id, username) {
  const user = await gm_user.findOne({
    where: {
      id,
    },
  });

  if (!user) {
    await gm_user.create({
      id,
      username,
    });
  } else {
    user.username = username;
    user.changed('updatedAt', true);
    await user.save();
  }

  return true;
}

export async function saveUserPanel(discordID, discordUserToken, sessionData) {
  const discordToken = await gm_discordToken.findOne({
    where: {
      discordID,
    },
  });

  if (!discordToken) {
    await gm_discordToken.create({
      discordID,
      accessToken: discordUserToken.access_token,
      refreshToken: discordUserToken.refresh_token,
      creationDate: discordUserToken.creationDate,
      expirationDate: discordUserToken.expirationDate,
    });
  } else {
    discordToken.accessToken = discordUserToken.access_token;
    discordToken.refreshToken = discordUserToken.refresh_token;
    discordToken.creationDate = discordUserToken.creationDate;
    discordToken.expirationDate = discordUserToken.expirationDate;
    discordToken.changed('updatedAt', true);
    await discordToken.save();
  }

  const panelAccessToken = generateToken(32);

  await gm_panelToken.create({
    discordID,
    accessToken: panelAccessToken,
    creationDate: discordUserToken.creationDate,
    expirationDate: discordUserToken.expirationDate,
    os: sessionData.os,
    ip: sessionData.ip,
    browser: sessionData.browser,
    country: sessionData.country,
  });

  return panelAccessToken;
}

export async function addUserToGuild(guildID, userID, userToken) {
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

export async function getDiscordUserFromID(discordID) {
  const client = await getMainClient();
  return client.users.fetch(discordID);
}

export async function updatePseudoToGmod(member, oldMember, newMember) {
  const guildBotInstance = await getGuildClient(member.guild.id, false);
  if (guildBotInstance.user.id !== member.guild.client.user.id) {
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

    const guild = mainClient.guilds.cache.get(discordConfig.guildID);
    if (!guild) return;

    const gmodStoreBuyers = await GmodStorePurchases.findAll();
    if (!gmodStoreBuyers) return;

    let subscriptionBuyers = [];
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

    guild.roles.cache.get(discordConfig.premiumRoleID).members.map(async (member) => {
      const user = await getUserFromDiscordID(member.id);
      if (
        !user ||
        (!subscriptionBuyers.includes(member.id) &&
          !gmodStoreBuyers.find((buyer) => buyer.steamID64 === user.getSteamID64()))
      ) {
        await member.roles.remove(premiumRole);
      }
    });

    guild.roles.cache.get(discordConfig.gmodStorePremiumRoleID).members.map(async (member) => {
      const user = await getUserFromDiscordID(member.id);
      if (!user || !gmodStoreBuyers.find((buyer) => buyer.steamID64 === user.getSteamID64())) {
        await member.roles.remove(gmodStorePremiumRole);
      }
    });

    guild.roles.cache.get(discordConfig.discordPremiumRoleID).members.map(async (member) => {
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
