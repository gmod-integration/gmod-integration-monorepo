import { Guild as DiscordGuild } from 'discord.js';
import { Server } from '../classes/v3/Server.js';
import { PanelUser } from '../classes/v3/PanelUser.js';
import { Guild } from '../classes/v3/Guild.js';

declare global {
  namespace Express {
    interface Request {
      server?: Server;
      panelUser?: PanelUser;
      guild?: Guild;
      dscGuild?: DiscordGuild;
      rawBody?: string;
    }
  }
}
