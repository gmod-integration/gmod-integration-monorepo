import { getConnectionPromise } from '../../database/connection.js';
import { getSteamUserAvatarLarge } from '../../steam/index.js';
import gm_user_steam from '../../database/schema/gm_user_steam.js';
import { getRandomDiscordRelay } from '../../utils/tools.js';
import { discordConfig, serverConfig } from '../../config/index.js';
import { getClient } from '../../discord/index.js';
import { WebhookClient } from 'discord.js';

export async function getPlayerBan(steamID64) {
  return new Promise(async (resolve, reject) => {
    const connection = await getConnectionPromise();
    connection.query('SELECT * FROM gm_ban WHERE steam_id = ?', [steamID64], (error, results) => {
      if (error) return reject(error);

      if (results.length > 0) {
        return resolve(results[0]);
      } else {
        return resolve(null);
      }
    });
  });
}

export async function sendPlayerSay(server, player, text, onlyTeam) {
  let anonymous = false;

  player.name.replace(/[^\x00-\x7F]/g, '');
  text.replace(/[^\x00-\x7F]/g, '');

  const syncChatChannel = await server.getSyncChatChannel();
  if (!syncChatChannel) {
    return { skip: true, message: 'Sync chat channel not found or not set' };
  }

  // const syncChatDirection = await server.getSetting('syncChatDirection');
  // if (syncChatDirection && syncChatDirection === 'discordToGmod') {
  //   return { skip: true, message: 'Sync chat direction is discord to gmod' };
  // }
  //
  // const syncChatTriggerAll = await server.getSetting('syncChatTriggerAll');
  // if (!syncChatTriggerAll || syncChatTriggerAll === 'false') {
  //   const possibleFields = ['steamID64', 'userGroup', 'teamName', 'message'];
  //   const operator = ['equal', 'notEqual', 'contain', 'notContain', 'startWith', 'endWith'];
  //   const action = ['relay', 'block', 'anonymize'];
  //
  //   let relayMessage = false;
  //   let blocked = false;
  //
  //   function executeAction(action) {
  //     switch (action) {
  //       case 'relay':
  //         relayMessage = true;
  //         break;
  //       case 'block':
  //         blocked = true;
  //         break;
  //       case 'anonymize':
  //         player.name = 'Anonymous';
  //         relayMessage = true;
  //         anonymous = true;
  //         break;
  //     }
  //   }
  //
  //   function getCorrectValue(field) {
  //     switch (field) {
  //       case 'steamID64':
  //         return player.steamID64;
  //       case 'userGroup':
  //         return player.userGroup;
  //       case 'teamName':
  //         return player.team.name;
  //       case 'message':
  //         return text;
  //     }
  //   }
  //
  //   function verifyRule(rule) {
  //     if (!rule.enable) return;
  //     if (!possibleFields.includes(rule.field)) return;
  //     if (!operator.includes(rule.operator)) return;
  //     if (!action.includes(rule.action)) return;
  //     switch (rule.operator) {
  //       case 'equal':
  //         if (getCorrectValue(rule.field) === rule.value) {
  //           executeAction(rule.action);
  //         }
  //         break;
  //       case 'notEqual':
  //         if (getCorrectValue(rule.field) !== rule.value) {
  //           executeAction(rule.action);
  //         }
  //         break;
  //       case 'contain':
  //         if (getCorrectValue(rule.field).includes(rule.value)) {
  //           executeAction(rule.action);
  //         }
  //         break;
  //       case 'notContain':
  //         if (!getCorrectValue(rule.field).includes(rule.value)) {
  //           executeAction(rule.action);
  //         }
  //         break;
  //       case 'startWith':
  //         if (getCorrectValue(rule.field).startsWith(rule.value)) {
  //           text = text.substring(rule.value.length);
  //           executeAction(rule.action);
  //         }
  //         break;
  //       case 'endWith':
  //         if (getCorrectValue(rule.field).endsWith(rule.value)) {
  //           text = text.substring(0, text.length - rule.value.length);
  //           executeAction(rule.action);
  //         }
  //         break;
  //     }
  //   }
  //
  //   const chatRules = await server.getChatRules();
  //   chatRules.forEach((rule) => {
  //     verifyRule(rule);
  //   });
  //
  //   const globalChatRules = await server.getGlobalChatRules();
  //   globalChatRules.forEach((rule) => {
  //     rule.enable = true;
  //     verifyRule(rule);
  //   });
  //
  //   if (!relayMessage || blocked) {
  //     return { skip: true, message: 'Message blocked or not relayed' };
  //   }
  // }

  if (serverConfig.production === 'true') {
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
          content: text ? text : 'No message',
        },
      }),
    });

    if (!webhookRelay.ok) {
      return { skip: true, message: 'Webhook not found' };
    }
  } else {
    const dscClient = await getClient();

    try {
      const webhook = await dscClient.fetchWebhook(syncChatChannel.id, syncChatChannel.token);
      const webhookClient = new WebhookClient({ id: webhook.id, token: webhook.token });
      await webhookClient.send({
        username: anonymous ? 'Anonymous' : player.name ? player.name : 'Unknown',
        avatarURL: anonymous
          ? 'https://i.imgur.com/MfkZJfm.jpeg'
          : await getSteamUserAvatarLarge(player.steamID64).catch(() => 'https://i.imgur.com/MfkZJfm.jpeg'),
        content: text ? text : 'No message',
      });
    } catch (err) {
      console.error(err);
      return { skip: true, message: 'Webhook not found' };
    }
  }

  return { success: true };
}

export async function saveConnectionGlobalInfo(steamID64, steamID, IP, name) {
  try {
    const connection = await getConnectionPromise();
    const [results] = await connection.query('SELECT * FROM users WHERE steamID64 = ?', [steamID64]);
    const IPs = results.length === 0 ? [] : JSON.parse(results[0].IPS);

    if (!IPs.includes(IP)) {
      IPs.push(IP);
    }

    if (results.length === 0) {
      await connection.query(
        'INSERT INTO users (steamID64, steamID, name, lastIP, IPS, lastUpdate) VALUES (?, ?, ?, ?, ?, NOW())',
        [steamID64, steamID, name, IP, JSON.stringify(IPs)],
      );
    } else {
      await connection.query('UPDATE users SET lastIP = ?, IPS = ?, lastUpdate = NOW() WHERE steamID64 = ?', [
        IP,
        JSON.stringify(IPs),
        steamID64,
      ]);
    }
  } catch (err) {
    console.error(err);
    throw err;
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
