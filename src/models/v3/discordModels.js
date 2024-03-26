const {getRoleFromRole, getRoleFromDiscordRoleID} = require("../../classes/v3/Role");
const {getUserFromDiscordID} = require("../../classes/v3/User");
const {getServersFromDiscordGuildID} = require("../../classes/v3/Server");
const {wsSendToServer} = require("../../websockets");
const {getClient} = require("../../discord");

let userUpdateRoleCurrent = {};

function updateGuildUserSyncRoles(server, user, newGroup, oldGroup = null) {
    return new Promise(async (resolve, reject) => {
        // check if user is User and not null
        if (!user) {
            console.log(user);
            console.log(user === null);
            return reject({error: 'user_not_found', itsFine: true});
        }

        const userDiscordID = user.getDiscordID();
        if (!userDiscordID) {
            return reject({error: 'user_not_linked', itsFine: true});
        }

        let theClient = await getClient();
        const guild = theClient.guilds.cache.get(await server.getGuildID());
        if (!guild) {
            return reject({error: 'guild_not_found', itsFine: true});
        }

        const guildUser = await guild.members.fetch(userDiscordID).catch(reject);
        if (!guildUser) {
            return reject({error: 'user_not_found', itsFine: true});
        }

        if (oldGroup) {
            const oldRole = await getRoleFromRole(server.getID(), oldGroup);
            if (oldRole && oldRole.isValid() && oldRole.isSyncEnabled() && oldRole.getDiscordRoleID()) {
                userUpdateRoleCurrent[oldRole.getDiscordRoleID()] = false;
                await guildUser.roles.remove(oldRole.getDiscordRoleID()).catch(reject);
            }
        }

        const role = await getRoleFromRole(server.getID(), newGroup);
        if (role && role.isValid() && role.isSyncEnabled() && role.getDiscordRoleID()) {
            userUpdateRoleCurrent[role.getDiscordRoleID()] = true;
            await guildUser.roles.add(role.getDiscordRoleID()).catch(reject);
        }

        // remove other roles
        await server.getRoles().then(async (roles) => {
            let rolesToRemove = [];
            for (let i = 0; i < roles.length; i++) {
                if (roles[i].getDiscordRoleID() && role && role.getDiscordRoleID() && roles[i].getDiscordRoleID() !== role.getDiscordRoleID()) {
                    userUpdateRoleCurrent[roles[i].getDiscordRoleID()] = false;
                    rolesToRemove.push(roles[i].getDiscordRoleID());
                }
            }

            await guildUser.roles.remove(rolesToRemove).catch(reject);
            return resolve();
        }).catch(reject);
    });
}

async function updateRolesToGmod(newMember, roleID, add = true) {
    const guildID = newMember.guild.id;
    const memberID = newMember.id;

    // if (userUpdateRoleCurrent[`guildID-${guildID}`] && userUpdateRoleCurrent[`guildID-${guildID}`] > new Date().getTime() - 10000) {
    //     return;
    // } else {
    //     userUpdateRoleCurrent[`guildID-${guildID}`] = new Date().getTime();
    // }
    if (userUpdateRoleCurrent[roleID] !== null && userUpdateRoleCurrent[roleID] === add) {
        return;
    } else {
        userUpdateRoleCurrent[roleID] = add;
    }

    console.log(userUpdateRoleCurrent[roleID] === add);

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
                            userUpdateRoleCurrent[roles[i].getDiscordRoleID()] = false;
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

        resolve();
    });
}

module.exports = {
    updateGuildUserSyncRoles,
    updateRolesToGmod,
}