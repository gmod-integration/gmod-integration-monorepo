const { getConnection } = require('../database/connection');
const { addTodoTask } = require('../utils/todoTask');
const axios = require('axios');
const { bot_token, steamAPI } = require('../config/index');
const serverModels = require("./serverModel");
const steamApi = require('steamapi');
const steam = new steamApi(steamAPI);

function getUserData(discordID, steamID64) {
    return new Promise((resolve, reject) => {
        getConnection().then((connection) => {
            connection.query('SELECT * FROM gm_user WHERE id = ? OR steam = ?', [discordID, steamID64], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        }).catch((err) => {
            reject(err);
        });
    });
}

function getUserServerData(serverID, steamID64, ip) {
    return new Promise((resolve, reject) => {
        getConnection().then((connection) => {
            connection.query('SELECT * FROM gm_user WHERE steam = ?', [steamID64], (error, results) => {
                if (error) throw error;
                if (results.length > 0) {
                    connection.query('SELECT * FROM gm_server WHERE id = ?', [serverID], (error, results2) => {
                        if (error) throw error;
                        if (results2.length > 0) {
                            connection.query('SELECT * FROM banUsers WHERE steamID64 = ? OR discordID = ? OR ip = ?', [steamID64, results[0].id, ip], (error, results3) => {
                                if (error) throw error;
                                if (results3.length > 0) {
                                    resolve(results[0], results3[0].reason);
                                } else {
                                    // user is not ban
                                    const guild = results2[0].guild;
                                    resolve(results[0]);

                                    axios.get(`https://discord.com/api/guilds/${guild}/bans/${results[0].id}`, {
                                        headers: {
                                            'Content-Type': 'application/json',
                                            'Authorization': `Bot ${bot_token}`
                                        },
                                    }).then((response) => {
                                        // Check if user is banned on Discord
                                        if (response.status === 200) {
                                            resolve(results[0], response.data.reason);
                                        } else if (response.status === 404) {
                                            resolve(results[0]);
                                        }
                                    }).catch((error) => {
                                        resolve(results[0]);
                                    });
                                }
                            });
                        } else {
                            resolve(false);
                        }
                    });
                } else {
                    resolve(false);
                }
            });
        }).catch((err) => {
            reject(err);
        });
    });
}

// function postUserStatDisconnect(serverID, steamID64, userData) {
//     console.log(serverID);
//     console.log(steamID64);
//     console.log(userData);
//     /*
//         Q9SuZQRFmR
//         76561198219049673
//         {
//         rank: 'superadmin',
//         time: 709,
//         kills: 1,
//         deaths: 0,
//         customValues: '{"money":127720}'
//         }
//     */

//     const rank = userData.rank;
//     const time = userData.time;
//     const kills = userData.kills;
//     const deaths = userData.deaths;
//     const customValues = JSON.stringify(userData.customValues);

//     return new Promise((resolve, reject) => {
//         getConnection().then((connection) => {
//             connection.query(`
//             UPDATE gm_server_stat SET
//             rank = ?,
//             total_time = total_time + ?,
//             total_kill = total_kill + ?,
//             total_death = total_death + ?,
//             custom_values = ?
//             WHERE steam_id = ? AND server_id = ?
//         `, [rank, time, time, kills, deaths, customValues, steamID64, serverID], (error, results) => {
//                 if (error) {
//                     reject(error);
//                 } else {
//                     resolve(results);
//                     console.log(results);
//                 }
//             });
//         }).catch((err) => {
//             reject(err);
//         });
//     });
// }

function postUserStatDisconnect(serverID, steamID64, userData) {
    // Déconstruction des données utilisateur
    const { rank, time, kills, deaths, customValues } = userData;

    // Convertir customValues en chaîne JSON si nécessaire
    const customValuesString = typeof customValues === 'string' ? customValues : JSON.stringify(customValues);

    getConnection().then((connection) => {
        // set last connect to default
        connection.query(`
            INSERT INTO gm_server_stat (steam_id, server_id, rank, total_time, total_kill, total_death, custom_values, last_connect)
            VALUES (?, ?, ?, ?, ?, ?, ?, DEFAULT)
            ON DUPLICATE KEY UPDATE
            rank = VALUES(rank),
            total_time = total_time + VALUES(total_time),
            total_kill = total_kill + VALUES(total_kill),
            total_death = total_death + VALUES(total_death),
            custom_values = VALUES(custom_values),
            last_connect = DEFAULT
        `, [steamID64, serverID, rank, time, kills, deaths, customValuesString], (error, results) => {
            if (error) {
                // skip error
            }
        });
    }).catch((err) => {
        throw err;
    });
}

function postSaveUserSession(serverID, steamID64, userData) {
    return new Promise((resolve, reject) => {
        getConnection().then((connection) => {
            connection.query('INSERT INTO gm_server_stat_session(serverID, steamID64, time, deaths, kills, customValues) VALUES (?, ?, ?, ?, ?, ?)', [serverID, steamID64, userData.time, userData.deaths, userData.kills, JSON.stringify(userData.customValues)], (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        }).catch((err) => {
            reject(err);
        });
    });
}

function saveGlobalUser(steamID64, steamID, name, ip) {
    return new Promise((resolve, reject) => {
        getConnection().then((connection) => {
            connection.query('SELECT lastUpdate FROM users WHERE steamID64 = ?', [steamID64], (err, results) => {
                if (err) {
                    reject(err);
                    return;
                }

                if (results.length > 0) {
                    const ips = JSON.parse(results[0].IPS || '[]');
                    ips.push(ip);

                    connection.query('UPDATE users SET name = ?, lastUpdate = ?, lastIP = ?, IPS = ? WHERE steamID64 = ?', [name, new Date(), ip, JSON.stringify(ips), steamID64], (err) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve();
                        }
                    });
                } else {
                    connection.query('INSERT IGNORE INTO users (steamID64, steamID, name, lastUpdate, lastIP, IPS) VALUES (?, ?, ?, ?, ?, ?)', [steamID64, steamID, name, new Date(), ip, JSON.stringify([ip])], (err) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve();
                        }
                    });
                }
            });
        }).catch((err) => {
            reject(err);
        });
    });
}

function saveUser(steamID64, name, ip) {
    return new Promise((resolve, reject) => {
        getConnection().then((connection) => {
            connection.query('INSERT INTO gm_user_steam (steam_id, username, last_ip) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE username = ?, last_ip = ?, total_connect = total_connect + 1', [steamID64, name, ip, name, ip], (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        }).catch((err) => {
            reject(err);
        });
    });
}

function saveUserServer(serverID, steamID64, name) {
    return new Promise((resolve, reject) => {
        getConnection().then((connection) => {
            connection.query('INSERT INTO gm_server_stat (steam_id, server_id, name) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = ?, total_connect = total_connect + 1', [steamID64, serverID, name, name], (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        }
        ).catch((err) => {
            reject(err);
        });
    });
}

function addUserSteam(steamID64, name, ip, serverID) {
    // promise all
    return new Promise((resolve, reject) => {
        Promise.all([
            saveGlobalUser(steamID64, name, ip),
            saveUser(steamID64, name, ip),
            saveUserServer(serverID, steamID64, name)
        ]).then(() => {
            resolve();
        }).catch((err) => {
            reject(err);
        });
    });
}

function addUserServerConnect(guildID, serverID, steamID64, userName) {
    return new Promise((resolve, reject) => {
        getConnection().then((connection) => {
            connection.query('UPDATE gm_server_stat SET name = ? WHERE steam_id = ? AND server_id = ?', [userName, steamID64, serverID], (error) => {
                if (error) throw error;
            });
            // TODO if user is in table gm_user update ingame name
            resolve();
        }).catch((err) => {
            reject(err);
        });
    });
}

function addUserSay(steamID64, message, name, id) {
    return new Promise(async (resolve, reject) => {
        const syncChat = await serverModels.getServerSetting(id, 'syncChat');
        const syncChatDirection = await serverModels.getServerSetting(id, 'syncChatDirection');
        const syncChatTriggerAll = await serverModels.getServerSetting(id, 'syncChatTriggerAll');

        if (!syncChat || syncChatDirection === 'discordToGmod') {
            resolve();
        }

        if (!syncChatTriggerAll) {
            // TODO check if message start with trigger
            resolve();
        }

        getConnection().then((connection) => {
            connection.query('SELECT * FROM gm_sync_chat WHERE server = ?', [id], async (error, results) => {
                if (error) throw error;
                if (results.length > 0) {
                    const summary = await steam.getUserSummary(steamID64);
                    const avatarUrl = summary.avatar.large;

                    axios.post( `https://discord.com/api/webhooks/${results[0].id}/${results[0].token}`, {
                        content: message,
                        username: name || summary.nickname,
                        avatar_url: avatarUrl,
                    }).then(() => {
                        resolve();
                    }).catch((err) => {
                        reject(err);
                    });
                }
            });
        }).catch((err) => {
            reject(err);
        });
    });
}

module.exports = {
    getUserData,
    addUserSteam,
    getUserServerData,
    addUserServerConnect,
    addUserSay,
    postUserStatDisconnect,
    postSaveUserSession,
};