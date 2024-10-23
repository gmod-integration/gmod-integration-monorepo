import { discordConfig } from '../../config';
import { addAutoRoleToUser, updateGuildStat, verifyUser } from '../../models/v3/discordModels';
import { gmLog } from '../../utils/logger';
import { getNotVerifiedMessage } from '../utils/messages';
import { GuildMember } from 'discord.js';
import prisma from '../../prisma';

export default {
  name: 'guildMemberAdd',
  async execute(add_info: GuildMember) {
    if (add_info.user.id === discordConfig.clientID) return;

    try {
      const guild = add_info.client.guilds.cache.get(add_info.guild.id);
      if (!guild) throw new Error('Guild not found');
      const member = guild.members.cache.get(add_info.user.id);
      if (!member) throw new Error('Member not found');

      gmLog('event', `New member joined guild: ${add_info.guild.name}`);
      await updateGuildStat(guild);
      await addAutoRoleToUser(guild, member).catch(() => {});

      if (!(await verifyUser(guild, member))) {
        const dontMp = await prisma.gm_guild_settings.findFirst({
          where: {
            guildID: guild.id,
            setting: 'verification_dont_mp',
          },
        });

        if (dontMp) {
          return;
        }

        await member.send(await getNotVerifiedMessage(guild, member));
      }
    } catch (err) {
      gmLog('error', `Error in guildMemberAdd: ${err}`);
    }
  },
};
