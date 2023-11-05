const { getConnection } = require('../database/connection');

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

module.exports = {
    updateServerStatus,
    getServer,
};