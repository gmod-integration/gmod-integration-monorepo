import { badArgument } from '../../utils/tools.js';
import { logServer } from '../../database/schema/ServerLogs.js';
import ServerWarn from '../../database/schema/ServerWarn.js';

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
  return res.status(200).json({ success: true });
}

export async function serverImportWarns(req, res) {
  const server = req.server;
  const { warns } = req.body;

  if (!warns) {
    return res.status(400).json({
      error: 'missing_arguments',
      args: { warns: !!warns },
    });
  }

  for (const warn of warns) {
    let { adminSteamID64, playerSteamID64, date, reason } = warn;
    if (!adminSteamID64 || !playerSteamID64 || !date) {
      continue;
    }

    if (typeof date === 'string' && !isNaN(date)) {
      date = new Date(date * 1000);
    } else {
      date = new Date(date * 1000);
    }
    reason = reason || 'No reason provided';

    // only add if not already in the database (based on date + steamID64)
    const warnExists = await ServerWarn.findOne({
      where: {
        userSteamID64: playerSteamID64,
        adminSteamID64,
        reason,
        createdAt: date,
      },
    });

    if (warnExists) {
      continue;
    }

    await ServerWarn.create({
      serverID: server.getID(),
      userSteamID64: playerSteamID64,
      adminSteamID64,
      reason,
      createdAt: date,
    });
  }

  return res.status(200).json({ success: true });
}

export async function serverStart(req, res) {
  const server = req.server;

  await logServer(server, 'server_start');
  return res.status(200).json({ success: true });
}

export async function serverStop(req, res) {
  const server = req.server;

  await logServer(server, 'server_stop');
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

const endpointToLogID = {
  '^/servers/[^/]+/players/[^/]+/warns$': 'player_warned',
  '^/servers/[^/]+/players/[^/]+/death$': 'player_death',
  '^/servers/[^/]+/players/[^/]+/initial-spawn$': 'player_initial_spawn',
  '^/servers/[^/]+/players/[^/]+/hurt$': 'player_hurt',
  '^/servers/[^/]+/players/[^/]+/give$': 'player_give',
  '^/servers/[^/]+/players/[^/]+/spawn/[^/]+$': 'player_spawn_object',
  '^/servers/[^/]+/players/[^/]+/connect$': 'player_connect',
  '^/servers/[^/]+/players/[^/]+/disconnect$': 'player_disconnect',
  '^/servers/[^/]+/players/[^/]+/ready$': 'player_ready',
  '^/servers/[^/]+/players/[^/]+/spawn$': 'player_spawn',
  '^/servers/[^/]+/players/[^/]+/name$': 'player_change_name',
  '^/servers/[^/]+/players/[^/]+/group$': 'player_change_group',
};

function matchEndpoint(endpoint) {
  for (const [regexPattern, logID] of Object.entries(endpointToLogID)) {
    const regex = new RegExp(regexPattern);
    if (regex.test(endpoint)) {
      return logID;
    }
  }
  return null;
}

export async function postMultiLog(req, res) {
  const logs = req.body;
  const server = req.server;

  for (const log of logs) {
    const { endpoint, data } = log;
    if (!endpoint || !data) continue;

    const logID = matchEndpoint(endpoint);
    if (!logID) continue;

    await logServer(server, logID, data);
  }

  return res.status(200).json({ success: true });
}
