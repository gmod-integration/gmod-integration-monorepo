import fs from 'fs';
import UsersDataRequest from '../../database/schema/UsersDataRequest.js';
import gm_user from '../../database/schema/gm_user.ts';
import UsersNotifications, { createNotification } from '../../database/schema/UsersNotifications.js';
import gm_user_steam from '../../database/schema/gm_user_steam.js';
import gm_server_stat from '../../database/schema/gm_server_stat.js';
import ServerPlayerSession from '../../database/schema/ServerPlayerSession.js';
import { serverConfig } from '../../config/index.ts';
import archiver from 'archiver';
import { gmLog } from '../../utils/logger.ts';
import Users from '../../database/schema/Users.js';
import ServerWarn from '../../database/schema/ServerWarn.js';
import { Op, QueryTypes } from 'sequelize';
import ServerVote from '../../database/schema/ServerVote.js';
import GmodStorePurchases from '../../database/schema/GmodStorePurchases.js';
import Ban from '../../database/schema/Ban.js';
import sequelize from '../../database/sequelize.js';

export async function getUserDataGRPD(user) {
  const discordID = user.getDiscordID();
  const steamID64 = user.getSteamID64();

  // first if not exist create folder gdpr-request
  if (!fs.existsSync('./gdpr-request')) {
    fs.mkdirSync('./gdpr-request');
  }

  const request = await UsersDataRequest.create({
    discordID,
    status: 'pending',
    expirationDate: new Date(new Date().setDate(new Date().getDate() + 4)),
    code: Math.random().toString(36).substring(2, 18),
  });

  // create folder with id
  fs.mkdirSync(`./gdpr-request/${request.id}`);

  if (discordID) {
    let userData = {};
    userData.discordUser =
      (await gm_user.findOne({
        where: {
          id: discordID,
        },
        include: [
          {
            model: UsersDataRequest,
            as: 'userDataRequests',
            where: {
              discordID,
            },
          },
          {
            model: UsersNotifications,
            as: 'userNotifications',
            where: {
              discordID,
            },
          },
        ],
      })) || {};

    userData.vote =
      (await ServerVote.findAll({
        where: {
          userID: discordID,
        },
      })) || {};

    userData.ban = await Ban.findAll({
      where: {
        discordID,
      },
    });

    fs.writeFileSync(`./gdpr-request/${request.id}/discord.json`, JSON.stringify(userData, null, 2));
  }

  if (steamID64) {
    let userData = {};
    userData.steamUser =
      (await gm_user_steam.findOne({
        where: {
          steam_id: steamID64,
        },
        include: [
          {
            model: gm_server_stat,
            as: 'userStats',
            where: {
              steam_id: steamID64,
            },
          },
          {
            model: ServerPlayerSession,
            as: 'playerSessions',
            where: {
              steamID64,
            },
          },
        ],
      })) || {};

    userData.userWarn = await ServerWarn.findAll({
      where: {
        [Op.or]: [
          {
            userSteamID64: steamID64,
          },
          {
            adminSteamID64: steamID64,
          },
        ],
      },
    });

    userData.user = await Users.findOne({
      where: {
        steamID64,
      },
    });

    userData.gmodStore = await GmodStorePurchases.findAll({
      where: {
        steamID64,
      },
    });

    userData.ban = await Ban.findAll({
      where: {
        steamID64,
      },
    });

    fs.writeFileSync(`./gdpr-request/${request.id}/steam.json`, JSON.stringify(userData, null, 2));

    const findServerLogsByPlayerId = async (steamID64) => {
      try {
        // Count the number of logs
        const countQuery = `SELECT COUNT(*) AS count
                            FROM gm_server_logs
                            WHERE JSON_CONTAINS(playerInvolvedSteamID64, '"${steamID64}"', '$')`;
        const countResult = await sequelize.query(countQuery, { type: QueryTypes.SELECT });
        const serverLogCount = countResult[0].count;

        let offset = 0;
        const limit = 1000;
        while (offset < serverLogCount) {
          const logsQuery = `SELECT *
                             FROM gm_server_logs
                             WHERE JSON_CONTAINS(playerInvolvedSteamID64, '"${steamID64}"', '$')
                                 LIMIT ${limit}
                             OFFSET ${offset}`;
          const serverLogs = await sequelize.query(logsQuery, { type: QueryTypes.SELECT });

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
    };

    await findServerLogsByPlayerId(steamID64);
  }

  // to zip the folder
  const zipFilePath = `./gdpr-request/${request.id}.zip`;
  const output = fs.createWriteStream(zipFilePath);
  const archive = archiver('zip', {
    zlib: { level: 9 },
  });

  output.on('close', () => {
    gmLog(
      `Data for user ${discordID} has been exported and zipped to ${zipFilePath} (${archive.pointer()} total bytes)`,
    );
  });

  archive.on('error', (err) => {
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
      gmLog(`Error while deleting folder ${request.id}`, err);
    }
  });

  request.downloadLink = `${serverConfig.domain}/gdpr-request/${request.id}`;
  request.status = 'ready';
  await request.save();

  if (discordID) {
    await createNotification(
      discordID,
      'gdpr',
      `Your GDPR request has been processed. You can download the data from ${serverConfig.websiteUrl}/account`,
    );
  }

  return request;
}
