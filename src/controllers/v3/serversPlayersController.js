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
  const { steamID64 } = req.params;
  const { player } = req.body;

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

  await logServer(server, 'player_spawn', { ply });
  res.status(200).json({ success: true });
}

export async function playerReady(req, res) {
  const server = req.server;
  const { steamID64 } = req.params;
  const { player } = req.body;

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

  await logServer(server, 'player_ready', { ply });
  // await updateGuildUserSyncRoles(server, await getUserFromSteamID64(steamID64), player.userGroup);
  return res.status(200).json({ success: true });
}

export async function playerSay(req, res) {
  const server = req.server;
  const { steamID64 } = req.params;

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

  await logServer(server, 'player_say', { ply, text, teamOnly });
  await sendPlayerSay(server, player, text, teamOnly);
  return res.status(200).json({ success: true });
}

export async function playerChangeName(req, res) {
  const server = req.server;

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

  await logServer(server, 'player_change_name', { ply, oldName, newName });
  await updateGuildUserPseudo(server, ply);
  return res.status(200).json({ success: true });
}

export async function playerChangeGroup(req, res) {
  const server = req.server;
  const { steamID64 } = req.params;

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

  await logServer(server, 'player_change_group', { steamID64, oldGroup, newGroup });
  await updatePlayerUserGroup(server.getID(), steamID64, newGroup);
  return res.status(200).json({ success: true });
}

export async function playerConnect(req, res) {
  const server = req.server;
  const { address, name, networkid, steamID64 } = req.body;

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
  await logServer(server, 'player_connect', { steamID64, name, ip });
  await saveConnectionGlobalInfo(steamID64, networkid, ip, name);
  await saveConnectionSteamInfo(steamID64, name, ip);
  await server.saveUserConnectionInfo(steamID64, name, ip);
  return res.status(200).json({ success: true });
}

export async function playerDisconnect(req, res) {
  const server = req.server;
  const { player } = req.body;

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

  await logServer(server, 'player_disconnect', { ply });
  await ply.saveServerStat(server.getID());
  await ply.saveServerStatSession(server.getID());
  await updatePlayerUserGroup(server.getID(), ply.steamID64, ply.userGroup);
  await updateGuildUserPseudo(server, ply);
  return res.status(200).json({ success: true });
}

export async function playerDeath(req, res) {
  const server = req.server;
  const { player, inflictor, attacker } = req.body;

  if (badArgument([player, inflictor, attacker])) {
    return res.status(400).json({
      error: 'missing_arguments',
      args: {
        player: !!player,
      },
    });
  }

  const plyTarget = new PlayerGmod(player);
  const plyAttacker = new PlayerGmod(attacker);

  if (!plyTarget.isValid() || !plyAttacker.isValid()) {
    return res.status(400).json({
      error: 'player_bad_format',
      arguments: {
        player: plyTarget.isValidGetInformations(),
        attacker: plyAttacker.isValidGetInformations(),
      },
    });
  }

  await logServer(server, 'player_death', { plyTarget, inflictor, plyAttacker });
  return res.status(200).json({ success: true });
}

export async function playerHurt(req, res) {
  const server = req.server;
  const { victim, attacker, healthRemaining, damageTaken } = req.body;

  if (badArgument([victim, attacker, healthRemaining, damageTaken])) {
    return res.status(400).json({
      error: 'missing_arguments',
      args: {
        victim: !!victim,
        attacker: !!attacker,
        healthRemaining: !!healthRemaining,
        damageTaken: !!damageTaken,
      },
    });
  }

  const plyVictim = new PlayerGmod(victim);
  const plyAttacker = new PlayerGmod(attacker);
  if (!plyVictim.isValid() || !plyAttacker.isValid()) {
    return res.status(400).json({
      error: 'player_bad_format',
      arguments: {
        victim: plyVictim.isValidGetInformations(),
        attacker: plyAttacker.isValidGetInformations(),
      },
    });
  }

  await logServer(server, 'player_hurt', { plyVictim, plyAttacker, healthRemaining, damageTaken });
  return res.status(200).json({ success: true });
}

export async function playerGive(req, res) {
  const server = req.server;
  const { player, swep } = req.body;
  const wep_class = req.body.class;

  if (badArgument([player, swep, wep_class])) {
    return res.status(400).json({
      error: 'missing_arguments',
      args: {
        player: !!player,
        swep: !!swep,
        class: !!wep_class,
      },
    });
  }

  const ply = new PlayerGmod(player);
  if (!ply.isValid()) {
    return res.status(400).json({ error: 'player_bad_format', arguments: ply.isValidGetInformations() });
  }

  await logServer(server, 'player_give', { ply, swep, wep_class });
  return res.status(200).json({ success: true });
}

export async function playerInitialSpawn(req, res) {
  const server = req.server;
  const { player } = req.body;

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

  await logServer(server, 'player_initial_spawn', { ply });
  return res.status(200).json({ success: true });
}

export async function playerSpawnObject(req, res) {
  const server = req.server;
  const { player, entity, model } = req.body;
  const { object } = req.params;

  if (badArgument([player, entity, model])) {
    return res.status(400).json({
      error: 'missing_arguments',
      args: {
        player: !!player,
        entity: !!entity,
        model: !!model,
      },
    });
  }

  const ply = new PlayerGmod(player);
  if (!ply.isValid()) {
    return res.status(400).json({ error: 'player_bad_format', arguments: ply.isValidGetInformations() });
  }

  await logServer(server, 'player_spawn_object', { ply, entity, model, object });
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

export async function playerWarn(req, res) {
  const server = req.server;
  const { steamID64 } = req.params;
  const { admin, player, adminSteamID64, reason, date } = req.body;

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

  await logServer(server, 'player_warned', { plyAdmin, plyUser, steamID64, adminSteamID64, reason });
  const warn = await ServerWarn.create({
    serverID: server.getID(),
    userSteamID64: (plyUser && plyUser.steamID64) || steamID64,
    adminSteamID64: (plyAdmin && plyAdmin.steamID64) || adminSteamID64,
    reason,
    createdAt: validDate,
  });
  return res.status(200).json(warn);
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
