import { getUserFromDiscordID, getUserFromSteamID64 } from '../../classes/v3/User.js';
import { createServer, getServersFromDiscordGuildID, Server } from '../../classes/v3/Server.js';
import { discordConfig } from '../../config/index.js';
import {
  addAutoRoleToUser,
  getDiscordUserFromID,
  getUserFromToken,
  getUserTokenFromCode,
  saveUser,
  saveUserPanel,
  verifyUser,
} from '../../models/v3/discordModels.js';
import { badArgument, generateToken, todoControllers } from '../../utils/tools.js';
import { getVerificationGuildMessage } from '../../discord/utils/messages.js';
import moment from 'moment';
import { getUserDataGRPD } from '../../models/v3/gdrp.js';
import { getMainClient } from '../../discord/index.js';
import redis from '../../redis/index.js';
import prisma from '../../prisma.js';
import { NextFunction, Request, Response } from 'express';
import { getLogsByServer } from '../../database/gm_server_logs.js';

export async function getProfile(req: Request, res: Response) {
  const { steamID64, discordID } = req.query;

  if (discordID) {
    const user = await getUserFromDiscordID(discordID as string);
    if (!user) {
      return res.status(404).send({
        error: 'User not found',
      });
    }
    return res.send(user);
  }

  if (steamID64) {
    const user = await getUserFromSteamID64(steamID64 as string);
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

export async function getUserSessions(req: Request, res: Response) {
  const { discordID } = req.params;
  const sessions = await prisma.gm_panelToken.findMany({
    where: {
      discordID,
    },
  });

  return res.send(sessions || []);
}

export async function deleteUserSession(req: Request, res: Response) {
  const { discordID, sessionID } = req.params;
  const session = await prisma.gm_panelToken.findFirst({
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

  await prisma.gm_panelToken.delete({
    where: {
      id: sessionID,
    },
  });

  return res.send(session || {});
}

export async function logOut(req: Request, res: Response) {
  const panelUser = req.panelUser!;
  const sessionToken = await prisma.gm_panelToken.findFirst({
    where: {
      discordID: panelUser.discordID,
      accessToken: panelUser.panelToken.token,
    },
  });

  if (sessionToken) {
    await prisma.gm_panelToken.delete({
      where: {
        id: sessionToken.id,
      },
    });
  }

  return res.status(200).json(sessionToken || {});
}

export async function findCurrentUser(req: Request, res: Response) {
  return res.send((await getDiscordUserFromID(req.params.discordID)) || {});
}

export async function oauthLogin(req: Request, res: Response) {
  const { code } = req.query;

  if (!code) {
    const { redirect } = req.query;
    return res.redirect(discordConfig.oauthPanel + (redirect ? `&state=redirect:${redirect}` : ''));
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
    os: userUA?.os || 'Unknown',
    browser: userUA?.browser || 'Unknown',
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

export async function getUserGuildsOwnOrAdmins(req: Request, res: Response) {
  const panelUser = req.panelUser!;

  return res.send(await panelUser.findGuildsWithPermsForPanel());
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
  const guild = req.guild!;

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
  const { element, operator, trigger, action, active } = req.body;

  if (badArgument([element, operator, trigger, action, active])) {
    return res.status(400).send({
      error: 'missing arguments',
    });
  }

  const filter = await prisma.gm_server_sync_chat_filter.findFirst({
    where: {
      id: Number(filterID),
      serverID: server.id,
    },
  });

  if (!filter) {
    return res.status(404).send({
      error: 'filter not found',
    });
  }

  const updatedFilter = await prisma.gm_server_sync_chat_filter.update({
    where: {
      id: Number(filterID),
    },
    data: {
      element: element !== undefined ? element : filter.element,
      operator: operator !== undefined ? operator : filter.operator,
      trigger: trigger !== undefined ? trigger : filter.trigger,
      action: action !== undefined ? action : filter.action,
      active: active !== undefined ? active : filter.active,
    },
  });

  await redis.del(`server:${server.id}:gmodToDiscordFilter`);
  return res.send(updatedFilter);
}

export async function deleteGmodToDiscordFilter(req: Request, res: Response) {
  const { filterID } = req.params;
  const server = req.server!;
  const filter = await prisma.gm_server_sync_chat_filter.findFirst({
    where: {
      id: Number(filterID),
      serverID: server.id,
    },
  });

  if (!filter) {
    return res.status(404).send({
      error: 'filter not found',
    });
  }

  await redis.del(`server:${server.id}:gmodToDiscordFilter`);
  // await filter.destroy();
  await prisma.gm_server_sync_chat_filter.delete({
    where: {
      id: Number(filterID),
    },
  });
  return res.send(filter);
}

export async function getServerPlayers(req: Request, res: Response) {
  const server = req.server!;
  return res.send((await server.getDBPlayers()) || []);
}

export async function putPlayerBypassMaintenance(req: Request, res: Response) {
  const server = req.server!;
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

  const editPlayer = await prisma.gm_server_stat.update({
    where: {
      server_id_steam_id: {
        steam_id: player.steam_id,
        server_id: server.id,
      },
    },
    data: {
      bypassMaintenance: player.bypassMaintenance,
    },
  });
  return res.send(editPlayer);
}

export async function postUserStartVerification(req: Request, res: Response) {
  const { discordID } = req.params;
  const user = await prisma.gm_user.findFirst({
    where: {
      id: discordID,
    },
  });

  if (!user) {
    return res.status(404).send({
      error: 'User not found',
    });
  }

  const newUser = await prisma.gm_user.update({
    where: {
      id: discordID,
    },
    data: {
      token: generateToken(16),
      token_expires: new Date(Date.now() + 1000 * 60 * 7),
    },
  });

  return res.json({
    token: newUser.token,
    expires: newUser.token_expires,
  });
}

export async function postAutoRoles(req: Request, res: Response) {
  const { guildID, roleID } = req.params;
  const existingAutoRole = await prisma.gm_guild_auto_roles.findFirst({
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

  const autoRole = await prisma.gm_guild_auto_roles.create({
    data: {
      guildID,
      roleID,
    },
  });

  return res.send(autoRole);
}

export async function deleteAutoRoles(req: Request, res: Response) {
  const { guildID, roleID } = req.params;
  const autoRole = await prisma.gm_guild_auto_roles.findFirst({
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

  await prisma.gm_guild_auto_roles.delete({
    where: {
      roleID,
      guildID,
    },
  });
  return res.send(autoRole);
}

export async function getAutoRoles(req: Request, res: Response) {
  const { guildID } = req.params;
  const autoRoles = await prisma.gm_guild_auto_roles.findMany({
    where: {
      guildID,
    },
  });

  return res.send(autoRoles || []);
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
  const msg = await getVerificationGuildMessage(dscGuild.preferredLocale);
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
  console.log(thirtyDaysAgo);
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
    return res.send(await server.setSetting(setting, value));
  } catch (error) {
    return res.status(404).send({
      error: 'Setting not found or not allowed',
    });
  }
}

export async function getServerLogs(req: Request, res: Response) {
  const { serverID } = req.params;
  const { offset, limit: number } = req.query;
  const limit = Number(number);

  if (limit && limit > 100) {
    return res.status(400).send({
      error: 'limit too high',
    });
  }

  const logs = await getLogsByServer(serverID, {
    offset: Number(offset) || 0,
    limit: limit || 500,
  });

  return res.send(logs || []);
}

export async function getServerErrors(req: Request, res: Response) {
  const { serverID } = req.params;
  const { offset, limit: number } = req.query;
  const limit = Number(number);

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
    skip: Number(offset) || 0,
    take: limit || 500,
  });

  return res.send(errors || []);
}

export async function getAdminGuilds(req: Request, res: Response) {
  return res.send((await prisma.gm_guild.findMany()) || []);
}

export async function getAdminInformations(req: Request, res: Response) {
  let data: any = {
    guild: {},
    server: {},
    user: {},
  };
  // Guild
  data.guild.total = await prisma.gm_guild.count();
  data.guild.language = (
    await prisma.gm_guild.groupBy({
      by: ['language'],
      _count: {
        language: true,
      },
    })
  ).map((lang) => ({
    label: lang.language,
    value: lang._count.language,
  }));
  // Server
  data.server.total = await prisma.gm_server.count();
  // User
  data.user.totalDiscordMembers =
    (
      await prisma.gm_guild.aggregate({
        _sum: {
          member: true,
        },
      })
    )._sum.member || 0;
  data.user.totalDiscordUser = await prisma.gm_user.count();
  data.user.totalSteamUser = await prisma.users.count();
  data.user.totalVerified = await prisma.gm_user.count({
    where: {
      steam: {
        not: null,
      },
    },
  });
  data.user.totalUnverified = data.user.totalDiscordMembers - data.user.totalVerified;
  data.user.total = data.user.totalDiscordMembers + data.user.totalSteamUser;
  return res.json(data);
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
  const user = await getUserFromDiscordID(discordID);
  if (!user || !user.getSteamID64()) {
    return res.status(404).send({
      error: 'User not found or not linked',
    });
  }

  const guild = req.guild!;
  const purchase = await prisma.gm_gmodstore_purchases.findFirst({
    where: {
      steamID64: user.getSteamID64()!,
    },
  });

  if (!purchase) {
    return res.status(404).send({
      error: 'Purchase not found',
    });
  }

  await prisma.gm_gmodstore_purchases.update({
    where: {
      steamID64: user.getSteamID64()!,
    },
    data: {
      guild: guildID,
    },
  });
  return res.send((await guild.getBotClientInfo(req.panelUser!.user)) || {});
}

export async function deleteGmodPurchase(req: Request, res: Response) {
  const { discordID } = req.params;
  const guild = req.guild!;
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

  const purchase = await prisma.gm_gmodstore_purchases.findFirst({
    where: {
      steamID64: user.getSteamID64()!,
    },
  });

  if (!purchase) {
    return res.status(404).send({
      error: 'Purchase not found',
    });
  }

  const savedPurchase = await prisma.gm_gmodstore_purchases.update({
    where: {
      steamID64: user.getSteamID64()!,
    },
    data: {
      guild: '',
      token: '',
    },
  });
  await guild.reloadBotInstance();
  return res.send(savedPurchase);
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
  const { discordID } = req.params;
  const user = await getUserFromDiscordID(discordID);
  if (!user || !user.getSteamID64()) {
    return res.status(404).send({
      error: 'User not found or not linked',
    });
  }

  let purchases: any = await prisma.gm_gmodstore_purchases.findFirst({
    where: {
      steamID64: user.getSteamID64()!,
    },
  });

  if (purchases && purchases.guild) {
    const mainClient = await getMainClient();
    purchases.hasMainBot = mainClient.guilds.cache.has(purchases.guild);
  }

  return res.send(purchases || {});
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

  const pseudo = await prisma.gm_server_pseudo.findFirst({
    where: {
      serverID,
      id: Number(roleID),
    },
  });

  if (!pseudo) {
    return res.status(404).send({
      error: 'Pseudo not found',
    });
  }

  const { role, name, prefix, enabled } = req.body;

  const updatePseudo = await prisma.gm_server_pseudo.update({
    where: {
      id: pseudo.id,
      serverID,
    },
    data: {
      name: name !== undefined ? name : pseudo.name,
      prefix: prefix !== undefined ? prefix : pseudo.prefix,
      role: role !== undefined ? role : pseudo.role,
      enabled: enabled !== undefined ? enabled : pseudo.enabled,
    },
  });

  return res.send(updatePseudo);
}

export async function deleteServerPseudo(req: Request, res: Response) {
  const { serverID, roleID } = req.params;

  const pseudo = await prisma.gm_server_pseudo.findFirst({
    where: {
      serverID,
      id: Number(roleID),
    },
  });

  if (!pseudo) {
    return res.status(404).send({
      error: 'Pseudo not found',
    });
  }

  await prisma.gm_server_pseudo.delete({
    where: {
      id: pseudo.id,
      serverID,
    },
  });
  return res.send(pseudo);
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
  const notification = await prisma.gm_users_notifications.findFirst({
    where: {
      id: Number(notificationID),
      discordID,
    },
  });

  if (!notification) {
    return res.status(404).send({ error: 'Notification not found' });
  }

  res.json(
    await prisma.gm_users_notifications.update({
      where: {
        id: notification.id,
        discordID,
      },
      data: {
        read: true,
      },
    }),
  );
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
