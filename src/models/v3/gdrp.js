import fs from 'fs';
import UsersDataRequest from '../../database/schema/UsersDataRequest.js';
import gm_user from '../../database/schema/gm_user.js';
import UsersNotifications from '../../database/schema/UsersNotifications.js';
import gm_user_steam from '../../database/schema/gm_user_steam.js';
import gm_server_stat from '../../database/schema/gm_server_stat.js';
import ServerPlayerSession from '../../database/schema/ServerPlayerSession.js';
import { serverConfig } from '../../config/index.js';
import archiver from 'archiver';
import { gmLog } from '../../utils/logger.js';

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
    expirationDate: new Date(new Date().setDate(new Date().getDate() + 2)),
    code: Math.random().toString(36).substring(2, 18),
  });

  // create folder with id
  fs.mkdirSync(`./gdpr-request/${request.id}`);

  if (discordID) {
    // for every table with user data create a file with data
    const userData = await gm_user.findOne({
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
    });
    fs.writeFileSync(`./gdpr-request/${request.id}/discord.json`, JSON.stringify(userData, null, 2));
  }

  if (steamID64) {
    const user = await gm_user_steam.findOne({
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
    });
    fs.writeFileSync(`./gdpr-request/${request.id}/steam.json`, JSON.stringify(user, null, 2));
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

  if (discordID) {
    archive.file(`./gdpr-request/${request.id}/discord.json`, { name: 'discord.json' });
  }
  if (steamID64) {
    archive.file(`./gdpr-request/${request.id}/steam.json`, { name: 'steam.json' });
  }

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

  return request;
}
