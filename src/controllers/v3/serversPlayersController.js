import { badArgument, ipGetIP } from '../../utils/tools.js';
import { PlayerGmod, updatePlayerUserGroup } from '../../classes/v3/PlayerGmod.js';
import {
  saveConnectionGlobalInfo,
  saveConnectionSteamInfo,
  sendPlayerSay,
} from '../../models/v3/serversPlayersModels.js';
import { updateGuildUserPseudo } from '../../discord/index.js';
import { logServer } from '../../database/schema/ServerLogs.js';
import ServerWarn from '../../database/schema/ServerWarn.js';

export async function getPlayer(req, res) {
  const { steamID64 } = req.params;
  const server = req.server;
  return res.send((await server.getPlayerStats(steamID64)) || {});
}

export async function playerSpawn(req, res) {
  const server = req.server;
  await logServer(server, 'player_spawn', req.body);
  res.status(200).json({ success: true });
}

export async function playerReady(req, res) {
  const server = req.server;
  await logServer(server, 'player_ready', req.body);
  // await updateGuildUserSyncRoles(server, await getUserFromSteamID64(steamID64), player.userGroup);
  return res.status(200).json({ success: true });
}

export async function playerSay(req, res) {
  const server = req.server;
  const { steamID64 } = req.params;
  await logServer(server, 'player_say', req.body);

  const { player, text, teamOnly } = req.body;
  if (badArgument([player, text, teamOnly])) {
    return res.status(400).json({
      error: 'missing_arguments',
      args: {
        steamID64: !!steamID64,
        player: !!player,
        text: !!text,
        teamOnly: !!teamOnly,
      },
    });
  }

  const ply = new PlayerGmod(player);
  if (!ply.isValid()) {
    return res.status(400).json({ error: 'player_bad_format', arguments: ply.isValidGetInformations() });
  }

  await sendPlayerSay(server, player, text, teamOnly);
  return res.status(200).json({ success: true });
}

export async function playerChangeName(req, res) {
  const server = req.server;
  await logServer(server, 'player_change_name', req.body);

  const { player, oldName, newName } = req.body;
  if (badArgument([player, oldName, newName])) {
    return res.status(400).json({
      error: 'missing_arguments',
      args: {
        oldName: !!oldName,
        newName: !!newName,
      },
    });
  }

  const ply = new PlayerGmod(player);
  if (!ply.isValid()) {
    return res.status(400).json({ error: 'player_bad_format', arguments: ply.isValidGetInformations() });
  }

  await updateGuildUserPseudo(server, ply);
  return res.status(200).json({ success: true });
}

export async function playerChangeGroup(req, res) {
  const server = req.server;
  const { steamID64 } = req.params;
  await logServer(server, 'player_change_group', { steamID64, ...req.body });

  const { oldGroup, newGroup } = req.body;
  if (badArgument([oldGroup, newGroup])) {
    return res.status(400).json({
      error: 'missing_arguments',
      args: {
        oldGroup: !!oldGroup,
        newGroup: !!newGroup,
      },
    });
  }

  await updatePlayerUserGroup(server.getID(), steamID64, newGroup);
  return res.status(200).json({ success: true });
}

export async function playerConnect(req, res) {
  const server = req.server;
  const { steamID64 } = req.params;
  const { address, name, networkid } = req.body;
  await logServer(server, 'player_connect', { steamID64, ...req.body });

  if (badArgument([address, name, networkid, steamID64])) {
    return res.status(400).json({
      error: 'missing_arguments',
      args: {
        address: !!address,
        name: !!name,
        networkid: !!networkid,
        steam: !!steamID64,
      },
    });
  }

  const ip = ipGetIP(address);
  await saveConnectionGlobalInfo(steamID64, networkid, ip, name);
  await saveConnectionSteamInfo(steamID64, name, ip);
  await server.saveUserConnectionInfo(steamID64, name, ip);
  return res.status(200).json({ success: true });
}

export async function playerDisconnect(req, res) {
  const server = req.server;
  const { player } = req.body;
  await logServer(server, 'player_disconnect', req.body);

  if (badArgument([player])) {
    return res.status(400).json({
      error: 'missing_arguments',
      args: {
        player: !!player,
      },
    });
  }

  const ply = new PlayerGmod(player);
  if (!ply.isValid()) {
    return res.status(400).json({ error: 'player_bad_format', arguments: ply.isValidGetInformations() });
  }

  await ply.saveServerStat(server.getID());
  await ply.saveServerStatSession(server.getID());
  await updatePlayerUserGroup(server.getID(), ply.steamID64, ply.userGroup);
  await updateGuildUserPseudo(server, ply);
  return res.status(200).json({ success: true });
}

export async function playerDeath(req, res) {
  const server = req.server;
  await logServer(server, 'player_death', req.body);
  return res.status(200).json({ success: true });
}

export async function playerHurt(req, res) {
  const server = req.server;
  await logServer(server, 'player_hurt', req.body);
  return res.status(200).json({ success: true });
}

export async function playerGive(req, res) {
  const server = req.server;
  await logServer(server, 'player_give', req.body);
  return res.status(200).json({ success: true });
}

export async function playerInitialSpawn(req, res) {
  const server = req.server;
  await logServer(server, 'player_initial_spawn', req.body);
  return res.status(200).json({ success: true });
}

export async function playerSpawnObject(req, res) {
  const server = req.server;
  const { object } = req.params;
  await logServer(server, 'player_spawn_object', { object, ...req.body });
  return res.status(200).json({ success: true });
}

export async function playerWarn(req, res) {
  const server = req.server;
  const { steamID64 } = req.params;
  const { admin, player, adminSteamID64, reason, date } = req.body;
  // await logServer(server, 'player_warned', { plyAdmin, plyUser, steamID64, adminSteamID64, reason });
  await logServer(server, 'player_warned', req.body);

  if (!admin && !adminSteamID64) {
    return res.status(400).json({
      error: 'missing_arguments',
      args: { admin: !!admin, adminSteamID64: !!adminSteamID64 },
    });
  }

  let validDate = date;
  if (typeof date === 'string' && !isNaN(date)) {
    validDate = new Date(date * 1000);
  } else {
    validDate = new Date(date * 1000);
  }

  const plyAdmin = new PlayerGmod(admin);
  const plyUser = new PlayerGmod(player);

  const warn = await ServerWarn.create({
    serverID: server.getID(),
    userSteamID64: (plyUser && plyUser.steamID64) || steamID64,
    adminSteamID64: (plyAdmin && plyAdmin.steamID64) || adminSteamID64,
    reason,
    createdAt: validDate,
  });
  return res.status(200).json(warn);
}
