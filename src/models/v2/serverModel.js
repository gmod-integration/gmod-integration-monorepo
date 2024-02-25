const {getConnection} = require('../../database/connection');
const {generateToken} = require('../../utils/tools');

function updateServerStatus(id, players, maxplayers, map, hostname, gamemode, port, ip) {
    return new Promise((resolve, reject) => {
        getConnection().then((connection) => {
            connection.query('INSERT INTO gm_server_status (id, ip, port, hostname, map, players, maxplayers, gamemode) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE ip = ?, port = ?, hostname = ?, map = ?, players = ?, maxplayers = ?, gamemode = ?, last_update = ?', [id, ip, port, hostname, map, players, maxplayers, gamemode, ip, port, hostname, map, players, maxplayers, gamemode, new Date()], (error) => {
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

function getServerSetting(serverID, setting) {
    return new Promise((resolve, reject) => {
        getConnection().then((connection) => {
            connection.query('SELECT * FROM gm_server_settings WHERE serverID = ?', [serverID], (error, results) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(results[0] ? results[0][setting] : null);
                }
            });
        }).catch((err) => {
            reject(err);
        });
    });
}

function getServer(serverID) {
    return new Promise((resolve, reject) => {
        getConnection().then((connection) => {
            connection.query('SELECT * FROM gm_server WHERE id = ?', [serverID], (error, results) => {
                if (error) {
                    reject(error);
                } else {
                    delete results[0].token; // remove for security
                    resolve(results[0]);
                }
            });
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
    updateServerStatus,
    getServer,
    addServerLog,
    getServerSetting,
    refreshPublicTempToken,
};