import { updatePseudoToGmod, updateRolesToGmod } from '../../models/v3/discordModels.js';
import { GuildMember } from 'discord.js';

export default {
  name: 'guildMemberUpdate',
  async execute(oldMember: GuildMember, newMember: GuildMember) {
    await updateRolesToGmod(newMember, oldMember, newMember);
    await updatePseudoToGmod(newMember, oldMember, newMember);
  },
};
