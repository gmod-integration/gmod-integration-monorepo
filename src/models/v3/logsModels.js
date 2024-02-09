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

module.exports = {
    getInformations,
    isValidAuth,
};