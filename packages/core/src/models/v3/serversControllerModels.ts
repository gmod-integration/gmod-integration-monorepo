import { badArgument } from '../../utils/tools.js';
import { logServer } from '../../utils/logger.js';
import prisma from '@gmod/infra-prisma';
import { PlayerGmod } from '../../classes/v3/PlayerGmod.js';
import { Server } from '@gmod/domain-server/Server.js';

type EndpointResult = {
  status: number;
  body: unknown;
};

function ok(body: unknown = { success: true }): EndpointResult {
  return { status: 200, body };
}

function bad(body: unknown): EndpointResult {
  return { status: 400, body };
}

function invalidPlayerResult(player: PlayerGmod): EndpointResult {
  return bad({ error: 'player_bad_format', arguments: player.isValidGetInformations() });
}

export async function processPostIGSettings(server: Server, settings: any): Promise<EndpointResult> {
  if (!settings || typeof settings !== 'object') {
    return bad({
      error: 'missing_arguments',
      args: { settings: !!settings },
    });
  }

  await server.saveIGSettings(settings);
  return ok();
}

export async function processPostStatus(server: Server, body: any): Promise<EndpointResult> {
  const { players, playersList, maxPlayers, map, hostname, gameMode, port, ip, uptime } = body;

  if (badArgument([players, maxPlayers, map, hostname, gameMode, port, ip, uptime])) {
    return bad({
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

  await server.saveStatus(ip, port, hostname, map, gameMode, players, maxPlayers, uptime, playersList || []);
  return ok();
}

export async function processServerImportWarns(server: Server, warns: any): Promise<EndpointResult> {
  if (!warns) {
    return bad({
      error: 'missing_arguments',
      args: { warns: !!warns },
    });
  }

  for (const warn of warns) {
    let { adminSteamID64, playerSteamID64, date, reason } = warn;
    if (!adminSteamID64 || !playerSteamID64 || !date) {
      continue;
    }

    if (typeof date === 'string' && !isNaN(Number(date))) {
      date = new Date(Number(date) * 1000);
    } else if (typeof date === 'number') {
      date = new Date(date * 1000);
    } else {
      continue;
    }
    reason = reason || 'No reason provided';

    const warnExists = await prisma.gm_server_warn.findFirst({
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

    await prisma.gm_server_warn.create({
      data: {
        serverID: server.getID(),
        userSteamID64: playerSteamID64,
        adminSteamID64,
        reason,
        createdAt: date,
      },
    });
  }

  return ok();
}

export async function processDarkRPDropMoney(server: Server, body: any): Promise<EndpointResult> {
  const { player, amount, entity } = body;
  if (badArgument([player, amount, entity])) {
    return bad({
      error: 'missing_arguments',
      args: {
        player: !!player,
        amount: !!amount,
        entity: !!entity,
      },
    });
  }

  const ply = new PlayerGmod(player);
  if (!ply.isValid()) {
    return invalidPlayerResult(ply);
  }

  await logServer(server, 'dark_rp_drop_money', {
    player: ply,
    amount: Math.round(amount),
    entity,
  });

  return ok();
}

export async function processDarkRPPickedUpMoney(server: Server, body: any): Promise<EndpointResult> {
  const { player, amount, entity } = body;
  if (badArgument([player, amount, entity])) {
    return bad({
      error: 'missing_arguments',
      args: {
        player: !!player,
        amount: !!amount,
        entity: !!entity,
      },
    });
  }

  const ply = new PlayerGmod(player);
  if (!ply.isValid()) {
    return invalidPlayerResult(ply);
  }

  await logServer(server, 'dark_rp_picked_up_money', {
    player: ply,
    amount: Math.round(amount),
    entity,
  });

  return ok();
}

export async function processDarkRPPickedUpCheque(server: Server, body: any): Promise<EndpointResult> {
  const { playerChequeWriter, playerChequeTarget, amount, entity } = body;
  if (badArgument([playerChequeWriter, playerChequeTarget, amount, entity])) {
    return bad({
      error: 'missing_arguments',
      args: {
        playerChequeWriter: !!playerChequeWriter,
        playerChequeTarget: !!playerChequeTarget,
        amount: !!amount,
        entity: !!entity,
      },
    });
  }

  const plyWriter = new PlayerGmod(playerChequeWriter);
  const plyTarget = new PlayerGmod(playerChequeTarget);
  if (!plyWriter.isValid() || !plyTarget.isValid()) {
    return invalidPlayerResult(plyWriter);
  }

  await logServer(server, 'dark_rp_picked_up_cheque', {
    playerChequeWriter: plyWriter,
    playerChequeTarget: plyTarget,
    amount: Math.round(amount),
    entity,
  });
  return ok();
}

export async function processCHATMTakeMoney(server: Server, body: any): Promise<EndpointResult> {
  const { player, amount, reason } = body;
  if (badArgument([player, amount, reason])) {
    return bad({
      error: 'missing_arguments',
      args: {
        player: !!player,
        amount: !!amount,
        reason: !!reason,
      },
    });
  }

  const ply = new PlayerGmod(player);
  if (!ply.isValid()) {
    return invalidPlayerResult(ply);
  }

  await logServer(server, 'ch_atm_take_money', {
    player: ply,
    amount: Math.round(amount),
    reason,
  });

  return ok();
}

export async function processCHATMReceiveMoney(server: Server, body: any): Promise<EndpointResult> {
  const { player, amount, reason } = body;
  if (badArgument([player, amount, reason])) {
    return bad({
      error: 'missing_arguments',
      args: {
        player: !!player,
        amount: !!amount,
        reason: !!reason,
      },
    });
  }

  const ply = new PlayerGmod(player);
  if (!ply.isValid()) {
    return invalidPlayerResult(ply);
  }

  await logServer(server, 'ch_atm_receive_money', {
    player: ply,
    amount: Math.round(amount),
    reason,
  });

  return ok();
}

export async function processCHATMSendMoney(server: Server, body: any): Promise<EndpointResult> {
  const { player, amount, receiver } = body;
  if (badArgument([player, amount, receiver])) {
    return bad({
      error: 'missing_arguments',
      args: {
        player: !!player,
        amount: !!amount,
        receiver: !!receiver,
      },
    });
  }

  const ply = new PlayerGmod(player);
  const plyReceiver = new PlayerGmod(receiver);
  if (!ply.isValid() || !plyReceiver.isValid()) {
    return invalidPlayerResult(ply);
  }

  await logServer(server, 'ch_atm_send_money', {
    player: ply,
    receiver: plyReceiver,
    amount: Math.round(amount),
  });

  return ok();
}

export async function processCHATMWithdrawMoney(server: Server, body: any): Promise<EndpointResult> {
  const { player, amount } = body;
  if (badArgument([player, amount])) {
    return bad({
      error: 'missing_arguments',
      args: {
        player: !!player,
        amount: !!amount,
      },
    });
  }

  const ply = new PlayerGmod(player);
  if (!ply.isValid()) {
    return invalidPlayerResult(ply);
  }

  await logServer(server, 'ch_atm_withdraw_money', {
    player: ply,
    amount: Math.round(amount),
  });

  return ok();
}

export async function processCHATMDepositMoney(server: Server, body: any): Promise<EndpointResult> {
  const { player, amount } = body;
  if (badArgument([player, amount])) {
    return bad({
      error: 'missing_arguments',
      args: {
        player: !!player,
        amount: !!amount,
      },
    });
  }

  const ply = new PlayerGmod(player);
  if (!ply.isValid()) {
    return invalidPlayerResult(ply);
  }

  await logServer(server, 'ch_atm_deposit_money', {
    player: ply,
    amount: Math.round(amount),
  });

  return ok();
}

const endpointToLogID: Record<string, string> = {
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

const endpointToAction: Record<string, (server: Server, data: any) => Promise<EndpointResult>> = {
  '^/servers/[^/]+/players/[^/]+/dark-rp/drop-money$': processDarkRPDropMoney,
  '^/servers/[^/]+/players/[^/]+/dark-rp/picked-up-money$': processDarkRPPickedUpMoney,
  '^/servers/[^/]+/players/[^/]+/dark-rp/picked-up-cheque$': processDarkRPPickedUpCheque,
  '^/servers/[^/]+/players/[^/]+/ch-atm/send-money$': processCHATMSendMoney,
  '^/servers/[^/]+/players/[^/]+/ch-atm/take-money$': processCHATMTakeMoney,
  '^/servers/[^/]+/players/[^/]+/ch-atm/receive-money$': processCHATMReceiveMoney,
  '^/servers/[^/]+/players/[^/]+/ch-atm/deposit-money$': processCHATMDepositMoney,
  '^/servers/[^/]+/players/[^/]+/ch-atm/withdraw-money$': processCHATMWithdrawMoney,
};

function matchRegex<T>(endpoint: string, items: Record<string, T>): T | null {
  for (const [regexPattern, value] of Object.entries(items)) {
    const regex = new RegExp(regexPattern);
    if (regex.test(endpoint)) {
      return value;
    }
  }
  return null;
}

export async function processMultiLog(server: Server, logs: any[]): Promise<EndpointResult> {
  for (const log of logs) {
    const { endpoint, data } = log;
    if (!endpoint || !data) continue;

    const logID = matchRegex(endpoint, endpointToLogID);
    if (logID) {
      if (logID === 'player_spawn_object') {
        data.object = endpoint.split('/').pop();
      }
      await logServer(server, logID, data);
      continue;
    }

    const action = matchRegex(endpoint, endpointToAction);
    if (!action) {
      continue;
    }

    await action(server, data).catch(() => {});
  }

  return ok();
}
