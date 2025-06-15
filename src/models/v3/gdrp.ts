import fs from 'fs';
import { serverConfig } from '../../classes/config/Config.js';
import archiver from 'archiver';
import { gmLog } from '../../utils/logger.js';
import index from '../../services/prisma/index.js';
import { User } from '../../classes/v3/User.js';
import { addNotification } from '../../utils/tools.js';
import { getLogsByServerAndSteamIDList, getLogsCountByServerAndSteamIDList } from '../../database/gm_server_logs.js';

export async function getUserDataGRPD(user: User) {
  const discordID = user.getDiscordID();
  const steamID64 = user.getSteamID64();

  // first if not exist create folder gdpr-request
  if (!fs.existsSync('./gdpr-request')) {
    fs.mkdirSync('./gdpr-request');
  }

  const request = await index.gm_users_data_request.create({
    data: {
      discordID,
      status: 'pending',
      expirationDate: new Date(new Date().setDate(new Date().getDate() + 4)),
      code: Math.random().toString(36).substring(2, 18),
    },
  });

  // create folder with id
  fs.mkdirSync(`./gdpr-request/${request.id}`);

  if (discordID) {
    let userData: any = {};
    userData.discordUser =
      (await index.gm_user.findUnique({
        where: {
          id: discordID,
        },
        include: {
          gm_users_data_request: {
            where: {
              discordID,
            },
          },
          gm_users_notifications: {
            where: {
              discordID,
            },
          },
        },
      })) || {};

    userData.vote =
      (await index.gm_server_vote.findMany({
        where: {
          userID: discordID,
        },
      })) || {};

    userData.ban = await index.banUsers.findMany({
      where: {
        discordID,
      },
    });

    fs.writeFileSync(`./gdpr-request/${request.id}/discord.json`, JSON.stringify(userData, null, 2));
  }

  if (steamID64) {
    let userData: any = {};
    userData.steamUser =
      (await index.gm_user_steam.findUnique({
        where: {
          steam_id: steamID64,
        },
        include: {
          gm_server_stat: {
            where: {
              steam_id: steamID64,
            },
          },
          gm_server_stat_session: {
            where: {
              steamID64,
            },
          },
        },
      })) || {};

    userData.userWarn = await index.gm_server_warn.findMany({
      where: {
        OR: [
          {
            userSteamID64: steamID64,
          },
          {
            adminSteamID64: steamID64,
          },
        ],
      },
    });

    userData.user = await index.users.findMany({
      where: {
        steamID64,
      },
    });

    userData.gmodStore = await index.gm_gmodstore_purchases.findMany({
      where: {
        steamID64,
      },
    });

    userData.ban = await index.banUsers.findMany({
      where: {
        steamID64,
      },
    });

    fs.writeFileSync(`./gdpr-request/${request.id}/steam.json`, JSON.stringify(userData, null, 2));

    try {
      const serverLogCount = await getLogsCountByServerAndSteamIDList('serverID', [steamID64]);

      const limit = 1000;
      let offset = 0;

      while (offset < serverLogCount) {
        const serverLogs = await getLogsByServerAndSteamIDList('serverID', [steamID64], {
          limit,
          offset,
        });

        const currentFile = Math.floor(offset / limit) + 1;
        const currentFileCount = Math.floor(serverLogCount / limit + 1);
        fs.appendFileSync(
          `./gdpr-request/${request.id}/steam-server-logs-${currentFile}-${currentFileCount}.json`,
          JSON.stringify(serverLogs, null, 2),
        );

        offset += limit;
      }
    } catch (error) {
      console.error('Error fetching server logs:', error);
    }
  }

  // to zip the folder
  const zipFilePath = `./gdpr-request/${request.id}.zip`;
  const output = fs.createWriteStream(zipFilePath);
  const archive = archiver('zip', {
    zlib: { level: 9 },
  });

  output.on('close', () => {
    gmLog(
      'rgpd',
      `Data for user ${discordID} has been exported and zipped to ${zipFilePath} (${archive.pointer()} total bytes)`,
    );
  });

  archive.on('error', (err: any) => {
    throw err;
  });

  archive.pipe(output);

  const files = fs.readdirSync(`./gdpr-request/${request.id}`);
  files.forEach((file) => {
    archive.file(`./gdpr-request/${request.id}/${file}`, { name: file });
  });

  // delete the folder
  await archive.finalize();

  fs.rm(`./gdpr-request/${request.id}`, { recursive: true }, (err) => {
    if (err) {
      gmLog('rgpd', `Error while deleting folder ${request.id}`);
      console.error(err);
    }
  });

  request.downloadLink = `${serverConfig.domain}/gdpr-request/${request.id}`;
  request.status = 'ready';
  await index.gm_users_data_request.update({
    where: {
      id: request.id,
    },
    data: {
      downloadLink: request.downloadLink,
      status: request.status,
    },
  });

  if (discordID) {
    await addNotification(
      discordID,
      'gdpr',
      `Your GDPR request has been processed. You can download the data from ${serverConfig.websiteUrl}/account`,
    );
  }

  return request;
}
