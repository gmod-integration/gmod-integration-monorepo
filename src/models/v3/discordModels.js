import { getRoleFromDiscordRoleID, getRoleFromRole } from '../../classes/v3/Role.js';
import { getUserFromDiscordID } from '../../classes/v3/User.js';
import { getServersFromDiscordGuildID } from '../../classes/v3/Server.js';
import { wsSendToServer } from '../../websockets/index.js';
import { getClient } from '../../discord/index.js';
import { getConnectionPromise } from '../../database/connection.js';
import { isGuildPremium } from '../../classes/v3/Guild.js';
import { discordConfig } from '../../config/index.js';
import { generateToken } from '../../utils/tools.js';
import gm_guild from '../../database/schema/gm_guild.js';
import gm_guild_verify_role from '../../database/schema/gm_guild_verify_role.js';
import gm_guild_not_verify_role from '../../database/schema/gm_guild_not_verify_role.js';
import gm_user from '../../database/schema/gm_user.js';

let userUpdateRoleCurrent = {};

export function updateGuildUserSyncRoles(server, user, newGroup, oldGroup = null) {
  return new Promise(async (resolve, reject) => {
    if (!user) {
      console.log(user);
      console.log(user === null);
      return reject({ error: 'user_not_found', itsFine: true });
    }

    const userDiscordID = user.getDiscordID();
    if (!userDiscordID) {
      return reject({ error: 'user_not_linked', itsFine: true });
    }

    let theClient = await getClient();
    const guild = theClient.guilds.cache.get(await server.getGuildID());
    if (!guild) {
      return reject({ error: 'guild_not_found', itsFine: true });
    }

    const guildUser = await guild.members.fetch(userDiscordID).catch(reject);
    if (!guildUser) {
      return reject({ error: 'user_not_found', itsFine: true });
    }

    if (oldGroup) {
      const oldRole = await getRoleFromRole(server.getID(), oldGroup);
      if (oldRole && oldRole.isValid() && oldRole.isSyncEnabled() && oldRole.getDiscordRoleID()) {
        userUpdateRoleCurrent[oldRole.getDiscordRoleID()] = false;
        await guildUser.roles.remove(oldRole.getDiscordRoleID()).catch(reject);
      }
    }

    const role = await getRoleFromRole(server.getID(), newGroup);
    if (role && role.isValid() && role.isSyncEnabled() && role.getDiscordRoleID()) {
      userUpdateRoleCurrent[role.getDiscordRoleID()] = true;
      await guildUser.roles.add(role.getDiscordRoleID()).catch(reject);
    }

    await server
      .getRoles()
      .then(async (roles) => {
        let rolesToRemove = [];
        for (let i = 0; i < roles.length; i++) {
          if (
            roles[i].getDiscordRoleID() &&
            role &&
            role.getDiscordRoleID() &&
            roles[i].getDiscordRoleID() !== role.getDiscordRoleID()
          ) {
            userUpdateRoleCurrent[roles[i].getDiscordRoleID()] = false;
            rolesToRemove.push(roles[i].getDiscordRoleID());
          }
        }

        await guildUser.roles.remove(rolesToRemove).catch(reject);
        return resolve();
      })
      .catch(reject);
  });
}

export async function updateRolesToGmod(newMember, roleID, add = true) {
  const guildID = newMember.guild.id;
  const memberID = newMember.id;

  if (userUpdateRoleCurrent[roleID] !== null && userUpdateRoleCurrent[roleID] === add) {
    return;
  } else {
    userUpdateRoleCurrent[roleID] = add;
  }

  console.log(userUpdateRoleCurrent[roleID] === add);

  return new Promise(async (resolve, reject) => {
    console.log('updateRolesToGmod', guildID, memberID, roleID, add);

    const userInfo = await getUserFromDiscordID(memberID).catch(reject);
    if (!userInfo) {
      return reject('User not found');
    }
    if (!userInfo.getSteamID64()) {
      return reject('User not linked');
    }

    const serversInfo = await getServersFromDiscordGuildID(guildID).catch(reject);
    if (!serversInfo || serversInfo.length === 0) {
      return reject('No servers found');
    }

    for (const servInfo of serversInfo) {
      if (!servInfo.isValid()) {
        continue;
      }

      const roleInfo = await getRoleFromDiscordRoleID(servInfo.getID(), roleID);
      if (!roleInfo || !roleInfo.isValid()) {
        continue;
      }
      if (!roleInfo.isSyncEnabled()) {
        continue;
      }
      if (!roleInfo.getDiscordRoleID()) {
        continue;
      }

      if (add === true) {
        await servInfo
          .getRoles()
          .then(async (roles) => {
            let rolesToRemove = [];
            for (let i = 0; i < roles.length; i++) {
              if (roles[i].getDiscordRoleID() && roles[i].getDiscordRoleID() !== roleInfo.getDiscordRoleID()) {
                userUpdateRoleCurrent[roles[i].getDiscordRoleID()] = false;
                rolesToRemove.push(roles[i].getDiscordRoleID());
              }
            }

            await newMember.roles.remove(rolesToRemove).catch(reject);
          })
          .catch(reject);
      }

      wsSendToServer(servInfo.getID(), {
        method: 'wsPlayerUpdateGroup',
        steamID64: userInfo.getSteamID64(),
        group: roleInfo.role,
        add: add,
      });
    }

    resolve();
  });
}

export async function updateGuildStat(guild) {
  const guildDB = await gm_guild.findOne({
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
    const oldGuildDB = guildDB;
    guildDB.member = guild.memberCount;
    guildDB.language = guild.preferredLocale;
    guildDB.name = guild.name;
    if (oldGuildDB !== guildDB) {
      await guildDB.save();
    }
  }
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

    if (member.roles.cache.has(roleData.roleID)) continue;
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

    if (!member.roles.cache.has(roleData.roleID)) continue;
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
      scope: 'identify guilds role_connection.write',
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
    await user.save();
  }

  return true;
}

export async function saveUserPanel(discordID, discordUserToken) {
  const connection = await getConnectionPromise();
  const query =
    'INSERT INTO gm_discordToken (discordID, accessToken, refreshToken, creationDate, expirationDate) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE accessToken = ?, refreshToken = ?, creationDate = ?, expirationDate = ?';
  await connection.execute(query, [
    discordID,
    discordUserToken.access_token,
    discordUserToken.refresh_token,
    discordUserToken.creationDate,
    discordUserToken.expirationDate,
    discordUserToken.access_token,
    discordUserToken.refresh_token,
    discordUserToken.creationDate,
    discordUserToken.expirationDate,
  ]);

  const panelAccessToken = generateToken(32);

  const query2 =
    'INSERT INTO gm_panelToken (discordID, accessToken, creationDate, expirationDate) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE accessToken = ?, creationDate = ?, expirationDate = ?';
  await connection.execute(query2, [
    discordID,
    panelAccessToken,
    discordUserToken.creationDate,
    discordUserToken.expirationDate,
    panelAccessToken,
    discordUserToken.creationDate,
    discordUserToken.expirationDate,
  ]);

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
  const client = await getClient();
  return client.users.fetch(discordID);
}
