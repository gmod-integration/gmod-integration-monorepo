import { gmLog } from '../../utils/logger.js';
import { updateGuildStat } from '@gmod/domain-guild/discordModels.js';
import { Guild } from 'discord.js';

export default {
  name: 'guildCreate',
  async execute(guild: Guild) {
    gmLog('event', `Bot joined guild: ${guild.name}`);
    await updateGuildStat(guild);
  },
};
