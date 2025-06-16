import fs from 'fs';
import { ConfigServer } from '../../classes/config/Config.js';
import archiver from 'archiver';
import { gmLog } from '../../utils/logger.js';
import { User } from '../../classes/v3/User.js';
import { addNotification } from '../../utils/tools.js';
import { getLogsBySteamIDList, getLogsCountBySteamIDList } from '../../database/gm_server_logs.js';
import path from 'path';
import * as os from 'node:os';
import { createBucketIfNotExists, s3 } from '../../services/minio/index.js';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import prisma from '../../services/prisma/index.js';

export async function getUserDataGRPD(user: User) {
  const discordID = user.getDiscordID();
  const steamID64 = user.getSteamID64();

  const request = await prisma.gm_users_data_request.create({
    data: {
      discordID,
      status: 'pending',
      expirationDate: new Date(new Date().setDate(new Date().getDate() + 4)),
      code: Math.random().toString(36).substring(2, 18),
    },
  });

  const baseTempPath = path.join(os.tmpdir(), 'gmod-integration', 'gdpr');
  const tempPath = path.join(baseTempPath, request.id);
  fs.mkdirSync(tempPath, { recursive: true });

  if (discordID) {
    const userData: any = {
      discordUser:
        (await prisma.gm_user.findUnique({
          where: { id: discordID },
          include: {
            gm_users_data_request: { where: { discordID } },
            gm_users_notifications: { where: { discordID } },
          },
        })) || {},
      vote: (await prisma.gm_server_vote.findMany({ where: { userID: discordID } })) || {},
      ban: (await prisma.banUsers.findMany({ where: { discordID } })) || {},
    };

    fs.writeFileSync(`${tempPath}/discord.json`, JSON.stringify(userData));
  }

  if (steamID64) {
    const userData: any = {
      steamUser:
        (await prisma.gm_user_steam.findUnique({
          where: { steam_id: steamID64 },
          include: {
            gm_server_stat: { where: { steam_id: steamID64 } },
            gm_server_stat_session: { where: { steamID64 } },
          },
        })) || {},
      userWarn: await prisma.gm_server_warn.findMany({
        where: {
          OR: [{ userSteamID64: steamID64 }, { adminSteamID64: steamID64 }],
        },
      }),
      user: await prisma.users.findMany({ where: { steamID64 } }),
      gmodStore: await prisma.gm_gmodstore_purchases.findMany({ where: { steamID64 } }),
      ban: await prisma.banUsers.findMany({ where: { steamID64 } }),
    };

    fs.writeFileSync(`${tempPath}/steam.json`, JSON.stringify(userData));

    try {
      const serverLogCount = await getLogsCountBySteamIDList([steamID64]);
      const limit = 1000;
      let offset = 0;
      let fileIndex = 1;
      const totalFiles = Math.ceil(serverLogCount / limit);

      while (offset < serverLogCount) {
        const logs = await getLogsBySteamIDList([steamID64], { limit, offset });
        const stream = fs.createWriteStream(`${tempPath}/steam-logs-${fileIndex}-${totalFiles}.json`);

        stream.write('[\n');
        for (let i = 0; i < logs.length; i++) {
          if (i !== 0) stream.write(',\n');
          stream.write(JSON.stringify(logs[i]));
        }
        stream.write('\n]');
        stream.end();

        await new Promise<void>((resolve) => stream.on('finish', () => resolve()));

        offset += limit;
        fileIndex++;
      }
    } catch (error) {
      console.error('Error fetching server logs:', error);
    }
  }

  const zipFilePath = path.join(baseTempPath, `${request.id}.zip`);
  const output = fs.createWriteStream(zipFilePath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  output.on('close', () => {
    gmLog('rgpd', `Data for user ${discordID} zipped to ${zipFilePath} (${archive.pointer()} bytes)`);
  });

  archive.on('error', (err) => {
    throw err;
  });
  archive.pipe(output);

  const files = fs.readdirSync(tempPath);
  for (const file of files) {
    archive.file(path.join(tempPath, file), { name: file });
  }

  await archive.finalize();

  await createBucketIfNotExists('gmi-gdpr-exports');
  const zipStream = fs.createReadStream(zipFilePath);

  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: 'gmi-gdpr-exports',
        Key: `${request.id}.zip`,
        Body: zipStream,
        ContentType: 'application/zip',
      }),
    );
  } catch (err) {
    console.error('Error uploading zip to MinIO:', err);
  }

  fs.rmSync(tempPath, { recursive: true, force: true });
  fs.rmSync(zipFilePath, { force: true });

  request.downloadLink = `${ConfigServer.domain}/gdpr-request/${request.id}`;
  request.status = 'ready';

  await prisma.gm_users_data_request.update({
    where: { id: request.id },
    data: {
      downloadLink: request.downloadLink,
      status: request.status,
    },
  });

  if (discordID) {
    await addNotification(discordID, 'gdpr', `Your GDPR request is ready: ${ConfigServer.websiteUrl}/account`);
  }

  return request;
}
