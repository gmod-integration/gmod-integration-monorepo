import {getConnectionPromise} from '../../database/connection.js';
import {getClient} from "../../discord/index.js";

export function banFormat(ban) {
    return {
        reason: ban.reason,
        banDate: ban.banDate,
        banTime: ban.banTime,
        unbanDate: ban.unbanDate,
        admin: ban.admin,
    };
}

export function isGlobalBanIP(IP) {
    return new Promise(async (resolve, reject) => {
        if (!IP) return resolve(false);

        const connection = await getConnectionPromise();
        const query = 'SELECT * FROM banUsers WHERE ip LIKE ?';
        const [rows] = connection.query(query, [IP]);
        if (rows.length > 0) {
            return resolve(banFormat(rows[0]));
        } else {
            return resolve(false);
        }
    });
}

export function isGlobalBanSteamID64(steamID64) {
    return new Promise(async (resolve, reject) => {
        if (!steamID64) return resolve(false);

        const connection = await getConnectionPromise();
        connection.query('SELECT * FROM banUsers WHERE steamID64 = ?', [steamID64], (error, results) => {
            if (error) return reject(error);

            if (results.length > 0) {
                return resolve(banFormat(results[0]));
            } else {
                return resolve(false);
            }
        });
    });
}

export function isGlobalBanDiscordID(discordID) {
    return new Promise(async (resolve, reject) => {
        if (!discordID) return resolve(false);

        const connection = await getConnectionPromise();
        connection.query('SELECT * FROM banUsers WHERE discordID = ?', [discordID], (error, results) => {
            if (error) return reject(error);

            if (results.length > 0) {
                return resolve(banFormat(results[0]));
            } else {
                return resolve(false);
            }
        });
    });
}

export async function isBanFromGuild(guildID, discordID) {
    return new Promise(async (resolve, reject) => {
        const client = await getClient()

        client.guilds.fetch(guildID).then(guild => {
            guild.bans.fetch(discordID).then(banInfo => {
                console.log(`${banInfo.user.tag} is banned. Reason: ${banInfo.reason}`);
                resolve(banInfo);
            }).catch(error => {
                // User is not banned
                console.log(`${discordID} is not banned.`);
                // Resolve without ban information
                resolve(false);
            });
        }).catch(error => {
            // Unable to fetch guild
            console.error(`Error fetching guild: ${error.message}`);
        });
    });
}

export async function isBanFromServer(serverID, steamID64) {
    return new Promise((resolve, reject) => {
        // TODO: Implement this export function, for now use is global ban steamID64
        isGlobalBanSteamID64(steamID64).then(resolve).catch(reject);
    });
}

export async function isGlobalBan(IP, discordID, steamID64) {
    const banIP = await isGlobalBanIP(IP);
    if (banIP) return banIP;

    const banDiscordID = await isGlobalBanDiscordID(discordID);
    if (banDiscordID) return banDiscordID;

    const banSteamID64 = await isGlobalBanSteamID64(steamID64);
    if (banSteamID64) return banSteamID64;

    return false;
}