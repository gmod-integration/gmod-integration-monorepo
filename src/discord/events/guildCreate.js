import { gmLog } from '../../utils/logger.js';
import { updateGuildStat } from '../../models/v3/discordModels.js';

export default {
  name: 'guildCreate',
  async execute(guild) {
    gmLog('event', `Bot joined guild: ${guild.name}`);
    await updateGuildStat(guild);
  },
};
