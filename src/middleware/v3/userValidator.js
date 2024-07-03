import { badArgument } from '../../utils/tools.js';
import { getPanelUserFromDiscordID } from '../../classes/v3/PanelUser.js';
import { getClient } from '../../discord/index.js';
import { getServerFromID } from '../../classes/v3/Server.js';
import { Guild } from '../../classes/v3/Guild.js';
import { getUserFromDiscordID } from '../../classes/v3/User.js';

export async function userValidator(req, res, next) {
  const { discordID } = req.params;
  const { authorization } = req.headers;

  if (badArgument([discordID])) {
    return res.status(400).json({
      error: 'missing_arguments',
      args: {
        discordID: discordID,
      },
    });
  }

  if (!authorization || !authorization.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'unauthorized',
    });
  }

  const token = authorization.split(' ')[1];

  const panelUser = await getPanelUserFromDiscordID(discordID);
  if (!panelUser) {
    return res.status(404).json({
      error: 'user_not_found',
    });
  }

  if (!panelUser.authAllowed(token)) {
    return res.status(401).json({
      error: 'unauthorized',
    });
  }

  req.panelUser = panelUser;
  next();
}

export async function userAdminGuildValidator(req, res, next) {
  const panelUser = req.panelUser;
  const { guildID } = req.params;

  if (!(await panelUser.isAdminOfGuild(guildID))) {
    return res.status(403).json({
      error: 'not_admin_of_guild',
    });
  }

  const dscClient = await getClient();
  const dscGuild = dscClient.guilds.cache.get(guildID);
  if (!dscGuild) {
    return res.status(404).json({
      error: 'guild_not_found',
    });
  }

  const guild = new Guild(dscGuild);
  if (!guild) {
    return res.status(404).json({
      error: 'guild_not_found',
    });
  }

  req.guild = guild;
  req.dscGuild = dscGuild;
  next();
}

export async function userServerValidator(req, res, next) {
  const { serverID } = req.params;

  const server = await getServerFromID(serverID);
  if (!server) {
    return res.status(404).json({
      error: 'server_not_found',
    });
  }

  if (server.getGuildID() !== req.dscGuild.id) {
    return res.status(403).json({
      error: 'server_not_in_guild',
    });
  }

  req.server = server;
  next();
}

export async function userAdminValidator(req, res, next) {
  const panelUser = req.panelUser;

  const user = await getUserFromDiscordID(panelUser.discordID);
  if (!user) {
    return res.status(404).json({
      error: 'user_not_found',
    });
  }

  if (!user.isDeveloper()) {
    return res.status(403).json({
      error: 'not_developer',
    });
  }

  next();
}
