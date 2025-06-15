import { GuildMember } from 'discord.js';
import index from '../../services/prisma/index.js';

export default {
  name: 'guildMemberRemove',
  async execute(remove_info: GuildMember) {
    const dbGuild = await index.gm_guild.findFirst({
      where: {
        guild: remove_info.guild.id,
      },
    });

    if (!dbGuild) return;

    await index.gm_guild.update({
      where: {
        guild: remove_info.guild.id,
      },
      data: {
        member: dbGuild.member - 1,
      },
    });
  },
};
