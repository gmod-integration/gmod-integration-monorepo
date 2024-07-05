import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.js';
import { wsSendToAllClientsOfServer } from '../../websockets/index.js';
import { discordConfig, serverConfig } from '../../config/index.js';
import { getRandomDiscordRelay } from '../../utils/tools.js';
import { EmbedBuilder } from 'discord.js';
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
      defaultValue: {},
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
  player_give: '#cdc751',
  player_spawn_object: '#68c13c',
  player_hurt: '#cd5151',
  player_initial_spawn: '#51cd51',
  player_say: '#51c3cd',
  default: '#2B2D31',
};

export async function logServer(server, type, data) {
  try {
    await ServerLogs.create({
      serverID: server.getID(),
      type,
      data,
    });
    const lang = await server.getDiscordGuild().preferredLocale;
    await wsSendToAllClientsOfServer(server.getID(), 'server_logs', { type, data });
    const relayChannelInfo = await server.getCachedLogsChannel();
    if (relayChannelInfo) {
      const { webhookID, webhookToken } = relayChannelInfo;

      const dscList = [];
      switch (type) {
        case 'player_connect':
          dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.steamID64 + '`');
          dscList.push((await getTranslate('name', lang)) + ': `' + data.name + '`');
          dscList.push(
            (await getTranslate('ip', lang)) +
              ': `' +
              ((await server.getSetting('log_hide_ip')) ? 'xx.xx.xx.xx' : data.ip) +
              '`',
          );
          break;
        case 'player_disconnect':
          dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.ply.steamID64 + '`');
          dscList.push((await getTranslate('name', lang)) + ': `' + data.ply.name + '`');
          dscList.push((await getTranslate('connectTime', lang)) + ': `' + data.ply.connectTime + '`');
          break;
        case 'player_say':
          dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.ply.steamID64 + '`');
          dscList.push((await getTranslate('name', lang)) + ': `' + data.ply.name + '`');
          dscList.push((await getTranslate('text', lang)) + ': `' + data.text + '`');
          dscList.push((await getTranslate('teamOnly', lang)) + ': `' + data.teamOnly + '`');
          break;
        case 'player_spawn':
          dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.ply.steamID64 + '`');
          dscList.push((await getTranslate('name', lang)) + ': `' + data.ply.name + '`');
          dscList.push((await getTranslate('team', lang)) + ': `' + data.ply.team.name + '`');
          break;
        case 'player_change_name':
          dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.ply.steamID64 + '`');
          dscList.push((await getTranslate('oldName', lang)) + ': `' + data.oldName + '`');
          dscList.push((await getTranslate('newName', lang)) + ': `' + data.newName + '`');
          break;
        case 'player_change_group':
          dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.ply.steamID64 + '`');
          dscList.push((await getTranslate('name', lang)) + ': `' + data.ply.name + '`');
          dscList.push((await getTranslate('oldGroup', lang)) + ': `' + data.oldGroup + '`');
          dscList.push((await getTranslate('newGroup', lang)) + ': `' + data.newGroup + '`');
          break;
        case 'player_spawn_object':
          dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.ply.steamID64 + '`');
          dscList.push((await getTranslate('name', lang)) + ': `' + data.ply.name + '`');
          dscList.push((await getTranslate('object', lang)) + ': `' + data.object + '`');
          dscList.push((await getTranslate('model', lang)) + ': `' + data.model + '`');
          break;
        case 'player_give':
          dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.ply.steamID64 + '`');
          dscList.push((await getTranslate('name', lang)) + ': `' + data.ply.name + '`');
          dscList.push((await getTranslate('weapon', lang)) + ': `' + (data.swep ? data.swep.PrintName : '') + '`');
          dscList.push(
            (await getTranslate('weaponClass', lang)) + ': `' + (data.swep ? data.swep.ClassName : '') + '`',
          );
          break;
        case 'player_death':
          dscList.push(await getTranslate('attacker', lang));
          dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.plyAttacker.steamID64 + '`');
          dscList.push((await getTranslate('name', lang)) + ': `' + data.plyAttacker.name + '`');
          dscList.push('\n');
          dscList.push(await getTranslate('victim', lang));
          dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.plyTarget.steamID64 + '`');
          dscList.push((await getTranslate('name', lang)) + ': `' + data.plyTarget.name + '`');
          break;
        case 'player_hurt':
          dscList.push((await getTranslate('attacker', lang)) + ':');
          dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.plyAttacker.steamID64 + '`');
          dscList.push((await getTranslate('name', lang)) + ': `' + data.plyAttacker.name + '`');

          dscList.push((await getTranslate('victim', lang)) + ':');
          dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.plyTarget.steamID64 + '`');
          dscList.push((await getTranslate('name', lang)) + ': `' + data.plyTarget.name + '`');

          dscList.push((await getTranslate('damage', lang)) + ': `' + data.damage + '`');
          dscList.push((await getTranslate('health', lang)) + ': `' + data.health + '`');
          break;
        case 'player_initial_spawn':
          dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.ply.steamID64 + '`');
          dscList.push((await getTranslate('name', lang)) + ': `' + data.ply.name + '`');
          break;
        default:
          if (data.steamID64) dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.steamID64 + '`');
          if (data.name) dscList.push((await getTranslate('name', lang)) + ': `' + data.name + '`');
          if (data.team && data.team.name)
            dscList.push((await getTranslate('team', lang)) + ': `' + data.team.name + '`');
          if (data.ply) {
            if (data.ply.steamID64)
              dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.ply.steamID64 + '`');
            if (data.ply.name) dscList.push((await getTranslate('name', lang)) + ': `' + data.ply.name + '`');
            if (data.ply.team && data.ply.team.name)
              dscList.push((await getTranslate('team', lang)) + ': `' + data.ply.team.name + '`');
          }
          if (data.ip) dscList.push((await getTranslate('ip', lang)) + ': `' + data.ip + '`');
          break;
      }

      const embed = new EmbedBuilder()
        .setAuthor({
          name: await getTranslate(type, lang),
          ulr: `${serverConfig.websiteUrl}/dashboard/guilds/${server.getGuildID()}/config/servers/${server.getID()}/logs`,
        })
        .setDescription(dscList.length > 0 ? dscList.join('\n') : null)
        .setColor(logEmbedColors[type] || logEmbedColors.default)
        .setFooter({
          text: server.getName(),
        })
        .setTimestamp();

      const file = {
        name: `${server.getID()}-${new Date().toISOString().replace(/T/g, '-').replace(/\..+/, '').replace(/:/g, '-')}-${type}.json`,
        content: JSON.stringify(data, null, 2),
      };

      const includeFile = await server.getSetting('log_include_file');

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
            filesToAdd: includeFile ? [file] : [],
          },
        }),
      });

      if (!webhookRelay.ok) {
        await server.destroyLogsChannel();
        return { skip: true, message: 'Webhook not found' };
      }
    }
  } catch (error) {
    console.error(error);
  }
}
