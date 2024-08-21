import { getRandomDiscordRelay } from '../../utils/tools.js';
import fs from 'fs';
import { discordConfig, serverConfig } from '../../config/index.js';
import { EmbedBuilder } from 'discord.js';
import { getSteamUserAvatarLarge } from '../../steam/index.js';
import { getMainClient } from '../../discord/index.js';
import { v4 as uuidv4 } from 'uuid';

export function saveScreenshot(screenshot, captureData, player, server) {
  return new Promise(async (resolve, reject) => {
    const format = captureData.format || 'jpeg';
    const dateFormatted = new Date().toISOString().replace(/T/g, '_').replace(/\..+/, '').replace(/:/g, '-');
    const filename = `${dateFormatted}_${player.steamID64}_${uuidv4()}.${format}`;

    // Save screenshot to be usable in the website
    const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const path = `./screenshots/${filename}`;
    const internUrl = `${serverConfig.domain}/screenshots/${filename}`;
    fs.writeFile(path, buffer, (err) => {
      if (err) {
        reject(err);
      }
    });

    // Send screenshot to discord to be usable in discord
    let discordUrl = '';
    const dscClient = await getMainClient();
    const channel = await dscClient.channels.fetch(serverConfig.screenshotChannel);
    try {
      if (channel) {
        const message = await channel.send({
          files: [buffer],
          content: `Server: ${server.getName()} - Player: ${player.name} - SteamID64: ${player.steamID64}`,
        });
        discordUrl = message.attachments.first().url;
      }
    } catch (e) {
      // do nothing
    }

    resolve({
      discordUrl,
      internUrl,
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
