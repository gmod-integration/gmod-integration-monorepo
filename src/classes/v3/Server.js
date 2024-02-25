const BaseClass = require("./BaseClass");
const {getConnection} = require("../../database/connection");

class Server extends BaseClass {
    constructor(obj = {}) {
        super();
        this.token = obj.token;
        this.id = obj.id;
        this.guild = obj.guild;
        this.name = obj.name;
        this.ip = obj.ip;
        this.port = obj.port;
        this.image = obj.image;
        this.verified = obj.verified;
        this.publicTempToken = obj.publicTempToken;
    }

    isValidToken(token) {
        return this.token === token;
    }

    getSetting(setting) {
        return new Promise((resolve, reject) => {
            getConnection().then((connection) => {
                connection.query('SELECT * FROM gm_server_settings WHERE serverID = ?', [this.id], (error, results) => {
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

    getSettings() {
        return new Promise((resolve, reject) => {
            getConnection().then((connection) => {
                connection.query('SELECT * FROM gm_server_settings WHERE serverID = ?', [this.id], (error, results) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(results[0]);
                    }
                });
            }).catch((err) => {
                reject(err);
            });
        });
    }
}

async function getServerFromID(serverID) {
    return new Promise((resolve, reject) => {
        getConnection().then((connection) => {
            connection.query('SELECT * FROM gm_server WHERE id = ?', [serverID], (error, results) => {
                if (error) return reject(error);

                if (results.length > 0) {
                    return resolve(new Server(results[0]));
                } else {
                    reject('Server not found');
                }
            });
        }).catch((err) => {
            reject(err);
        });
    });
}

module.exports = {
    Server,
    getServerFromID,
}