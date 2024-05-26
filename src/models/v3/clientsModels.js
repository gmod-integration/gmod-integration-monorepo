import { generateToken } from '../../utils/tools.js';
import fs from 'fs';
import { serverConfig } from '../../config/index.js';
import { WebhookClient } from 'discord.js';
import { getSteamUserAvatarLarge } from '../../steam/index.js';
import { getClient } from '../../discord/index.js';

export function saveScreenshot(screenshot, captureData, player) {
  return new Promise(async (resolve, reject) => {
    const format = captureData.format || 'jpeg';
    const dateFormatted = new Date().toISOString().replace(/T/g, '_').replace(/\..+/, '').replace(/:/g, '-');
    const filename = `${dateFormatted}_${player.steamID64}_${generateToken(8)}.${format}`;

    const path = `./screenshots/${filename}`;

    const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    fs.writeFile(path, buffer, (err) => {
      if (err) {
        reject(err);
      }

      resolve({
        path,
        filename,
      });
    });
  });
}

export function sendScreenshotToDiscord(path, filename, player, server) {
  return new Promise(async (resolve, reject) => {
    const channelInfo = await server.getScreenshotsChannel();
    if (!channelInfo) {
      return reject('channel_not_found');
    }

    // TODO Better code
    const dscClient = await getClient();

    const dscGuild = dscClient.guilds.cache.get(syncChatChannel.guild);
    if (!dscGuild) {
      return reject({ skip: true, message: 'Guild not found' });
    }

    const dscChannel = dscGuild.channels.cache.get(syncChatChannel.channel);
    if (!dscChannel) {
      return reject({ skip: true, message: 'Channel not found' });
    }

    // get channel webhook
    const webhooks = await dscChannel.fetchWebhooks();
    const webhook = webhooks.find((w) => w.id === syncChatChannel.webhook);
    if (!webhook) {
      return reject({ skip: true, message: 'Webhook not found' });
    }

    const webhookClient = new WebhookClient(webhook.id, webhook.token);

    webhookClient
      .send({
        username: player.name,
        avatarURL: await getSteamUserAvatarLarge(player.steamID64),
        embeds: [
          {
            image: {
              url: `${serverConfig.domain}/screenshots/${filename}`,
              proxy_url: `${serverConfig.domain}/screenshots/${filename}`,
            },
            content: `${serverConfig.domain}/screenshots/${filename}`,
            footer: {
              text: `SteamID64: ${player.steamID64} - Server: ${server.name}`,
            },
          },
        ],
      })
      .then(() => {
        resolve();
      })
      .catch((err) => {
        reject(err);
      });
  });
}
