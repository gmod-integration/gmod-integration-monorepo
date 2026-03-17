import { getUserFromDiscordID } from '@gmod/domain-user/User.js';
import { getServersFromDiscordGuildID, Server } from '@gmod/domain-server/Server.js';
import { ConfigDiscord } from '@gmod/config';
import {
  addAutoRoleToUser,
  addUserToGuild,
  getDiscordUserFromID,
  getUserGuildsWithPermsForPanel,
  getUserFromToken,
  getUserTokenFromCode,
  saveUser,
  saveUserPanel,
  verifyUser,
} from '@gmod/domain-guild/discordModels.js';
import { badArgument, todoControllers } from '@gmod/core/utils/tools.js';
import { getVerificationGuildMessage } from '@/discord/utils/messages.js';
import moment from 'moment';
import { getUserDataGRPD } from '@gmod/domain-compliance/gdrp.js';
import { getGuildClient } from '@/discord/index.js';
import redis from '@gmod/infra-redis';
import prisma from '@gmod/infra-prisma';
import { NextFunction, Request, Response } from 'express';
import {
  processCreateNewServer,
  processDeleteAutoRoles,
  processDeleteGmodPurchase,
  processDeleteGmodToDiscordFilter,
  processDeleteServerLogsTrigger,
  processDeleteServerPseudo,
  processDeleteUserSession,
  processGetAdminInformations,
  processGetAutoRoles,
  processGetProfile,
  processGetScreenshotsList,
  processGetServerLogs,
  processGetServerPlayers,
  processGetServerWarns,
  processGetUserGmodStorePurchases,
  processGetUserSessions,
  processLogOut,
  processPatchUserNotifications,
  processPostAutoRoles,
  processPostGmodPurchase,
  processPostServerLogsTrigger,
  processPostUserStartVerification,
  processPutGmodToDiscordFilter,
  processPutPlayerBypassMaintenance,
  processPutServerLogsTrigger,
  processPutServerPseudo,
} from '@gmod/core/models/v3/usersControllerModels.js';
import { Guild } from '@gmod/domain-guild/Guild.js';

export async function getProfile(req: Request, res: Response) {
  const result = await processGetProfile(req.query.steamID64, req.query.discordID);
  return res.status(result.status).send(result.body);
}

export async function getUserSessions(req: Request, res: Response) {
  const result = await processGetUserSessions(String(req.params.discordID));
  return res.status(result.status).send(result.body);
}

export async function deleteUserSession(req: Request, res: Response) {
  const { discordID, sessionID } = req.params;
  const result = await processDeleteUserSession(String(discordID), String(sessionID));
  return res.status(result.status).send(result.body);
}

export async function logOut(req: Request, res: Response) {
  const panelUser = req.panelUser!;
  const result = await processLogOut(panelUser.discordID, panelUser.panelToken.token);
  return res.status(result.status).json(result.body);
}

export async function findCurrentUser(req: Request, res: Response) {
  return res.send((await getDiscordUserFromID(req.params.discordID)) || {});
}

export async function oauthLogin(req: Request, res: Response) {
  const { code } = req.query;

  if (!code) {
    const { redirect } = req.query;
    return res.redirect(ConfigDiscord.oauthPanel + (redirect ? `&state=redirect:${redirect}` : ''));
  }

  const redirect = typeof req.query.state === 'string' ? req.query.state.split('redirect:')[1] : null;
  const codeString = typeof code === 'string' ? code : '';
  const discordUserToken = await getUserTokenFromCode(
    codeString,
    `${req.protocol}://${req.headers.host}${req.originalUrl.split('?')[0]}`,
  );
  if (!discordUserToken) {
    return res.status(401).send({
      error: 'unauthorized',
    });
  }

  const guildIDMatch = typeof req.query.state === 'string' ? req.query.state.match(/guildID=([0-9]+)/) : null;
  const guildID = guildIDMatch ? guildIDMatch[1] : null;

  discordUserToken.expirationDate = new Date(Date.now() + discordUserToken.expires_in * 1000);
  discordUserToken.creationDate = new Date();

  const discordUser = await getUserFromToken(`${discordUserToken.token_type} ${discordUserToken.access_token}`);
  if (!discordUser) {
    return res.status(401).send({
      error: 'unauthorized',
    });
  }

  let skipGuidJoin = false;

  if (guildID) {
    const dscClient = await getGuildClient(guildID);
    if (!dscClient) return;

    const dscGuild = dscClient.guilds.cache.get(guildID);
    if (!dscGuild) return;

    const guild = new Guild(dscGuild);
    if (!guild) return;

    skipGuidJoin = await guild.getSetting('verification_dont_join_support');
  }

  if (!skipGuidJoin) {
    await addUserToGuild(ConfigDiscord.guildID, discordUser.id, discordUserToken.access_token)
      .then(() => {
        console.log('User added to guild');
      })
      .catch((error) => {
        console.error(error);
      });
  }

  const userIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const userCountry = req.headers['cf-ipcountry'] || 'XX';
  const userUA = req.useragent;

  const panelAccessToken = await saveUserPanel(discordUser.id, discordUserToken, {
    os: userUA?.os || 'Unknown',
    browser: userUA?.browser || 'Unknown',
    ip: userIP,
    country: userCountry,
  });
  await saveUser(discordUser.id, discordUser.username);

  return res.redirect(
    `${ConfigDiscord.oauthPanelRedirect}?discordID=${discordUser.id}&accessToken=${panelAccessToken}&expirationDate=${discordUserToken.expirationDate.getTime()}${
      redirect ? `&redirect=${redirect}` : ''
    }`,
  );
}

export async function getUserGuildsOwnOrAdmins(req: Request, res: Response) {
  const panelUser = req.panelUser!;

  return res.send(await getUserGuildsWithPermsForPanel(panelUser));
}

export async function findGuild(req: Request, res: Response) {
  const dscGuild = req.dscGuild!;

  return res.send({
    id: dscGuild.id,
    name: dscGuild.name,
    icon: dscGuild.icon,
    ownerID: dscGuild.ownerId,
  });
}

export async function findGuildChannels(req: Request, res: Response, next: NextFunction) {
  const dscGuild = req.dscGuild!;

  return res.send(
    dscGuild.channels.cache.map((channel) => ({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      position: 'position' in channel ? channel.position : null,
      parentID: channel.parent ? channel.parent.id : null,
    })),
  );
}

export async function getGuildEmojis(req: Request, res: Response) {
  const dscGuild = req.dscGuild!;
  const totalEmojis: any = [];

  dscGuild.emojis.cache.forEach((emoji) => {
    totalEmojis.push({
      id: emoji.id,
      name: emoji.name,
      url: emoji.url,
    });
  });

  return res.send(totalEmojis);
}

export async function getGuildRoles(req: Request, res: Response) {
  const dscGuild = req.dscGuild!;

  return res.send(
    dscGuild.roles.cache
      .filter((role) => role.managed === false)
      .map((role) => ({
        id: role.id,
        name: role.name,
        position: role.position,
        color: role.color,
        colorHex: `#${role.color.toString(16).padStart(6, '0')}`,
      }))
      .filter((role) => role.name !== '@everyone')
      .sort((a, b) => a.position - b.position),
  );
}

export async function findGuildServers(req: Request, res: Response) {
  const dscGuild = req.dscGuild!;

  return res.send(await getServersFromDiscordGuildID(dscGuild.id));
}

export async function findGuildServer(req: Request, res: Response) {
  return res.json(req.server);
}

export async function findServerStatus(req: Request, res: Response) {
  const server = req.server!;
  return res.send((await server.getStatusChannelAndMessage()) || {});
}

export async function createNewServer(req: Request, res: Response) {
  const result = await processCreateNewServer(req.guild!);
  return res.status(result.status).send(result.body);
}

export async function getGuildLinks(req: Request, res: Response) {
  const guild = req.guild!;
  return res.send((await guild.getLinks()) || []);
}

export async function postGuildLinks(req: Request, res: Response) {
  const guild = req.guild!;
  const isPremium = await guild.isPremium();

  const links = await guild.getLinks();
  if (links.length >= 2 && !isPremium) {
    return res.status(403).send({
      error: 'max links reached',
    });
  }

  return res.send(await guild.createNewLink());
}

export async function putGuildLinks(req: Request, res: Response) {
  const { linkID } = req.params;
  const guild = req.guild!;
  const { url, alias, active } = req.body;

  const link = await guild.getLink(Number(linkID));
  if (!link) {
    return res.status(404).send({
      error: 'link not found or not belong to guild',
    });
  }

  return res.send(
    await prisma.gm_server_links.update({
      where: {
        id: link.id,
        guild: guild.id,
      },
      data: {
        url: url !== undefined ? url : link.url,
        alias: alias !== undefined ? alias : link.alias,
        active: active !== undefined ? active : link.active,
      },
    }),
  );
}

export async function deleteGuildLinks(req: Request, res: Response) {
  const { linkID } = req.params;
  const guild = req.guild!;

  const link = await guild.getLink(linkID);
  if (!link) {
    return res.status(404).send({
      error: 'link not found or not belong to guild',
    });
  }

  await guild.deleteLink(linkID);
  return res.send(link);
}

export async function putGuildServer(req: Request, res: Response) {
  const server = req.server!;
  const { name, image, ip, port, isPublic, description } = req.body;

  return res.send(
    await prisma.gm_server.update({
      where: {
        id: server.id,
      },
      data: {
        name: name !== undefined ? name : server.name,
        image: image !== undefined ? image : server.image,
        ip: ip !== undefined ? ip : server.ip,
        port: port !== undefined ? port : server.port,
        isPublic: isPublic !== undefined ? isPublic : server.isPublic,
        description: description !== undefined ? description : server.description,
      },
    }),
  );
}

export async function deleteGuildServer(req: Request, res: Response) {
  const server = req.server!;
  await server.delete();
  return res.send(server);
}

export async function getGuildAdmins(req: Request, res: Response) {
  const guild = req.guild!;
  return res.send((await guild.getAdmins()) || []);
}

export async function postGuildServerToken(req: Request, res: Response) {
  const server = req.server!;
  await server.regenerateToken();
  return res.send(server);
}

export async function getGuildVerificationsRoles(req: Request, res: Response) {
  const guild = req.guild!;
  return res.send((await guild.getVerificationRoles()) || []);
}

export async function putGuildVerificationsRoles(req: Request, res: Response) {
  const guild = req.guild!;
  const { roleID } = req.params;
  const { isGiveRole, enabled } = req.body;

  const verificationRole = await guild.getVerificationRole(roleID);
  if (!verificationRole) {
    return res.status(404).send({
      error: 'role not found or not belong to guild',
    });
  }

  return res.send(
    await prisma.gm_guild_verify_role.update({
      where: {
        id: verificationRole.id,
        guildID: guild.id,
      },
      data: {
        isGiveRole: isGiveRole !== undefined ? isGiveRole : verificationRole.isGiveRole,
        enabled: enabled !== undefined ? enabled : verificationRole.enabled,
      },
    }),
  );
}

export async function deleteGuildVerificationsRoles(req: Request, res: Response) {
  const guild = req.guild!;
  const { roleID } = req.params;

  const verificationRole = await guild.getVerificationRole(roleID);
  if (!verificationRole) {
    return res.status(404).send({
      error: 'role not found or not belong to guild',
    });
  }

  await prisma.gm_guild_verify_role.delete({
    where: {
      id: verificationRole.id,
    },
  });
  return res.send(verificationRole);
}

export async function createGuildVerificationsRoles(req: Request, res: Response) {
  const guild = req.guild!;
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

export async function deleteServerStatus(req: Request, res: Response) {
  const server = req.server!;
  return res.send(await server.deleteStatus());
}

export async function postServerStatus(req: Request, res: Response) {
  const server = req.server!;
  const { channelID } = req.body;
  await server.deleteStatus();
  return res.send(await server.createStatus(channelID));
}

export async function getServerStatusButtons(req: Request, res: Response) {
  const server = req.server!;
  return res.send((await server.findStatusButtons()) || []);
}

export async function putServerStatusButtons(req: Request, res: Response) {
  const server = req.server!;
  const { buttonID } = req.params;
  const { name, emoji, url, enable } = req.body;

  const button = await server.findStatusButton(Number(buttonID));
  if (!button) {
    return res.status(404).send({
      error: 'button not found',
    });
  }

  const updateButton = await prisma.gm_status_button.update({
    where: {
      id: button.id,
      server: server.id,
    },
    data: {
      name: name !== undefined ? name : button.name,
      emoji: emoji !== undefined ? emoji : button.emoji,
      url: url !== undefined ? url : button.url,
      enable: enable !== undefined ? enable : button.enable,
    },
  });

  if (button.enable) {
    await server.editStatusChannelAndMessage(await server.getStatusData());
  }

  return res.send(updateButton);
}

export async function createServerStatusButtons(req: Request, res: Response) {
  const server = req.server!;
  const button = await server.createStatusButton();
  return res.send(button);
}

export async function deleteServerStatusButtons(req: Request, res: Response) {
  const server = req.server!;
  const { buttonID } = req.params;

  const button = await server.findStatusButton(Number(buttonID));
  if (!button) {
    return res.status(404).send({
      error: 'button not found',
    });
  }

  await server.destroyStatusButton(Number(buttonID));

  if (button.enable) {
    await server.editStatusChannelAndMessage(await server.getStatusData());
  }

  return res.send(button);
}

export async function findServerScreenshots(req: Request, res: Response) {
  const server = req.server!;
  return res.send((await server.getScreenshotsChannel()) || {});
}

export async function postServerScreenshots(req: Request, res: Response) {
  const server = req.server!;
  const { channelID } = req.body;
  return res.send(await server.createScreenshotChannel(channelID));
}

export async function deleteServerScreenshots(req: Request, res: Response) {
  const server = req.server!;
  return res.send(await server.destroyScreenshotChannel());
}

export async function findServerSyncChat(req: Request, res: Response) {
  const server = req.server!;
  return res.send((await server.getSyncChat()) || {});
}

export async function postServerSyncChat(req: Request, res: Response) {
  const server = req.server!;
  const { channelID } = req.body;
  return res.send(await server.createSyncChat(channelID));
}

export async function deleteServerSyncChat(req: Request, res: Response) {
  const server = req.server!;
  return res.send(await server.destroySyncChat());
}

export async function getGmodToDiscordFilter(req: Request, res: Response) {
  const server = req.server!;
  return res.send(
    (await prisma.gm_server_sync_chat_filter.findMany({
      where: {
        serverID: server.id,
      },
    })) || [],
  );
}

export async function postGmodToDiscordFilter(req: Request, res: Response) {
  const server = req.server!;

  const filter = await prisma.gm_server_sync_chat_filter.create({
    data: {
      serverID: server.id,
    },
  });

  await redis.del(`server:${server.id}:gmodToDiscordFilter`);
  return res.send(filter);
}

export async function putGmodToDiscordFilter(req: Request, res: Response) {
  const { filterID } = req.params;
  const server = req.server!;
  const result = await processPutGmodToDiscordFilter(server, filterID, req.body);
  return res.status(result.status).send(result.body);
}

export async function deleteGmodToDiscordFilter(req: Request, res: Response) {
  const { filterID } = req.params;
  const server = req.server!;
  const result = await processDeleteGmodToDiscordFilter(server, filterID);
  return res.status(result.status).send(result.body);
}

export async function getServerPlayers(req: Request, res: Response) {
  const server = req.server!;
  const result = await processGetServerPlayers(server.id, {
    limit: req.query.limit,
    offset: req.query.offset,
    order: req.query.order,
    searchColum: req.query.searchColum,
    search: req.query.search,
  });
  return res.status(result.status).send(result.body);
}

export async function putPlayerBypassMaintenance(req: Request, res: Response) {
  const server = req.server!;
  const { playerID } = req.params;
  const result = await processPutPlayerBypassMaintenance(server, String(playerID), req.body.bypassMaintenance);
  return res.status(result.status).send(result.body);
}

export async function postUserStartVerification(req: Request, res: Response) {
  const result = await processPostUserStartVerification(String(req.params.discordID));
  return res.status(result.status).json(result.body);
}

export async function postAutoRoles(req: Request, res: Response) {
  const { guildID, roleID } = req.params;
  const result = await processPostAutoRoles(String(guildID), String(roleID));
  return res.status(result.status).send(result.body);
}

export async function deleteAutoRoles(req: Request, res: Response) {
  const { guildID, roleID } = req.params;
  const result = await processDeleteAutoRoles(String(guildID), String(roleID));
  return res.status(result.status).send(result.body);
}

export async function getAutoRoles(req: Request, res: Response) {
  const result = await processGetAutoRoles(String(req.params.guildID));
  return res.status(result.status).send(result.body);
}

export async function createVerificationMessage(req: Request, res: Response) {
  const dscGuild = req.dscGuild!;
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
  if (!channel || !channel.isSendable()) {
    return res.status(400).send({
      error: 'Channel is not a text channel',
    });
  }

  const oldMsg = await prisma.gm_guild_verify_msg.findFirst({
    where: {
      guildID: dscGuild.id,
    },
  });

  if (oldMsg) {
    const oldChannel = dscGuild.channels.cache.get(oldMsg.channelID);
    if (oldChannel && oldChannel.isTextBased()) {
      try {
        const oldMessage = await oldChannel.messages.fetch(oldMsg.messageID);
        await oldMessage.delete();
      } catch (error) {
        //skip
      }
    }
    await prisma.gm_guild_verify_msg.delete({
      where: {
        guildID: dscGuild.id,
      },
    });
  }

  // send msg
  const msg = await getVerificationGuildMessage(dscGuild.preferredLocale, dscGuild.id);
  const sentMsg = await channel.send(msg);

  // save msg
  const newVerif = await prisma.gm_guild_verify_msg.create({
    data: {
      guildID: dscGuild.id,
      messageID: sentMsg.id,
      channelID: channelID,
    },
  });

  return res.send(newVerif);
}

export async function getVerificationCheck(req: Request, res: Response) {
  const guild = req.guild!;
  return res.send(await guild.canCheckVerif());
}

export async function postVerificationCheck(req: Request, res: Response) {
  const guild = req.guild!;

  if (!(await guild.canCheckVerif())) {
    return res.status(403).send({
      error: 'Verification check done in the last day',
    });
  }

  res.send({
    success: true,
  });

  const verif = await prisma.gm_guild_verification_check.create({
    data: {
      guildID: guild.id,
    },
  });

  const members = await guild.dscGuild.members.fetch();
  for (const member of members.values()) {
    await addAutoRoleToUser(guild.dscGuild, member);
    await verifyUser(guild.dscGuild, member);
  }

  await prisma.gm_guild_verification_check.update({
    where: {
      id: verif.id,
    },
    data: {
      done: true,
    },
  });
}

export async function getVerificationMessage(req: Request, res: Response) {
  const dscGuild = req.dscGuild!;
  const msg = await prisma.gm_guild_verify_msg.findFirst({
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

export async function deleteVerificationMessage(req: Request, res: Response) {
  const dscGuild = req.dscGuild!;
  const msg = await prisma.gm_guild_verify_msg.findFirst({
    where: {
      guildID: dscGuild.id,
    },
  });

  if (!msg) {
    return res.status(404).send({
      error: 'Verification message not found',
    });
  }

  const channel = dscGuild.channels.cache.get(msg.channelID);
  if (channel && channel.isTextBased()) {
    try {
      const message = await channel.messages.fetch(msg.messageID);
      await message.delete();
    } catch (error) {
      //skip
    }
  }

  await prisma.gm_guild_verify_msg.delete({
    where: {
      guildID: dscGuild.id,
    },
  });
  return res.send(msg);
}

export async function getPublicServers(req: Request, res: Response) {
  const serversData = await prisma.gm_server.findMany({
    where: {
      isPublic: true,
    },
  });

  let publicServers: any = [];

  let thirtyDaysAgo = moment().subtract(30, 'days').toDate();
  for (const serverData of serversData) {
    const server = new Server(serverData);
    let publicInformations = await server.getPublicInformations();
    publicInformations.vote = await prisma.gm_server_vote.count({
      where: {
        serverID: server.id,
        createdAt: {
          gt: thirtyDaysAgo,
        },
      },
    });
    publicServers.push(publicInformations);
  }

  const serverStatus = await prisma.gm_server_status.findMany({
    where: {
      id: {
        in: serversData.map((server: any) => server.id),
      },
    },
  });

  for (const status of serverStatus) {
    if (status.updatedAt < new Date(Date.now() - 1000 * 60 * 5)) {
      continue;
    }
    const server = publicServers.find((server: any) => server.id === status.id);
    if (server) server.status = status;
  }

  return res.send(publicServers);
}

export async function getVoteChannels(req: Request, res: Response) {
  const server = req.server!;
  return res.send((await server.getVoteChannel()) || {});
}

export async function postVoteChannels(req: Request, res: Response) {
  const server = req.server!;
  const { channelID } = req.body;

  if (badArgument([channelID])) {
    return res.status(400).send({
      error: 'Missing required arguments',
    });
  }

  return res.send(await server.createVoteChannel(channelID));
}

export async function deleteVoteChannels(req: Request, res: Response) {
  const server = req.server!;
  return res.send(await server.destroyVoteChannel());
}

export async function getLogsChannel(req: Request, res: Response) {
  const server = req.server!;
  return res.send((await server.getLogsChannel()) || {});
}

export async function postLogsChannel(req: Request, res: Response) {
  const server = req.server!;
  const { channelID } = req.body;

  if (badArgument([channelID])) {
    return res.status(400).send({
      error: 'Missing required arguments',
    });
  }

  return res.send(await server.createLogsChannel(channelID));
}

export async function deleteLogsChannel(req: Request, res: Response) {
  const server = req.server!;
  return res.send(await server.destroyLogsChannel());
}

export async function getGuildSettings(req: Request, res: Response) {
  const guild = req.guild!;
  return res.send((await guild.getAllSettings()) || []);
}

export async function getGuildSetting(req: Request, res: Response) {
  // const { setting } = req.params;
  // return res.send(
  //   prisma.gm_guild_settings.findFirst({
  //     where: {
  //       setting,
  //     },
  //   }) || {},
  // );
  const guild = req.guild!;
  const { setting } = req.params;

  try {
    return res.send({
      value: await guild.getSetting(setting),
    });
  } catch (error) {
    return res.status(404).send({
      error: 'Setting not found',
    });
  }
}

export async function putGuildSetting(req: Request, res: Response) {
  const guild = req.guild!;
  const { setting } = req.params;
  const { value } = req.body;

  if (badArgument([value])) {
    return res.status(400).send({
      error: 'Missing required arguments',
    });
  }

  try {
    return res.send(await guild.setSetting(setting, value));
  } catch (error) {
    return res.status(404).json({
      error: 'Setting not found or not allowed',
    });
  }
}

export async function getServerSettings(req: Request, res: Response) {
  const server = req.server!;
  return res.send((await server.getAllSettings()) || []);
}

export async function getServerSetting(req: Request, res: Response) {
  const { setting } = req.params;
  const server = req.server!;

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

export async function putServerSetting(req: Request, res: Response) {
  const { setting } = req.params;
  const server = req.server!;
  const { value } = req.body;

  if (badArgument([value])) {
    return res.status(400).send({
      error: 'Missing required arguments',
    });
  }

  try {
    return res.send(await server.setSetting(setting, value, 'dashboard'));
  } catch (error) {
    return res.status(404).send({
      error: 'Setting not found or not allowed',
    });
  }
}

export async function getAdminGuilds(req: Request, res: Response) {
  return res.send((await prisma.gm_guild.findMany()) || []);
}

export async function getAdminInformations(req: Request, res: Response) {
  const result = await processGetAdminInformations();
  return res.status(result.status).json(result.body);
}

export async function getServerRoles(req: Request, res: Response) {
  const { serverID } = req.params;

  const roles = await prisma.gm_server_sync_roles.findMany({
    where: {
      serverID,
    },
  });

  return res.send(roles || []);
}

export async function postServerRoles(req: Request, res: Response) {
  const { serverID, roleID } = req.params;

  const role = await prisma.gm_server_sync_roles.create({
    data: {
      serverID,
      roleID,
    },
  });

  return res.send(role);
}

export async function putServerRoles(req: Request, res: Response) {
  const { serverID, roleID } = req.params;

  const role = await prisma.gm_server_sync_roles.findFirst({
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

  return res.send(
    await prisma.gm_server_sync_roles.update({
      where: {
        serverID_roleID: {
          serverID,
          roleID,
        },
      },
      data: {
        userGroup: userGroup !== undefined ? userGroup : role.userGroup,
        enable: enable !== undefined ? enable : role.enable,
      },
    }),
  );
}

export async function deleteServerRoles(req: Request, res: Response) {
  const { serverID, roleID } = req.params;

  const role = await prisma.gm_server_sync_roles.findFirst({
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

  await prisma.gm_server_sync_roles.delete({
    where: {
      serverID_roleID: {
        serverID,
        roleID,
      },
    },
  });
  return res.send(role);
}

export async function getServerTeams(req: Request, res: Response) {
  const { serverID } = req.params;

  const roles = await prisma.gm_server_sync_team_roles.findMany({
    where: {
      serverID,
    },
  });

  return res.send(roles || []);
}

export async function postServerTeams(req: Request, res: Response) {
  const { serverID, roleID } = req.params;

  const role = await prisma.gm_server_sync_team_roles.create({
    data: {
      serverID,
      roleID,
    },
  });

  return res.send(role);
}

export async function putServerTeams(req: Request, res: Response) {
  const { serverID, id } = req.params;

  const role = await prisma.gm_server_sync_team_roles.findFirst({
    where: {
      serverID,
      id: Number(id),
    },
  });

  if (!role) {
    return res.status(404).send({
      error: 'Role not found',
    });
  }

  const { teamName, enable } = req.body;
  return res.send(
    await prisma.gm_server_sync_team_roles.update({
      where: {
        serverID,
        id: Number(id),
      },
      data: {
        teamName: teamName !== undefined ? teamName : role.teamName,
        enable: enable !== undefined ? enable : role.enable,
      },
    }),
  );
}

export async function deleteServerTeams(req: Request, res: Response) {
  const { serverID, id } = req.params;

  const role = await prisma.gm_server_sync_team_roles.findFirst({
    where: {
      serverID,
      id: Number(id),
    },
  });

  if (!role) {
    return res.status(404).send({
      error: 'Role not found',
    });
  }

  await prisma.gm_server_sync_team_roles.delete({
    where: {
      serverID,
      id: Number(id),
    },
  });
  return res.send(role);
}

export async function getGuildBotInstance(req: Request, res: Response) {
  const guild = req.guild!;
  return res.send((await guild.getBotClientInfo(req.panelUser!.user)) || {});
}

export async function getGuildBotRoleSubordination(req: Request, res: Response) {
  const guild = req.guild!;
  return res.send((await guild.getBotRoleSubordination()) || {});
}

export async function patchGuildBotInstance(req: Request, res: Response) {
  const { token } = req.body;
  if (badArgument([token])) {
    return res.status(400).send({
      error: 'Missing required arguments',
    });
  }

  const guild = req.guild!;
  try {
    await guild.updateBotInstanceToken(token);
    return res.send((await guild.getBotClientInfo(req.panelUser!.user)) || {});
  } catch (error: any) {
    return res.status(400).send({
      error: error.message,
    });
  }
}

export async function postGmodPurchase(req: Request, res: Response) {
  const { guildID, discordID } = req.params;
  const result = await processPostGmodPurchase(String(guildID), String(discordID), req.guild!, req.panelUser!);
  return res.status(result.status).send(result.body);
}

export async function deleteGmodPurchase(req: Request, res: Response) {
  const result = await processDeleteGmodPurchase(String(req.params.discordID), req.guild!);
  return res.status(result.status).send(result.body);
}

export async function putGuildBotInstance(req: Request, res: Response) {
  const { username, avatar, token, status } = req.body;
  const guild = req.guild!;

  if (badArgument([username, avatar, token, status])) {
    return res.status(400).send({
      error: 'Missing required arguments',
    });
  }

  await guild.updateBotInstanceInfo({ username, avatar, token, status });
  return res.send((await guild.getBotClientInfo(req.panelUser!.user)) || {});
}

export async function deleteGuildBotInstance(req: Request, res: Response) {
  return todoControllers(req, res);
  // const guild = req.guild!;
  // await guild.deleteBotInstance();
  // return res.send((await guild.getBotClientInfo(req.panelUser!.user)) || {});
}

export async function getUserGmodStorePurchases(req: Request, res: Response) {
  const result = await processGetUserGmodStorePurchases(String(req.params.discordID));
  return res.status(result.status).send(result.body);
}

export async function getServerPseudo(req: Request, res: Response) {
  const server = req.server!;
  return res.send(
    (await prisma.gm_server_pseudo.findMany({
      where: {
        serverID: server.id,
      },
    })) || [],
  );
}

export async function postServerPseudo(req: Request, res: Response) {
  const { serverID } = req.params;

  const pseudo = await prisma.gm_server_pseudo.create({
    data: {
      serverID,
    },
  });

  return res.send(pseudo);
}

export async function putServerPseudo(req: Request, res: Response) {
  const { serverID, roleID } = req.params;
  const result = await processPutServerPseudo(String(serverID), roleID, req.body);
  return res.status(result.status).send(result.body);
}

export async function deleteServerPseudo(req: Request, res: Response) {
  const { serverID, roleID } = req.params;
  const result = await processDeleteServerPseudo(String(serverID), roleID);
  return res.status(result.status).send(result.body);
}

export async function getUserNotifications(req: Request, res: Response) {
  const { discordID } = req.params;
  return res.json(
    await prisma.gm_users_notifications.findMany({
      where: { discordID },
    }),
  );
}

export async function patchUserNotifications(req: Request, res: Response) {
  const { discordID, notificationID } = req.params;
  const result = await processPatchUserNotifications(String(discordID), notificationID);
  return res.status(result.status).json(result.body);
}

export async function getUserDataRequest(req: Request, res: Response) {
  const { discordID } = req.params;
  return res.json(
    await prisma.gm_users_data_request.findMany({
      where: { discordID },
    }),
  );
}

export async function postUserDataRequest(req: Request, res: Response) {
  const { discordID } = req.params;
  const lastRequest = await prisma.gm_users_data_request.findFirst({
    where: {
      discordID,
    },
    orderBy: {
      createdAt: 'desc',
    },
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

export async function getServerReportBugs(req: Request, res: Response) {
  const { serverID } = req.params;
  return res.json(
    await prisma.gm_server_report_bugs.findMany({
      where: { serverID },
    }),
  );
}

export async function getServerLogs(req: Request, res: Response) {
  const result = await processGetServerLogs(String(req.params.serverID), req.query);
  return res.status(result.status).send(result.body);
}

export async function getServerWarns(req: Request, res: Response) {
  const server = req.server!;
  const result = await processGetServerWarns(server.id, req.query);
  return res.status(result.status).json(result.body);
}

export async function getScreenshotsList(req: Request, res: Response) {
  const server = req.server!;
  const result = await processGetScreenshotsList(server.id, req.query);
  return res.status(result.status).json(result.body);
}

export async function getServerLogsTrigger(req: Request, res: Response) {
  const server = req.server!;
  if (!(await server.isPremium())) {
    return res.status(403).send({
      error: 'Server is not premium',
    });
  }
  return res.send((await server.getLogsTrigger()) || {});
}

export async function postServerLogsTrigger(req: Request, res: Response) {
  const result = await processPostServerLogsTrigger(req.server!, req.body);
  return res.status(result.status).send(result.body);
}

export async function putServerLogsTrigger(req: Request, res: Response) {
  const { triggerID } = req.params;
  const result = await processPutServerLogsTrigger(req.server!, triggerID, req.body);
  return res.status(result.status).send(result.body);
}

export async function deleteServerLogsTrigger(req: Request, res: Response) {
  const result = await processDeleteServerLogsTrigger(req.server!, req.params.triggerID);
  return res.status(result.status).send(result.body);
}
