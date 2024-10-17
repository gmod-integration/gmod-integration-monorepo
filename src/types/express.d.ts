import { Server } from '../../classes/v3/Server';
import { PanelUser } from '../classes/v3/PanelUser';
import { Guild } from '../classes/v3/Guild';
import { Discord } from 'discord.js';

declare global {
  namespace Express {
    interface Request {
      server?: Server;
      panelUser?: PanelUser;
      guild?: Guild;
      dscGuild?: Discord.Guild;
    }
  }
}
