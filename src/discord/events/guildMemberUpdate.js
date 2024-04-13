import {updateRolesToGmod} from "../../models/v3/discordModels.js";

export default {
    name: 'guildMemberUpdate',
    async execute(oldMember, newMember) {
        const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
        const removedRoles = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id));

        if (addedRoles.size > 0) {
            for (const role of addedRoles) {
                try {
                    await updateRolesToGmod(newMember, role[0], true);
                } catch (error) {
                    console.error(error);
                }
            }
        }
        if (removedRoles.size > 0) {
            for (const role of removedRoles) {
                try {
                    await updateRolesToGmod(newMember, role[0], false);
                } catch (error) {
                    console.error(error);
                }
            }
        }
    }
};