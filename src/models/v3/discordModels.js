const {getRoleFromRole, getRoleFromDiscordRoleID} = require("../../classes/v3/Role");
const {getUserFromDiscordID} = require("../../classes/v3/User");
const {getServerFromDiscordGuildID} = require("../../classes/v3/Server");
const {wsSendToServer} = require("../../websockets");
const {getClient} = require("../../discord");

let userUpdateRoleCurrent = {};

function updateGuildUserSyncRoles(server, user, newGroup) {
    return new Promise(async (resolve, reject) => {
        const role = await getRoleFromRole(server.getID(), newGroup);
        if (!role || !role.isValid()) {
            return reject({error: 'role_not_found'});
        }
        if (!role.isSyncEnabled()) {
            return reject({error: 'role_not_sync'});
        }
        if (!role.getDiscordRoleID()) {
            return reject({error: 'role_not_linked'});
        }

        let theClient = await getClient();
        const guild = theClient.guilds.cache.get(await server.getGuildID());
        if (!guild) {
            return reject('Guild not found');
        }

        userUpdateRoleCurrent[`guildID-${guild.id}`] = true;

        await guild.members.fetch(user.getDiscordID()).then(async member => {
            if (!member) {
                return reject('User not found');
            }
            await member.roles.add(role.getDiscordRoleID()).catch(reject);
            await server.getRoles().then(async roles => {
                let rolesToRemove = [];
                for (let i = 0; i < roles.length; i++) {
                    if (roles[i].getDiscordRoleID() && roles[i].getDiscordRoleID() !== role.getDiscordRoleID()) {
                        rolesToRemove.push(roles[i].getDiscordRoleID());
                    }
                }

                await member.roles.remove(rolesToRemove).catch(reject);
            }).catch(reject);
        }).catch(reject);

        userUpdateRoleCurrent[`guildID-${guild.id}`] = null;
        resolve();
    });
}

async function updateRolesToGmod(newMember, roleID, add = true) {
    const guildID = newMember.guild.id;
    const memberID = newMember.id;

    if (userUpdateRoleCurrent[`guildID-${guildID}`]) {
        return;
    } else {
        userUpdateRoleCurrent[`guildID-${guildID}`] = true;
    }

    return new Promise(async (resolve, reject) => {
        console.log('updateRolesToGmod', guildID, memberID, roleID, add);

        const userInfo = await getUserFromDiscordID(memberID).catch(reject);
        if (!userInfo) {
            return reject('User not found');
        }
        if (!userInfo.getSteamID64()) {
            return reject('User not linked');
        }

        const servInfo = await getServerFromDiscordGuildID(guildID).catch(reject);
        if (!servInfo || !servInfo.isValid()) {
            return reject('Server not found');
        }

        const roleInfo = await getRoleFromDiscordRoleID(servInfo.getID(), roleID);
        if (!roleInfo || !roleInfo.isValid()) {
            return reject('Role not found');
        }
        if (!roleInfo.isSyncEnabled()) {
            return reject('Role not sync');
        }
        if (!roleInfo.getDiscordRoleID()) {
            return reject('Role not linked');
        }

        if (add === true) {
            await servInfo.getRoles().then(async (roles) => {
                let rolesToRemove = [];
                for (let i = 0; i < roles.length; i++) {
                    if (roles[i].getDiscordRoleID() && roles[i].getDiscordRoleID() !== roleInfo.getDiscordRoleID()) {
                        rolesToRemove.push(roles[i].getDiscordRoleID());
                    }
                }

                await newMember.roles.remove(rolesToRemove).catch(reject);
            }).catch(reject);
        }

        wsSendToServer(
            servInfo.getID(),
            {
                method: 'wsPlayerUpdateGroup',
                steamID64: userInfo.getSteamID64(),
                group: roleInfo.role,
                add: add,
            }
        );

        userUpdateRoleCurrent[`guildID-${guildID}`] = null;
        resolve();
    });
}

module.exports = {
    updateGuildUserSyncRoles,
    updateRolesToGmod,
}