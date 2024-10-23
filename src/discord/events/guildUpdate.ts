import { gmLog } from '../../utils/logger';
import { updateGuildStat } from '../../models/v3/discordModels';
import { Guild } from 'discord.js';

export default {
  name: 'guildUpdate',
  async execute(oldGuild: Guild, newGuild: Guild) {
    if (oldGuild.name === newGuild.name) return;

    gmLog('event', `Guild name changed from ${oldGuild.name} to ${newGuild.name}`);
    await updateGuildStat(newGuild);
  },
};
