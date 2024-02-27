const {getConnection} = require('../../database/connection');

function reportError({error, stack, id, name, realm, identifier, uptime}) {
    return new Promise((resolve, reject) => {
        getConnection().then((connection) => {
            connection.query('INSERT INTO gm_errors (error, stack, workshopID, name, realm, identifier, uptime) VALUES (?, ?, ?, ?, ?, ?, ?)', [error, stack, id, name, realm, identifier, uptime], (error) => {
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
    reportError,
}