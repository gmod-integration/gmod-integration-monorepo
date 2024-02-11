const {getConnection} = require('../../database/connection');
const serverModels = require("../v2/serverModel");
const axios = require("axios");
const steam = require("../../steam");
const {badArgument} = require("../../utils/tools");
const {WebhookClient} = require('discord.js');
const playersModels = require("./playersModels");

function validPlayerFormat(player) {
    console.log(player);
    return !badArgument([player.steamID, player.steamID64, player.connectTime, player.kills, player.customValues, player.deaths, player.team, player.teamName, player.name, player.userGroup]);
}

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

function sendPlayerSay(serverID, player, text, team) {
    return new Promise(async (resolve, reject) => {
        const syncChat = await serverModels.getServerSetting(serverID, 'syncChat');
        const syncChatDirection = await serverModels.getServerSetting(serverID, 'syncChatDirection');
        const syncChatTriggerAll = await serverModels.getServerSetting(serverID, 'syncChatTriggerAll');
        const steamAPI = await steam.getSteamApi()

        if (!syncChat || syncChatDirection === 'discordToGmod') {
            resolve();
        }

        if (!syncChatTriggerAll) {
            // TODO check if message start with trigger
            resolve();
        }

        getConnection().then((connection) => {
            connection.query('SELECT * FROM gm_sync_chat WHERE server = ?', [serverID], async (error, results) => {
                if (error) throw error;
                if (results.length > 0) {
                    const summary = await steamAPI.getUserSummary(player.steamID64);
                    const avatarUrl = await summary.avatar.large;

                    const webhookClient = new WebhookClient({id: results[0].id, token: results[0].token});

                    webhookClient.send({
                        username: player.name,
                        avatarURL: avatarUrl,
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

module.exports = {
    getInformations,
    isValidAuth,
    getPlayerInformations,
    validPlayerFormat,
    sendPlayerSay,
    updatePlayerPseudo,
};