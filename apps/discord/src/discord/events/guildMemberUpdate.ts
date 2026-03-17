import { updatePseudoToGmod, updateRolesToGmod } from '@gmod/domain-guild/discordModels.js';
import { type GuildMember } from 'discord.js';

export default {
  name: 'guildMemberUpdate',
  async execute(oldMember: GuildMember, newMember: GuildMember) {
    await updateRolesToGmod(newMember, oldMember, newMember);
    await updatePseudoToGmod(newMember, oldMember, newMember);
  },
};
