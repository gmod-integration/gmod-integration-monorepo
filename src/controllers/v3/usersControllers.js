import { getUserFromDiscordID, getUserFromSteamID64 } from '../../classes/v3/User.js';
import { getServersFromDiscordGuildID } from '../../classes/v3/Server.js';
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
