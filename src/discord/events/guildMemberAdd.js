import { discordConfig } from '../../config/index.js';
import { updateGuildStat } from '../../models/v3/discordModels.js';
import { gmLog } from '../../utils/logger.js';

export default {
  name: 'guildMemberAdd',
  async execute(add_info) {
    if (add_info.member.user.id === discordConfig.clientID) {
      return;
    }

    gmLog('event', `New member joined guild: ${add_info.guild.name}`);
    await updateGuildStat(add_info.guild);
  },
};
