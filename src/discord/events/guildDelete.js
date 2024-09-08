import { gmLog } from '../../utils/logger.js';
import gm_guild from '../../database/schema/gm_guild.js';
import { discordConfig } from '../../config/index.js';
import { getGuildClient, killGuildClient } from '../index.js';
import GmodStorePurchases from '../../database/schema/GmodStorePurchases.js';

export default {
  name: 'guildDelete',
  async execute(guild) {
    gmLog('event', `Bot left guild: ${guild.name}`);

    const guildBotInstance = await getGuildClient(guild.id, false);
    if (guildBotInstance.user.id !== guild.client.user.id) {
      return;
    }

    if (guild.client.user.id !== discordConfig.clientID) {
      const member = await guild.members.fetch(discordConfig.clientID).catch(() => null);
      await killGuildClient(guild.id);
      if (member) {
        return;
      }
    }

    const oldGuild = await gm_guild.findOne({
      where: {
        guild: guild.id,
      },
    });

    if (oldGuild) {
      await oldGuild.destroy();
    }

    const purchase = await GmodStorePurchases.findOne({
      where: {
        guild: guild.id,
      },
    });

    if (purchase) {
      purchase.guild = '';
      purchase.token = '';
      purchase.changed('updatedAt', true);
      await purchase.save();
    }
  },
};
