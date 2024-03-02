const BaseClass = require("./BaseClass");
const {getConnection, getConnectionPromisse} = require("../../database/connection");
const {Role} = require("./Role");

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

    getID() {
        return this.id;
    }

    getGuildID() {
        return this.guild;
    }

    async getSetting(setting) {
        try {
            const connection = await getConnectionPromisse();
            const [results] = await connection.query('SELECT * FROM gm_server_settings WHERE serverID = ? AND setting = ?', [this.id, setting]);
            return results[0] ? results[0].value : null;
        } catch (error) {
            console.error(error);
            return null;
        }
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

    async getRoles() {
        try {
            const connection = await getConnectionPromisse();
            const [results] = await connection.query('SELECT * FROM gm_server_roles WHERE serverID = ?', [this.id]);
            return results.map((result) => new Role(result));
        } catch (error) {
            console.error(error);
            return [];
        }
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

async function getServerFromDiscordGuildID(guildID) {
    return new Promise((resolve, reject) => {
        getConnection().then((connection) => {
            connection.query('SELECT * FROM gm_server WHERE guild = ?', [guildID], (error, results) => {
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
    getServerFromDiscordGuildID,
}