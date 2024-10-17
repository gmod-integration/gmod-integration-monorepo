import { Guild as DiscordGuild } from 'discord.js';
import { Server } from '../classes/v3/Server';
import { PanelUser } from '../classes/v3/PanelUser';
import { Guild } from '../classes/v3/Guild';

declare global {
  namespace Express {
    interface Request {
      server?: Server;
      panelUser?: PanelUser;
      guild?: Guild;
      dscGuild?: DiscordGuild;
    }
  }
}
