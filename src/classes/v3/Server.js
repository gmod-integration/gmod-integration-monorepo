import { BaseClass } from './BaseClass.js';
import { generateToken } from '../../utils/tools.js';
import redis from '../../redis/index.js';
import { getGuildClient } from '../../discord/index.js';
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
import ServerVoteChannel from '../../database/schema/ServerVoteChannel.js';
import { Op } from 'sequelize';
import ServerSetting from '../../database/schema/ServerSettings.js';
import ServerLogsChannel from '../../database/schema/ServerLogsChannel.js';
import ServerSyncRole from '../../database/schema/ServerSyncRole.js';

const serverSettings = {
  sync_role_direction: {
    defaultValue: 'both',
    acceptedValues: ['both', 'gmod-to-discord', 'discord-to-gmod'],
  },
  syncChatDirection: {
    defaultValue: 'both',
    acceptedValues: ['both', 'gmodToDiscord', 'discordToGmod'],
  },
  log_hide_ip: {
    defaultValue: false,
    acceptedValues: [true, false],
  },
  log_include_file: {
    defaultValue: false,
    acceptedValues: [true, false],
  },
  show_player_list_status: {
    defaultValue: true,
    acceptedValues: [true, false],
  },
};

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

  async getAllSettings() {
    const settings = await ServerSetting.findAll({
      where: {
        serverID: this.id,
      },
    });

    const data = {};
    for (const setting of settings) {
      data[setting.setting] = setting.value;
    }

    return data;
  }

  async getSetting(setting) {
    if (!serverSettings[setting]) {
      throw new Error('Setting not found');
    }

    const redisKey = `server:${this.id}:setting:${setting}`;
    const redisData = await redis.get(redisKey);
    if (redisData) {
      return JSON.parse(redisData);
    }

    const result = await ServerSetting.findOne({
      where: {
        serverID: this.id,
        setting,
      },
    });

    if (result) {
      if (result.value === '0') result.value = false;
      if (result.value === '1') result.value = true;

      await redis.set(redisKey, JSON.stringify(result.value), 'EX', 10);
      return result.value;
    }

    return serverSettings[setting].defaultValue;
  }

  async setSetting(setting, value) {
    if (!serverSettings[setting]) {
      throw new Error('Setting not found');
    }

    if (!serverSettings[setting].acceptedValues.includes(value)) {
      throw new Error('Invalid value');
    }

    const result = await ServerSetting.findOne({
      where: {
        serverID: this.id,
        setting,
      },
    });

    if (result) {
      result.value = value;
      await result.save();
    } else {
      await ServerSetting.create({
        serverID: this.id,
        setting,
        value,
      });
    }

    await redis.del(`server:${this.id}:setting:${setting}`);

    return {
      value,
    };
  }

  async getStatusChannelAndMessage() {
    return await gm_status.findOne({
      where: {
        server: this.id,
      },
    });
  }

  async getStatusData() {
    return await gm_server_status.findOne({
      where: {
        id: this.getID(),
        updatedAt: {
          [Op.gt]: new Date(new Date() - 6 * 60 * 1000),
        },
      },
    });
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

  async getBotInstance() {
    return await getGuildClient(this.guild);
  }

  async getDiscordGuild() {
    const dscClient = await this.getBotInstance();
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

    const msgData = await this.getStatusData();
    const embed = await getStatusMessage(this, msgData, guild.preferredLocale);
    const message = await channel.send(embed);

    return await gm_status.create({
      server: this.getID(),
      message: message.id,
      channel: channel.id,
    });
  }

  async editStatusChannelAndMessage(msgData) {
    const dscClient = await this.getBotInstance();
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

  async saveStatus(ip, port, hostname, map, gameMode, players, maxPlayers, uptime, playersList) {
    const serverStatus = await gm_server_status.findOne({
      where: {
        id: this.getID(),
      },
    });
    if (serverStatus) {
      // update
      serverStatus.ip = ip;
      serverStatus.port = port;
      serverStatus.hostname = hostname;
      serverStatus.map = map;
      serverStatus.gameMode = gameMode;
      serverStatus.players = players;
      serverStatus.maxPlayers = maxPlayers;

      // force the updatedAt to change even if the data is the same
      serverStatus.changed('updatedAt', true);

      // save
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
      ip,
      port,
      hostname,
      map,
      gameMode,
      players,
      maxPlayers,
      uptime,
      playersList,
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

  // async getChatRules() {
  //   try {
  //     const redisKey = `server:${this.id}:chatRules`;
  //     const redisData = await redis.get(redisKey);
  //     if (redisData) {
  //       return JSON.parse(redisData);
  //     }
  //
  //     const connection = await getConnectionPromise();
  //     const [results] = await connection.query('SELECT * FROM gm_server_sync_chat_rules WHERE serverID = ?', [this.id]);
  //     if (results && results[0]) {
  //       await redis.set(redisKey, JSON.stringify(results), 'EX', 60);
  //       return results;
  //     }
  //
  //     return [];
  //   } catch (error) {
  //     console.error(error);
  //     return [];
  //   }
  // }
  //
  // async getGlobalChatRules() {
  //   try {
  //     const redisKey = `server:${this.id}:chatRulesPreset`;
  //     const redisData = await redis.get(redisKey);
  //     if (redisData) {
  //       return JSON.parse(redisData);
  //     }
  //
  //     const connection = await getConnectionPromise();
  //     const [results] = await connection.query('SELECT * FROM gm_server_sync_chat_rules_preset');
  //     if (results && results[0]) {
  //       await redis.set(redisKey, JSON.stringify(results), 'EX', 60);
  //       return results;
  //     }
  //
  //     return [];
  //   } catch (error) {
  //     console.error(error);
  //     return [];
  //   }
  // }

  async getSyncRoles() {
    return (
      (await ServerSyncRole.findAll({
        where: {
          serverID: this.id,
        },
      })) || []
    );
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
      serverToSave.changed('updatedAt', true);
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
    const screenshotChannel = await this.getScreenshotsChannel();

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

  async getLogsChannel() {
    return await ServerLogsChannel.findOne({
      where: {
        serverID: this.id,
      },
    });
  }

  async getCachedLogsChannel() {
    const redisKey = `server:${this.id}:logsChannel`;
    const redisData = await redis.get(redisKey);
    if (redisData) {
      return JSON.parse(redisData);
    }

    const logsChannel = await this.getLogsChannel();
    if (logsChannel) {
      await redis.set(redisKey, JSON.stringify(logsChannel), 'EX', 60);
    }

    return logsChannel;
  }

  async destroyLogsChannel() {
    const logsChannel = await this.getLogsChannel();

    if (logsChannel) {
      try {
        const guild = await this.getDiscordGuild();
        if (!guild) throw new Error('Guild not found');

        const channel = await guild.channels.cache.get(logsChannel.channelID);
        if (!channel) throw new Error('Channel not found');

        const webhook = await channel.fetchWebhooks();
        const webhookToDelete = webhook.find((webhook) => webhook.id === logsChannel.webhookID);
        if (webhookToDelete) await webhookToDelete.delete();
      } catch (error) {
        // skip
      }
      await redis.del(`server:${this.id}:logsChannel`);
      await logsChannel.destroy();
    }

    return logsChannel;
  }

  async createLogsChannel(channelID) {
    await this.destroyLogsChannel();

    const guild = await this.getDiscordGuild();
    if (!guild) throw new Error('Guild not found');

    const channel = await guild.channels.cache.get(channelID);
    if (!channel || channel.type !== ChannelType.GuildText) throw new Error('Channel not found');

    const webhook = await channel.createWebhook({
      name: 'Server Logs',
    });

    if (!webhook) throw new Error('Webhook not created');

    await redis.del(`server:${this.id}:logsChannel`);
    return await ServerLogsChannel.create({
      serverID: this.id,
      channelID,
      webhookID: webhook.id,
      webhookToken: webhook.token,
    });
  }

  async getVoteChannel() {
    return await ServerVoteChannel.findOne({
      where: {
        serverID: this.id,
      },
    });
  }

  async destroyVoteChannel() {
    const voteChannel = await this.getVoteChannel();

    if (voteChannel) {
      try {
        const guild = await this.getDiscordGuild();
        if (!guild) throw new Error('Guild not found');

        const channel = await guild.channels.cache.get(voteChannel.channelID);
        if (!channel) throw new Error('Channel not found');

        const webhook = await channel.fetchWebhooks();
        const webhookToDelete = webhook.find((webhook) => webhook.id === voteChannel.webhook);
        if (webhookToDelete) await webhookToDelete.delete();
      } catch (error) {
        // skip
      }
      await voteChannel.destroy();
    }

    return voteChannel;
  }

  async createVoteChannel(channelID) {
    await this.destroyVoteChannel();

    const guild = await this.getDiscordGuild();
    if (!guild) throw new Error('Guild not found');

    const channel = await guild.channels.cache.get(channelID);
    if (!channel || channel.type !== ChannelType.GuildText) throw new Error('Channel not found');

    const webhook = await channel.createWebhook({
      name: 'Server Vote',
    });

    if (!webhook) throw new Error('Webhook not created');

    return await ServerVoteChannel.create({
      serverID: this.id,
      channelID,
      webhookID: webhook.id,
      webhookToken: webhook.token,
    });
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

export async function statusRoutine() {
  const serversStatusChannel = await gm_status.findAll();

  for (const statusChannel of serversStatusChannel) {
    try {
      const server = await getServerFromID(statusChannel.server);
      if (!server) return await statusChannel.destroy();

      const statusInfo = await gm_server_status.findOne({
        where: {
          id: server.getID(),
          updatedAt: {
            [Op.gte]: new Date(new Date() - 10 * 60 * 1000),
          },
        },
      });

      if (statusInfo) return;

      const dscClient = await server.getBotInstance();
      const guild = dscClient.guilds.cache.get(server.getGuildID());
      if (!guild) return new Error('Guild not found');

      const channel = guild.channels.cache.get(statusChannel.channel);
      if (!channel) return new Error('Channel not found');

      const message = await channel.messages.fetch(statusChannel.message);
      if (!message) return new Error('Message not found');

      const lang = await guild.preferredLocale;
      const newMsgContent = await getStatusMessage(server, {}, lang);
      await message.edit(newMsgContent);
    } catch (error) {
      console.error(error);
      await statusChannel.destroy();
    }
  }
}
