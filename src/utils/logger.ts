import { discordConfig, serverConfig } from '../config/index.js';
import { PlayerGmod } from '../classes/v3/PlayerGmod.js';
import { getRandomDiscordRelay, ipGetIP } from './tools.js';
import { getTranslate } from './localizations.js';
import { wsSendToAllClientsOfServer } from '../websockets/index.js';
import { ColorResolvable, EmbedBuilder } from 'discord.js';
import { Server } from '../classes/v3/Server.js';
import { addLog } from '../database/gm_server_logs.js';

export enum LogLevel {
  MINIMAL = 'minimal',
  NORMAL = 'normal',
  VERBOSE = 'verbose',
  ALL = 'all',
  CUSTOM = 'custom',
}

export function gmLog(type: string, message: string, debug: boolean = false) {
  if (debug && !serverConfig.dev) return;
  console.log(`[${new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '')}] [${type.toUpperCase()}] ${message}`);
}

const logEmbedColors: Record<string, ColorResolvable> = {
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

export async function logServer(server: Server, type: string, data?: any) {
  data = data || {};
  try {
    if (data.player) data.player = new PlayerGmod(data.player);
  } catch (error) {
    //
  }

  const playerInvolvedSteamID64: any = [];
  const dataString = JSON.stringify(data);
  const regex = /7656119\d{10}/g;
  let match;
  while ((match = regex.exec(dataString))) {
    if (!playerInvolvedSteamID64.includes(match[0])) playerInvolvedSteamID64.push(match[0]);
  }

  let dataToSave: any = {};
  if (data.player) dataToSave.ply = data.player;

  const guild = await server.getDiscordGuild();
  const lang = guild.preferredLocale;
  const relayChannelInfo = await server.getCachedLogsChannel();

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
    dscList.push(await data.player.getLogFormat(lang));
    dscList.push((await getTranslate('text', lang)) + ': `' + text + '`');
    dscList.push((await getTranslate('teamOnly', lang)) + ': `' + teamOnly + '`');
  } else if (type === 'player_spawn') {
    dscList.push(await data.player.getLogFormat(lang), LogLevel.NORMAL);
  } else if (type === 'player_change_name') {
    const oldName = data.oldName || 'Unknown';
    dataToSave.oldName = oldName;
    const newName = data.newName || 'Unknown';
    dataToSave.newName = newName;
    // TODO: INSPECT: .name is new or old name ?
    dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.player.steamID64 + '`');
    dscList.push((await getTranslate('oldName', lang)) + ': `' + oldName + '`');
    dscList.push((await getTranslate('newName', lang)) + ': `' + newName + '`');
  } else if (type === 'player_change_group') {
    const oldGroup = data.oldGroup || 'Unknown';
    dataToSave.oldGroup = oldGroup;
    const newGroup = data.newGroup || 'Unknown';
    dataToSave.newGroup = newGroup;
    dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.steamID64 + '`');
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
    try {
      const attacker = new PlayerGmod(data.attacker);
      dataToSave.attacker = attacker;
      dscList.push((await getTranslate('steamID64', lang)) + ': `' + attacker.steamID64 + '`');
      dscList.push((await getTranslate('name', lang)) + ': `' + attacker.name + '`');
    } catch (error) {
      dataToSave.attacker = data.attacker;
      dscList.push((await getTranslate('entity', lang)) + ': `' + data.attacker.class + '`');
    }
    dscList.push('\n');
    dscList.push(await getTranslate('victim', lang));
    dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.player.steamID64 + '`');
    dscList.push((await getTranslate('name', lang)) + ': `' + data.player.name + '`');
  } else if (type === 'player_hurt') {
    const victim = new PlayerGmod(data.victim);
    dataToSave.ply = victim;
    const healthRemaining = data.healthRemaining || 0;
    dataToSave.healthRemaining = healthRemaining;
    const damageTaken = data.damageTaken || 0;
    dataToSave.damage = damageTaken;
    dscList.push(await getTranslate('attacker', lang));
    try {
      const attacker = new PlayerGmod(data.attacker);
      dataToSave.attacker = attacker;
      dscList.push((await getTranslate('steamID64', lang)) + ': `' + attacker.steamID64 + '`');
      dscList.push((await getTranslate('name', lang)) + ': `' + attacker.name + '`');
    } catch (error) {
      dataToSave.attacker = data.attacker;
      dscList.push((await getTranslate('entity', lang)) + ': `' + data.attacker.class + '`');
    }
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
    dataToSave = data;
    if (data.steamID64) dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.steamID64 + '`');
    if (data.name) dscList.push((await getTranslate('name', lang)) + ': `' + data.name + '`');
    if (data.team && data.team.name) dscList.push((await getTranslate('team', lang)) + ': `' + data.team.name + '`');
    if (data.player) {
      dataToSave.ply = data.player;
      delete dataToSave.player;
      if (data.player.steamID64)
        dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.player.steamID64 + '`');
      if (data.player.name) dscList.push((await getTranslate('name', lang)) + ': `' + data.player.name + '`');
      if (data.player.team && data.player.team.name)
        dscList.push((await getTranslate('team', lang)) + ': `' + data.player.team.name + '`');
    }
    if (data.ip) dscList.push((await getTranslate('ip', lang)) + ': `' + data.ip + '`');
  }

  await addLog({
    serverID: server.getID(),
    type,
    data: dataToSave,
    playerInvolvedSteamID64: playerInvolvedSteamID64,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  wsSendToAllClientsOfServer(server.getID(), 'server_logs', { type, data: dataToSave });

  if (relayChannelInfo) {
    const { webhookID, webhookToken } = relayChannelInfo;

    const embed = new EmbedBuilder()
      .setAuthor({
        name: await getTranslate(type, lang),
        // url: `${serverConfig.websiteUrl}/dashboard/guilds/${server.getGuildID()}/config/servers/${server.getID()}/logs`,
      })
      .setDescription(dscList.length > 0 ? dscList.join('\n') : null)
      .setColor(logEmbedColors[type] || logEmbedColors.default)
      .setFooter({
        text: server.getName(),
      })
      .setTimestamp();

    if (data.address && (await server.getSetting('log_hide_ip'))) data.address = 'xx.xx.xx.xx';
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
      // await server.destroyLogsChannel(); TODO better handling of this
      return { skip: true, message: 'Webhook not found' };
    }
  }
}
