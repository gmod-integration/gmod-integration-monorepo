import { getSteamUserAvatarLarge } from '../../steam/index.js';
import gm_user_steam from '../../database/schema/gm_user_steam.js';
import { getRandomDiscordRelay } from '../../utils/tools.js';
import { discordConfig } from '../../config/index.js';
import Users from '../../database/schema/Users.js';
import { isGuildPremium } from '../../classes/v3/Guild.js';

export async function sendPlayerSay(server, player, text, onlyTeam) {
  let anonymous = false;

  player.name.replace(/[^\x00-\x7F]/g, '');
  text.replace(/[^\x00-\x7F]/g, '');

  if (!(await isGuildPremium(server.getGuildID()))) {
    return { skip: true, message: 'Server is not premium' };
  }

  const syncChatChannel = await server.getSyncChatChannel();
  if (!syncChatChannel) {
    return { skip: true, message: 'Sync chat channel not found or not set' };
  }

  const syncChatDirection = await server.getSetting('syncChatDirection');
  if (syncChatDirection !== 'both' && syncChatDirection !== 'gmodToDiscord') {
    return { skip: true, message: 'Sync chat direction is discord to gmod' };
  }

  if (!text || text === '') {
    return { skip: true, message: 'No message' };
  }

  const possibleFields = ['steamID64', 'userGroup', 'teamName', 'message'];
  const operator = ['equal', 'notEqual', 'contain', 'notContain', 'startWith', 'endWith'];
  const action = ['relay', 'block', 'anonymize'];

  let relayMessage = await server.getSetting('chat_sync_relay_all');
  let outputStr = '';

  function executeAction(action) {
    switch (action) {
      case 'relay':
        relayMessage = true;
        break;
      case 'block':
        relayMessage = false;
        break;
      case 'anonymize':
        player.name = 'Anonymous';
        relayMessage = true;
        anonymous = true;
        break;
    }
  }

  function getCorrectValue(element) {
    switch (element) {
      case 'steamID64':
        return player.steamID64;
      case 'userGroup':
        return player.userGroup;
      case 'teamName':
        return player.team.name;
      case 'message':
        return text;
    }
  }

  function verifyRule(rule) {
    if (!rule.active) return;
    if (!possibleFields.includes(rule.element)) return;
    if (!operator.includes(rule.operator)) return;
    if (!action.includes(rule.action)) return;
    if (rule.trigger === '') return;
    switch (rule.operator) {
      case 'equal':
        if (getCorrectValue(rule.element) === rule.trigger) {
          executeAction(rule.action);
        }
        break;
      case 'notEqual':
        if (getCorrectValue(rule.element) !== rule.trigger) {
          executeAction(rule.action);
        }
        break;
      case 'contain':
        if (getCorrectValue(rule.element).includes(rule.trigger)) {
          executeAction(rule.action);
        }
        break;
      case 'notContain':
        if (!getCorrectValue(rule.element).includes(rule.trigger)) {
          executeAction(rule.action);
        }
        break;
      case 'startWith':
        if (getCorrectValue(rule.element).startsWith(rule.trigger)) {
          outputStr = text.substring(rule.trigger.length);
          executeAction(rule.action);
        }
        break;
      case 'endWith':
        if (getCorrectValue(rule.element).endsWith(rule.trigger)) {
          outputStr = text.substring(0, text.length - rule.trigger.length);
          executeAction(rule.action);
        }
        break;
    }
  }

  const chatRules = await server.getGmodToDiscordFilter();
  chatRules.forEach((rule) => {
    verifyRule(rule);
  });

  if (!relayMessage) {
    return { skip: true, message: 'Message blocked' };
  }

  if (outputStr === '') {
    return { skip: true, message: 'Final message is empty' };
  }

  const webhookRelay = await fetch(getRandomDiscordRelay(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + discordConfig.barerTokenRelay,
    },
    body: JSON.stringify({
      webhookID: syncChatChannel.id,
      webhookToken: syncChatChannel.token,
      data: {
        username: anonymous ? 'Anonymous' : player.name ? player.name : 'Unknown',
        avatarURL: anonymous
          ? 'https://i.imgur.com/MfkZJfm.jpeg'
          : await getSteamUserAvatarLarge(player.steamID64).catch(() => 'https://i.imgur.com/MfkZJfm.jpeg'),
        content: outputStr ? outputStr : 'No message',
      },
    }),
  });

  if (!webhookRelay.ok) {
    return { skip: true, message: 'Webhook not found' };
  }

  return { success: true };
}

export async function saveConnectionGlobalInfo(steamID64, steamID, IP, name) {
  const user = await Users.findOne({
    where: {
      steamID64: steamID64,
    },
  });

  if (user) {
    user.name = name;
    user.lastIP = IP;
    user.IPS = user.IPS.includes(IP) ? user.IPS : [...user.IPS, IP];
    user.changed('updatedAt', true);
    await user.save();
  } else {
    await Users.create({
      steamID64: steamID64,
      steamID: steamID,
      name: name,
      lastIP: IP,
      IPS: [IP],
    });
  }
}

export async function saveConnectionSteamInfo(steamID64, name, IP) {
  try {
    const player = await gm_user_steam.findOne({
      where: {
        steam_id: steamID64,
      },
    });

    if (player) {
      player.username = name;
      player.last_ip = IP;
      player.total_connect += 1;
      await player.save();
    } else {
      await gm_user_steam.create({
        steam_id: steamID64,
        username: name,
        last_ip: IP,
      });
    }
  } catch (err) {
    console.error(err);
    throw err;
  }
}
