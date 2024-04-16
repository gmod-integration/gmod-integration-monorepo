import { badArgument, ipGetIP } from '../../utils/tools.js';

export function postStatus(req, res) {
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

  server
    .saveStatus(ipGetIP(ip), port, hostname, map, gameMode, players, maxPlayers, uptime)
    .then(() => {
      return res.status(200).json({ status: 'ok' });
    })
    .catch((error) => {
      console.error(error);
      return res.status(500).json({ error: 'internal_error' });
    });
}

export async function getInfo(req, res) {
  return res.status(200).json(req.server);
}

export async function getPublicToken(req, res) {
  const server = req.server;
  await server.regeneratePublicTempToken();
  return res.status(200).json({ publicTempToken: server.getPublicToken() });
}
