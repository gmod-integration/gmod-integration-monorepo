import { discordConfig, serverConfig } from '../config/index.js';
import { PlayerGmod } from '../classes/v3/PlayerGmod.js';
import { getRandomDiscordRelay, ipGetIP } from './tools.js';
import { getTranslate } from './localizations.js';
import { wsSendToAllClientsOfServer } from '../websockets/index.js';
import { ChannelType, ColorResolvable, EmbedBuilder } from 'discord.js';
import { Server } from '../classes/v3/Server.js';
import { addLog } from '../database/gm_server_logs.js';
import redis from '../redis/index.js';
import { gm_server_logs_triggers } from '@prisma/client';

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
  player_change_team: '#cd51bc',
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
  dark_rp_drop_money: '#c7c751',
  dark_rp_picked_up_money: '#c7c751',
  dark_rp_picked_up_cheque: '#c7c751',
  ch_atm_send_money: '#adc751',
  ch_atm_receive_money: '#adc751',
  ch_atm_take_money: '#adc751',
  ch_atm_withdraw_money: '#adc751',
  ch_atm_deposit_money: '#adc751',
  player_warned: '#9d2929',
  player_ban: '#9d2929',
  player_unban: '#9d2929',
  player_kick: '#9d2929',
};

const log_trigger_operator: Record<string, string> = {
  greaterThan: 'greaterThan',
  lessThan: 'lessThan',
  equal: 'equal',
  notEqual: 'notEqual',
  contain: 'contain',
  notContain: 'notContain',
  startWith: 'startWith',
  endWith: 'endWith',
};

const log_trigger_action: Record<string, string> = {
  sendMessageInChannel: 'sendMessageInChannel',
};

interface log_trigger_compare {
  [key: string]: {
    type: string;
    id: string;
  };
}

const log_trigger_compare: Record<string, log_trigger_compare> = {
  dark_rp_drop_money: {
    amount: {
      type: 'number',
      id: 'amount',
    },
  },
  dark_rp_picked_up_money: {
    amount: {
      type: 'number',
      id: 'amount',
    },
  },
  dark_rp_picked_up_cheque: {
    amount: {
      type: 'number',
      id: 'amount',
    },
  },
  ch_atm_send_money: {
    amount: {
      type: 'number',
      id: 'amount',
    },
  },
  ch_atm_receive_money: {
    amount: {
      type: 'number',
      id: 'amount',
    },
  },
  ch_atm_take_money: {
    amount: {
      type: 'number',
      id: 'amount',
    },
  },
  ch_atm_withdraw_money: {
    amount: {
      type: 'number',
      id: 'amount',
    },
  },
  ch_atm_deposit_money: {
    amount: {
      type: 'number',
      id: 'amount',
    },
  },
};

/*
structure example:
data: {
  "data": {
    "ply": {
      "steamID": "STEAM_0:1:129391972",
      "steamID64": "76561198219049673",
      "connectTime": 2419,
      "kills": 0,
      "customValues": {
        "job": "Citizen",
        "money": 999997530,
        "bank": 300
      },
      "deaths": 0,
      "team": {
        "id": 1,
        "name": "Citizen"
      },
      "name": "Linventif",
      "userGroup": "superadmin",
      "position": {
        "x": 695,
        "y": 288,
        "z": -143
      },
      "angle": {
        "p": 19,
        "y": -149,
        "r": 0
      },
      "fps": 15,
      "ping": 14,
      "adjustedTime": 0,
      "branch": "unknown",
      "timeLastTeamChange": 2421
    },
    "amount": 1000,
    "player": {
      "steamID": "STEAM_0:1:129391972",
      "steamID64": "76561198219049673",
      "connectTime": 2419,
      "kills": 0,
      "customValues": {
        "job": "Citizen",
        "money": 999997530,
        "bank": 300
      },
      "deaths": 0,
      "team": {
        "id": 1,
        "name": "Citizen"
      },
      "name": "Linventif",
      "userGroup": "superadmin",
      "position": {
        "x": 695,
        "y": 288,
        "z": -143
      },
      "angle": {
        "p": 19,
        "y": -149,
        "r": 0
      },
      "fps": 15,
      "ping": 14,
      "adjustedTime": 0,
      "branch": "unknown",
      "timeLastTeamChange": 2421
    },
    "entity": {
      "angle": {
        "y": 31,
        "r": 0,
        "p": 0
      },
      "model": "models/props/cs_assault/money.mdl",
      "position": {
        "y": 247,
        "x": 627,
        "z": -107
      },
      "class": "spawned_money"
    }
  },
  "category": "dark_rp_drop_money",
  "createAt": "2025-05-20T01:04:42.872Z"
}
 */

async function handleLogsTrigger(server: Server, type: string, data?: any) {
  const availableTriggers = await server.getLogsTriggerFromRedis();
  if (!availableTriggers || availableTriggers.length === 0 || !availableTriggers.includes(type)) return;
  const redisKey = `server:${server.id}:logsTrigger:${type}`;
  const triggers = (await redis.get(redisKey)) || '[]';
  const triggerList: gm_server_logs_triggers[] = JSON.parse(triggers);
  for (const trigger of triggerList) {
    if (!trigger) continue;

    const typeInfo = log_trigger_compare[type];
    if (!typeInfo) continue;

    const correctValueType = typeInfo[trigger.compare];
    if (!correctValueType) continue;

    let newValue;
    let compareValue;
    if (correctValueType.type === 'number') {
      newValue = parseFloat(data[trigger.compare]);
      compareValue = parseFloat(trigger.value);
    } else {
      newValue = data[trigger.compare];
      compareValue = trigger.value;
    }

    if (newValue === undefined || compareValue === undefined) continue;
    if (trigger.operator === log_trigger_operator.greaterThan && newValue <= compareValue) continue;
    if (trigger.operator === log_trigger_operator.lessThan && newValue >= compareValue) continue;
    if (trigger.operator === log_trigger_operator.equal && newValue !== compareValue) continue;
    if (trigger.operator === log_trigger_operator.notEqual && newValue === compareValue) continue;
    if (trigger.operator === log_trigger_operator.contain && !newValue.includes(compareValue)) continue;
    if (trigger.operator === log_trigger_operator.notContain && newValue.includes(compareValue)) continue;
    if (trigger.operator === log_trigger_operator.startWith && !newValue.startsWith(compareValue)) continue;
    if (trigger.operator === log_trigger_operator.endWith && !newValue.endsWith(compareValue)) continue;

    if (trigger.action === log_trigger_action.sendMessageInChannel) {
      const client = await server.getBotInstance();
      if (!client) continue;

      const channel = client.channels.cache.get(trigger.channelID);
      if (!channel || channel.type !== ChannelType.GuildText) continue;

      let message = trigger.message;
      // remplace every {{path.to.value}} by the value of the data
      // 1# get all regex
      const regex = /{{data\.(.*?)}}/g;
      const matches = message.match(regex);
      if (matches) {
        for (const match of matches) {
          // remove {{ and }}
          const path = match.replace(/{{data\./, '').replace(/}}/, '');
          const pathArray = path.split('.');
          // get the value of the data
          let value = data;
          for (const key of pathArray) {
            if (value[key] !== undefined) {
              value = value[key];
            } else {
              value = null;
              break;
            }
          }
          if (value !== null) {
            message = message.replace(match, value);
          } else {
            message = message.replace(match, 'undefined');
          }
        }
      }

      const embed = new EmbedBuilder().setColor(logEmbedColors[type] || logEmbedColors.default).setDescription(message);

      // send the message
      await channel.send({
        embeds: [embed],
      });
    }
  }
}

export async function logServer(server: Server, type: string, data?: any) {
  data = data || {};
  try {
    if (data.player) data.player = new PlayerGmod(data.player);
  } catch (error) {
    //
  }

  handleLogsTrigger(server, type, data).catch(() => {});

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
    dataToSave.ply = data.player;
    // TODO: INSPECT: .name is new or old name ?
    dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.player.steamID64 + '`');
    dscList.push((await getTranslate('oldName', lang)) + ': `' + oldName + '`');
    dscList.push((await getTranslate('newName', lang)) + ': `' + newName + '`');
  } else if (type === 'player_change_group') {
    const oldGroup = data.oldGroup || 'Unknown';
    dataToSave.oldGroup = oldGroup;
    const newGroup = data.newGroup || 'Unknown';
    dataToSave.newGroup = newGroup;
    dataToSave.ply = data.player;
    dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.steamID64 + '`');
    dscList.push((await getTranslate('oldGroup', lang)) + ': `' + oldGroup + '`');
    dscList.push((await getTranslate('newGroup', lang)) + ': `' + newGroup + '`');
  } else if (type === 'player_change_team') {
    const oldTeam = data.oldTeam?.name || 'Unknown';
    dataToSave.oldTeam = oldTeam;
    const newTeam = data.newTeam?.name || 'Unknown';
    dataToSave.newTeam = newTeam;
    dataToSave.ply = data.player;
    dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.steamID64 + '`');
    dscList.push((await getTranslate('oldTeam', lang)) + ': `' + oldTeam + '`');
    dscList.push((await getTranslate('newTeam', lang)) + ': `' + newTeam + '`');
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
    dscList.push('\n');
    dscList.push((await getTranslate('player', lang)) + ':');
    dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.player.steamID64 + '`');
    dscList.push((await getTranslate('name', lang)) + ': `' + data.player.name + '`');
    dscList.push('\n');
    dscList.push((await getTranslate('reason', lang)) + ': `' + reason + '`');
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
    /*

  dark_rp_drop_money: '#c7c751',
  dark_rp_picked_up_money: '#c7c751',
  dark_rp_picked_up_cheque: '#c7c751',
  ch_atm_send_money: '#adc751',
  ch_atm_receive_money: '#adc751',
  ch_atm_take_money: '#adc751',
  ch_atm_withdraw_money: '#adc751',
  ch_atm_deposit_money: '#adc751',
     */
  } else if (type === 'dark_rp_drop_money') {
    const amount = data.amount || 0;
    /*
    player: ply,
    amount: Math.round(amount),
    entity,
     */
    dataToSave.amount = amount;
    dataToSave.player = data.player;
    dataToSave.entity = data.entity;
    dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.player.steamID64 + '`');
    dscList.push((await getTranslate('name', lang)) + ': `' + data.player.name + '`');
    dscList.push((await getTranslate('amount', lang)) + ': `' + amount + '`');
  } else if (type === 'dark_rp_picked_up_money') {
    /*
    player: ply,
    amount: Math.round(amount),
    entity,
     */
    const amount = data.amount || 0;
    dataToSave.amount = amount;
    dataToSave.entity = data.entity;
    dataToSave.player = data.player;
    dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.player.steamID64 + '`');
    dscList.push((await getTranslate('name', lang)) + ': `' + data.player.name + '`');
    dscList.push((await getTranslate('amount', lang)) + ': `' + amount + '`');
  } else if (type === 'dark_rp_picked_up_cheque') {
    /*
     playerChequeWriter: plyWriter,
    playerChequeTarget: plyTarget,
    amount: Math.round(amount),
    entity,
     */
    const amount = data.amount || 0;
    dataToSave.amount = amount;
    dataToSave.playerChequeWriter = data.playerChequeWriter;
    dataToSave.playerChequeTarget = data.playerChequeTarget;
    dataToSave.entity = data.entity;
    dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.playerChequeWriter.steamID64 + '`');
    dscList.push((await getTranslate('name', lang)) + ': `' + data.playerChequeWriter.name + '`');
    dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.playerChequeTarget.steamID64 + '`');
    dscList.push((await getTranslate('name', lang)) + ': `' + data.playerChequeTarget.name + '`');
    dscList.push((await getTranslate('amount', lang)) + ': `' + amount + '`');
  } else if (type === 'ch_atm_send_money') {
    /*
    player: ply,
    receiver: plyTarget,
    amount: Math.round(amount),
     */
    const amount = data.amount || 0;
    dataToSave.amount = amount;
    dataToSave.receiver = data.receiver;
    dataToSave.player = data.player;
    dscList.push((await getTranslate('amount', lang)) + ': `' + amount + '`');
    dscList.push('\n');
    dscList.push((await getTranslate('sender', lang)) + ':');
    dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.player.steamID64 + '`');
    dscList.push((await getTranslate('name', lang)) + ': `' + data.player.name + '`');
    dscList.push('\n');
    dscList.push((await getTranslate('receiver', lang)) + ':');
    dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.receiver.steamID64 + '`');
    dscList.push((await getTranslate('name', lang)) + ': `' + data.receiver.name + '`');
  } else if (type === 'ch_atm_receive_money') {
    /*
    player: ply,
    amount: Math.round(amount),
    reason,
     */
    const amount = data.amount || 0;
    dataToSave.amount = amount;
    dataToSave.reason = data.reason;
    dataToSave.player = data.player;
    dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.player.steamID64 + '`');
    dscList.push((await getTranslate('name', lang)) + ': `' + data.player.name + '`');
    dscList.push((await getTranslate('amount', lang)) + ': `' + amount + '`');
    dscList.push((await getTranslate('reason', lang)) + ': `' + data.reason + '`');
  } else if (type === 'ch_atm_take_money') {
    /*
    player: ply,
    amount: Math.round(amount),
    reason,
     */
    const amount = data.amount || 0;
    dataToSave.amount = amount;
    dataToSave.reason = data.reason;
    dataToSave.player = data.player;
    dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.player.steamID64 + '`');
    dscList.push((await getTranslate('name', lang)) + ': `' + data.player.name + '`');
    dscList.push((await getTranslate('amount', lang)) + ': `' + amount + '`');
    dscList.push((await getTranslate('reason', lang)) + ': `' + data.reason + '`');
  } else if (type === 'ch_atm_withdraw_money') {
    /*
    player: ply,
    amount: Math.round(amount),
     */
    const amount = data.amount || 0;
    dataToSave.amount = amount;
    dataToSave.player = data.player;
    dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.player.steamID64 + '`');
    dscList.push((await getTranslate('name', lang)) + ': `' + data.player.name + '`');
    dscList.push((await getTranslate('amount', lang)) + ': `' + amount + '`');
  } else if (type === 'ch_atm_deposit_money') {
    /*
    player: ply,
    amount: Math.round(amount),
     */
    const amount = data.amount || 0;
    dataToSave.amount = amount;
    dataToSave.player = data.player;
    dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.player.steamID64 + '`');
    dscList.push((await getTranslate('name', lang)) + ': `' + data.player.name + '`');
    dscList.push((await getTranslate('amount', lang)) + ': `' + amount + '`');
  } else {
    dataToSave = data;
    if (data.steamID64) dscList.push((await getTranslate('steamID64', lang)) + ': `' + data.steamID64 + '`');
    if (data.name) dscList.push((await getTranslate('name', lang)) + ': `' + data.name + '`');
    if (data.team && data.team.name) dscList.push((await getTranslate('team', lang)) + ': `' + data.team.name + '`');
    if (data.player) {
      dataToSave.ply = data.player;
      delete dataToSave.player;
      if (dataToSave.ply.steamID64)
        dscList.push((await getTranslate('steamID64', lang)) + ': `' + dataToSave.ply.steamID64 + '`');
      if (dataToSave.ply.name) dscList.push((await getTranslate('name', lang)) + ': `' + dataToSave.ply.name + '`');
      if (dataToSave.ply.team && dataToSave.ply.team.name)
        dscList.push((await getTranslate('team', lang)) + ': `' + dataToSave.ply.team.name + '`');
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
