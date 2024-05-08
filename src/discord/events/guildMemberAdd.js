import gm_guild from '../../database/shema/gm_guild.js';
import { discordConfig } from '../../config/index.js';

export default {
  name: 'guildMemberAdd',
  async execute(add_info) {
    if (add_info.member.user.id === discordConfig.clientID) {
      return;
    }

    const editedGuild = await gm_guild.findOne({
      where: {
        guild: add_info.guild.id,
      },
    });

    if (editedGuild) {
      editedGuild.member = add_info.guild.memberCount;
      await editedGuild.save();
    }
  },
};
