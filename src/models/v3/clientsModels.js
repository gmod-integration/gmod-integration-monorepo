import { generateToken, getRandomDiscordRelay } from '../../utils/tools.js';
import fs from 'fs';
import { discordConfig, serverConfig } from '../../config/index.js';
import { EmbedBuilder } from 'discord.js';
import { getSteamUserAvatarLarge } from '../../steam/index.js';
import { getMainClient } from '../../discord/index.js';

export function saveScreenshot(screenshot, captureData, player, server) {
  return new Promise(async (resolve, reject) => {
    const format = captureData.format || 'jpeg';
    const dateFormatted = new Date().toISOString().replace(/T/g, '_').replace(/\..+/, '').replace(/:/g, '-');
    const filename = `${dateFormatted}_${player.steamID64}_${generateToken(8)}.${format}`;

    // because of a bug I need to first send the screenshot to the discord
    const dscClient = await getMainClient();
    const channel = await dscClient.channels.fetch(serverConfig.screenshotChannel);

    const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    let url;

    if (!channel) {
      const path = `./screenshots/${filename}`;

      fs.writeFile(path, buffer, (err) => {
        if (err) {
          reject(err);
        }
      });

      url = `${serverConfig.domain}/screenshots/${filename}`;
    } else {
      const message = await channel.send({
        files: [buffer],
        content: `Server: ${server.getName()} - Player: ${player.name} - SteamID64: ${player.steamID64}`,
      });
      url = message.attachments.first().url;
    }

    resolve({
      url,
      filename,
    });
  });
}

export async function sendScreenshotToDiscord(url, filename, player, server) {
  const channelInfo = await server.getScreenshotsChannel();
  if (!channelInfo) {
    return { skip: true, message: 'Channel not found' };
  }

  const embed = new EmbedBuilder()
    .setImage(url)
    .setColor('#2b2d31')
    .setFooter({
      text: `${player.steamID64} - ${server.getName()}`,
    })
    .setTimestamp();

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
