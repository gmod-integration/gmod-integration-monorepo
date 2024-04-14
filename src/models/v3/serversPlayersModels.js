import {getConnectionPromise} from '../../database/connection.js';
import {WebhookClient} from 'discord.js';
import {getSteamUserAvatarLarge} from "../../steam/index.js";

export function getInformations(id) {
    return new Promise((resolve, reject) => {
        const connection = await getConnectionPromise();
        connection.query('SELECT * FROM gm_server WHERE id = ?', [id], (error, results) => {
            if (error) return reject(error);

            if (results.length > 0) {
                return resolve(results[0]);
            } else {
                reject('Server not found');
            }
        });
    });
}

export function isValidAuth(id, token) {
    return new Promise((resolve, reject) => {
        const connection = await getConnectionPromise();
        connection.query('SELECT * FROM gm_server WHERE id = ? AND token = ?', [id, token], (error, results) => {
            if (error) return reject(error);

            if (results.length > 0) {
                return resolve(true);
            } else {
                return resolve(false);
            }
        });
    });
}

export function getPlayerInformations(steamID64) {
    return new Promise((resolve, reject) => {
        const connection = await getConnectionPromise();
        connection.query('SELECT * FROM gm_server_stat WHERE steam_id = ?', [steamID64], (error, results) => {
            if (error) return reject(error);

            if (results.length > 0) {
                return resolve({
                    steamID64: results[0].steam_id,
                    customValue: JSON.parse(results[0].custom_values || '{}'),
                    lastConnection: results[0].last_connect,
                    firstConnection: results[0].first_connect,
                    playtime: results[0].total_time,
                    totalConnections: results[0].total_connect,
                    totalKills: results[0].total_kill,
                    totalDeaths: results[0].total_death,
                    name: results[0].name,
                });
            } else {
                return resolve(null);
            }
        });
    });
}

export async function getPlayerBan(steamID64) {
    return new Promise((resolve, reject) => {
        const connection = await getConnectionPromise();
        connection.query('SELECT * FROM gm_ban WHERE steam_id = ?', [steamID64], (error, results) => {
            if (error) return reject(error);

            if (results.length > 0) {
                return resolve(results[0]);
            } else {
                return resolve(null);
            }
        });
    });
}

export function sendPlayerSay(server, player, text, onlyTeam) {
    let anonymous = false;
    return new Promise(async (resolve, reject) => {
        player.name.replace(/[^\x00-\x7F]/g, "");
        text.replace(/[^\x00-\x7F]/g, "");

        const syncChatChannel = await server.getSyncChatChannel();
        if (!syncChatChannel) {
            return reject({skip: true, message: 'Sync chat channel not found or not set'});
        }

        const syncChatDirection = await server.getSetting('syncChatDirection');
        if (syncChatDirection && syncChatDirection === "discordToGmod") {
            return reject({skip: true, message: 'Sync chat direction is discord to gmod'});
        }

        const syncChatTriggerAll = await server.getSetting('syncChatTriggerAll');
        if (!syncChatTriggerAll || syncChatTriggerAll === "false") {
            const possibleFields = ['steamID64', 'userGroup', 'teamName', 'message'];
            const operator = ['equal', 'notEqual', 'contain', 'notContain', 'startWith', 'endWith'];
            const action = ['relay', 'block', 'anonymize'];

            let relayMessage = false;
            let blocked = false;

            function executeAction(action) {
                switch (action) {
                    case 'relay':
                        relayMessage = true;
                        break;
                    case 'block':
                        blocked = true;
                        break;
                    case 'anonymize':
                        player.name = 'Anonymous';
                        relayMessage = true;
                        anonymous = true;
                        break;
                }
            }

            function getCorrectValue(field) {
                switch (field) {
                    case 'steamID64':
                        return player.steamID64;
                    case 'userGroup':
                        return player.userGroup;
                    case 'teamName':
                        return player.team.name;
                    case 'message':
                        return text;
                }
            }

            function verifyRule(rule) {
                if (!rule.enable) return;
                if (!possibleFields.includes(rule.field)) return;
                if (!operator.includes(rule.operator)) return;
                if (!action.includes(rule.action)) return;
                switch (rule.operator) {
                    case 'equal':
                        if (getCorrectValue(rule.field) === rule.value) {
                            executeAction(rule.action);
                        }
                        break;
                    case 'notEqual':
                        if (getCorrectValue(rule.field) !== rule.value) {
                            executeAction(rule.action);
                        }
                        break;
                    case 'contain':
                        if (getCorrectValue(rule.field).includes(rule.value)) {
                            executeAction(rule.action);
                        }
                        break;
                    case 'notContain':
                        if (!getCorrectValue(rule.field).includes(rule.value)) {
                            executeAction(rule.action);
                        }
                        break;
                    case 'startWith':
                        if (getCorrectValue(rule.field).startsWith(rule.value)) {
                            text = text.substring(rule.value.length);
                            executeAction(rule.action);
                        }
                        break;
                    case 'endWith':
                        if (getCorrectValue(rule.field).endsWith(rule.value)) {
                            text = text.substring(0, text.length - rule.value.length);
                            executeAction(rule.action);
                        }
                        break;
                }
            }

            const chatRules = await server.getChatRules();
            chatRules.forEach((rule) => {
                verifyRule(rule);
            });

            const globalChatRules = await server.getGlobalChatRules();
            globalChatRules.forEach((rule) => {
                rule.enable = true;
                verifyRule(rule);
            });

            if (!relayMessage || blocked) {
                return reject({skip: true, message: 'Message blocked or not relayed'});
            }
        }

        const webhookClient = new WebhookClient({id: syncChatChannel.id, token: syncChatChannel.token});
        webhookClient.send({
            username: anonymous ? 'Anonymous' : (player.name ? player.name : 'Unknown'),
            avatarURL: anonymous ? 'https://i.imgur.com/MfkZJfm.jpeg' : await getSteamUserAvatarLarge(player.steamID64).catch(() => 'https://i.imgur.com/MfkZJfm.jpeg'),
            content: text ? text : 'No message',
        }).then(() => {
            return resolve();
        }).catch((err) => {
            console.error(err);
            return reject(err);
        });
    });
}

export async function saveConnectionGlobalInfo(steamID64, steamID, IP, name) {
    try {
        const connection = await getConnectionPromise();
        const [results] = await connection.query('SELECT * FROM users WHERE steamID64 = ?', [steamID64]);
        const IPs = results.length === 0 ? [] : JSON.parse(results[0].IPS);
        IPs.push(IP);

        if (results.length === 0) {
            await connection.query('INSERT INTO users (steamID64, steamID, name, lastIP, IPS, lastUpdate) VALUES (?, ?, ?, ?, ?, NOW())', [steamID64, steamID, name, IP, JSON.stringify(IPs)]);
        } else {
            await connection.query('UPDATE users SET lastIP = ?, IPS = ?, lastUpdate = NOW() WHERE steamID64 = ?', [IP, JSON.stringify(IPs), steamID64]);
        }
    } catch (err) {
        console.error(err);
        throw err;
    }
}

export async function saveConnectionSteamInfo(steamID64, name, IP) {
    try {
        const connection = await getConnectionPromise();
        await connection.query('INSERT INTO gm_user_steam (steam_id, username, last_ip, last_connect, total_connect) VALUES (?, ?, ?, NOW(), 1) ON DUPLICATE KEY UPDATE last_ip = ?, last_connect = NOW(), total_connect = total_connect + 1', [steamID64, name, IP, IP]);
    } catch (err) {
        console.error(err);
        throw err;
    }
}