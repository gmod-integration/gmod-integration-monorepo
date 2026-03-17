import { gmLog } from '@gmod/core/utils/logger.js';
import { type GuildChannel } from 'discord.js';
import prisma from '@gmod/infra-prisma';

export default {
  name: 'channelCreate',
  async execute(channel: GuildChannel) {
    const guild = channel.guild;
    gmLog('event', `Channel created in guild: ${guild.name}`);

    const notVerifiedRole = await prisma.gm_role_auto.findFirst({
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
