import { getUserFromDiscordID, getUserFromSteamID64 } from '../../classes/v3/User.js';
import { createServer, getServersFromDiscordGuildID } from '../../classes/v3/Server.js';
import { discordConfig } from '../../config/index.js';
import {
  addUserToGuild,
  getDiscordUserFromID,
  getUserFromToken,
  getUserTokenFromCode,
  saveUserPanel,
} from '../../models/v3/discordModels.js';

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

export async function findCurrentUser(req, res) {
  return res.send(await getDiscordUserFromID(req.params.discordID));
}

export async function oauthLogin(req, res) {
  const { code } = req.query;

  if (!code) {
    return res.redirect(discordConfig.oauthPanel);
  }

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

  await addUserToGuild(discordConfig.guildID, discordUser.id, discordUserToken.access_token)
    .then(() => {
      console.log('User added to guild');
    })
    .catch((error) => {
      console.error(error);
    });

  const panelAccessToken = await saveUserPanel(discordUser.id, discordUserToken);

  return res.redirect(
    `${discordConfig.oauthPanelRedirect}?discordID=${discordUser.id}&accessToken=${panelAccessToken}&expirationDate=${discordUserToken.expirationDate.getTime()}`,
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
    })),
  );
}

export async function getGuildRoles(req, res) {
  const dscGuild = req.dscGuild;

  return res.send(
    dscGuild.roles.cache
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

export async function createGuildStatusServer(req, res) {
  // TODO
  return res.status(501).send({
    error: 'Not implemented',
  });
}

export async function findServerStatus(req, res) {
  const server = req.server;

  return res.send(server.getStatusChannelAndMessage());
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
  return res.send(await guild.getLinks());
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
  const { name, image, ip, port } = req.body;

  server.name = name !== undefined ? name : server.name;
  server.image = image !== undefined ? image : server.image;
  server.ip = ip !== undefined ? ip : server.ip;
  server.port = port !== undefined ? port : server.port;

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
  return res.send(await guild.getAdmins());
}

export async function postGuildServerToken(req, res) {
  const server = req.server;
  await server.regenerateToken();
  return res.send(server);
}

export function getTodo(req, res) {
  return res.status(501).send({
    error: 'Not Implemented',
  });
}

export async function getGuildVerificationsRoles(req, res) {
  const guild = req.guild;
  return res.send(await guild.getVerificationRoles());
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

export async function getServerStatus(req, res) {
  return getTodo(req, res);
}

export async function postServerStatus(req, res) {
  return getTodo(req, res);
}

export async function deleteServerStatus(req, res) {
  return getTodo(req, res);
}

export async function getServerStatusButtons(req, res) {
  const server = req.server;
  return res.send(await server.findStatusButtons());
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

  await button.save();
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
  return res.send(button);
}
