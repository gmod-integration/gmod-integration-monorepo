import { badArgument, ipGetIP } from '@gmod/core/utils/tools.js';
import { PlayerGmod } from '@gmod/core/classes/v3/PlayerGmod.js';
import {
  saveConnectionGlobalInfo,
  saveConnectionSteamInfo,
  sendPlayerSay,
} from '@gmod/core/models/v3/serversPlayersModels.js';
import {
  enqueueUpdateGuildUserPseudo,
  enqueueUpdatePlayerUserGroup,
  enqueueUpdateDiscordTeamRole,
} from '@gmod/infra-bullmq/discordQueueAdapters.js';
import { Request, Response } from 'express';
import prisma from '@gmod/infra-prisma';
import { logServer } from '@gmod/core/utils/logger.js';

export async function getPlayer(req: Request, res: Response) {
  const { steamID64 } = req.params;
  const server = req.server!;
  return res.send((await server.getPlayerStats(steamID64)) || {});
}

export async function playerSpawn(req: Request, res: Response) {
  const server = req.server!;
  await logServer(server, 'player_spawn', req.body);
  res.status(200).json({ success: true });
}

export async function playerReady(req: Request, res: Response) {
  const server = req.server!;
  await logServer(server, 'player_ready', req.body);
  // TODO why is this commented out?
  // await updateGuildUserSyncRoles(server, await getUserFromSteamID64(steamID64), player.userGroup);
  return res.status(200).json({ success: true });
}

export async function playerSay(req: Request, res: Response) {
  const server = req.server!;
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

export async function playerChangeName(req: Request, res: Response) {
  const server = req.server!;
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

  await enqueueUpdateGuildUserPseudo({
    serverID: server.getID(),
    steamID64: ply.steamID64,
    playerName: ply.name,
    userGroup: ply.userGroup,
    forceName: newName,
  });
  return res.status(200).json({ success: true });
}

export async function playerChangeGroup(req: Request, res: Response) {
  const server = req.server!;
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

  await enqueueUpdatePlayerUserGroup({
    serverID: server.getID(),
    steamID64,
    userGroup: newGroup,
  });
  return res.status(200).json({ success: true });
}

export async function playerChangeTeam(req: Request, res: Response) {
  const server = req.server!;
  const { steamID64 } = req.params;
  await logServer(server, 'player_change_team', { steamID64, ...req.body });

  const { oldTeam, newTeam } = req.body;
  if (badArgument([oldTeam, newTeam])) {
    return res.status(400).json({
      error: 'missing_arguments',
      args: {
        oldTeam: !!oldTeam,
        newTeam: !!newTeam,
      },
    });
  }

  const { player } = req.body;
  const ply = new PlayerGmod(player);
  if (ply.isValid()) {
    await ply.saveTeamTime(server.getID());
  }

  await enqueueUpdateDiscordTeamRole({
    serverID: server.getID(),
    steamID64,
    teamName: newTeam?.name || null,
  });
  return res.status(200).json({ success: true });
}

export async function playerConnect(req: Request, res: Response) {
  const server = req.server!;
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
  await server.saveUserConnectionInfo(steamID64, name);
  return res.status(200).json({ success: true });
}

export async function playerDisconnect(req: Request, res: Response) {
  const server = req.server!;
  const guild = req.guild!;
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
  await ply.saveTeamTime(server.getID());
  await enqueueUpdatePlayerUserGroup({
    serverID: server.getID(),
    steamID64: ply.steamID64,
    userGroup: ply.userGroup,
  });
  await enqueueUpdateGuildUserPseudo({
    serverID: server.getID(),
    steamID64: ply.steamID64,
    playerName: ply.name,
    userGroup: ply.userGroup,
  });
  await enqueueUpdateDiscordTeamRole({
    serverID: server.getID(),
    steamID64: ply.steamID64,
    teamName: null,
  });
  return res.status(200).json({ success: true });
}

export async function playerDeath(req: Request, res: Response) {
  const server = req.server!;
  await logServer(server, 'player_death', req.body);
  return res.status(200).json({ success: true });
}

export async function playerHurt(req: Request, res: Response) {
  const server = req.server!;
  await logServer(server, 'player_hurt', req.body);
  return res.status(200).json({ success: true });
}

export async function playerGive(req: Request, res: Response) {
  const server = req.server!;
  await logServer(server, 'player_give', req.body);
  return res.status(200).json({ success: true });
}

export async function playerInitialSpawn(req: Request, res: Response) {
  const server = req.server!;
  await logServer(server, 'player_initial_spawn', req.body);
  return res.status(200).json({ success: true });
}

export async function playerSpawnObject(req: Request, res: Response) {
  const server = req.server!;
  const { object } = req.params;
  await logServer(server, 'player_spawn_object', { object, ...req.body });
  return res.status(200).json({ success: true });
}

export async function playerWarn(req: Request, res: Response) {
  const server = req.server!;
  const { steamID64 } = req.params;
  const { admin, player, adminSteamID64, reason, date } = req.body;
  await logServer(server, 'player_warned', req.body);

  if (!admin && !adminSteamID64) {
    return res.status(400).json({
      error: 'missing_arguments',
      args: { admin: !!admin, adminSteamID64: !!adminSteamID64 },
    });
  }

  let validDate: Date;
  if (typeof date === 'string' && !isNaN(Number(date))) {
    validDate = new Date(Number(date) * 1000);
  } else if (typeof date === 'number') {
    validDate = new Date(date * 1000);
  } else {
    throw new Error('Invalid date format');
  }

  const plyAdmin = new PlayerGmod(admin);
  const plyUser = new PlayerGmod(player);

  const warn = await prisma.gm_server_warn.create({
    data: {
      serverID: server.getID(),
      userSteamID64: (plyUser && plyUser.steamID64) || steamID64,
      adminSteamID64: (plyAdmin && plyAdmin.steamID64) || adminSteamID64,
      reason,
      createdAt: validDate,
    },
  });
  return res.status(200).json(warn);
}

export async function playerBan(req: Request, res: Response) {
  return res.status(400).json({ error: 'not_implemented' });
}
