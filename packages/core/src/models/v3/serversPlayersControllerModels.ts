import { badArgument, ipGetIP } from '../../utils/tools.js';
import { PlayerGmod } from '../../classes/v3/PlayerGmod.js';
import { saveConnectionGlobalInfo, saveConnectionSteamInfo, sendPlayerSay } from './serversPlayersModels.js';
import {
  enqueueUpdateGuildUserPseudo,
  enqueueUpdatePlayerUserGroup,
  enqueueUpdateDiscordTeamRole,
} from '@gmod/infra-bullmq/discordQueueAdapters.js';
import prisma from '@gmod/infra-prisma';
import { Server } from '@gmod/domain-server/Server.js';

type EndpointResult = {
  status: number;
  body: unknown;
};

function getStringValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return '';
}

function ok(body: unknown = { success: true }): EndpointResult {
  return { status: 200, body };
}

function bad(body: unknown): EndpointResult {
  return { status: 400, body };
}

function getInvalidPlayerResult(player: PlayerGmod): EndpointResult {
  return bad({ error: 'player_bad_format', arguments: player.isValidGetInformations() });
}

export async function processPlayerSay(server: Server, steamID64Param: unknown, body: any): Promise<EndpointResult> {
  const steamID64 = getStringValue(steamID64Param);
  const { player, text, teamOnly } = body;

  if (badArgument([player, text, teamOnly])) {
    return bad({
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
    return getInvalidPlayerResult(ply);
  }

  await sendPlayerSay(server, player, text, teamOnly);
  return ok();
}

export async function processPlayerChangeName(server: Server, body: any): Promise<EndpointResult> {
  const { player, oldName, newName } = body;
  if (badArgument([player, oldName, newName])) {
    return bad({
      error: 'missing_arguments',
      args: {
        oldName: !!oldName,
        newName: !!newName,
      },
    });
  }

  const ply = new PlayerGmod(player);
  if (!ply.isValid()) {
    return getInvalidPlayerResult(ply);
  }

  await enqueueUpdateGuildUserPseudo({
    serverID: server.getID(),
    steamID64: ply.steamID64,
    playerName: ply.name,
    userGroup: ply.userGroup,
    forceName: newName,
  });
  return ok();
}

export async function processPlayerChangeGroup(
  server: Server,
  steamID64Param: unknown,
  body: any,
): Promise<EndpointResult> {
  const steamID64 = getStringValue(steamID64Param);
  const { oldGroup, newGroup } = body;
  if (badArgument([oldGroup, newGroup])) {
    return bad({
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
  return ok();
}

export async function processPlayerChangeTeam(
  server: Server,
  steamID64Param: unknown,
  body: any,
): Promise<EndpointResult> {
  const steamID64 = getStringValue(steamID64Param);
  const { oldTeam, newTeam, player } = body;
  if (badArgument([oldTeam, newTeam])) {
    return bad({
      error: 'missing_arguments',
      args: {
        oldTeam: !!oldTeam,
        newTeam: !!newTeam,
      },
    });
  }

  const ply = new PlayerGmod(player);
  if (ply.isValid()) {
    await ply.saveTeamTime(server.getID());
  }

  await enqueueUpdateDiscordTeamRole({
    serverID: server.getID(),
    steamID64,
    teamName: newTeam?.name || null,
  });
  return ok();
}

export async function processPlayerConnect(
  server: Server,
  steamID64Param: unknown,
  body: any,
): Promise<EndpointResult> {
  const steamID64 = getStringValue(steamID64Param);
  const { address, name, networkid } = body;

  if (badArgument([address, name, networkid, steamID64])) {
    return bad({
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
  return ok();
}

export async function processPlayerDisconnect(server: Server, body: any): Promise<EndpointResult> {
  const { player } = body;
  if (badArgument([player])) {
    return bad({
      error: 'missing_arguments',
      args: {
        player: !!player,
      },
    });
  }

  const ply = new PlayerGmod(player);
  if (!ply.isValid()) {
    return getInvalidPlayerResult(ply);
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
  return ok();
}

export async function processPlayerWarn(server: Server, steamID64Param: unknown, body: any): Promise<EndpointResult> {
  const steamID64 = getStringValue(steamID64Param);
  const { admin, player, adminSteamID64, reason, date } = body;

  if (!admin && !adminSteamID64) {
    return bad({
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
  return ok(warn);
}
