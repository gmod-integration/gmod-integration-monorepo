import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.js';
import { wsSendToAllClientsOfServer } from '../../websockets/index.js';
import { discordConfig, serverConfig } from '../../config/index.js';
import { getRandomDiscordRelay } from '../../utils/tools.js';
import { getClient } from '../../discord/index.js';
import { AttachmentBuilder, EmbedBuilder, WebhookClient } from 'discord.js';
import { getTranslate } from '../../utils/localizations.js';

class ServerLogs extends Model {}

ServerLogs.init(
  {
    serverID: {
      type: DataTypes.STRING,
      allowNull: false,
      references: {
        model: 'gm_server',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    data: {
      type: DataTypes.JSON,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'gm_server_logs',
    tableName: 'gm_server_logs',
    timestamps: true,
  },
);

ServerLogs.sync({ alter: true })
  .then(() => {
    gmLog('sequelize', 'Table created: ServerLogs');
  })
  .catch((error) => {
    console.error('Error creating link table:', error);
  });

export default ServerLogs;

const logEmbedColors = {
  player_connect: '#cd8f51',
  player_disconnect: '#cd8f51',
  player_death: '#cd5151',
  player_spawn: '#51cd51',
  player_ready: '#51cd51',
  player_change_group: '#cd51bc',
  player_change_name: '#cd51bc',
  player_say: '#51c3cd',
  default: '#2B2D31',
};

const logInfo = {
  steamID64: 'SteamID64',
  name: 'Name',
  ip: 'IP',
  connectTime: 'Connect Time',
  oldGroup: 'Old Group',
  newGroup: 'New Group',
  ply: 'Player',
};

function getStringFromType(id, value) {
  return logInfo[id] ? `${logInfo[id]}: \`${value}\`` : `${id}: \`${value}\``;
}

export async function logServer(server, type, data) {
  try {
    await ServerLogs.create({
      serverID: server.getID(),
      type,
      data,
    });
    await wsSendToAllClientsOfServer(server.getID(), 'server_logs', { type, data });
    const relayChannelInfo = await server.getCachedLogsChannel();
    if (relayChannelInfo) {
      const { webhookID, webhookToken } = relayChannelInfo;

      const dscList = [];
      switch (type) {
        case 'player_connect':
          dscList.push(getStringFromType('steamID64', data.steamID64));
          dscList.push(getStringFromType('name', data.name));
          dscList.push(getStringFromType('ip', data.ip));
          break;
        case 'player_disconnect':
          dscList.push(getStringFromType('steamID64', data.ply.steamID64));
          dscList.push(getStringFromType('name', data.ply.name));
          dscList.push(getStringFromType('connectTime', data.ply.connectTime));
          break;
        default:
          if (data.steamID64) dscList.push(`SteamID64: \`${data.steamID64}\``);
          if (data.name) dscList.push(`Name: \`${data.name}\``);
          if (data.ply) {
            if (data.ply.steamID64) dscList.push(`SteamID64: \`${data.ply.steamID64}\``);
            if (data.ply.name) dscList.push(`Name: \`${data.ply.name}\``);
          }
          if (data.ip) dscList.push(`IP: \`${data.ip}\``);
          break;
      }

      const embed = new EmbedBuilder()
        .setAuthor({
          name: await getTranslate(type, server.getDiscordGuild().preferredLocale),
          ulr: `${serverConfig.websiteUrl}/dashboard/guilds/${server.getGuildID()}/config/servers/${server.getID()}/logs`,
        })
        .setDescription(dscList.length > 0 ? dscList.join('\n') : null)
        .setColor(logEmbedColors[type] || logEmbedColors.default)
        .setFooter({
          text: server.getName(),
        })
        .setTimestamp();

      const file = new AttachmentBuilder(Buffer.from(JSON.stringify(data, null, 2), 'utf-8'), {
        name: `${server.getID()}-${new Date().toISOString()}-{type}.json`,
      });

      const includeFile = await server.getSetting('log_include_file');

      if (serverConfig.production === 'true') {
        const webhookRelay = await fetch(getRandomDiscordRelay(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + discordConfig.barerTokenRelay,
          },
          body: JSON.stringify({
            webhookID,
            webhookToken,
            data: {
              username: 'Gmod Integration - Server Logs',
              avatarURL: 'https://cdn.discordapp.com/avatars/1110121451501129758/cb1253ac05209638f77480643bf58b37.webp',
              embeds: [embed],
              files: includeFile ? [file] : [],
            },
          }),
        });

        if (!webhookRelay.ok) {
          return { skip: true, message: 'Webhook not found' };
        }
      } else {
        const dscClient = await getClient();

        try {
          const webhook = await dscClient.fetchWebhook(webhookID, webhookToken);
          const webhookClient = new WebhookClient({ id: webhook.id, token: webhook.token });
          await webhookClient.send({
            username: 'Gmod Integration - Server Logs',
            avatarURL: 'https://cdn.discordapp.com/avatars/1110121451501129758/cb1253ac05209638f77480643bf58b37.webp',
            embeds: [embed],
            files: includeFile ? [file] : [],
          });
        } catch (err) {
          console.error(err);
          return { skip: true, message: 'Webhook not found' };
        }
      }
    }
  } catch (error) {
    console.error(error);
  }
}
