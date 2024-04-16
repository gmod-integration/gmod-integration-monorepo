import { generateToken } from '../../utils/tools.js';
import fs from 'fs';
import { serverConfig } from '../../config/index.js';
import { WebhookClient } from 'discord.js';
import { getSteamUserAvatarLarge } from '../../steam/index.js';

export function saveScreenshot(screenshot, captureData, player) {
  return new Promise(async (resolve, reject) => {
    const format = captureData.format || 'jpeg';
    const dateFormatted = new Date().toISOString().replace(/T/g, '_').replace(/\..+/, '').replace(/:/g, '-');
    const filename = `${dateFormatted}_${player.steamID64}_${generateToken(8)}.${format}`;

    const path = `./screenshots/${filename}`;
    const url = `${serverConfig.domain}/screenshots/${filename}`;

    const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    fs.writeFile(path, buffer, (err) => {
      if (err) {
        reject(err);
      }

      resolve({
        path,
        filename,
        url,
      });
    });
  });
}

export function sendScreenshotToDiscord(screenshot, player, server) {
  return new Promise(async (resolve, reject) => {
    const channelInfo = await server.getScreenshotsChannel();
    if (!channelInfo) {
      return reject('channel_not_found');
    }

    const webhookClient = new WebhookClient({
      id: channelInfo.webhook,
      token: channelInfo.token,
    });

    webhookClient
      .send({
        username: player.name,
        avatarURL: await getSteamUserAvatarLarge(player.steamID64),
        embeds: [
          {
            image: {
              url: screenshot.url,
            },
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
