import { getRandomDiscordRelay } from '../../utils/tools.js';
import fs from 'fs';
import { discordConfig, serverConfig } from '../../config/index.js';
import { EmbedBuilder } from 'discord.js';
import { getSteamUserAvatarLarge } from '../../steam/index.js';
import { getMainClient } from '../../discord/index.js';
import { v4 as uuidv4 } from 'uuid';
import { Server } from '../../classes/v3/Server.js';
import prisma from '../../prisma.js';
import { PlayerGmod } from '../../classes/v3/PlayerGmod.js';

export async function saveScreenshot(screenshot: string, captureData: any, player: PlayerGmod, server: Server) {
  const format = captureData.format || 'jpeg';
  const dateFormatted = new Date().toISOString().replace(/T/g, '_').replace(/\..+/, '').replace(/:/g, '-');
  const filename = `${dateFormatted}_${player.steamID64}_${uuidv4()}.${format}`;

  // Save screenshot to be usable in the website
  const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');

  const path = `./screenshots/${filename}`;
  const internUrl = `${serverConfig.domain}/screenshots/${filename}`;
  fs.mkdirSync('./screenshots', { recursive: true });
  fs.writeFile(path, buffer, (err) => {
    if (err) {
      console.error(err);
    }
  });

  // Send screenshot to discord to be usable in discord
  let discordUrl = '';
  const dscClient = await getMainClient();
  const channel = await dscClient.channels.fetch(serverConfig.screenshotChannel!);
  try {
    if (channel && channel.isSendable()) {
      const message = await channel.send({
        files: [buffer],
        content: `Server: ${server.getName()} - Player: ${player.name} - SteamID64: ${player.steamID64}`,
      });
      discordUrl = message.attachments.first()?.url || '';
    }
  } catch (e) {
    // do nothing
  }

  await prisma.gm_server_screenshots.create({
    data: {
      serverID: server.id,
      title: captureData.title,
      player: JSON.stringify(player),
      url: internUrl,
    },
  });

  return {
    discordUrl,
    internUrl,
    filename,
  };
}

export async function sendScreenshotToDiscord(url: string, filename: string, player: PlayerGmod, server: Server) {
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
    await prisma.gm_server_screenshot_channels.delete({
      where: {
        server_adminCmd: {
          server: server.getID(),
          adminCmd: channelInfo.adminCmd,
        },
      },
    });
    return { skip: true, message: 'Webhook not found' };
  }

  return { success: true };
}
