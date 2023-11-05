const { getConnection } = require('../database/connection');
const { addTodoTask } = require('../utils/todoTask');
const { ipGetIP } = require('../utils/tools');
const axios = require('axios');
const { bot_token } = require('../config/index');

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
                                    console.log(guild, results[0].id);
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
                            // return res.status(200).json({ error: 'server not found' });
                            reject('server not found');
                        }
                    });
                } else {
                    // return res.status(200).json({ error: 'user not found' });
                    reject('user not found');
                }
            });
        }).catch((err) => {
            reject(err);
        });
    });
}

function addUserServerStat(steamID64, id) {
    return new Promise((resolve, reject) => {
        getConnection().then((connection) => {
            connection.query('INSERT INTO gm_server_stat (steam_id, server_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE last_connect = ?, total_connect = total_connect + 1', [steamID64, id, new Date()], (error) => {
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

function addUserSteam(steamID64, name, ip, id) {
    return new Promise((resolve, reject) => {
        getConnection().then((connection) => {
            connection.query('INSERT INTO gm_user_steam (steam_id, username, last_ip) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE username = ?, last_ip = ?, total_connect = total_connect + 1', [steamID64, name, ip, name, ip], (error) => {
                if (error) {
                    reject(error);
                } else {
                    addUserServerStat(steamID64, id).then(() => {
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

function addUserServerConnect(guildID, serverID, steamID64, userName) {
    return new Promise((resolve, reject) => {
        getConnection().then((connection) => {
            connection.query('UPDATE gm_server_stat SET name = ? WHERE steam_id = ? AND server_id = ?', [userName, steamID64, serverID], (error) => {
                if (error) throw error;
            });

            connection.query('SELECT * FROM gm_user WHERE steam = ?', [steamID64], (error, results) => {
                if (error) throw error;
                if (results.length > 0) {
                    addTodoTask('updateUserName', JSON.stringify({
                        discord_id: results[0].id,
                        guild_id: guildID,
                        steam_id: steamID64,
                        username: userName
                    }));
                }
            });
        }).catch((err) => {
            reject(err);
        });
    });
}

function addUserSay(steamID64, message, name, id) {
    return new Promise((resolve, reject) => {
        getConnection().then((connection) => {
            connection.query('SELECT * FROM gm_sync_chat WHERE server = ?', [id], async (error, results) => {
                if (error) throw error;
                if (results.length > 0) {
                    steam.getUserSummary(steamID64).then(summary => {
                        request(results[0].webhook, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                content: message,
                                username: name || summary.nickname,
                                avatar_url: summary.avatar.large,
                            })
                        });
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
};