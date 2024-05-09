import { gmLog } from '../../utils/logger.js';
import { updateGuildStat } from '../../models/v3/discordModels.js';

export default {
  name: 'guildUpdate',
  async execute(oldGuild, newGuild) {
    if (oldGuild.name === newGuild.name) return;

    gmLog('event', `Guild name changed from ${oldGuild.name} to ${newGuild.name}`);
    await updateGuildStat(newGuild);
  },
};
