import { getRandomDiscordRelay } from '../../utils/tools.js';
import { ConfigDiscord, ConfigServer } from '@gmod/config';
import { EmbedBuilder } from 'discord.js';
import { getSteamUserAvatarLarge } from '@gmod/infra-steam';
import { v4 as uuidv4 } from 'uuid';
import { type Server } from '@gmod/domain-server/Server.js';
import prisma from '@gmod/infra-prisma';
import { type PlayerGmod } from '../../classes/v3/PlayerGmod.js';
import { getTranslate } from '../../utils/localizations.js';
import { createBucketIfNotExists, s3 } from '@gmod/infra-minio';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { enqueueMainClientUploadScreenshot } from '@gmod/infra-bullmq/discordQueueAdapters.js';

type MissingArgumentsResponse<T extends Record<string, unknown>> = {
  error: 'missing_arguments';
  args: {
    [K in keyof T]: boolean;
  };
};

function getMissingArguments<T extends Record<string, unknown>>(
  args: T,
): MissingArgumentsResponse<T> | null {
  const state = Object.fromEntries(
    Object.entries(args).map(([key, value]) => [key, value !== undefined]),
  ) as MissingArgumentsResponse<T>['args'];

  const hasMissingArguments = Object.values(state).some((isPresent) => !isPresent);
  if (!hasMissingArguments) {
    return null;
  }

  return {
    error: 'missing_arguments',
    args: state,
  };
}

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
  if (ConfigServer.screenshotChannel) {
    discordUrl = await enqueueMainClientUploadScreenshot({
      channelID: ConfigServer.screenshotChannel,
      content: `Server: ${server.getName()} - Player: ${player.name} - SteamID64: ${player.steamID64}`,
      minioKey: filename,
      fileName: filename,
      contentType: `image/${format}`,
    }).catch(() => '');
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

export async function uploadScreenshotPayload(server: Server, payload: any) {
  const { player, screenshot, captureData, size, title } = payload;
  const missingArguments = getMissingArguments({
    player,
    screenshot,
    captureData,
    size,
  });
  if (missingArguments) {
    return missingArguments;
  }

  const { discordUrl, filename, internUrl } = await saveScreenshot(screenshot, captureData, player, server, title);
  await sendScreenshotToDiscord(discordUrl, internUrl, filename, player, server, title);
  return { success: true };
}

export async function reportBugPayload(server: Server, payload: any) {
  const { player, screenshot, description, importance, steps, expected, actual } = payload;
  const missingArguments = getMissingArguments({
    player,
    description,
    importance,
    steps,
    expected,
    actual,
  });
  if (missingArguments) {
    return missingArguments;
  }

  let screenshotName = '';
  if (screenshot) {
    const { screenshot: screenshotData, captureData, size } = screenshot;
    if (screenshotData && captureData && size) {
      const screenshotResult = await saveScreenshot(screenshotData, captureData, player, server, '').catch((error) => {
        console.error(error);
        return { internUrl: '', filename: '' };
      });
      screenshotName = screenshotResult.filename;
    }
  }

  return await prisma.gm_server_report_bugs.create({
    data: {
      serverID: server.id,
      steamID64: player.steamID64,
      description,
      status: 'open',
      steps,
      expected,
      actual,
      importance,
      screenshot: screenshotName,
    },
  });
}
