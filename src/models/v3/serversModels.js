const {getConnection} = require('../../database/connection');
const {generateToken} = require("../../utils/tools");

/**
 * Get the server informations
 * @param id
 * @returns {Promise<unknown>}
 */
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

/**
 * Get the server guild
 * @param id
 * @returns {Promise<unknown>}
 */
function getGuildID(id) {
    return new Promise((resolve, reject) => {
        getConnection().then((connection) => {
            connection.query('SELECT * FROM gm_server WHERE id = ?', [id], (error, results) => {
                if (error) return reject(error);

                if (results.length > 0) {
                    return resolve(results[0].guild);
                } else {
                    reject('Server not found');
                }
            });
        }).catch((err) => {
            reject(err);
        });
    });
}

/**
 * Check if the server is existing and the token is valid
 * @param id
 * @param token
 * @returns {Promise<unknown>}
 */
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

function postStatus(serverID, players, maxPlayers, map, hostname, gameMode, port, extractIP, uptime) {
    return new Promise((resolve, reject) => {
        getConnection().then((connection) => {
            connection.query('INSERT INTO gm_server_status_v3 (serverID, players, maxPlayers, map, hostname, gameMode, port, ip, uptime) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE players = ?, maxPlayers = ?, map = ?, hostname = ?, gameMode = ?, port = ?, ip = ?, uptime = ?', [serverID, players, maxPlayers, map, hostname, gameMode, port, extractIP, uptime, players, maxPlayers, map, hostname, gameMode, port, extractIP, uptime], (error) => {
                if (error) return reject(error);
                resolve();
            });
        }).catch((err) => {
            reject(err);
        });
    });
}

function refreshPublicTempToken(id) {
    return new Promise((resolve, reject) => {
        getConnection().then((connection) => {
            const publicTempToken = generateToken(16);
            connection.query('UPDATE gm_server SET publicTempToken = ? WHERE id = ?', [publicTempToken, id], (error) => {
                if (error) {
                    console.error(error);
                    reject(error);
                }
                resolve(publicTempToken);
            });
        }).catch((err) => {
            reject(err);
        });
    });
}

function getPlayer(serverID, steamID64) {
    return new Promise((resolve, reject) => {
        getConnection().then((connection) => {
            connection.query('SELECT * FROM gm_player WHERE serverID = ? AND steamID64 = ?', [serverID, steamID64], (error, results) => {
                if (error) return reject(error);

                if (results.length > 0) {
                    return resolve(results[0]);
                } else {
                    reject('Player not found');
                }
            });
        }).catch((err) => {
            reject(err);
        });
    });
}

function reportError(serverID, error) {
    return new Promise((resolve, reject) => {
        getConnection().then((connection) => {
            // connection.query('INSERT INTO gm_server_error (serverID, error) VALUES (?, ?)', [serverID, error], (error) => {
            //     if (error) {
            //         console.error(error);
            //         reject(error);
            //     }
            //     resolve();
            // });
            resolve();
        }).catch((err) => {
            reject(err);
        });
    });
}

function addServerLog(id, log) {
    return new Promise((resolve, reject) => {
        getConnection().then((connection) => {
            connection.query('INSERT INTO gm_server_logs (serverID, type, data) VALUES (?, ?, ?)', [id, log.type, JSON.stringify(log.data)], (error) => {
                if (error) {
                    console.error(error);
                    reject(error);
                }
                resolve();
            });
        }).catch((err) => {
            reject(err);
        });
    });
}

module.exports = {
    getInformations,
    isValidAuth,
    postStatus,
    refreshPublicTempToken,
    getGuildID,
    reportError,
    addServerLog,
};