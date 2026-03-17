import { type Guild as DiscordGuild } from 'discord.js';
import { type Server } from '@gmod/domain-server/Server.js';
import { type PanelUser } from '@gmod/domain-user/PanelUser.js';
import { type Guild } from '@gmod/domain-guild/Guild.js';

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
