import gm_guild from '../../database/schema/gm_guild.js';

export default {
  name: 'guildMemberRemove',
  async execute(remove_info) {
    const editedGuild = await gm_guild.findOne({
      where: {
        guild: remove_info.guild.id,
      },
    });

    if (editedGuild) {
      editedGuild.member = remove_info.guild.memberCount;
      await editedGuild.save();
    }
  },
};
