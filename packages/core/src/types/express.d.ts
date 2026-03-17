import { Guild as DiscordGuild } from 'discord.js';
import { Server } from '@gmod/domain-server/Server.js';
import { PanelUser } from '@gmod/domain-user/PanelUser.js';
import { Guild } from '@gmod/domain-guild/Guild.js';

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
