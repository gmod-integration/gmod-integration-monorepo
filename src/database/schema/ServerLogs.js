import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.js';
import { wsSendToAllClientsOfServer } from '../../websockets/index.js';
import { discordConfig, serverConfig } from '../../config/index.js';
import { getRandomDiscordRelay } from '../../utils/tools.js';
import { getClient } from '../../discord/index.js';
import { WebhookClient } from 'discord.js';

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
      const { channelID, webhookID, webhookToken } = relayChannelInfo;
      const contentTbl = [
        '   _ _   ',
        `Server: [${server.getName()}](${serverConfig.websiteUrl}/dashboard/guilds/${server.getGuildID()}/config/servers/${server.getID()})`,
        `Event: \`${type}\``,
        `Time: <t:${Math.floor(Date.now() / 1000)}:R>`,
        'Data:',
        '```json',
        JSON.stringify(data, null, 2),
        '```',
      ];
      // const content = `Server: [${server.getName()}](${serverConfig.websiteUrl}/dashboard/guilds/${server.getGuildID()}/config/servers/${server.getID()})\nEvent: ${type}\n\nData:\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;
      // const logData = {
      //   server: `${server.getName()} (${server.getID()})`,
      //   event: type,
      //   date: new Date()
      //     .toISOString()
      //     .replace('T', ' ')
      //     .replace(/\.\d{3}Z/, ''),
      //   data,
      // };
      // const content = `\`\`\`json\n${JSON.stringify(logData, null, 2)}\n\`\`\``;
      const content = contentTbl.join('\n');
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
              content,
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
            content,
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
