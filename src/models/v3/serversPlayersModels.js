const {getConnection, getConnectionPromisse} = require('../../database/connection');
const serverModels = require("../v2/serverModel");
const axios = require("axios");
const steam = require("../../steam");
const {badArgument} = require("../../utils/tools");
const {WebhookClient} = require('discord.js');
const playersModels = require("./usersModels");

function getInformations(id) {
    return new Promise((resolve, reject) => {
        getConnection().then((connection) => {
            connection.query('SELECT * FROM gm_server WHERE id = ?', [id], (error, results) => {
                if (error) return reject(error);

                if (results.length > 0) {
                    return resolve(results[0]);
                } else {
                    reject('Server not found');
                }
            });
        }).catch((err) => {
            reject(err);
        });
    });
}

function isValidAuth(id, token) {
    return new Promise((resolve, reject) => {
        getConnection().then((connection) => {
            connection.query('SELECT * FROM gm_server WHERE id = ? AND token = ?', [id, token], (error, results) => {
                if (error) return reject(error);

                if (results.length > 0) {
                    return resolve(true);
                } else {
                    return resolve(false);
                }
            });
        }).catch((err) => {
            reject(err);
        });
    });
}

function getPlayerInformations(steamID64) {
    return new Promise((resolve, reject) => {
        getConnection().then((connection) => {
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
        }).catch((err) => {
            reject(err);
        });
    });
}

async function getPlayerBan(steamID64) {
    return new Promise((resolve, reject) => {
        getConnection().then((connection) => {
            connection.query('SELECT * FROM gm_ban WHERE steam_id = ?', [steamID64], (error, results) => {
                if (error) return reject(error);

                if (results.length > 0) {
                    return resolve(results[0]);
                } else {
                    return resolve(null);
                }
            });
        }).catch((err) => {
            reject(err);
        });
    });
}

function sendPlayerSay(server, player, text, onlyTeam) {
    return new Promise(async (resolve, reject) => {
        const syncChat = await server.getSetting('syncChat');
        const syncChatDirection = await server.getSetting('syncChatDirection');
        if (!syncChat || syncChatDirection === 'discordToGmod') {
            resolve();
        }

        const syncChatTriggerAll = await server.getSetting('syncChatTriggerAll');
        if (!syncChatTriggerAll) {
            // TODO check if message start with trigger
            resolve();
        }

        getConnection().then((connection) => {
            connection.query('SELECT * FROM gm_sync_chat WHERE server = ?', [server.id], async (error, results) => {
                if (error) throw error;
                if (results.length > 0) {
                    const webhookClient = new WebhookClient({id: results[0].id, token: results[0].token});

                    webhookClient.send({
                        username: player.name,
                        avatarURL: await steam.getSteamUserAvatarLarge(player.steamID64),
                        content: text,
                    }).then(() => {
                        resolve();
                    }).catch((err) => {
                        console.error(err);
                        reject(err);
                    });
                }
            });
        }).catch((err) => {
            console.error(err);
            reject(err);
        });
    });
}

function updatePlayerPseudo(serverID, player, name) {
    return new Promise((resolve, reject) => {
        // get discordID
        playersModels.getDiscordIDFromSteamID64(player.steamID64).then((discordID) => {
            // update pseudo
            playersModels.updatePseudo(discordID, name).then(() => {
                resolve();
            }).catch((err) => {
                reject(err);
            });
        }).catch((err) => {
            reject(err);
        });
    });
}

async function saveConnectionGlobalInfo(steamID64, steamID, IP, name) {
    try {
        const connection = await getConnectionPromisse();
        const [results] = await connection.query('SELECT * FROM users WHERE steamID64 = ?', [steamID64]);
        if (results.length === 0) {
            await connection.query('INSERT INTO users (steamID64, steamID, name, lastIP, IPS, lastUpdate) VALUES (?, ?, ?, ?, ?, NOW())', [steamID64, steamID, name, IP, `[${IP}]`]);
        } else {
            let IPs = JSON.parse(results[0].IPS);
            if (!IPs.includes(IP)) {
                IPs.push(IP);
            }
            await connection.query('UPDATE users SET lastIP = ?, IPS = ?, lastUpdate = NOW() WHERE steamID64 = ?', [IP, JSON.stringify(IPs), steamID64]);
        }
    } catch (err) {
        console.error(err);
        throw err;
    }
}

async function saveConnectionSteamInfo(steamID64, name, IP) {
    try {
        const connection = await getConnectionPromisse();
        await connection.query('INSERT INTO gm_user_steam (steam_id, username, last_ip, last_connect, total_connect) VALUES (?, ?, ?, NOW(), 1) ON DUPLICATE KEY UPDATE last_ip = ?, last_connect = NOW(), total_connect = total_connect + 1', [steamID64, name, IP, IP]);
    } catch (err) {
        console.error(err);
        throw err;
    }
}

module.exports = {
    getInformations,
    isValidAuth,
    getPlayerInformations,
    sendPlayerSay,
    updatePlayerPseudo,
    saveConnectionGlobalInfo,
    saveConnectionSteamInfo,
};