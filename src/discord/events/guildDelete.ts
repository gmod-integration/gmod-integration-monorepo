import { gmLog } from '../../utils/logger.js';
import { ConfigDiscord } from '../../classes/config/Config.js';
import { getGuildClient, killGuildClient } from '../index.js';
import { Guild } from 'discord.js';
import prisma from '../../services/prisma/index.js';

export default {
  name: 'guildDelete',
  async execute(guild: Guild) {
    gmLog('event', `Bot left guild: ${guild.name}`);

    const guildBotInstance = await getGuildClient(guild.id, false);
    if (!guildBotInstance.user) return;
    if (guildBotInstance.user.id !== guild.client.user.id) {
      return;
    }

    if (guild.client.user.id !== ConfigDiscord.clientID) {
      const member = await guild.members.fetch(ConfigDiscord.clientID!).catch(() => null);
      await killGuildClient(guild.id);
      if (member) {
        return;
      }
    }

    const oldGuild = await prisma.gm_guild.findFirst({
      where: {
        guild: guild.id,
      },
    });

    if (oldGuild) {
      await prisma.gm_guild.delete({
        where: {
          guild: guild.id,
        },
      });
    }

    const purchase = await prisma.gm_gmodstore_purchases.findFirst({
      where: {
        guild: guild.id,
      },
    });

    if (purchase) {
      await prisma.gm_gmodstore_purchases.update({
        where: {
          steamID64: purchase.steamID64,
        },
        data: {
          guild: '',
          token: '',
        },
      });
    }
  },
};
