import {getRoleFromDiscordRoleID, getRoleFromRole} from "../../classes/v3/Role.js";
import {getUserFromDiscordID} from "../../classes/v3/User.js";
import {getServersFromDiscordGuildID} from "../../classes/v3/Server.js";
import {wsSendToServer} from "../../websockets/index.js";
import {getClient} from "../../discord/index.js";
import {getConnectionPromise} from "../../database/connection.js";
import {isGuildPremium} from "../../classes/v3/Guild.js";

let userUpdateRoleCurrent = {};

export function updateGuildUserSyncRoles(server, user, newGroup, oldGroup = null) {
    return new Promise(async (resolve, reject) => {
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

export async function updateRolesToGmod(newMember, roleID, add = true) {
    const guildID = newMember.guild.id;
    const memberID = newMember.id;

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

export async function getUserGuildsWithPermsForPanel(panelUser) {
    const guilds = [];
    const guildsResult = await fetch(
        'https://discord.com/api/users/@me/guilds',
        {
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${panelUser.getDiscordToken()}`,
            },
        }
    );
    const rawGuilds = await guildsResult.json();
    const connection = await getConnectionPromise();

    for (const guildData of rawGuilds) {
        const guildID = guildData.id;
        if (!(guildData.owner || (guildData.permissions & 0x8) === 0x8)) {
            continue;
        }

        let hasBot = false;
        const query = `SELECT *
                       FROM gm_guild
                       WHERE guild = ?`;
        const [rows] = await connection.execute(query, [guildID]);
        if (rows.length > 0) {
            hasBot = true;
        }

        guilds.push({
            id: guildID,
            name: guildData.name,
            icon: guildData.icon,
            hasBot: hasBot,
            isOwner: guildData.owner,
            isPremium: await isGuildPremium(guildID)
        });
    }

    return guilds;
}