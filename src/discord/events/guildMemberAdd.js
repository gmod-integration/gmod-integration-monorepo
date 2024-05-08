import gm_guild from '../../database/shema/gm_guild.js';

export default {
  name: 'guildMemberAdd',
  async execute(add_info) {
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
