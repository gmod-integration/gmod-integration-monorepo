import { gmLog } from '../../utils/logger';
import { updateGuildStat } from '../../models/v3/discordModels.js';
import { Guild } from 'discord.js';

export default {
  name: 'guildCreate',
  async execute(guild: Guild) {
    gmLog('event', `Bot joined guild: ${guild.name}`);
    await updateGuildStat(guild);
  },
};
