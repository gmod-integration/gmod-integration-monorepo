const { getConnection } = require('../database/connection');

function updateServerStatus(id, players, maxplayers, map, hostname, gamemode, port, ip) {
    return new Promise((resolve, reject) => {
        getConnection().then((connection) => {
            connection.query('INSERT INTO gm_server_status (id, ip, port, hostname, map, players, maxplayers, gamemode) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE ip = ?, port = ?, hostname = ?, map = ?, players = ?, maxplayers = ?, gamemode = ?, last_update = ?', [id, ip, port, hostname, map, players, maxplayers, gamemode, ip, port, hostname, map, players, maxplayers, gamemode, new Date()], (error) => {
                if (error) {
                    console.error(error);
                    return res.status(500).send('internal server error');
                }
                return res.status(200).send('data received');
            });
        }).catch((err) => {
            reject(err);
        });
    });
}

module.exports = {
    updateServerStatus
};