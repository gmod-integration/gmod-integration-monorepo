import { discordConfig } from '../../config/index.js';
import { addAutoRoleToUser, updateGuildStat, verifyUser } from '../../models/v3/discordModels.js';
import { gmLog } from '../../utils/logger.js';
import { getNotVerifiedMessage } from '../utils/messages.js';

export default {
  name: 'guildMemberAdd',
  async execute(add_info) {
    if (add_info.user.id === discordConfig.clientID) {
      return;
    }

    const guild = add_info.client.guilds.cache.get(add_info.guild.id);
    const member = guild.members.cache.get(add_info.user.id);

    gmLog('event', `New member joined guild: ${add_info.guild.name}`);
    await updateGuildStat(guild);
    await addAutoRoleToUser(guild, member).catch(() => {});

    if (!(await verifyUser(guild, member))) {
      await member.send(await getNotVerifiedMessage(guild, member)).catch(() => {});
    }
  },
};
