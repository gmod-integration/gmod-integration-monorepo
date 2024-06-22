import { gmLog } from '../../utils/logger.js';
import GuildNotVerifiedRole from '../../database/schema/GuildNotVerifiedRole.js';

export default {
  name: 'channelCreate',
  async execute(channel) {
    const guild = channel.guild;
    gmLog('event', `Channel created in guild: ${guild.name}`);

    const notVerifiedRole = await GuildNotVerifiedRole.findOne({
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
