import { updatePseudoToGmod, updateRolesToGmod } from '../../models/v3/discordModels.js';

export default {
  name: 'guildMemberUpdate',
  async execute(oldMember, newMember) {
    await updateRolesToGmod(newMember, oldMember, newMember);
    await updatePseudoToGmod(newMember, oldMember, newMember);
  },
};
