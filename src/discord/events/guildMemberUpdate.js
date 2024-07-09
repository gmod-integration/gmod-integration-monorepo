import { updateRolesToGmod } from '../../models/v3/discordModels.js';

export default {
  name: 'guildMemberUpdate',
  async execute(oldMember, newMember) {
    const addedRoles = newMember.roles.cache.filter((role) => !oldMember.roles.cache.has(role.id));
    const removedRoles = oldMember.roles.cache.filter((role) => !newMember.roles.cache.has(role.id));
    await updateRolesToGmod(newMember, addedRoles, removedRoles);
  },
};
