import { gmLog } from '../../utils/logger.js';
import { updateGuildStat } from '@gmod/domain-guild/discordModels.js';
import { Guild } from 'discord.js';

export default {
  name: 'guildUpdate',
  async execute(oldGuild: Guild, newGuild: Guild) {
    if (oldGuild.name === newGuild.name) return;

    gmLog('event', `Guild name changed from ${oldGuild.name} to ${newGuild.name}`);
    await updateGuildStat(newGuild);
  },
};
