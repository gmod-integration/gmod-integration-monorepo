import sequelize from '../sequelize.js';
import { DataTypes, Model } from 'sequelize';
import { gmLog } from '../../utils/logger.js';
import { wsSendToAllClientsOfServer } from '../../websockets/index.js';
import { discordConfig, serverConfig } from '../../config/index.js';
import { getRandomDiscordRelay, ipGetIP } from '../../utils/tools.js';
import { EmbedBuilder } from 'discord.js';
import { getTranslate } from '../../utils/localizations.js';
import { PlayerGmod } from '../../classes/v3/PlayerGmod.js';

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
    playerInvolvedSteamID64: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
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
  server_start: '#7c15d5',
  server_stop: '#7c15d5',
};

export async function logServer(server, type, data) {
  data = data || {};
  try {
    if (data.player) data.player = new PlayerGmod(data.player);
  } catch (error) {
    //
  }
  try {
    const playerInvolvedSteamID64 = [];
    // parse the data to get every steamID64 (start with 7656119 and have 17 characters)
    const dataString = JSON.stringify(data);
    const regex = /7656119\d{10}/g;
    let match;
    while ((match = regex.exec(dataString))) {
      if (!playerInvolvedSteamID64.includes(match[0])) playerInvolvedSteamID64.push(match[0]);
    }

    let dataToSave = {};
    if (data.player) dataToSave.ply = data.player;

    const lang = await server.getDiscordGuild().preferredLocale;
    const relayChannelInfo = await server.getCachedLogsChannel();
    if (relayChannelInfo) {
      const { webhookID, webhookToken } = relayChannelInfo;

      const dscList = [];
      if (type === 'player_connect') {
        const name = data.name || 'Unknown';
        dataToSave.name = name;
        const address = ipGetIP(data.address || 'Unknown');
        dataToSave.ip = address;
        dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.steamID64 + '`');
        dscList.push((await getTranslate('name', lang)) + ': `' + name + '`');
        dscList.push(
          (await getTranslate('ip', lang)) +
            ': `' +
            ((await server.getSetting('log_hide_ip')) ? 'xx.xx.xx.xx' : address) +
            '`',
        );
      } else if (type === 'player_disconnect') {
        dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.player.steamID64 + '`');
        dscList.push((await getTranslate('name', lang)) + ': `' + data.player.name + '`');
        dscList.push((await getTranslate('connectTime', lang)) + ': `' + data.player.connectTime + '`');
      } else if (type === 'player_say') {
        const text = data.text || 'Unknown';
        dataToSave.text = text;
        const teamOnly = data.teamOnly || false;
        dataToSave.teamOnly = teamOnly;
        dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.player.steamID64 + '`');
        dscList.push((await getTranslate('name', lang)) + ': `' + data.player.name + '`');
        dscList.push((await getTranslate('text', lang)) + ': `' + text + '`');
        dscList.push((await getTranslate('teamOnly', lang)) + ': `' + teamOnly + '`');
      } else if (type === 'player_spawn') {
        dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.player.steamID64 + '`');
        dscList.push((await getTranslate('name', lang)) + ': `' + data.player.name + '`');
        dscList.push((await getTranslate('team', lang)) + ': `' + data.player.team.name + '`');
      } else if (type === 'player_change_name') {
        const oldName = data.oldName || 'Unknown';
        dataToSave.oldName = oldName;
        const newName = data.newName || 'Unknown';
        dataToSave.newName = newName;
        dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.player.steamID64 + '`');
        dscList.push((await getTranslate('oldName', lang)) + ': `' + oldName + '`');
        dscList.push((await getTranslate('newName', lang)) + ': `' + newName + '`');
      } else if (type === 'player_change_group') {
        const oldGroup = data.oldGroup || 'Unknown';
        dataToSave.oldGroup = oldGroup;
        const newGroup = data.newGroup || 'Unknown';
        dataToSave.newGroup = newGroup;
        dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.player.steamID64 + '`');
        dscList.push((await getTranslate('name', lang)) + ': `' + data.player.name + '`');
        dscList.push((await getTranslate('oldGroup', lang)) + ': `' + oldGroup + '`');
        dscList.push((await getTranslate('newGroup', lang)) + ': `' + newGroup + '`');
      } else if (type === 'player_spawn_object') {
        const model = data.model || 'Unknown';
        dataToSave.model = model;
        const object = data.object || 'Unknown';
        dataToSave.object = object;
        const entity = data.entity || 'Unknown';
        dataToSave.entity = entity;
        dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.player.steamID64 + '`');
        dscList.push((await getTranslate('name', lang)) + ': `' + data.player.name + '`');
        dscList.push((await getTranslate('object', lang)) + ': `' + object + '`');
        if (object === 'object') {
          dscList.push((await getTranslate('model', lang)) + ': `' + model + '`');
        } else {
          dscList.push((await getTranslate('entity', lang)) + ': `' + entity.class + '`');
        }
      } else if (type === 'player_warned') {
        const admin = new PlayerGmod(data.admin);
        dataToSave.admin = admin;
        const reason = data.reason || 'Unknown';
        dataToSave.reason = reason;
        dscList.push((await getTranslate('admin', lang)) + ':');
        dscList.push((await getTranslate('steamID64', lang)) + ': `' + admin.steamID64 + '`');
        dscList.push((await getTranslate('name', lang)) + ': `' + admin.name + '`');
        dscList.push((await getTranslate('reason', lang)) + ': `' + reason + '`');
        dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.player.steamID64 + '`');
        dscList.push((await getTranslate('name', lang)) + ': `' + data.player.name + '`');
      } else if (type === 'player_give') {
        const swep = data.swep || {};
        dataToSave.wep_class = swep.ClassName || '';
        dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.player.steamID64 + '`');
        dscList.push((await getTranslate('name', lang)) + ': `' + data.player.name + '`');
        dscList.push((await getTranslate('weapon', lang)) + ': `' + (swep.PrintName || '') + '`');
        dscList.push((await getTranslate('weaponClass', lang)) + ': `' + (swep.ClassName || '') + '`');
      } else if (type === 'server_start' || type === 'server_stop') {
        //
      } else if (type === 'player_death') {
        const attacker = new PlayerGmod(data.attacker);
        dataToSave = {};
        dataToSave.plyTarget = data.player;
        dataToSave.plyAttacker = attacker;
        dscList.push(await getTranslate('attacker', lang));
        dscList.push((await getTranslate('steamID64', lang)) + ': `' + attacker.steamID64 + '`');
        dscList.push((await getTranslate('name', lang)) + ': `' + attacker.name + '`');
        dscList.push('\n');
        dscList.push(await getTranslate('victim', lang));
        dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.player.steamID64 + '`');
        dscList.push((await getTranslate('name', lang)) + ': `' + data.player.name + '`');
      } else if (type === 'player_hurt') {
        const victim = new PlayerGmod(data.victim);
        dataToSave.ply = victim;
        const attacker = new PlayerGmod(data.attacker);
        dataToSave.attacker = attacker;
        const healthRemaining = data.healthRemaining || 0;
        dataToSave.healthRemaining = healthRemaining;
        const damageTaken = data.damageTaken || 0;
        dataToSave.damage = damageTaken;
        dscList.push(await getTranslate('attacker', lang));
        dscList.push((await getTranslate('steamID64', lang)) + ': `' + attacker.steamID64 + '`');
        dscList.push((await getTranslate('name', lang)) + ': `' + attacker.name + '`');
        dscList.push('\n');
        dscList.push(await getTranslate('victim', lang));
        dscList.push((await getTranslate('steamID64', lang)) + ': `' + victim.steamID64 + '`');
        dscList.push((await getTranslate('name', lang)) + ': `' + victim.name + '`');

        dscList.push((await getTranslate('damage', lang)) + ': `' + damageTaken + '`');
        dscList.push((await getTranslate('health', lang)) + ': `' + healthRemaining + '`');
      } else if (type === 'player_initial_spawn') {
        dataToSave = {};
        dataToSave.ply = data.player;
        dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.player.steamID64 + '`');
        dscList.push((await getTranslate('name', lang)) + ': `' + data.player.name + '`');
      } else {
        if (data.steamID64) dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.steamID64 + '`');
        if (data.name) dscList.push((await getTranslate('name', lang)) + ': `' + data.name + '`');
        if (data.team && data.team.name)
          dscList.push((await getTranslate('team', lang)) + ': `' + data.team.name + '`');
        if (data.player) {
          if (data.player.steamID64)
            dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.player.steamID64 + '`');
          if (data.player.name) dscList.push((await getTranslate('name', lang)) + ': `' + data.player.name + '`');
          if (data.player.team && data.player.team.name)
            dscList.push((await getTranslate('team', lang)) + ': `' + data.player.team.name + '`');
        }
        if (data.ip) dscList.push((await getTranslate('ip', lang)) + ': `' + data.ip + '`');
        dataToSave = data;
      }

      await ServerLogs.create({
        serverID: server.getID(),
        type,
        data: dataToSave,
        playerInvolvedSteamID64,
      });
      await wsSendToAllClientsOfServer(server.getID(), 'server_logs', { type, data: dataToSave });

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
