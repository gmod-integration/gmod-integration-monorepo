import { badArgument } from '@gmod/core/utils/tools.js';
import { getPanelUserFromDiscordID } from '@gmod/domain-user/PanelUser.js';
import { getGuildClient } from '@/discord/index.js';
import { getServerFromID } from '@gmod/domain-server/Server.js';
import { Guild } from '@gmod/domain-guild/Guild.js';
import { getUserFromDiscordID } from '@gmod/domain-user/User.js';
import { type NextFunction, type Request, type Response } from 'express';

export async function userValidator(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { discordID } = req.params;
    const { authorization } = req.headers;

    if (badArgument([discordID])) {
      res.status(400).json({
        error: 'missing_arguments',
        args: {
          discordID: discordID,
        },
      });
      return;
    }

    if (!authorization || !authorization.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'unauthorized',
      });
      return;
    }

    const token = authorization.split(' ')[1];

    const panelUser = await getPanelUserFromDiscordID(discordID);
    if (!panelUser) {
      res.status(404).json({
        error: 'user_not_found',
      });
      return;
    }

    if (!(await panelUser.authAllowed(token))) {
      res.status(401).json({
        error: 'unauthorized',
      });
      return;
    }

    req.panelUser = panelUser;

    return next();
  } catch (error) {
    return next(error);
  }
}

export async function userAdminGuildValidator(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const panelUser = req.panelUser!;
    const { guildID } = req.params;

    if (!(await panelUser.isAdminOfGuild(guildID))) {
      res.status(403).json({
        error: 'not_admin_of_guild',
      });
      return;
    }

    const dscClient = await getGuildClient(guildID);
    const dscGuild = dscClient.guilds.cache.get(guildID);
    if (!dscGuild) {
      res.status(404).json({
        error: 'guild_not_found',
      });
      return;
    }

    const guild = new Guild(dscGuild);
    if (!guild) {
      res.status(404).json({
        error: 'guild_not_found',
      });
      return;
    }

    req.guild = guild;
    req.dscGuild = dscGuild;
    return next();
  } catch (error) {
    return next(error);
  }
}

export async function userServerValidator(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { serverID } = req.params;

    const server = await getServerFromID(serverID);
    if (!server) {
      res.status(404).json({
        error: 'server_not_found',
      });
      return;
    }

    if (server.getGuildID() !== req.dscGuild!.id) {
      res.status(403).json({
        error: 'server_not_in_guild',
      });
      return;
    }

    req.server = server;
    return next();
  } catch (error) {
    return next(error);
  }
}

export async function userAdminValidator(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const panelUser = req.panelUser!;

    const user = await getUserFromDiscordID(panelUser.discordID);
    if (!user) {
      res.status(404).json({
        error: 'user_not_found',
      });
      return;
    }

    if (!user.isDeveloper()) {
      res.status(403).json({
        error: 'not_developer',
      });
      return;
    }

    return next();
  } catch (error) {
    return next(error);
  }
}
