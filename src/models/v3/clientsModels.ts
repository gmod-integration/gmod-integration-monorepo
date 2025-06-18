import { getRandomDiscordRelay } from '../../utils/tools.js';
import { ConfigDiscord, ConfigServer } from '../../classes/config/Config.js';
import { EmbedBuilder } from 'discord.js';
import { getSteamUserAvatarLarge } from '../../services/steam/index.js';
import { getMainClient } from '../../discord/index.js';
import { v4 as uuidv4 } from 'uuid';
import { Server } from '../../classes/v3/Server.js';
import prisma from '../../services/prisma/index.js';
import { PlayerGmod } from '../../classes/v3/PlayerGmod.js';
import { getTranslate } from '../../utils/localizations.js';
import { createBucketIfNotExists, s3 } from '../../services/minio/index.js';
import { PutObjectCommand } from '@aws-sdk/client-s3';

export async function saveScreenshot(
  screenshot: string,
  captureData: any,
  player: PlayerGmod,
  server: Server,
  title: string | undefined,
) {
  const format = captureData.format || 'jpeg';
  const dateFormatted = new Date().toISOString().replace(/T/g, '_').replace(/\..+/, '').replace(/:/g, '-');
  const filename = `${dateFormatted}_${player.steamID64}_${uuidv4()}.${format}`;

  // Save screenshot to be usable in the website
  const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');
  const internUrl = `${ConfigServer.domain}/screenshots/${filename}`;
  await createBucketIfNotExists('gmi-players-screenshots');
  await s3
    .send(
      new PutObjectCommand({
        Bucket: 'gmi-players-screenshots',
        Key: filename,
        Body: buffer,
        ContentType: `image/${format}`,
      }),
    )
    .catch((err) => {
      console.error('Error uploading players screenshot to S3:', err);
    });

  let discordUrl = '';
  const dscClient = await getMainClient();
  const channel = await dscClient.channels.fetch(ConfigServer.screenshotChannel!);
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
      title: title,
      player: JSON.stringify(player),
      url: internUrl,
      captureData: JSON.stringify(captureData),
    },
  });

  return {
    discordUrl,
    internUrl,
    filename,
  };
}

export async function sendScreenshotToDiscord(
  discordUrl: string,
  internUrl: string,
  filename: string,
  player: PlayerGmod,
  server: Server,
  title: string | undefined,
) {
  const channelInfo = await server.getScreenshotsChannel();
  if (!channelInfo) {
    return { skip: true, message: 'Channel not found' };
  }

  const embed = new EmbedBuilder()
    .setImage(discordUrl)
    .setColor(ConfigDiscord.embedColor)
    .setTitle(title || (await getTranslate('discord.screenshot.no_title', 'No title')))
    .setURL(internUrl)
    .setFooter({
      text: `${player.steamID64} - ${server.getName()}`,
    })
    .setTimestamp();

  const webhookRelay = await fetch(getRandomDiscordRelay(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + ConfigDiscord.barerTokenRelay,
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
  //
  // if (!webhookRelay.ok) {
  //   await prisma.gm_server_screenshot_channels.delete({
  //     where: {
  //       server_adminCmd: {
  //         server: server.getID(),
  //         adminCmd: channelInfo.adminCmd,
  //       },
  //     },
  //   });
  //   return { skip: true, message: 'Webhook not found' };
  // }

  return { success: true };
}
