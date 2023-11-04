const { getConnection } = require('../database/connection');

function getUserData(discordID, steamID64) {
    return new Promise((resolve, reject) => {
        getConnection().then((connection) => {
            connection.query(`SELECT * FROM gm_user WHERE id = ? OR steam = ?`, [discordID, steamID64], (err, rows) => {
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

module.exports = {
    getUserData
};