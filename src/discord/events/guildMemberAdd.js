import { discordConfig } from '../../config/index.js';
import { updateGuildStat, verifyUser } from '../../models/v3/discordModels.js';
import { gmLog } from '../../utils/logger.js';
import { getNotVerifiedMessage } from '../utils/messages.js';

export default {
  name: 'guildMemberAdd',
  async execute(add_info) {
    if (add_info.user.id === discordConfig.clientID) {
      return;
    }

    gmLog('event', `New member joined guild: ${add_info.guild.name}`);
    await updateGuildStat(add_info.guild);
    if (!(await verifyUser(add_info.guild, add_info.user))) {
      await add_info.user.send(await getNotVerifiedMessage(add_info.guild, add_info.user)).catch(() => {});
    }
  },
};
