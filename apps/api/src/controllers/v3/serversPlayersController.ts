import {
  processPlayerChangeGroup,
  processPlayerChangeName,
  processPlayerChangeTeam,
  processPlayerConnect,
  processPlayerDisconnect,
  processPlayerSay,
  processPlayerWarn,
} from '@gmod/core/models/v3/serversPlayersControllerModels.js';
import { type Request, type Response } from 'express';
import { logServer } from '@gmod/core/utils/logger.js';

export async function getPlayer(req: Request, res: Response) {
  const steamID64 = Array.isArray(req.params.steamID64) ? req.params.steamID64[0] : req.params.steamID64;
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
  const result = await processPlayerSay(server, steamID64, req.body);
  return res.status(result.status).json(result.body);
}

export async function playerChangeName(req: Request, res: Response) {
  const server = req.server!;
  await logServer(server, 'player_change_name', req.body);
  const result = await processPlayerChangeName(server, req.body);
  return res.status(result.status).json(result.body);
}

export async function playerChangeGroup(req: Request, res: Response) {
  const server = req.server!;
  const { steamID64 } = req.params;
  await logServer(server, 'player_change_group', { steamID64, ...req.body });
  const result = await processPlayerChangeGroup(server, steamID64, req.body);
  return res.status(result.status).json(result.body);
}

export async function playerChangeTeam(req: Request, res: Response) {
  const server = req.server!;
  const { steamID64 } = req.params;
  await logServer(server, 'player_change_team', { steamID64, ...req.body });
  const result = await processPlayerChangeTeam(server, steamID64, req.body);
  return res.status(result.status).json(result.body);
}

export async function playerConnect(req: Request, res: Response) {
  const server = req.server!;
  const { steamID64 } = req.params;
  await logServer(server, 'player_connect', { steamID64, ...req.body });
  const result = await processPlayerConnect(server, steamID64, req.body);
  return res.status(result.status).json(result.body);
}

export async function playerDisconnect(req: Request, res: Response) {
  const server = req.server!;
  await logServer(server, 'player_disconnect', req.body);
  const result = await processPlayerDisconnect(server, req.body);
  return res.status(result.status).json(result.body);
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
  await logServer(server, 'player_warned', req.body);
  const result = await processPlayerWarn(server, steamID64, req.body);
  return res.status(result.status).json(result.body);
}

export async function playerBan(req: Request, res: Response) {
  return res.status(400).json({ error: 'not_implemented' });
}
