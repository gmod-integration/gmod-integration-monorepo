const BaseClass = require("./BaseClass");
const {getConnection, getConnectionPromisse} = require("../../database/connection");
const {Role} = require("./Role");
const {generateToken} = require("../../utils/tools");

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

    getPublicToken() {
        return this.publicTempToken;
    }

    getToken() {
        return this.token;
    }

    async regeneratePublicTempToken() {
        try {
            const connection = await getConnectionPromisse();
            const newToken = generateToken(16);
            await connection.query('UPDATE gm_server SET publicTempToken = ? WHERE id = ?', [newToken, this.id]);
            this.publicTempToken = newToken;
        } catch (error) {
            console.error(error);
            throw error;
        }
    }

    async getScreenshotsChannel() {
        try {
            const connection = await getConnectionPromisse();
            const [results] = await connection.query('SELECT * FROM gm_server_screenshot_channels WHERE serverID = ?', [this.id]);
            return results && results[0] ? results[0] : null;
        } catch (error) {
            console.error(error);
            return null;
        }
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

    async saveUserConnectionInfo(steamID64, name) {
        try {
            const connection = await getConnectionPromisse();
            await connection.query('INSERT INTO gm_server_stat (steam_id, server_id, name, last_connect, total_connect) VALUES (?, ?, ?, NOW(), 1) ON DUPLICATE KEY UPDATE last_connect = NOW(), total_connect = total_connect + 1', [steamID64, this.id, name]);
        } catch (error) {
            console.error(error);
            throw error;
        }
    }

    async isValidPlayerToken(steamID64, token, createDate) {

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

async function getServersFromDiscordGuildID(guildID) {
    const connection = await getConnectionPromisse();
    const [results] = await connection.query('SELECT * FROM gm_server WHERE guild = ?', [guildID]);
    return results.map((result) => new Server(result));
}

module.exports = {
    Server,
    getServerFromID,
    getServersFromDiscordGuildID
}