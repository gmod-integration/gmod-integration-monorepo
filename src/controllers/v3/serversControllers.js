import { badArgument } from '../../utils/tools.js';
import { gmLog } from '../../utils/logger.js';
import { Op } from 'sequelize';
import { getClient } from '../../discord/index.js';
import { getServerFromID } from '../../classes/v3/Server.js';
import { getStatusMessage } from '../../discord/utils/messages.js';
import gm_server_status from '../../database/schema/gm_server_status.js';
import gm_status from '../../database/schema/gm_status.js';

export async function postStatus(req, res) {
  const server = req.server;
  const { players, maxPlayers, map, hostname, gameMode, port, ip, uptime } = req.body;

  if (badArgument([players, maxPlayers, map, hostname, gameMode, port, ip, uptime])) {
    return res.status(400).json({
      error: 'missing_arguments',
      args: {
        players: !!players,
        maxPlayers: !!maxPlayers,
        map: !!map,
        hostname: !!hostname,
        gameMode: !!gameMode,
        port: !!port,
        ip: !!ip,
        uptime: !!uptime,
      },
    });
  }

  await server.saveStatus(ip, port, hostname, map, gameMode, players, maxPlayers, uptime);
  gmLog('server', `Status of ${server.getID()} updated`, true);
  return res.status(200).json({ success: true });
}

export async function getInfo(req, res) {
  return res.status(200).json(req.server);
}

export async function getPublicToken(req, res) {
  const server = req.server;
  await server.regeneratePublicTempToken();
  return res.status(200).json({ publicTempToken: server.getPublicToken() });
}

export async function statusRoutine() {
  const serverStatus = await gm_status.findAll();
  const dscClient = await getClient();

  for (const status of serverStatus) {
    const server = await getServerFromID(status.server);
    if (!server) return await status.destroy();

    if (status.updatedAt < new Date(new Date() - 10 * 60 * 1000)) {
      await status.update({ status: 'offline' });

      const statusChannel = await gm_server_status.findOne({
        where: {
          id: status.server,
          updatedAt: {
            [Op.gt]: new Date(new Date() - 10 * 60 * 1000),
          },
        },
      });

      if (!statusChannel) return;

      const guild = dscClient.guilds.cache.get(server.getGuildID());
      if (!guild) return await status.destroy();

      const channel = guild.channels.cache.get(statusChannel.channel);
      if (!channel) return await status.destroy();

      const message = await channel.messages.fetch(statusChannel.message);
      if (!message) return await status.destroy();

      const lang = await guild.preferredLocale;
      const newMsgContent = await getStatusMessage(server, {}, lang);
      await message.edit(newMsgContent);
    }
  }
}
