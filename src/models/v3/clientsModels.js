import { generateToken, getRandomDiscordRelay } from '../../utils/tools.js';
import fs from 'fs';
import { discordConfig, serverConfig } from '../../config/index.js';
import { EmbedBuilder } from 'discord.js';
import { getSteamUserAvatarLarge } from '../../steam/index.js';

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

export async function sendScreenshotToDiscord(path, filename, player, server) {
  const channelInfo = await server.getScreenshotsChannel();
  if (!channelInfo) {
    return { skip: true, message: 'Channel not found' };
  }

  const embed = new EmbedBuilder()
    .setImage(`${serverConfig.domain}/screenshots/${filename}`)
    .setColor('#2b2d31')
    .setFooter({
      text: `${player.steamID64} - ${server.getName()}`,
    })
    .setTimestamp();
  console.log('sendScreenshotToDiscord -> embed', embed);

  const webhookRelay = await fetch(getRandomDiscordRelay(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + discordConfig.barerTokenRelay,
    },
    body: JSON.stringify({
      webhookID: channelInfo.webhook,
      webhookToken: channelInfo.token,
      data: {
        username: player.name,
        avatarURL: await getSteamUserAvatarLarge(player.steamID64),
        embeds: [embed],
      },
    }),
  });

  if (!webhookRelay.ok) {
    await channelInfo.destroy();
    return { skip: true, message: 'Webhook not found' };
  }

  return { success: true };
}
