import { BaseClass } from './BaseClass.js';
import { Role } from './Role.js';
import { generateToken } from '../../utils/tools.js';
import { getConnectionPromise } from '../../database/connection.js';
import redis from '../../redis/index.js';
import { getClient } from '../../discord/index.js';
import { getStatusMessage } from '../../discord/utils/messages.js';
import { gmLog } from '../../utils/logger.js';
import gm_server from '../../database/schema/gm_server.js';
import gm_status_button from '../../database/schema/gm_status_button.js';
import gm_status from '../../database/schema/gm_status.js';
import gm_server_status from '../../database/schema/gm_server_status.js';
import { ChannelType } from 'discord.js';
import gm_server_screenshot_channels from '../../database/schema/gm_server_screenshot_channels.js';
import gm_server_stat from '../../database/schema/gm_server_stat.js';
import gm_sync_chat from '../../database/schema/gm_sync_chat.js';

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
    this.description = obj.description;
    this.isPublic = obj.isPublic;
  }

  async getStatusChannelAndMessage() {
    const redisKey = `server:${this.id}:statusChannel`;
    const redisData = await redis.get(redisKey);
    if (redisData) {
      return JSON.parse(redisData);
    }

    const status = await gm_status.findOne({
      where: {
        server: this.id,
      },
    });

    if (status) {
      await redis.set(redisKey, JSON.stringify(status), 'EX', 60);
      return status;
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
    this.publicTempToken = generateToken(16);
    await this.save();
  }

  async regenerateToken() {
    this.token = generateToken(16);
    await this.save();
  }

  async getServerStatusButtons() {
    return await gm_status_button.findAll({
      where: {
        server: this.getID(),
        enable: true,
      },
    });
  }

  async getDiscordGuild() {
    const dscClient = await getClient();
    const guild = await dscClient.guilds.fetch(this.guild);
    if (!guild) {
      throw new Error('Guild not found');
    }
    return guild;
  }

  async deleteStatus() {
    const status = await gm_status.findOne({
      where: {
        server: this.id,
      },
    });
    if (!status) return;

    const guild = await this.getDiscordGuild();
    if (!guild) return;

    const channel = await guild.channels.cache.get(status.channel);
    if (!channel) return;

    const message = await channel.messages.fetch(status.message);
    if (!message) return;

    await message.delete();
    await status.destroy();

    return status;
  }

  async createStatus(channelID) {
    const guild = await this.getDiscordGuild();

    if (!channelID) {
      throw new Error('Channel ID is required');
    }

    const channel = await guild.channels.cache.get(channelID);
    if (!channel || channel.type !== ChannelType.GuildText) {
      throw new Error('Channel not found');
    }

    const msgData = await gm_server_status.findOne({
      where: {
        id: this.getID(),
      },
    });

    const embed = await getStatusMessage(this, msgData, guild.preferredLocale);
    const message = await channel.send(embed);

    return await gm_status.create({
      server: this.getID(),
      message: message.id,
      channel: channel.id,
    });
  }

  async editStatusChannelAndMessage(msgData) {
    const dscClient = await getClient();
    const serverStatusInfo = await this.getStatusChannelAndMessage();
    if (!serverStatusInfo) {
      gmLog('status', `Status channel not found for server ${this.getID()}`, true);
      return;
    }

    const guild = await dscClient.guilds.fetch(this.getGuildID());
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
    const newMsgContent = await getStatusMessage(this, msgData, lang);
    await message.edit(newMsgContent);
  }

  async saveStatus(ip, port, hostname, map, gameMode, players, maxPlayers, uptime) {
    const serverStatus = await gm_server_status.findOne({
      where: {
        id: this.getID(),
      },
    });

    if (serverStatus) {
      serverStatus.ip = ip;
      serverStatus.port = port;
      serverStatus.hostname = hostname;
      serverStatus.map = map;
      serverStatus.gameMode = gameMode;
      serverStatus.players = players;
      serverStatus.maxPlayers = maxPlayers;
      await serverStatus.save();
    } else {
      await gm_server_status.create({
        id: this.getID(),
        ip,
        port,
        hostname,
        map,
        gameMode,
        players,
        maxPlayers,
      });
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

  async getSyncChatChannel() {
    try {
      const redisKey = `server:${this.id}:syncChatChannel`;
      const redisData = await redis.get(redisKey);
      if (redisData) {
        return JSON.parse(redisData);
      }

      const results = await gm_sync_chat.findOne({
        where: {
          server: this.id,
        },
      });

      if (results) {
        await redis.set(redisKey, JSON.stringify(results), 'EX', 60);
        return results;
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
      const player = await gm_server_stat.findOne({
        where: {
          steam_id: steamID64,
          server_id: this.id,
        },
      });

      if (player) {
        player.total_connect += 1;
        player.name = name;
        await player.save();
      } else {
        await gm_server_stat.create({
          steam_id: steamID64,
          server_id: this.id,
          name,
        });
      }
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async getServerPlayer(steamID64) {
    try {
      return await gm_server_stat.findOne({
        where: {
          server_id: this.id,
          steam_id: steamID64,
        },
      });
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  async delete() {
    const serverToDelete = await gm_server.findOne({
      where: {
        id: this.id,
      },
    });
    if (serverToDelete) {
      await serverToDelete.destroy();
    }
  }

  async save() {
    const serverToSave = await gm_server.findOne({
      where: {
        id: this.id,
      },
    });
    if (serverToSave) {
      serverToSave.name = this.name;
      serverToSave.ip = this.ip;
      serverToSave.port = this.port;
      serverToSave.image = this.image;
      serverToSave.isPublic = this.isPublic;
      serverToSave.verified = this.verified;
      serverToSave.publicTempToken = this.publicTempToken;
      serverToSave.description = this.description;
      await serverToSave.save();
    }
  }

  async findStatusButtons() {
    return await gm_status_button.findAll({
      where: {
        server: this.id,
      },
    });
  }

  async findStatusButton(id) {
    return await gm_status_button.findOne({
      where: {
        id,
        server: this.id,
      },
    });
  }

  async createStatusButton() {
    return await gm_status_button.create({
      server: this.id,
    });
  }

  async destroyStatusButton() {
    const statusButton = await gm_status_button.findOne({
      where: {
        server: this.id,
      },
    });

    if (statusButton) await statusButton.destroy();
    return statusButton;
  }

  async getScreenshotsChannel() {
    return await gm_server_screenshot_channels.findOne({
      where: {
        server: this.id,
      },
    });
  }

  async destroyScreenshotChannel() {
    const screenshotChannel = await gm_server_screenshot_channels.findOne({
      where: {
        server: this.id,
      },
    });

    if (screenshotChannel) {
      try {
        const guild = await this.getDiscordGuild();
        if (!guild) throw new Error('Guild not found');

        const channel = await guild.channels.cache.get(screenshotChannel.channelID);
        if (!channel) throw new Error('Channel not found');

        const webhook = await channel.fetchWebhooks();
        const webhookToDelete = webhook.find((webhook) => webhook.id === screenshotChannel.webhook);
        if (webhookToDelete) await webhookToDelete.delete();
      } catch (error) {
        // skip
      }
      await screenshotChannel.destroy();
    }

    return screenshotChannel;
  }

  async getDBPlayers() {
    return await gm_server_stat.findAll({
      where: {
        server_id: this.id,
      },
    });
  }

  async getPlayerStats(steamID64) {
    return await gm_server_stat.findOne({
      where: {
        server_id: this.id,
        steam_id: steamID64,
      },
    });
  }

  async createScreenshotChannel(channelID) {
    await this.destroyScreenshotChannel();

    const guild = await this.getDiscordGuild();
    if (!guild) throw new Error('Guild not found');

    const channel = await guild.channels.cache.get(channelID);
    if (!channel || channel.type !== ChannelType.GuildText) throw new Error('Channel not found');

    const webhook = await channel.createWebhook({
      name: 'Server Screenshots',
    });
    if (!webhook) throw new Error('Webhook not created');

    return await gm_server_screenshot_channels.create({
      server: this.id,
      channelID,
      webhook: webhook.id,
      token: webhook.token,
    });
  }

  async getSyncChat() {
    return await gm_sync_chat.findOne({
      where: {
        server: this.id,
      },
    });
  }

  async destroySyncChat() {
    const syncChat = await gm_sync_chat.findOne({
      where: {
        server: this.id,
      },
    });

    if (syncChat) {
      try {
        const guild = await this.getDiscordGuild();
        if (!guild) throw new Error('Guild not found');

        const channel = await guild.channels.cache.get(syncChat.channel);
        if (!channel) throw new Error('Channel not found');

        const webhook = await channel.fetchWebhooks();
        const webhookToDelete = webhook.find((webhook) => webhook.id === syncChat.id);
        if (webhookToDelete) await webhookToDelete.delete();
      } catch (error) {
        // skip
      }
      await syncChat.destroy();
    }
    return syncChat;
  }

  async createSyncChat(channelID) {
    await this.destroySyncChat();

    const guild = await this.getDiscordGuild();
    if (!guild) throw new Error('Guild not found');

    const channel = await guild.channels.cache.get(channelID);
    if (!channel || channel.type !== ChannelType.GuildText) throw new Error('Channel not found');

    const webhook = await channel.createWebhook({
      name: 'Server Chat',
    });

    if (!webhook) throw new Error('Webhook not created');

    return await gm_sync_chat.create({
      guild: this.guild,
      server: this.id,
      channel: channelID,
      id: webhook.id,
      token: webhook.token,
    });
  }
}

export async function generateServerUniqueID() {
  const generatedID = generateToken(10);
  const server = await gm_server.findOne({
    where: {
      id: generatedID,
    },
  });
  if (server) {
    return await generateServerUniqueID();
  }
  return generatedID;
}

export async function getServerFromID(serverID) {
  const server = await gm_server.findOne({
    where: {
      id: serverID,
    },
  });
  return server ? new Server(server) : null;
}

export async function getServersFromDiscordGuildID(guildID) {
  const servers = await gm_server.findAll({
    where: {
      guild: guildID,
    },
  });
  return servers.map((server) => new Server(server));
}

export async function createServer(guildID) {
  const serverID = await generateServerUniqueID();
  const server = await gm_server.create({
    id: serverID,
    token: generateToken(16),
    guild: guildID,
  });
  return new Server(server);
}
