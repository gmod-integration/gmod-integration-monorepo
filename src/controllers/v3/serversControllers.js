import { badArgument } from '../../utils/tools.js';
import { gmLog } from '../../utils/logger.js';
import { Op } from 'sequelize';
import { getClient } from '../../discord/index.js';
import { getServerFromID } from '../../classes/v3/Server.js';
import { getStatusMessage } from '../../discord/utils/messages.js';
import gm_server_status from '../../database/schema/gm_server_status.js';

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

  try {
    await server.saveStatus(ip, port, hostname, map, gameMode, players, maxPlayers, uptime);
    gmLog('server', `Status of ${server.getID()} updated`, true);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'internal_error' });
  }
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
  const offlineServers = await gm_server_status.findAll({
    where: {
      updatedAt: {
        [Op.lt]: new Date(new Date() - 10 * 60 * 1000),
      },
    },
  });

  const dscClient = await getClient();
  for (const offlineServer of offlineServers) {
    try {
      const server = await getServerFromID(offlineServer.id);
      if (!server) return await offlineServer.destroy();

      const guild = dscClient.guilds.cache.get(server.getGuildID());
      if (!guild) return await offlineServer.destroy();

      const channel = guild.channels.cache.get(offlineServer.channel);
      if (!channel) return await offlineServer.destroy();

      const message = await channel.messages.fetch(offlineServer.message);
      if (!message) return await offlineServer.destroy();

      const lang = await guild.preferredLocale;
      const newMsgContent = await getStatusMessage(server, offlineServer, lang);
      await message.edit(newMsgContent);
    } catch (error) {
      console.error(error);
    }
  }
}
