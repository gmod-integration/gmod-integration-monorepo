import { BaseClass } from './BaseClass.js';
import { generateToken } from '../../utils/tools.js';
import redis from '../../services/redis/index.js';
import { getGuildClient } from '../../discord/index.js';
import { getStatusMessage } from '../../discord/utils/messages.js';
import { gmLog } from '../../utils/logger.js';
import { ChannelType } from 'discord.js';
import index from '../../services/prisma/index.js';
import {
  gm_server_logs_triggers,
  gm_server_logs_triggers_action,
  gm_server_logs_triggers_operator,
  gm_server_sync_chat_filter,
} from '@prisma/client';
import { isGuildPremium } from './Guild.js';

const serverSettings: Record<string, any> = {
  sync_role_direction: {
    defaultValue: 'gmod-to-discord',
    acceptedValues: ['both', 'gmod-to-discord', 'discord-to-gmod'],
  },
  syncChatDirection: {
    defaultValue: 'gmodToDiscord',
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
  sync_pseudo_direction: {
    defaultValue: 'gmod-to-discord',
    acceptedValues: ['disable', 'both', 'gmod-to-discord', 'discord-to-gmod'],
  },
  pseudoFormat: {
    defaultValue: '{rolePrefix} - {plyName}',
    freeValues: true,
  },
  show_player_list_status: {
    defaultValue: false,
    acceptedValues: [true, false],
    onChange: async (server: Server) => {
      await server.editStatusChannelAndMessage(await server.getStatusData());
    },
  },
  chat_sync_relay_all: {
    defaultValue: true,
    acceptedValues: [true, false],
  },
  sync_chat_prevent_ping: {
    defaultValue: true,
    acceptedValues: [true, false],
  },
  status_player_list_format: {
    defaultValue: '{connectTime} - {name}',
    freeValues: true,
    onChange: async (server: Server) => {
      await server.editStatusChannelAndMessage(await server.getStatusData());
    },
  },
  show_status_chart: {
    defaultValue: false,
    acceptedValues: [true, false],
    premium: true,
    onChange: async (server: Server) => {
      await server.editStatusChannelAndMessage(await server.getStatusData());
    },
  },
};

export class Server extends BaseClass {
  public token: string;
  public id: string;
  public guild: string;
  public name: string;
  public ip: string;
  public port: string;
  public image: string;
  public verified: boolean;
  public publicTempToken: string;
  public description: string;
  public isPublic: boolean;

  constructor(obj: any) {
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

  async isPremium() {
    return await isGuildPremium(this.guild);
  }

  async getAllSettings() {
    const settings = await index.gm_server_settings.findMany({
      where: {
        serverID: this.id,
      },
    });

    const data: Record<string, any> = {};
    for (const setting of settings) {
      data[setting.setting] = setting.value;
      if (serverSettings[setting.setting] && serverSettings[setting.setting].acceptedValues) {
        if (
          serverSettings[setting.setting].acceptedValues.includes(true) ||
          serverSettings[setting.setting].acceptedValues.includes(false)
        ) {
          if (setting.value === '0' || setting.value === 'false') data[setting.setting] = false;
          if (setting.value === '1' || setting.value === 'true') data[setting.setting] = true;
        }
      }
    }

    return data;
  }

  async getSetting(setting: string) {
    if (!serverSettings[setting]) {
      throw new Error('Setting not found');
    }

    const redisKey = `server:${this.id}:setting:${setting}`;
    const redisData = await redis.get(redisKey);
    if (redisData) {
      return JSON.parse(redisData);
    }

    const result = await index.gm_server_settings.findFirst({
      where: {
        serverID: this.id,
        setting,
      },
    });

    if (result) {
      let rtnValue: any = result.value;
      if (serverSettings[setting].acceptedValues) {
        if (
          serverSettings[setting].acceptedValues.includes(true) ||
          serverSettings[setting].acceptedValues.includes(false)
        ) {
          if (rtnValue === '0' || rtnValue === 'false') rtnValue = false;
          if (rtnValue === '1' || rtnValue === 'true') rtnValue = true;
        }
      }

      await redis.set(redisKey, JSON.stringify(rtnValue), 'EX', 10);
      return rtnValue;
    }

    return serverSettings[setting].defaultValue;
  }

  async setSetting(setting: string, value: any) {
    if (!serverSettings[setting]) {
      throw new Error('Setting not found');
    }

    const previousValue = await this.getSetting(setting);

    if (serverSettings[setting].premium && !(await this.isPremium())) {
      throw new Error('Premium setting');
    }

    if (
      !serverSettings.freeValues &&
      serverSettings[setting].acceptedValues &&
      !serverSettings[setting].acceptedValues.includes(value)
    ) {
      throw new Error('Invalid value');
    }

    const result = await index.gm_server_settings.findFirst({
      where: {
        serverID: this.id,
        setting,
      },
    });

    value = value.toString();

    if (result) {
      await index.gm_server_settings.update({
        where: {
          serverID_setting: {
            serverID: this.id,
            setting,
          },
        },
        data: {
          value,
        },
      });
    } else {
      await index.gm_server_settings.create({
        data: {
          serverID: this.id,
          setting,
          value,
        },
      });
    }

    await redis.del(`server:${this.id}:setting:${setting}`);

    if (serverSettings[setting].onChange) {
      await serverSettings[setting].onChange(this, previousValue, value);
    }

    return {
      value: await this.getSetting(setting),
    };
  }

  async getGmodToDiscordFilter(): Promise<gm_server_sync_chat_filter[] | null> {
    const redisKey = `server:${this.id}:gmodToDiscordFilter`;
    const redisData = await redis.get(redisKey);

    if (redisData) {
      return JSON.parse(redisData);
    }

    const result = await index.gm_server_sync_chat_filter.findMany({
      where: {
        serverID: this.id,
      },
    });

    if (result) {
      await redis.set(redisKey, JSON.stringify(result), 'EX', 60);
      return result;
    }

    return null;
  }

  async getStatusChannelAndMessage() {
    return index.gm_status.findFirst({
      where: {
        server: this.id,
      },
    });
  }

  async getStatusData() {
    return index.gm_server_status.findFirst({
      where: {
        id: this.getID(),
        updatedAt: {
          gt: new Date(new Date().getTime() - 6 * 60 * 1000),
        },
      },
    });
  }

  isValidToken(token: string) {
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
    await index.gm_server.update({
      where: {
        id: this.id,
      },
      data: {
        publicTempToken: this.publicTempToken,
      },
    });
  }

  async regenerateToken() {
    this.token = generateToken(16);
    await index.gm_server.update({
      where: {
        id: this.id,
      },
      data: {
        token: this.token,
      },
    });
  }

  async getServerStatusButtons() {
    return index.gm_status_button.findMany({
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
    const status = await this.getStatusChannelAndMessage();
    if (!status) return;

    try {
      const guild = await this.getDiscordGuild();
      if (!guild) return;

      const channel = guild.channels.cache.get(status.channel);
      if (!channel) return;

      if (channel.isTextBased()) {
        const message = await channel.messages.fetch(status.message);
        if (message) await message.delete();
      }
    } catch (error) {
      // skip
    }

    // force delete the status from the database
    await index.gm_status.delete({
      where: {
        server: this.getID(),
      },
    });

    return status;
  }

  async createStatus(channelID: string) {
    const guild = await this.getDiscordGuild();

    if (!channelID) {
      throw new Error('Channel ID is required');
    }

    const channel = guild.channels.cache.get(channelID);
    if (!channel) throw new Error('Channel not found');
    if (!channel.isSendable()) throw new Error('Channel is not sendable');

    const msgData = await this.getStatusData();
    const embed = await getStatusMessage(this, msgData, guild.preferredLocale);
    const message = await channel.send(embed);

    return index.gm_status.create({
      data: {
        server: this.getID(),
        message: message.id,
        channel: channel.id,
      },
    });
  }

  async editStatusChannelAndMessage(msgData: any) {
    const dscClient = await this.getBotInstance();
    const serverStatusInfo = await this.getStatusChannelAndMessage();
    if (!serverStatusInfo) {
      gmLog('status', `Status channel not found for server ${this.getID()}`, true);
      return;
    }

    try {
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

      let message;
      if (!channel.isTextBased()) {
        gmLog('status', `Channel is not text based for server ${this.getID()}`, true);
        return;
      }

      message = await channel.messages.fetch(serverStatusInfo.message);
      if (!message) {
        gmLog('status', `Message not found for server ${this.getID()}`, true);
        return;
      }

      const lang = guild.preferredLocale;
      const newMsgContent = await getStatusMessage(this, msgData, lang);
      await message.edit(newMsgContent);
    } catch (error: any) {
      gmLog('status', `Error updating status message for server ${this.getID()}: ${error.message}`, true);
      console.error(error);
      // await prisma.gm_status.delete({
      //   where: {
      //     server: this.getID(),
      //   },
      // });
    }
  }

  async saveStatus(
    ip: string,
    port: number,
    hostname: string,
    map: string,
    gameMode: string,
    players: number,
    maxPlayers: number,
    uptime: number,
    playersList: any,
  ) {
    const serverStatus = await index.gm_server_status.findFirst({
      where: {
        id: this.getID(),
      },
    });
    if (serverStatus) {
      await index.gm_server_status.update({
        where: {
          id: this.getID(),
        },
        data: {
          ip,
          port,
          hostname,
          map,
          gameMode,
          players,
          maxPlayers,
          playersList: JSON.stringify(playersList),
        },
      });
    } else {
      await index.gm_server_status.create({
        data: {
          id: this.getID(),
          ip,
          port,
          hostname,
          map,
          gameMode,
          players,
          maxPlayers,
          playersList: JSON.stringify(playersList),
        },
      });
    }

    await index.gm_server_status_history.create({
      data: {
        serverID: this.getID(),
        players,
      },
    });

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

      const results = await index.gm_sync_chat.findFirst({
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

  async getSyncRoles() {
    return (
      (await index.gm_server_sync_roles.findMany({
        where: {
          serverID: this.id,
        },
      })) || []
    );
  }

  async getSyncTeamRoles() {
    return (
      (await index.gm_server_sync_team_roles.findMany({
        where: {
          serverID: this.id,
        },
      })) || []
    );
  }

  async saveUserConnectionInfo(steamID64: string, name: string) {
    try {
      const player = await index.gm_server_stat.findFirst({
        where: {
          steam_id: steamID64,
          server_id: this.id,
        },
      });

      if (player) {
        await index.gm_server_stat.update({
          where: {
            server_id_steam_id: {
              steam_id: steamID64,
              server_id: this.id,
            },
          },
          data: {
            name,
            total_connect: player.total_connect + 1,
          },
        });
      } else {
        await index.gm_server_stat.create({
          data: {
            steam_id: steamID64,
            server_id: this.id,
            name,
            last_connect: new Date(),
            first_join: new Date(),
            custom_values: '{}',
          },
        });
      }
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async getServerPlayer(steamID64: string) {
    try {
      return await index.gm_server_stat.findFirst({
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
    const serverToDelete = await index.gm_server.findFirst({
      where: {
        id: this.id,
      },
    });

    if (serverToDelete) {
      await index.gm_server.delete({
        where: {
          id: this.id,
        },
      });
    }

    return serverToDelete;
  }

  async save() {
    const serverToSave = await index.gm_server.findFirst({
      where: {
        id: this.id,
      },
    });

    if (serverToSave) {
      await index.gm_server.update({
        where: {
          id: this.id,
        },
        data: {
          name: this.name,
          ip: this.ip,
          port: this.port,
          image: this.image,
          isPublic: this.isPublic,
          verified: this.verified,
          publicTempToken: this.publicTempToken,
          description: this.description,
        },
      });
    }
  }

  async findStatusButtons() {
    return index.gm_status_button.findMany({
      where: {
        server: this.id,
      },
    });
  }

  async findStatusButton(id: number) {
    return index.gm_status_button.findFirst({
      where: {
        id,
        server: this.id,
      },
    });
  }

  async createStatusButton() {
    return index.gm_status_button.create({
      data: {
        server: this.id,
      },
    });
  }

  async destroyStatusButton(id: number) {
    const statusButton = await index.gm_status_button.findFirst({
      where: {
        server: this.id,
        id,
      },
    });

    if (statusButton) {
      await index.gm_status_button.delete({
        where: {
          id,
          server: this.id,
        },
      });
    }

    return statusButton;
  }

  async getScreenshotsChannel(admin: boolean = false) {
    return index.gm_server_screenshot_channels.findFirst({
      where: {
        server: this.getID(),
        adminCmd: admin,
      },
    });
  }

  async destroyScreenshotChannel() {
    const screenshotChannel = await this.getScreenshotsChannel();

    if (screenshotChannel) {
      try {
        const guild = await this.getDiscordGuild();
        if (!guild) throw new Error('Guild not found');

        const webhooks = await guild.fetchWebhooks();
        const webhookToDelete = webhooks.find((webhook) => webhook.id === screenshotChannel.webhook);

        if (webhookToDelete) await webhookToDelete.delete();
      } catch (error) {
        // skip
      }
      await index.gm_server_screenshot_channels.delete({
        where: {
          server_adminCmd: {
            server: this.getID(),
            adminCmd: screenshotChannel.adminCmd,
          },
        },
      });
    }

    return screenshotChannel;
  }

  async getLogsChannel() {
    return index.gm_server_logs_channel.findFirst({
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

        const webhooks = await guild.fetchWebhooks();
        const webhookToDelete = webhooks.find((webhook) => webhook.id === logsChannel.webhookID);
        if (webhookToDelete) await webhookToDelete.delete();
      } catch (error) {
        // skip
      }
      await redis.del(`server:${this.id}:logsChannel`);
      await index.gm_server_logs_channel.delete({
        where: {
          serverID: this.id,
        },
      });
    }

    return logsChannel;
  }

  async createLogsChannel(channelID: string) {
    await this.destroyLogsChannel();

    const guild = await this.getDiscordGuild();
    if (!guild) throw new Error('Guild not found');

    const channel = guild.channels.cache.get(channelID);
    if (!channel || channel.type !== ChannelType.GuildText) throw new Error('Channel not found');

    const webhook = await channel.createWebhook({
      name: 'Server Logs',
    });

    if (!webhook) throw new Error('Webhook not created');

    await redis.del(`server:${this.id}:logsChannel`);
    return index.gm_server_logs_channel.create({
      data: {
        serverID: this.id,
        channelID,
        webhookID: webhook.id,
        webhookToken: webhook.token,
      },
    });
  }

  async getVoteChannel() {
    return index.gm_server_vote_channels.findFirst({
      where: {
        serverID: this.id,
      },
    });
  }

  async getPublicInformations() {
    return {
      id: this.id,
      name: this.name,
      image: this.image,
      vote: this.vote,
      guild: this.guild,
      verified: this.verified,
      description: this.description,
      ip: this.ip,
      port: this.port,
    };
  }

  async destroyVoteChannel() {
    const voteChannel = await this.getVoteChannel();

    if (voteChannel) {
      try {
        const guild = await this.getDiscordGuild();
        if (!guild) throw new Error('Guild not found');

        const webhooks = await guild.fetchWebhooks();
        const webhookToDelete = webhooks.find((webhook) => webhook.id === voteChannel.webhookID);
        if (webhookToDelete) await webhookToDelete.delete();
      } catch (error) {
        // skip
      }

      await index.gm_server_vote_channels.delete({
        where: {
          channelID: voteChannel.channelID,
          serverID: this.id,
        },
      });
    }

    return voteChannel;
  }

  async createVoteChannel(channelID: string) {
    await this.destroyVoteChannel();

    const guild = await this.getDiscordGuild();
    if (!guild) throw new Error('Guild not found');

    const channel = guild.channels.cache.get(channelID);
    if (!channel || channel.type !== ChannelType.GuildText) throw new Error('Channel not found');

    const webhook = await channel.createWebhook({
      name: 'Server Vote',
    });

    if (!webhook) throw new Error('Webhook not created');

    return index.gm_server_vote_channels.create({
      data: {
        serverID: this.id,
        channelID,
        webhookID: webhook.id,
        webhookToken: webhook.token,
      },
    });
  }

  async getDBPlayers() {
    return index.gm_server_stat.findMany({
      where: {
        server_id: this.id,
      },
    });
  }

  async getPlayerStats(steamID64: string) {
    return index.gm_server_stat.findFirst({
      where: {
        server_id: this.id,
        steam_id: steamID64,
      },
    });
  }

  async createScreenshotChannel(channelID: string) {
    await this.destroyScreenshotChannel();

    const guild = await this.getDiscordGuild();
    if (!guild) throw new Error('Guild not found');

    const channel = guild.channels.cache.get(channelID);
    if (!channel || channel.type !== ChannelType.GuildText) throw new Error('Channel not found');

    const webhook = await channel.createWebhook({
      name: 'Server Screenshots',
    });

    if (!webhook) throw new Error('Webhook not created');

    return index.gm_server_screenshot_channels.create({
      data: {
        server: this.id,
        channelID,
        webhook: webhook.id,
        token: webhook.token,
      },
    });
  }

  async getSyncChat() {
    return index.gm_sync_chat.findFirst({
      where: {
        server: this.id,
      },
    });
  }

  async destroySyncChat() {
    const syncChat = await this.getSyncChat();

    if (syncChat) {
      try {
        const guild = await this.getDiscordGuild();
        if (!guild) throw new Error('Guild not found');

        const webhooks = await guild.fetchWebhooks();
        const webhookToDelete = webhooks.find((webhook) => webhook.id === syncChat.id);
        if (webhookToDelete) await webhookToDelete.delete();
      } catch (error) {
        // skip
      }
      await index.gm_sync_chat.delete({
        where: {
          guild_server: {
            guild: syncChat.guild,
            server: this.id,
          },
        },
      });
    }
    return syncChat;
  }

  async createSyncChat(channelID: string) {
    await this.destroySyncChat();

    const guild = await this.getDiscordGuild();
    if (!guild) throw new Error('Guild not found');

    const channel = guild.channels.cache.get(channelID);
    if (!channel || channel.type !== ChannelType.GuildText) throw new Error('Channel not found');

    const webhook = await channel.createWebhook({
      name: 'Server Chat',
    });

    if (!webhook) throw new Error('Webhook not created');

    return index.gm_sync_chat.create({
      data: {
        guild: this.guild,
        server: this.id,
        channel: channelID,
        id: webhook.id,
        token: webhook.token,
      },
    });
  }

  async getLogsTrigger() {
    return index.gm_server_logs_triggers.findMany({
      where: {
        serverID: this.id,
      },
    });
  }

  /*$
  model gm_server_logs_triggers {
  id        Int            @id @default(autoincrement())
  log_type  String         @db.VarChar(255)
  value     String         @db.VarChar(255)
  operator  operator       @default(equal)
  action    trigger_action @default(sendInChannel)
  channelID String         @default("") @db.VarChar(255)
  adminIDS  Json           @default("[]")
  message   String         @default("") @db.VarChar(255)
  createdAt DateTime       @default(now())
  updatedAt DateTime       @updatedAt

  serverID  String    @db.VarChar(255)
  gm_server gm_server @relation(fields: [serverID], references: [id], onDelete: Cascade)
}
   */
  async deleteLogsTrigger(id: number) {
    const trigger = await index.gm_server_logs_triggers.findFirst({
      where: {
        serverID: this.id,
        id,
      },
    });

    if (trigger) {
      await index.gm_server_logs_triggers.delete({
        where: {
          id,
          serverID: this.id,
        },
      });
    }

    await this.resetRedisLogsTrigger();
    return trigger;
  }

  async createLogsTrigger(
    action: string,
    compare: string,
    channelID: string,
    value: string,
    operator: string,
    message: string,
    log_type: string,
  ) {
    const newOperator = gm_server_logs_triggers_operator[operator as keyof typeof gm_server_logs_triggers_operator];
    const newAction = gm_server_logs_triggers_action[action as keyof typeof gm_server_logs_triggers_action];
    const data = index.gm_server_logs_triggers.create({
      data: {
        serverID: this.id,
        action: newAction,
        compare,
        channelID,
        value,
        operator: newOperator,
        message,
        log_type,
      },
    });

    await this.resetRedisLogsTrigger();
    return data;
  }

  async updateLogsTrigger(
    id: number,
    action: string,
    compare: string,
    channelID: string,
    value: string,
    operator: string,
    message: string,
    log_type: string,
  ) {
    const newOperator = gm_server_logs_triggers_operator[operator as keyof typeof gm_server_logs_triggers_operator];
    const newAction = gm_server_logs_triggers_action[action as keyof typeof gm_server_logs_triggers_action];
    const data = await index.gm_server_logs_triggers.update({
      where: {
        id,
        serverID: this.id,
      },
      data: {
        action: newAction,
        compare,
        channelID,
        value,
        operator: newOperator,
        message,
        log_type,
      },
    });

    await this.resetRedisLogsTrigger();
    return data;
  }

  async resetRedisLogsTrigger() {
    const redisKey = `server:${this.id}:logsTrigger`;
    await redis.del(redisKey);
    const triggers = await this.getLogsTrigger();
    if (triggers) {
      for (const trigger of triggers) {
        await redis.del(`${redisKey}:${trigger.log_type}`);
      }
    }
    await this.getLogsTriggerFromRedis();
  }

  async getLogsTriggerFromRedis() {
    const redisKey = `server:${this.id}:logsTrigger`;
    const redisData = await redis.get(redisKey);
    if (redisData) {
      return JSON.parse(redisData);
    } else {
      const redisKey = `server:${this.id}:logsTrigger`;
      const triggers = await this.getLogsTrigger();

      let triggersByType: Record<string, gm_server_logs_triggers[]> = {};
      for (const trigger of triggers) {
        if (!triggersByType[trigger.log_type]) {
          triggersByType[trigger.log_type] = [];
        }
        triggersByType[trigger.log_type].push(trigger);
      }

      // save every triggersByType in redis
      for (const [key, value] of Object.entries(triggersByType)) {
        await redis.set(`${redisKey}:${key}`, JSON.stringify(value), 'EX', 60 * 60 * 24);
      }

      // save list
      const trigger_types = Object.keys(triggersByType) || [];
      await redis.set(redisKey, JSON.stringify(trigger_types), 'EX', 60 * 60 * 24);

      //
      return trigger_types;
    }
  }
}

export async function generateServerUniqueID() {
  const generatedID = generateToken(10);
  const server = await index.gm_server.findFirst({
    where: {
      id: generatedID,
    },
  });
  if (server) return await generateServerUniqueID();
  return generatedID;
}

export async function getServerFromID(serverID: string) {
  const server = await index.gm_server.findFirst({
    where: {
      id: serverID,
    },
  });
  return server ? new Server(server) : null;
}

export async function getServersFromDiscordGuildID(guildID: string) {
  const servers = await index.gm_server.findMany({
    where: {
      guild: guildID,
    },
  });
  return servers.map((server) => new Server(server));
}

export async function createServer(guildID: string) {
  const serverID = await generateServerUniqueID();
  const server = await index.gm_server.create({
    data: {
      id: serverID,
      token: generateToken(16),
      guild: guildID,
    },
  });
  return new Server(server);
}

export async function statusRoutine() {
  const serversStatusChannel = await index.gm_status.findMany();

  for (const statusChannel of serversStatusChannel) {
    const server = await getServerFromID(statusChannel.server);
    if (!server) {
      await index.gm_status.delete({
        where: {
          server: statusChannel.server,
        },
      });
      continue;
    }

    const statusInfo = await index.gm_server_status.findFirst({
      where: {
        id: server.getID(),
        updatedAt: {
          gt: new Date(new Date().getTime() - 6 * 60 * 1000),
        },
      },
    });

    if (statusInfo) return;
    await server.editStatusChannelAndMessage(await server.getStatusData());
  }
}
