import { gmLog } from '../../utils/logger.js';
import { GuildChannel } from 'discord.js';
import index from '../../services/prisma/index.js';

export default {
  name: 'channelCreate',
  async execute(channel: GuildChannel) {
    const guild = channel.guild;
    gmLog('event', `Channel created in guild: ${guild.name}`);

    const notVerifiedRole = await index.gm_role_auto.findFirst({
      where: {
        guild: guild.id,
      },
    });

    if (notVerifiedRole) {
      const role = guild.roles.cache.get(notVerifiedRole.id);
      if (!role) return;
      await channel.permissionOverwrites.edit(role, { ViewChannel: false });
    }
  },
};
