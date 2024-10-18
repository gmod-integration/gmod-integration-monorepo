import { getUserFromDiscordID, getUserFromSteamID64 } from '../../classes/v3/User.ts';
import { createServer, getServersFromDiscordGuildID } from '../../classes/v3/Server.js';
import { discordConfig } from '../../config/index.ts';
import { ChannelType } from 'discord.js';
import {
  getDiscordUserFromID,
  getUserFromToken,
  getUserTokenFromCode,
  saveUser,
  saveUserPanel,
} from '../../models/v3/discordModels.js';
import { badArgument, generateToken } from '../../utils/tools.ts';
import gm_user from '../../database/schema/gm_user.js';
import gm_guild_auto_roles from '../../database/schema/gm_guild_auto_roles.js';
import { getVerificationGuildMessage } from '../../discord/utils/messages.js';
import gm_guild_verify_msg from '../../database/schema/gm_guild_verify_msg.js';
import gm_server from '../../database/schema/gm_server.js';
import gm_server_status from '../../database/schema/gm_server_status.js';
import ServerVote from '../../database/schema/ServerVote.js';
import moment from 'moment';
import { Op } from 'sequelize';
import GuildSettings from '../../database/schema/GuildSettings.js';
import ServerLogs from '../../database/schema/ServerLogs.js';
import gm_guild from '../../database/schema/gm_guild.js';
import ServerSyncRole from '../../database/schema/ServerSyncRole.js';
import GmodStorePurchases from '../../database/schema/GmodStorePurchases.js';
import { todoControllers } from '../../discord/utils/index.js';
import ServerPseudo from '../../database/schema/ServerPseudo.js';
import UsersNotifications from '../../database/schema/UsersNotifications.js';
import UsersDataRequest from '../../database/schema/UsersDataRequest.js';
import { getUserDataGRPD } from '../../models/v3/gdrp.js';
import ServerReportBugs from '../../database/schema/ServerReportBugs.js';
import { getMainClient } from '../../discord/index.js';
import ServerSyncChatFilter from '../../database/schema/ServerSyncChatFilter.js';
import redis from '../../redis/index.ts';
import gm_panelToken from '../../database/schema/gm_panelToken.js';
import prisma from '../../prisma.js';

export async function getProfile(req, res) {
  const { steamID64, discordID } = req.query;

  if (discordID) {
    const user = await getUserFromDiscordID(discordID);
    if (!user) {
      return res.status(404).send({
        error: 'User not found',
      });
    }
    return res.send(user);
  }

  if (steamID64) {
    const user = await getUserFromSteamID64(steamID64);
    if (!user) {
      return res.status(404).send({
        error: 'User not found',
      });
    }
    return res.send(user);
  }

  return res.status(400).send({
    error: 'Missing required query parameter',
  });
}

export async function getUserSessions(req, res) {
  const { discordID } = req.params;
  const sessions = await gm_panelToken.findAll({
    where: {
      discordID,
    },
  });

  return res.send(sessions || []);
}

export async function deleteUserSession(req, res) {
  const { discordID, sessionID } = req.params;
  const session = await gm_panelToken.findOne({
    where: {
      discordID,
      id: sessionID,
    },
  });

  if (!session) {
    return res.status(404).send({
      error: 'Session not found',
    });
  }

  await session.destroy();
  return res.send(session || {});
}

export async function logOut(req, res) {
  const panelUser = req.panelUser;
  const sessionToken = await gm_panelToken.findOne({
    where: {
      discordID: panelUser.discordID,
      accessToken: panelUser.panelToken.token,
    },
  });

  if (sessionToken) {
    await sessionToken.destroy();
  }

  return res.status(200).json(sessionToken || {});
}

export async function findCurrentUser(req, res) {
  return res.send((await getDiscordUserFromID(req.params.discordID)) || {});
}

export async function oauthLogin(req, res) {
  const { code } = req.query;

  if (!code) {
    const { redirect } = req.query;
    return res.redirect(discordConfig.oauthPanel + (redirect ? `&state=redirect:${redirect}` : ''));
  }

  const redirect = req.query.state ? req.query.state.split('redirect:')[1] : null;
  const discordUserToken = await getUserTokenFromCode(
    code,
    `${req.protocol}://${req.headers.host}${req.originalUrl.split('?')[0]}`,
  );
  if (!discordUserToken) {
    return res.status(401).send({
      error: 'unauthorized',
    });
  }

  discordUserToken.expirationDate = new Date(Date.now() + discordUserToken.expires_in * 1000);
  discordUserToken.creationDate = new Date();

  const discordUser = await getUserFromToken(`${discordUserToken.token_type} ${discordUserToken.access_token}`);
  if (!discordUser) {
    return res.status(401).send({
      error: 'unauthorized',
    });
  }

  // I remove the auto join guild feature if uncomment also update perm here: getUserTokenFromCode
  // await addUserToGuild(discordConfig.guildID, discordUser.id, discordUserToken.access_token)
  //   .then(() => {
  //     console.log('User added to guild');
  //   })
  //   .catch((error) => {
  //     console.error(error);
  //   });

  const userIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const userCountry = req.headers['cf-ipcountry'] || 'XX';
  const userUA = req.useragent;

  const panelAccessToken = await saveUserPanel(discordUser.id, discordUserToken, {
    os: userUA.os,
    browser: userUA.browser,
    ip: userIP,
    country: userCountry,
  });
  await saveUser(discordUser.id, discordUser.username);

  return res.redirect(
    `${discordConfig.oauthPanelRedirect}?discordID=${discordUser.id}&accessToken=${panelAccessToken}&expirationDate=${discordUserToken.expirationDate.getTime()}${
      redirect ? `&redirect=${redirect}` : ''
    }`,
  );
}

export async function getUserGuildsOwnOrAdmins(req, res) {
  const panelUser = req.panelUser;

  return res.send(await panelUser.findGuildsWithPermsForPanel());
}

export async function findGuild(req, res) {
  const dscGuild = req.dscGuild;

  return res.send({
    id: dscGuild.id,
    name: dscGuild.name,
    icon: dscGuild.icon,
    ownerID: dscGuild.ownerID,
  });
}

export async function findGuildChannels(req, res, next) {
  const dscGuild = req.dscGuild;

  return res.send(
    dscGuild.channels.cache.map((channel) => ({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      position: channel.position,
      parentID: channel.parent ? channel.parent.id : null,
    })),
  );
}

export async function getGuildEmojis(req, res) {
  const dscGuild = req.dscGuild;
  const totalEmojis = [];

  dscGuild.emojis.cache.forEach((emoji) => {
    totalEmojis.push({
      id: emoji.id,
      name: emoji.name,
      url: emoji.url,
    });
  });

  return res.send(totalEmojis);
}

export async function getGuildRoles(req, res) {
  const dscGuild = req.dscGuild;

  return res.send(
    dscGuild.roles.cache
      .filter((role) => role.managed === false)
      .map((role) => ({
        id: role.id,
        name: role.name,
        position: role.position,
      }))
      .filter((role) => role.name !== '@everyone')
      .sort((a, b) => a.position - b.position),
  );
}

export async function findGuildServers(req, res) {
  const dscGuild = req.dscGuild;

  return res.send(await getServersFromDiscordGuildID(dscGuild.id));
}

export async function findGuildServer(req, res) {
  return res.json(req.server);
}

export async function findServerStatus(req, res) {
  const server = req.server;
  return res.send((await server.getStatusChannelAndMessage()) || {});
}

export async function createNewServer(req, res) {
  const guild = req.guild;

  const isPremium = await guild.isPremium();
  const servers = await guild.getServers();

  if (servers.length >= 1 && !isPremium) {
    return res.status(403).send({
      error: 'Server limit reached',
    });
  }

  const newServer = await createServer(guild.id);
  return res.send(newServer);
}

export async function getGuildLinks(req, res) {
  const guild = req.guild;
  return res.send((await guild.getLinks()) || []);
}

export async function postGuildLinks(req, res) {
  const guild = req.guild;
  const isPremium = await guild.isPremium();

  const links = await guild.getLinks();
  if (links.length >= 2 && !isPremium) {
    return res.status(403).send({
      error: 'max links reached',
    });
  }

  return res.send(await guild.createNewLink());
}

export async function putGuildLinks(req, res) {
  const { linkID } = req.params;
  const guild = req.guild;
  const { url, alias, active } = req.body;

  const link = await guild.getLink(linkID);
  if (!link) {
    return res.status(404).send({
      error: 'link not found or not belong to guild',
    });
  }

  link.url = url !== undefined ? url : link.url;
  link.alias = alias !== undefined ? alias : link.alias;
  link.active = active !== undefined ? active : link.active;

  link.changed('updatedAt', true);
  await link.save();
  return res.send(link);
}

export async function deleteGuildLinks(req, res) {
  const { linkID } = req.params;
  const guild = req.guild;

  const link = await guild.getLink(linkID);
  if (!link) {
    return res.status(404).send({
      error: 'link not found or not belong to guild',
    });
  }

  await link.destroy();
  return res.send(link);
}

export async function putGuildServer(req, res) {
  const server = req.server;
  const { name, image, ip, port, isPublic, description } = req.body;

  server.name = name !== undefined ? name : server.name;
  server.image = image !== undefined ? image : server.image;
  server.ip = ip !== undefined ? ip : server.ip;
  server.port = port !== undefined ? port : server.port;
  server.isPublic = isPublic !== undefined ? isPublic : server.isPublic;
  server.description = description !== undefined ? description : server.description;

  await server.save();
  return res.send(server);
}

export async function deleteGuildServer(req, res) {
  const server = req.server;
  await server.delete();
  return res.send(server);
}

export async function getGuildAdmins(req, res) {
  const guild = req.guild;
  return res.send((await guild.getAdmins()) || []);
}

export async function postGuildServerToken(req, res) {
  const server = req.server;
  await server.regenerateToken();
  return res.send(server);
}

export async function getGuildVerificationsRoles(req, res) {
  const guild = req.guild;
  return res.send((await guild.getVerificationRoles()) || []);
}

export async function putGuildVerificationsRoles(req, res) {
  const guild = req.guild;
  const { roleID } = req.params;
  const { isGiveRole, enabled } = req.body;

  const verificationRole = await guild.getVerificationRole(roleID);
  if (!verificationRole) {
    return res.status(404).send({
      error: 'role not found or not belong to guild',
    });
  }

  verificationRole.isGiveRole = isGiveRole !== undefined ? isGiveRole : verificationRole.isGiveRole;
  verificationRole.enabled = enabled !== undefined ? enabled : verificationRole.enabled;

  verificationRole.changed('updatedAt', true);
  await verificationRole.save();
  return res.send(verificationRole);
}

export async function deleteGuildVerificationsRoles(req, res) {
  const guild = req.guild;
  const { roleID } = req.params;

  const verificationRole = await guild.getVerificationRole(roleID);
  if (!verificationRole) {
    return res.status(404).send({
      error: 'role not found or not belong to guild',
    });
  }

  await verificationRole.destroy();
  return res.send(verificationRole);
}

export async function createGuildVerificationsRoles(req, res) {
  const guild = req.guild;
  const { roleID } = req.params;
  const isPremium = await guild.isPremium();

  const verificationRoles = await guild.getVerificationRoles();
  if (verificationRoles.length >= 2 && !isPremium) {
    return res.status(403).send({
      error: 'max verification roles reached',
    });
  }

  if (verificationRoles.find((role) => role.roleID === roleID)) {
    return res.status(409).send({
      error: 'role already exists',
    });
  }

  if (!guild.dscGuild.roles.cache.has(roleID)) {
    return res.status(404).send({
      error: 'role not found',
    });
  }

  return res.send(await guild.createVerificationRole(roleID));
}

// Status Buttons

export async function deleteServerStatus(req, res) {
  const server = req.server;
  return res.send(await server.deleteStatus());
}

export async function postServerStatus(req, res) {
  const server = req.server;
  const { channelID } = req.body;
  await server.deleteStatus();
  return res.send(await server.createStatus(channelID));
}

export async function getServerStatusButtons(req, res) {
  const server = req.server;
  return res.send((await server.findStatusButtons()) || []);
}

export async function putServerStatusButtons(req, res) {
  const server = req.server;
  const { buttonID } = req.params;
  const { name, emoji, url, enable } = req.body;

  const button = await server.findStatusButton(buttonID);
  if (!button) {
    return res.status(404).send({
      error: 'button not found',
    });
  }

  button.name = name !== undefined ? name : button.name;
  button.emoji = emoji !== undefined ? emoji : button.emoji;
  button.url = url !== undefined ? url : button.url;
  button.enable = enable !== undefined ? enable : button.enable;

  button.changed('updatedAt', true);
  await button.save();

  if (button.enable) {
    await server.editStatusChannelAndMessage(await server.getStatusData());
  }

  return res.send(button);
}

export async function createServerStatusButtons(req, res) {
  const server = req.server;
  const button = await server.createStatusButton();
  return res.send(button);
}

export async function deleteServerStatusButtons(req, res) {
  const server = req.server;
  const { buttonID } = req.params;

  const button = await server.findStatusButton(buttonID);
  if (!button) {
    return res.status(404).send({
      error: 'button not found',
    });
  }

  await server.destroyStatusButton(buttonID);

  if (button.enable) {
    await server.editStatusChannelAndMessage(await server.getStatusData());
  }

  return res.send(button);
}

export async function findServerScreenshots(req, res) {
  const server = req.server;
  return res.send((await server.getScreenshotsChannel()) || {});
}

export async function postServerScreenshots(req, res) {
  const server = req.server;
  const { channelID } = req.body;
  return res.send(await server.createScreenshotChannel(channelID));
}

export async function deleteServerScreenshots(req, res) {
  const server = req.server;
  return res.send(await server.destroyScreenshotChannel());
}

export async function findServerSyncChat(req, res) {
  const server = req.server;
  return res.send((await server.getSyncChat()) || {});
}

export async function postServerSyncChat(req, res) {
  const server = req.server;
  const { channelID } = req.body;
  return res.send(await server.createSyncChat(channelID));
}

export async function deleteServerSyncChat(req, res) {
  const server = req.server;
  return res.send(await server.destroySyncChat());
}

export async function getGmodToDiscordFilter(req, res) {
  const server = req.server;
  return res.send(
    (await ServerSyncChatFilter.findAll({
      where: {
        serverID: server.id,
      },
    })) || [],
  );
}

export async function postGmodToDiscordFilter(req, res) {
  const server = req.server;

  const filter = await ServerSyncChatFilter.create({
    serverID: server.id,
  });

  await redis.del(`server:${server.id}:gmodToDiscordFilter`);
  return res.send(filter);
}

export async function putGmodToDiscordFilter(req, res) {
  const { filterID } = req.params;
  const server = req.server;
  const { element, operator, trigger, action, active } = req.body;

  if (badArgument([element, operator, trigger, action, active])) {
    return res.status(400).send({
      error: 'missing arguments',
    });
  }

  const filter = await ServerSyncChatFilter.findOne({
    where: {
      id: filterID,
      serverID: server.id,
    },
  });

  if (!filter) {
    return res.status(404).send({
      error: 'filter not found',
    });
  }

  filter.element = element !== undefined ? element : filter.element;
  filter.operator = operator !== undefined ? operator : filter.operator;
  filter.trigger = trigger !== undefined ? trigger : filter.trigger;
  filter.action = action !== undefined ? action : filter.action;
  filter.active = active !== undefined ? active : filter.active;

  filter.changed('updatedAt', true);
  await filter.save();
  await redis.del(`server:${server.id}:gmodToDiscordFilter`);
  return res.send(filter);
}

export async function deleteGmodToDiscordFilter(req, res) {
  const { filterID } = req.params;
  const server = req.server;
  const filter = await ServerSyncChatFilter.findOne({
    where: {
      id: filterID,
      serverID: server.id,
    },
  });

  if (!filter) {
    return res.status(404).send({
      error: 'filter not found',
    });
  }

  await redis.del(`server:${server.id}:gmodToDiscordFilter`);
  await filter.destroy();
  return res.send(filter);
}

export async function getServerPlayers(req, res) {
  const server = req.server;
  return res.send((await server.getDBPlayers()) || []);
}

export async function putPlayerBypassMaintenance(req, res) {
  const server = req.server;
  const { playerID } = req.params;
  const { bypassMaintenance } = req.body;

  if (badArgument([bypassMaintenance])) {
    return res.status(400).send({
      error: 'missing arguments',
    });
  }

  const player = await server.getPlayerStats(playerID);
  if (!player) {
    return res.status(404).send({
      error: 'player not found',
    });
  }

  player.bypassMaintenance = bypassMaintenance !== undefined ? bypassMaintenance : player.bypassMaintenance;

  player.changed('updatedAt', true);
  await player.save();
  return res.send(player);
}

export async function postUserStartVerification(req, res) {
  const { discordID } = req.params;
  const user = await gm_user.findOne({
    where: {
      id: discordID,
    },
  });

  if (!user) {
    return res.status(404).send({
      error: 'User not found',
    });
  }

  user.token = generateToken(16);
  user.token_expires = new Date(Date.now() + 1000 * 60 * 5);
  await user.save();

  return res.json({
    token: user.token,
    expires: user.token_expires,
  });
}

export async function postAutoRoles(req, res) {
  const { guildID, roleID } = req.params;
  const existingAutoRole = await gm_guild_auto_roles.findOne({
    where: {
      guildID,
      roleID,
    },
  });

  if (existingAutoRole) {
    return res.status(409).send({
      error: 'Auto role already exists',
    });
  }

  const autoRole = await gm_guild_auto_roles.create({
    guildID,
    roleID,
  });

  return res.send(autoRole);
}

export async function deleteAutoRoles(req, res) {
  const { guildID, roleID } = req.params;
  const autoRole = await gm_guild_auto_roles.findOne({
    where: {
      guildID,
      roleID,
    },
  });

  if (!autoRole) {
    return res.status(404).send({
      error: 'Auto role not found',
    });
  }

  await autoRole.destroy();
  return res.send(autoRole);
}

export async function getAutoRoles(req, res) {
  const { guildID } = req.params;
  const autoRoles = await gm_guild_auto_roles.findAll({
    where: {
      guildID,
    },
  });

  return res.send(autoRoles || []);
}

export async function createVerificationMessage(req, res) {
  const dscGuild = req.dscGuild;
  const { channelID } = req.body;

  if (badArgument([channelID])) {
    return res.status(400).send({
      error: 'Missing required arguments',
    });
  }

  if (!dscGuild.channels.cache.has(channelID)) {
    return res.status(404).send({
      error: 'Channel not found',
    });
  }

  const channel = dscGuild.channels.cache.get(channelID);
  if (channel.type !== ChannelType.GuildText) {
    return res.status(400).send({
      error: 'Channel is not a text channel',
    });
  }

  const oldMsg = await gm_guild_verify_msg.findOne({
    where: {
      guildID: dscGuild.id,
    },
  });

  if (oldMsg) {
    const oldChannel = await dscGuild.channels.cache.get(oldMsg.channelID);
    if (oldChannel) {
      const oldMessage = await oldChannel.messages.fetch(oldMsg.messageID);
      await oldMessage.delete();
    }
    await oldMsg.destroy();
  }

  // send msg
  const msg = await getVerificationGuildMessage(dscGuild.preferredLocale);
  const sentMsg = await channel.send(msg);

  // save msg
  await gm_guild_verify_msg.create({
    guildID: dscGuild.id,
    messageID: sentMsg.id,
    channelID: channelID,
  });

  return res.send({
    messageID: sentMsg.id,
  });
}

export async function getVerificationMessage(req, res) {
  const dscGuild = req.dscGuild;
  const msg = await gm_guild_verify_msg.findOne({
    where: {
      guildID: dscGuild.id,
    },
  });

  if (!msg) {
    return res.status(404).send({
      error: 'Verification message not found',
    });
  }

  return res.send(msg);
}

export async function deleteVerificationMessage(req, res) {
  const dscGuild = req.dscGuild;
  const msg = await gm_guild_verify_msg.findOne({
    where: {
      guildID: dscGuild.id,
    },
  });

  if (!msg) {
    return res.status(404).send({
      error: 'Verification message not found',
    });
  }

  const channel = await dscGuild.channels.cache.get(msg.channelID);
  if (channel) {
    const message = await channel.messages.fetch(msg.messageID);
    await message.delete();
  }

  await msg.destroy();
  return res.send(msg);
}

export async function getPublicServers(req, res) {
  const servers = await gm_server.findAll({
    where: {
      isPublic: true,
    },
  });

  let publicServers = [];

  let thirtyDaysAgo = moment().subtract(30, 'days').toDate();
  console.log(thirtyDaysAgo);
  for (const server of servers) {
    let publicInformations = await server.getPublicInformations();
    publicInformations.vote = await ServerVote.count({
      where: {
        serverID: server.id,
        createdAt: {
          [Op.gte]: thirtyDaysAgo,
        },
      },
    });
    publicServers.push(publicInformations);
  }

  const serverStatus = await gm_server_status.findAll({
    where: {
      id: servers.map((server) => server.id),
    },
  });

  for (const status of serverStatus) {
    if (status.dataValues.updatedAt < new Date(Date.now() - 1000 * 60 * 5)) {
      continue;
    }
    const server = publicServers.find((server) => server.id === status.dataValues.id);
    if (server) {
      server.status = status.dataValues;
    }
  }

  return res.send(publicServers);
}

export async function getVoteChannels(req, res) {
  const server = req.server;
  return res.send((await server.getVoteChannel()) || {});
}

export async function postVoteChannels(req, res) {
  const server = req.server;
  const { channelID } = req.body;

  if (badArgument([channelID])) {
    return res.status(400).send({
      error: 'Missing required arguments',
    });
  }

  return res.send(await server.createVoteChannel(channelID));
}

export async function deleteVoteChannels(req, res) {
  const { channelID } = req.params;
  const server = req.server;
  return res.send(await server.destroyVoteChannel(channelID));
}

export async function getLogsChannel(req, res) {
  const server = req.server;
  return res.send((await server.getLogsChannel()) || {});
}

export async function postLogsChannel(req, res) {
  const server = req.server;
  const { channelID } = req.body;

  if (badArgument([channelID])) {
    return res.status(400).send({
      error: 'Missing required arguments',
    });
  }

  return res.send(await server.createLogsChannel(channelID));
}

export async function deleteLogsChannel(req, res) {
  const server = req.server;
  return res.send(await server.destroyLogsChannel());
}

export async function getGuildSettings(req, res) {
  const { guildID } = req.params;
  const settings = await GuildSettings.findAll({
    where: {
      guildID,
    },
  });
  return res.send(settings || []);
}

export async function getGuildSetting(req, res) {
  const { setting } = req.params;
  return res.send(
    (await GuildSettings.findOne({
      where: {
        setting,
      },
    })) || {},
  );
}

const allowedGuildSettings = ['verification_dont_mp'];

export async function putGuildSetting(req, res) {
  const { guildID, setting } = req.params;
  const { value } = req.body;

  if (badArgument([value])) {
    return res.status(400).send({
      error: 'Missing required arguments',
    });
  }

  if (!allowedGuildSettings.includes(setting)) {
    return res.status(400).send({
      error: 'Setting not allowed',
    });
  }

  let guildSetting = await GuildSettings.findOne({
    where: { guildID, setting },
  });

  if (!guildSetting) {
    guildSetting = await GuildSettings.create({ guildID, setting, value });
  } else {
    guildSetting.value = value;
    guildSetting.changed('updatedAt', true);
    await guildSetting.save();
  }

  return res.send(guildSetting);
}

export async function postGuildSetting(req, res) {
  const { guildID, setting } = req.params;
  const { value } = req.body;

  if (badArgument([value])) {
    return res.status(400).send({
      error: 'Missing required arguments',
    });
  }

  if (!allowedGuildSettings.includes(setting)) {
    return res.status(400).send({
      error: 'Setting not allowed',
    });
  }

  let guildSetting = await GuildSettings.findOne({
    where: { guildID, setting },
  });

  if (guildSetting) {
    return res.status(409).send({
      error: 'Setting already exists',
    });
  }

  guildSetting = await GuildSettings.create({ guildID, setting, value });
  return res.send(guildSetting);
}

export async function deleteGuildSetting(req, res) {
  const { guildID, setting } = req.params;
  const guildSetting = await GuildSettings.findOne({
    where: { guildID, setting },
  });

  if (!guildSetting) {
    return res.status(404).send({
      error: 'Setting not found',
    });
  }

  await guildSetting.destroy();
  return res.send(guildSetting);
}

export async function getServerSettings(req, res) {
  const server = req.server;
  return res.send((await server.getAllSettings()) || []);
}

export async function getServerSetting(req, res) {
  const { setting } = req.params;
  const server = req.server;

  try {
    return res.send({
      value: await server.getSetting(setting),
    });
  } catch (error) {
    return res.status(404).send({
      error: 'Setting not found',
    });
  }
}

export async function putServerSetting(req, res) {
  const { setting } = req.params;
  const server = req.server;
  const { value } = req.body;

  if (badArgument([value])) {
    return res.status(400).send({
      error: 'Missing required arguments',
    });
  }

  try {
    return res.send(await server.setSetting(setting, value));
  } catch (error) {
    return res.status(404).send({
      error: 'Setting not found or not allowed',
    });
  }
}

export async function getServerLogs(req, res) {
  const { serverID } = req.params;
  const { offset, limit } = req.query;

  if (limit && limit > 100) {
    return res.status(400).send({
      error: 'limit too high',
    });
  }

  const logs = await ServerLogs.findAll({
    where: {
      serverID,
    },
    order: [['createdAt', 'DESC']],
    offset: offset || 0,
    limit: limit || 500,
  });

  return res.send(logs || []);
}

export async function getServerErrors(req, res) {
  const { serverID } = req.params;
  const { offset, limit } = req.query;

  if (limit && limit > 100) {
    return res.status(400).send({
      error: 'limit too high',
    });
  }

  const errors = await prisma.gm_server_errors.findMany({
    where: {
      serverID,
    },
    orderBy: {
      createdAt: 'desc',
    },
    skip: offset || 0,
    take: limit || 500,
  });

  return res.send(errors || []);
}

export async function getAdminGuilds(req, res) {
  return res.send((await gm_guild.findAll()) || []);
}

export async function getServerRoles(req, res) {
  const { serverID } = req.params;

  const roles = await ServerSyncRole.findAll({
    where: {
      serverID,
    },
  });

  return res.send(roles || []);
}

export async function postServerRoles(req, res) {
  const { serverID, roleID } = req.params;

  const role = await ServerSyncRole.create({
    serverID,
    roleID,
  });

  return res.send(role);
}

export async function putServerRoles(req, res) {
  const { serverID, roleID } = req.params;

  const role = await ServerSyncRole.findOne({
    where: {
      serverID,
      roleID,
    },
  });

  if (!role) {
    return res.status(404).send({
      error: 'Role not found',
    });
  }

  const { userGroup, enable } = req.body;

  role.userGroup = userGroup !== undefined ? userGroup : role.userGroup;
  role.enable = enable !== undefined ? enable : role.enable;

  role.changed('updatedAt', true);
  await role.save();

  return res.send(role);
}

export async function deleteServerRoles(req, res) {
  const { serverID, roleID } = req.params;

  const role = await ServerSyncRole.findOne({
    where: {
      serverID,
      roleID,
    },
  });

  if (!role) {
    return res.status(404).send({
      error: 'Role not found',
    });
  }

  await role.destroy();
  return res.send(role);
}

export async function getGuildBotInstance(req, res) {
  const guild = req.guild;
  return res.send((await guild.getBotClientInfo(req.panelUser.user)) || {});
}

export async function patchGuildBotInstance(req, res) {
  const { token } = req.body;
  if (badArgument([token])) {
    return res.status(400).send({
      error: 'Missing required arguments',
    });
  }

  const guild = req.guild;
  try {
    await guild.updateBotInstanceToken(token);
    return res.send((await guild.getBotClientInfo(req.panelUser.user)) || {});
  } catch (error) {
    return res.status(400).send({
      error: error.message,
    });
  }
}

export async function postGmodPurchase(req, res) {
  const { guildID, discordID } = req.params;
  const user = await getUserFromDiscordID(discordID);
  if (!user || !user.getSteamID64()) {
    return res.status(404).send({
      error: 'User not found or not linked',
    });
  }

  const guild = req.guild;
  const purchase = await GmodStorePurchases.findOne({
    where: {
      steamID64: user.getSteamID64(),
    },
  });

  if (!purchase) {
    return res.status(404).send({
      error: 'Purchase not found',
    });
  }

  purchase.guild = guildID;
  await purchase.save();
  return res.send((await guild.getBotClientInfo(req.panelUser.user)) || {});
}

export async function deleteGmodPurchase(req, res) {
  const { discordID } = req.params;
  const guild = req.guild;
  if (!(await guild.mainBotOnGuild())) {
    return res.status(400).send({
      error: 'Main bot not on guild',
    });
  }

  const user = await getUserFromDiscordID(discordID);
  if (!user || !user.getSteamID64()) {
    return res.status(404).send({
      error: 'User not found or not linked',
    });
  }

  const purchase = await GmodStorePurchases.findOne({
    where: {
      steamID64: user.getSteamID64(),
    },
  });

  if (!purchase) {
    return res.status(404).send({
      error: 'Purchase not found',
    });
  }

  purchase.guild = '';
  purchase.token = '';
  purchase.changed('updatedAt', true);
  await purchase.save();
  await guild.reloadBotInstance();
  return res.send(purchase);
}

export async function putGuildBotInstance(req, res) {
  const { username, avatar, token } = req.body;
  const guild = req.guild;

  if (badArgument([username, avatar, token])) {
    return res.status(400).send({
      error: 'Missing required arguments',
    });
  }

  await guild.updateBotInstanceInfo({ username, avatar, token });
  return res.send((await guild.getBotClientInfo(req.panelUser.user)) || {});
}

export async function deleteGuildBotInstance(req, res) {
  return todoControllers(req, res);
  // const guild = req.guild;
  // await guild.deleteBotInstance();
  // return res.send((await guild.getBotClientInfo(req.panelUser.user)) || {});
}

export async function getUserGmodStorePurchases(req, res) {
  const { discordID } = req.params;
  const user = await getUserFromDiscordID(discordID);
  if (!user || !user.getSteamID64()) {
    return res.status(404).send({
      error: 'User not found or not linked',
    });
  }

  let purchases = await GmodStorePurchases.findOne({
    where: {
      steamID64: user.getSteamID64(),
    },
  });

  if (purchases && purchases.guild) {
    const mainClient = await getMainClient();
    purchases.dataValues.hasMainBot = mainClient.guilds.cache.has(purchases.guild);
  }

  return res.send(purchases || {});
}

export async function getServerPseudo(req, res) {
  const server = req.server;
  return res.send((await ServerPseudo.findAll({ where: { serverID: server.id } })) || []);
}

export async function postServerPseudo(req, res) {
  const { serverID } = req.params;

  const pseudo = await ServerPseudo.create({
    serverID,
  });

  return res.send(pseudo);
}

export async function putServerPseudo(req, res) {
  const { serverID, roleID } = req.params;

  const pseudo = await ServerPseudo.findOne({
    where: {
      serverID,
      id: roleID,
    },
  });

  if (!pseudo) {
    return res.status(404).send({
      error: 'Pseudo not found',
    });
  }

  const { role, name, prefix, enabled } = req.body;

  pseudo.name = name !== undefined ? name : pseudo.name;
  pseudo.prefix = prefix !== undefined ? prefix : pseudo.prefix;
  pseudo.role = role !== undefined ? role : pseudo.role;
  pseudo.enabled = enabled !== undefined ? enabled : pseudo.enabled;

  pseudo.changed('updatedAt', true);
  await pseudo.save();

  return res.send(pseudo);
}

export async function deleteServerPseudo(req, res) {
  const { serverID, roleID } = req.params;

  const pseudo = await ServerPseudo.findOne({
    where: {
      serverID,
      id: roleID,
    },
  });

  if (!pseudo) {
    return res.status(404).send({
      error: 'Pseudo not found',
    });
  }

  await pseudo.destroy();
  return res.send(pseudo);
}

export async function getUserNotifications(req, res) {
  const { discordID } = req.params;
  return res.json(await UsersNotifications.findAll({ where: { discordID } }));
}

export async function patchUserNotifications(req, res) {
  const { discordID, notificationID } = req.params;
  const notification = await UsersNotifications.findOne({
    where: {
      discordID,
      id: notificationID,
    },
  });
  if (!notification) {
    return res.status(404).send({ error: 'Notification not found' });
  }
  notification.read = true;
  await notification.save();
  return res.json(notification);
}

export async function getUserDataRequest(req, res) {
  const { discordID } = req.params;
  return res.json(await UsersDataRequest.findAll({ where: { discordID } }));
}

export async function postUserDataRequest(req, res) {
  const { discordID } = req.params;
  const lastRequest = await UsersDataRequest.findOne({
    where: {
      discordID,
    },
    order: [['createdAt', 'DESC']],
  });

  if (lastRequest && new Date(lastRequest.expirationDate) > new Date()) {
    return res.status(409).send({
      error: 'A recent request has already been made and is still valid.',
    });
  }

  const user = await getUserFromDiscordID(discordID);
  if (!user) {
    return res.status(404).send({
      error: 'User not found',
    });
  }

  return res.json(await getUserDataGRPD(user));
}

export async function getServerReportBugs(req, res) {
  const { serverID } = req.params;
  return res.json(await ServerReportBugs.findAll({ where: { serverID } }));
}
