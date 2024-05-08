import { gmLog } from '../../utils/logger.js';
import gm_guild from '../../database/shema/gm_guild.js';

export default {
  name: 'guildCreate',
  async execute(guild) {
    gmLog('event', `Bot joined guild: ${guild.name}`);

    const newGuild = await gm_guild.create({
      guild: guild.id,
      name: guild.name,
      member: guild.memberCount,
      language: guild.preferredLocale,
    });

    await newGuild.save();
  },
};
