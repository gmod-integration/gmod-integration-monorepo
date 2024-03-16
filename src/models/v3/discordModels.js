const {getRoleFromRole, getRoleFromDiscordRoleID} = require("../../classes/v3/Role");
const {getUserFromDiscordID} = require("../../classes/v3/User");
const {getServersFromDiscordGuildID} = require("../../classes/v3/Server");
const {wsSendToServer} = require("../../websockets");
const {getClient} = require("../../discord");

let userUpdateRoleCurrent = {};

function updateGuildUserSyncRoles(server, user, newGroup) {
    return new Promise(async (resolve, reject) => {
        const role = await getRoleFromRole(server.getID(), newGroup);
        if (!role || !role.isValid()) {
            return reject({error: 'role_not_found', itsFine: true});
        }
        if (!role.isSyncEnabled()) {
            return reject({error: 'role_not_sync', itsFine: true});
        }
        if (!role.getDiscordRoleID()) {
            return reject({error: 'role_not_linked', itsFine: true});
        }

        let theClient = await getClient();
        const guild = theClient.guilds.cache.get(await server.getGuildID());
        if (!guild) {
            return reject({error: 'guild_not_found', itsFine: true});
        }

        userUpdateRoleCurrent[`guildID-${guild.id}`] = new Date().getTime();

        await guild.members.fetch(user.getDiscordID()).then(async member => {
            if (!member) {
                return reject({error: 'member_not_found', itsFine: true});
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

    if (userUpdateRoleCurrent[`guildID-${guildID}`] && userUpdateRoleCurrent[`guildID-${guildID}`] > new Date().getTime() - 5000) {
        return;
    } else {
        userUpdateRoleCurrent[`guildID-${guildID}`] = new Date().getTime();
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

        const serversInfo = await getServersFromDiscordGuildID(guildID).catch(reject);
        if (!serversInfo || serversInfo.length === 0) {
            return reject('No servers found');
        }

        for (const servInfo of serversInfo) {
            if (!servInfo.isValid()) {
                continue;
            }

            const roleInfo = await getRoleFromDiscordRoleID(servInfo.getID(), roleID);
            if (!roleInfo || !roleInfo.isValid()) {
                continue;
            }
            if (!roleInfo.isSyncEnabled()) {
                continue;
            }
            if (!roleInfo.getDiscordRoleID()) {
                continue;
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
        }

        userUpdateRoleCurrent[`guildID-${guildID}`] = null;
        resolve();
    });
}

module.exports = {
    updateGuildUserSyncRoles,
    updateRolesToGmod,
}