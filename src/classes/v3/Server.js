import {BaseClass} from "./BaseClass.js";
import {Role} from "./Role.js";
import {Player} from "./Player.js";
import {generateToken} from "../../utils/tools.js";
import {getConnectionPromise} from "../../database/connection.js";
import redis from "../../redis/index.js";

export class Server extends BaseClass {
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
            const connection = await getConnectionPromise();
            const newToken = generateToken(16);
            await connection.query('UPDATE gm_server SET publicTempToken = ? WHERE id = ?', [newToken, this.id]);
            this.publicTempToken = newToken;
        } catch (error) {
            console.error(error);
            throw error;
        }
    }

    async saveStatus(ip, port, hostname, map, gameMode, players, maxPlayers, uptime) {
        return new Promise(async (resolve, reject) => {
            const connection = await getConnectionPromise();
            const query = 'INSERT INTO gm_server_status (id, ip, port, last_update, hostname, map, gamemode, players, maxplayers) VALUES (?, ?, ?, NOW(), ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE ip = ?, port = ?, last_update = NOW(), hostname = ?, map = ?, gamemode = ?, players = ?, maxplayers = ?';
            const values = [this.getID(), ip, port, hostname, map, gameMode, players, maxPlayers, ip, port, hostname, map, gameMode, players, maxPlayers];
            const [results] = await connection.query(query, values);
            if (results.affectedRows >= 1) {
                resolve();
            } else {
                reject('Failed to save status');
            }
        });
    }

    async getScreenshotsChannel() {
        try {
            const connection = await getConnectionPromise();
            const [results] = await connection.query('SELECT * FROM gm_server_screenshot_channels WHERE serverID = ?', [this.id]);
            return results && results[0] ? results[0] : null;
        } catch (error) {
            console.error(error);
            return null;
        }
    }

    async getSyncChatChannel() {
        try {
            const redisKey = `server:${this.id}:syncChatChannel`;
            const redisData = await redis.get(redisKey);
            if (redisData) {
                return JSON.parse(redisData);
            }

            const connection = await getConnectionPromise();
            const [results] = await connection.query('SELECT * FROM gm_sync_chat WHERE server = ?', [this.id]);
            if (results && results[0]) {
                await redis.set(redisKey, JSON.stringify(results[0]), 'EX', 60);
                return results[0];
            }

            return null;
        } catch (error) {
            console.error(error);
            return null;
        }
    }

    async getSetting(setting) {
        try {
            const redisKey = `server:${this.id}:setting:${setting}`;
            const redisData = await redis.get(redisKey);
            if (redisData) {
                return JSON.parse(redisData);
            }

            const connection = await getConnectionPromise();
            const [results] = await connection.query('SELECT * FROM gm_server_settings WHERE serverID = ? AND setting = ?', [this.id, setting]);
            if (results && results[0]) {
                await redis.set(redisKey, JSON.stringify(results[0].value), 'EX', 60);
                return results[0].value;
            }

            return null;
        } catch (error) {
            console.error(error);
            return null;
        }
    }

    async getSettings() {
        try {
            const connection = await getConnectionPromise();
            const [results] = await connection.query('SELECT * FROM gm_server_settings WHERE serverID = ?', [this.id]);
            return results ? results : [];
        } catch (error) {
            console.error(error);
            return [];
        }
    }

    async getChatRules() {
        try {
            const redisKey = `server:${this.id}:chatRules`;
            const redisData = await redis.get(redisKey);
            if (redisData) {
                return JSON.parse(redisData);
            }

            const connection = await getConnectionPromise();
            const [results] = await connection.query('SELECT * FROM gm_server_sync_chat_rules WHERE serverID = ?', [this.id]);
            if (results && results[0]) {
                await redis.set(redisKey, JSON.stringify(results), 'EX', 60);
                return results;
            }

            return [];
        } catch (error) {
            console.error(error);
            return [];
        }
    }

    async getGlobalChatRules() {
        try {
            const redisKey = `server:${this.id}:chatRulesPreset`;
            const redisData = await redis.get(redisKey);
            if (redisData) {
                return JSON.parse(redisData);
            }

            const connection = await getConnectionPromise();
            const [results] = await connection.query('SELECT * FROM gm_server_sync_chat_rules_preset');
            if (results && results[0]) {
                await redis.set(redisKey, JSON.stringify(results), 'EX', 60);
                return results;
            }

            return [];
        } catch (error) {
            console.error(error);
            return [];
        }
    }

    async getRoles() {
        try {
            const connection = await getConnectionPromise();
            const [results] = await connection.query('SELECT * FROM gm_server_roles WHERE serverID = ?', [this.id]);
            return results.map((result) => new Role(result));
        } catch (error) {
            console.error(error);
            return [];
        }
    }

    async saveUserConnectionInfo(steamID64, name) {
        try {
            const connection = await getConnectionPromise();
            await connection.query('INSERT INTO gm_server_stat (steam_id, server_id, name, last_connect, total_connect) VALUES (?, ?, ?, NOW(), 1) ON DUPLICATE KEY UPDATE last_connect = NOW(), total_connect = total_connect + 1', [steamID64, this.id, name]);
        } catch (error) {
            console.error(error);
            throw error;
        }
    }

    async getServerPlayer(steamID64) {
        try {
            const connection = await getConnectionPromise();
            const [results] = await connection.query('SELECT * FROM gm_server_stat WHERE server_id = ? AND steam_id = ?', [this.id, steamID64]);
            return results && results[0] ? new Player(results[0]) : null;
        } catch (error) {
            console.error(error);
            return null;
        }
    }
}

export async function getServerFromID(serverID) {
    try {
        const connection = await getConnectionPromise();
        const [results] = await connection.query('SELECT * FROM gm_server WHERE id = ?', [serverID]);
        return results[0] ? new Server(results[0]) : null;
    } catch (error) {
        console.error(error);
        return null;
    }
}

export async function getServersFromDiscordGuildID(guildID) {
    try {
        const connection = await getConnectionPromise();
        const [results] = await connection.query('SELECT * FROM gm_server WHERE guild = ?', [guildID]);
        return results.map((result) => new Server(result));
    } catch (error) {
        console.error(error);
        return [];
    }
}