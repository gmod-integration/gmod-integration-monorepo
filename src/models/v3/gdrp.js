import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import UsersDataRequest from '../../database/schema/UsersDataRequest.js';
import gm_user from '../../database/schema/gm_user.js';
import UsersNotifications from '../../database/schema/UsersNotifications.js';
import gm_user_steam from '../../database/schema/gm_user_steam.js';
import gm_server_stat from '../../database/schema/gm_server_stat.js';
import ServerPlayerSession from '../../database/schema/ServerPlayerSession.js';
import { serverConfig } from '../../config/index.js';
import archiver from 'archiver';
import { gmLog } from '../../utils/logger.js';
import Users from '../../database/schema/Users.js';
import ServerWarn from '../../database/schema/ServerWarn.js';
import { Op } from 'sequelize';
import ServerVote from '../../database/schema/ServerVote.js';
import GmodStorePurchases from '../../database/schema/GmodStorePurchases.js';
import Ban from '../../database/schema/Ban.js';
import ServerLogs from '../../database/schema/ServerLogs.js';

export async function getUserDataGRPD(user) {
  const discordID = user.getDiscordID();
  const steamID64 = user.getSteamID64();

  await fs.mkdir('./gdpr-request', { recursive: true });

  const request = await UsersDataRequest.create({
    discordID,
    status: 'pending',
    expirationDate: new Date(new Date().setDate(new Date().getDate() + 2)),
    code: Math.random().toString(36).substring(2, 18),
  });

  const requestFolderPath = `./gdpr-request/${request.id}`;
  await fs.mkdir(requestFolderPath);

  const tasks = [];

  if (discordID) {
    tasks.push(
      (async () => {
        const userData =
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

        await fs.writeFile(`${requestFolderPath}/discord.json`, JSON.stringify(userData, null, 2));
      })(),
    );
  }

  if (steamID64) {
    tasks.push(
      (async () => {
        const user =
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

        user.userWarn = await ServerWarn.findAll({
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

        user.user = await Users.findOne({
          where: {
            steamID64,
          },
        });

        user.gmodStore = await GmodStorePurchases.findAll({
          where: {
            steamID64,
          },
        });

        user.ban = await Ban.findAll({
          where: {
            steamID64,
          },
        });

        user.serverLog = await ServerLogs.findAll({
          where: {
            playerInvolvedSteamID64: {
              [Op.contains]: [steamID64],
            },
          },
        });

        await fs.writeFile(`${requestFolderPath}/steam.json`, JSON.stringify(user, null, 2));
      })(),
    );
  }

  await Promise.all(tasks);

  const zipFilePath = `./gdpr-request/${request.id}.zip`;
  const output = createWriteStream(zipFilePath);
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

  if (discordID) {
    archive.file(`${requestFolderPath}/discord.json`, { name: 'discord.json' });
  }
  if (steamID64) {
    archive.file(`${requestFolderPath}/steam.json`, { name: 'steam.json' });
  }

  await archive.finalize();

  await fs.rm(requestFolderPath, { recursive: true, force: true });

  request.downloadLink = `${serverConfig.domain}/gdpr-request/${request.id}.zip`;
  request.status = 'ready';
  await request.save();

  return request;
}
