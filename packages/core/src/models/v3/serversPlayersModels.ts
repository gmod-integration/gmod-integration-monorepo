import { getSteamUserAvatarLarge } from '@gmod/infra-steam';
import { getRandomDiscordRelay } from '../../utils/tools.js';
import { ConfigDiscord } from '@gmod/config';
import { type Server } from '@gmod/domain-server/Server.js';
import { type PlayerGmod } from '../../classes/v3/PlayerGmod.js';
import prisma from '@gmod/infra-prisma';
import { gm_server_sync_chat_filter_element } from '@gmod/infra-prisma/enums.js';
import type { gm_server_sync_chat_filter } from '@gmod/infra-prisma/client.js';

export async function sendPlayerSay(server: Server, player: PlayerGmod, text: string, onlyTeam: boolean) {
  let anonymous = false;

  player.name.replace(/[^\x00-\x7F]/g, '');
  text.replace(/[^\x00-\x7F]/g, '');

  if (!text || text === '') {
    return { skip: true, message: 'No message' };
  }

  const syncChatChannel = await server.getSyncChatChannel();
  if (!syncChatChannel) {
    return { skip: true, message: 'Sync chat channel not found or not set' };
  }

  const syncChatDirection = await server.getSetting('syncChatDirection');
  if (syncChatDirection !== 'both' && syncChatDirection !== 'gmodToDiscord') {
    return { skip: true, message: 'Sync chat direction is discord to gmod' };
  }

  const possibleFields = ['steamID64', 'userGroup', 'teamName', 'message'];
  const operator = ['equal', 'notEqual', 'contain', 'notContain', 'startWith', 'endWith'];
  const action = ['relay', 'block', 'anonymize'];

  let relayMessage = await server.getSetting('chat_sync_relay_all');
  console.log('relayMessage', relayMessage);
  let outputStr = text;

  // prevent size overflow
  if (text.length > 2000) {
    return { skip: true, message: 'Message too long' };
  }

  function executeAction(action: string) {
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

  function getCorrectValue(element: gm_server_sync_chat_filter_element) {
    switch (element) {
      case gm_server_sync_chat_filter_element.steamID64:
        return player.steamID64;
      case gm_server_sync_chat_filter_element.userGroup:
        return player.userGroup;
      case gm_server_sync_chat_filter_element.teamName:
        return player.team.name;
      case gm_server_sync_chat_filter_element.message:
        return text;
    }
  }

  function verifyRule(rule: gm_server_sync_chat_filter) {
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
        if (getCorrectValue(rule.element)?.includes(rule.trigger)) {
          executeAction(rule.action);
        }
        break;
      case 'notContain':
        if (!getCorrectValue(rule.element)?.includes(rule.trigger)) {
          executeAction(rule.action);
        }
        break;
      case 'startWith':
        if (getCorrectValue(rule.element)?.startsWith(rule.trigger)) {
          outputStr = text.substring(rule.trigger.length);
          executeAction(rule.action);
        }
        break;
      case 'endWith':
        if (getCorrectValue(rule.element)?.endsWith(rule.trigger)) {
          outputStr = text.substring(0, text.length - rule.trigger.length);
          executeAction(rule.action);
        }
        break;
    }
  }

  const chatRules = await server.getGmodToDiscordFilter();
  if (chatRules) {
    chatRules.forEach((rule) => {
      verifyRule(rule);
    });
  }

  if (!relayMessage) {
    return { skip: true, message: 'Message blocked' };
  }

  if (outputStr === '') {
    return { skip: true, message: 'Final message is empty' };
  }

  // prevent ping, @everyone, @here or <@&ID>
  const syncChatPreventPing = await server.getSetting('sync_chat_prevent_ping');
  if (syncChatPreventPing) {
    outputStr = outputStr.replace(/@/g, '@\u200B');
  }

  const webhookRelay = await fetch(getRandomDiscordRelay(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + ConfigDiscord.barerTokenRelay,
    },
    body: JSON.stringify({
      webhookID: syncChatChannel.id,
      webhookToken: syncChatChannel.token,
      data: {
        username: anonymous ? 'Anonymous' : player.name ? player.name : 'Unknown',
        avatarURL: anonymous
          ? 'https://i.imgur.com/MfkZJfm.jpeg'
          : await getSteamUserAvatarLarge(player.steamID64).catch(() => 'https://i.imgur.com/MfkZJfm.jpeg'),
        content: outputStr,
      },
    }),
  });

  if (!webhookRelay.ok) {
    return { skip: true, message: 'Webhook not found' };
  }

  return { success: true };
}

export async function saveConnectionGlobalInfo(steamID64: string, steamID: string, IP: string, name: string) {
  const user = await prisma.users.findFirst({
    where: {
      steamID64: steamID64,
    },
  });

  if (user) {
    let IPArray = user.IPS;
    if (!Array.isArray(IPArray)) {
      try {
        IPArray = JSON.parse(IPArray as string);
        if (!Array.isArray(IPArray)) {
          IPArray = [];
        }
      } catch (e) {
        IPArray = [];
      }
    }
    if (!IPArray.includes(IP)) IPArray.push(IP);

    await prisma.users.update({
      where: {
        steamID64: steamID64,
      },
      data: {
        name: name,
        lastIP: IP,
        IPS: JSON.stringify(IPArray),
      },
    });
  } else {
    await prisma.users.create({
      data: {
        steamID64: steamID64,
        steamID: steamID,
        name: name,
        lastIP: IP,
        IPS: JSON.stringify([IP]),
      },
    });
  }
}

export async function saveConnectionSteamInfo(steamID64: string, name: string, IP: string) {
  try {
    const player = await prisma.gm_user_steam.findFirst({
      where: {
        steam_id: steamID64,
      },
    });

    if (player) {
      await prisma.gm_user_steam.update({
        where: {
          steam_id: steamID64,
        },
        data: {
          username: name,
          last_ip: IP,
          total_connect: player.total_connect ? player.total_connect + 1 : 1,
        },
      });
    } else {
      await prisma.gm_user_steam.create({
        data: {
          steam_id: steamID64,
          username: name,
          last_ip: IP,
        },
      });
    }
  } catch (err) {
    console.error(err);
    throw err;
  }
}
