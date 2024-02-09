const {getConnection} = require('../../database/connection');

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

module.exports = {
    getInformations,
    isValidAuth,
    getPlayerInformations,
};