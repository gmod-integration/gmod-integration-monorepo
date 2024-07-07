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
  const { players, playersList, maxPlayers, map, hostname, gameMode, port, ip, uptime } = req.body;

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

  await server.saveStatus(ip, port, hostname, map, gameMode, players, maxPlayers, uptime, playersList);
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
  const serversStatusChannel = await gm_status.findAll();
  const dscClient = await getClient();

  for (const statusChannel of serversStatusChannel) {
    try {
      const server = await getServerFromID(statusChannel.server);
      if (!server) return await statusChannel.destroy();

      const statusInfo = await gm_server_status.findOne({
        where: {
          id: server.getID(),
          updatedAt: {
            [Op.gte]: new Date(new Date() - 10 * 60 * 1000),
          },
        },
      });

      if (statusInfo) return;

      const guild = dscClient.guilds.cache.get(server.getGuildID());
      if (!guild) return new Error('Guild not found');

      const channel = guild.channels.cache.get(statusChannel.channel);
      if (!channel) return new Error('Channel not found');

      const message = await channel.messages.fetch(statusChannel.message);
      if (!message) return new Error('Message not found');

      const lang = await guild.preferredLocale;
      const newMsgContent = await getStatusMessage(server, {}, lang);
      await message.edit(newMsgContent);
    } catch (error) {
      console.error(error);
      await statusChannel.destroy();
    }
  }
}
