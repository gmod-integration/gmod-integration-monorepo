import {BaseClass} from "./BaseClass.js";
import {Role} from "./Role.js";
import {Player} from "./Player.js";
import {generateToken} from "../../utils/tools.js";
import {getConnectionPromise} from "../../database/connection.js";

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
            const connection = await getConnectionPromise();
            const [results] = await connection.query('SELECT * FROM gm_sync_chat WHERE server = ?', [this.id]);
            return results && results[0] ? results[0] : null;
        } catch (error) {
            console.error(error);
            return null;
        }
    }

    async getSetting(setting) {
        try {
            const connection = await getConnectionPromise();
            const [results] = await connection.query('SELECT * FROM gm_server_settings WHERE serverID = ? AND setting = ?', [this.id, setting]);
            return results[0] ? results[0].value : null;
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
            const connection = await getConnectionPromise();
            const [results] = await connection.query('SELECT * FROM gm_server_sync_chat_rules WHERE serverID = ?', [this.id]);
            return results;
        } catch (error) {
            console.error(error);
            return [];
        }
    }

    async getGlobalChatRules() {
        try {
            const connection = await getConnectionPromise();
            const [results] = await connection.query('SELECT * FROM gm_server_sync_chat_rules_preset');
            return results;
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