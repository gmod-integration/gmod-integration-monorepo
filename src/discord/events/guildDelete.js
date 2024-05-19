import { gmLog } from '../../utils/logger.js';
import gm_guild from '../../database/schema/gm_guild.js';

export default {
  name: 'guildDelete',
  async execute(guild) {
    gmLog('event', `Bot left guild: ${guild.name}`);

    const oldGuild = await gm_guild.findOne({
      where: {
        guild: guild.id,
      },
    });

    if (oldGuild) {
      await oldGuild.destroy();
    }
  },
};
