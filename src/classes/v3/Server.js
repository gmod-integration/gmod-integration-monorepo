import { BaseClass } from './BaseClass.js';
import { Role } from './Role.js';
import { Player } from './Player.js';
import { generateToken } from '../../utils/tools.js';
import { getConnectionPromise } from '../../database/connection.js';
import redis from '../../redis/index.js';
import { getClient } from '../../discord/index.js';
import { getStatusMessage } from '../../discord/utils/messages.js';
import { gmLog } from '../../utils/logger.js';

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

  async getStatusChannelAndMessage() {
    const redisKey = `server:${this.id}:statusChannel`;
    const redisData = await redis.get(redisKey);
    if (redisData) {
      return JSON.parse(redisData);
    }

    const connection = await getConnectionPromise();
    const [results] = await connection.query('SELECT * FROM gm_status WHERE guild = ? AND server = ?', [
      this.guild,
      this.id,
    ]);
    if (results && results[0]) {
      await redis.set(redisKey, JSON.stringify(results[0]), 'EX', 60);
      return results[0];
    }

    return null;
  }

  isValidToken(token) {
    return this.token === token;
  }

  getName() {
    return this.name;
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

  async getServerStatusButtons() {
    const connection = await getConnectionPromise();
    const [results] = await connection.query('SELECT * FROM gm_status_button WHERE server = ? AND enable = 1', [
      this.getID(),
    ]);
    if (results && results[0]) {
      return results.map((result) => {
        return {
          label: result.name,
          emoji: result.emoji,
          link: result.ulr,
        };
      });
    }
    return [];
  }

  async editStatusChannelAndMessage(msgData) {
    const dscClient = await getClient();
    const serverStatusInfo = await this.getStatusChannelAndMessage();
    if (!serverStatusInfo) {
      gmLog('status', `Status channel not found for server ${this.getID()}`, true);
      return;
    }

    const guild = await dscClient.guilds.fetch(serverStatusInfo.guild);
    if (!guild) {
      gmLog('status', `Guild not found for server ${this.getID()}`, true);
      return;
    }

    const channel = await dscClient.channels.fetch(serverStatusInfo.channel);
    if (!channel) {
      gmLog('status', `Channel not found for server ${this.getID()}`, true);
      return;
    }

    const message = await channel.messages.fetch(serverStatusInfo.message);
    if (!message) {
      gmLog('status', `Message not found for server ${this.getID()}`, true);
      return;
    }

    const lang = await guild.preferredLocale;
    const newMsgContent = await getStatusMessage(this, msgData, await this.getServerStatusButtons(), lang);
    await message.edit(newMsgContent);
  }

  async saveStatus(ip, port, hostname, map, gameMode, players, maxPlayers, uptime) {
    const connection = await getConnectionPromise();
    const query =
      'INSERT INTO gm_server_status (id, ip, port, last_update, hostname, map, gamemode, players, maxplayers) VALUES (?, ?, ?, NOW(), ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE ip = ?, port = ?, last_update = NOW(), hostname = ?, map = ?, gamemode = ?, players = ?, maxplayers = ?';
    const values = [
      this.getID(),
      ip,
      port,
      hostname,
      map,
      gameMode,
      players,
      maxPlayers,
      ip,
      port,
      hostname,
      map,
      gameMode,
      players,
      maxPlayers,
    ];
    const [results] = await connection.query(query, values);
    if (results.affectedRows === 0) {
      throw new Error('Failed to save server status in database');
    } else {
      gmLog('status', `Saved status for server ${this.getID()} in database`, true);
    }

    await this.editStatusChannelAndMessage({
      hostname,
      map,
      gameMode,
      players,
      maxPlayers,
      uptime,
    });
  }

  async getScreenshotsChannel() {
    try {
      const redisKey = `server:${this.id}:screenshotsChannel`;
      const redisData = await redis.get(redisKey);
      if (redisData) {
        return JSON.parse(redisData);
      }

      const connection = await getConnectionPromise();
      const [results] = await connection.query('SELECT * FROM gm_server_screenshot_channels WHERE serverID = ?', [
        this.id,
      ]);
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
      const [results] = await connection.query('SELECT * FROM gm_server_settings WHERE serverID = ? AND setting = ?', [
        this.id,
        setting,
      ]);
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
      await connection.query(
        'INSERT INTO gm_server_stat (steam_id, server_id, name, last_connect, total_connect) VALUES (?, ?, ?, NOW(), 1) ON DUPLICATE KEY UPDATE last_connect = NOW(), total_connect = total_connect + 1',
        [steamID64, this.id, name],
      );
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async getServerPlayer(steamID64) {
    try {
      const connection = await getConnectionPromise();
      const [results] = await connection.query('SELECT * FROM gm_server_stat WHERE server_id = ? AND steam_id = ?', [
        this.id,
        steamID64,
      ]);
      return results && results[0] ? new Player(results[0]) : null;
    } catch (error) {
      console.error(error);
      return null;
    }
  }
}

export async function generateServerUniqueID() {
  const generatedID = generateToken(10);
  const connection = await getConnectionPromise();
  const [results] = await connection.query('SELECT * FROM gm_server WHERE id = ?', [generatedID]);
  if (results && results[0]) {
    return await generateServerUniqueID();
  }
  return generatedID;
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

export async function createServer(guildID) {
  const connection = await getConnectionPromise();
  const serverID = await generateServerUniqueID();
  const [results] = await connection.query('INSERT INTO gm_server (id, token, guild) VALUES (?, ?, ?)', [
    serverID,
    generateToken(16),
    guildID,
  ]);
  if (results.affectedRows === 0) {
    return null;
  }
  return await getServerFromID(serverID);
}
