import { badArgument } from '../../utils/tools.js';
import { logServer } from '../../utils/logger.js';
import { Request, Response } from 'express';
import index from '../../services/prisma/index.js';
import { PlayerGmod } from '../../classes/v3/PlayerGmod.js';

export async function postStatus(req: Request, res: Response) {
  const server = req.server!;
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

  await server.saveStatus(ip, port, hostname, map, gameMode, players, maxPlayers, uptime, playersList || []);
  return res.status(200).json({ success: true });
}

export async function serverImportWarns(req: Request, res: Response) {
  const server = req.server!;
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

    if (typeof date === 'string' && !isNaN(Number(date))) {
      date = new Date(Number(date) * 1000);
    } else if (typeof date === 'number') {
      date = new Date(date * 1000);
    } else {
      continue;
    }
    reason = reason || 'No reason provided';

    const warnExists = await index.gm_server_warn.findFirst({
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

    await index.gm_server_warn.create({
      data: {
        serverID: server.getID(),
        userSteamID64: playerSteamID64,
        adminSteamID64,
        reason,
        createdAt: date,
      },
    });
  }

  return res.status(200).json({ success: true });
}

export async function serverStart(req: Request, res: Response) {
  const server = req.server!;

  await logServer(server, 'server_start');
  return res.status(200).json({ success: true });
}

export async function serverStop(req: Request, res: Response) {
  const server = req.server!;

  await logServer(server, 'server_stop');
  return res.status(200).json({ success: true });
}

export async function getInfo(req: Request, res: Response) {
  return res.status(200).json(req.server);
}

export async function getPublicToken(req: Request, res: Response) {
  const server = req.server!;
  await server.regeneratePublicTempToken();
  return res.status(200).json({ publicTempToken: server.getPublicToken() });
}

export async function postDarkRPDropMoney(req: Request, res: Response) {
  const server = req.server!;
  const { player, amount, entity } = req.body;
  if (badArgument([player, amount, entity])) {
    return res.status(400).json({
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
    return res.status(400).json({ error: 'player_bad_format', arguments: ply.isValidGetInformations() });
  }

  await logServer(server, 'dark_rp_drop_money', {
    player: ply,
    amount: Math.round(amount),
    entity,
  });

  return res.status(200).json({ success: true });
}

export async function postDarkRPPickedUpMoney(req: Request, res: Response) {
  const server = req.server!;
  const { player, amount, entity } = req.body;
  if (badArgument([player, amount, entity])) {
    return res.status(400).json({
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
    return res.status(400).json({ error: 'player_bad_format', arguments: ply.isValidGetInformations() });
  }

  await logServer(server, 'dark_rp_picked_up_money', {
    player: ply,
    amount: Math.round(amount),
    entity,
  });

  return res.status(200).json({ success: true });
}

export async function postDarkRPPickedUpCheque(req: Request, res: Response) {
  const server = req.server!;
  const { playerChequeWriter, playerChequeTarget, amount, entity } = req.body;
  if (badArgument([playerChequeWriter, playerChequeTarget, amount, entity])) {
    return res.status(400).json({
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
    return res.status(400).json({ error: 'player_bad_format', arguments: plyWriter.isValidGetInformations() });
  }

  await logServer(server, 'dark_rp_picked_up_cheque', {
    playerChequeWriter: plyWriter,
    playerChequeTarget: plyTarget,
    amount: Math.round(amount),
    entity,
  });
  return res.status(200).json({ success: true });
}

export async function postCHATMTakeMoney(req: Request, res: Response) {
  const server = req.server!;
  const { player, amount, reason } = req.body;
  if (badArgument([player, amount, reason])) {
    return res.status(400).json({
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
    return res.status(400).json({ error: 'player_bad_format', arguments: ply.isValidGetInformations() });
  }

  await logServer(server, 'ch_atm_take_money', {
    player: ply,
    amount: Math.round(amount),
    reason,
  });

  return res.status(200).json({ success: true });
}

export async function postCHATMReceiveMoney(req: Request, res: Response) {
  const server = req.server!;
  const { player, amount, reason } = req.body;
  if (badArgument([player, amount, reason])) {
    return res.status(400).json({
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
    return res.status(400).json({ error: 'player_bad_format', arguments: ply.isValidGetInformations() });
  }

  await logServer(server, 'ch_atm_receive_money', {
    player: ply,
    amount: Math.round(amount),
    reason,
  });

  return res.status(200).json({ success: true });
}

export async function postCHATMSendMoney(req: Request, res: Response) {
  const server = req.server!;
  const { player, amount, receiver } = req.body;
  if (badArgument([player, amount, receiver])) {
    return res.status(400).json({
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
    return res.status(400).json({ error: 'player_bad_format', arguments: ply.isValidGetInformations() });
  }

  await logServer(server, 'ch_atm_send_money', {
    player: ply,
    receiver: plyReceiver,
    amount: Math.round(amount),
  });

  return res.status(200).json({ success: true });
}

export async function postCHATMWithdrawMoney(req: Request, res: Response) {
  const server = req.server!;
  const { player, amount } = req.body;
  if (badArgument([player, amount])) {
    return res.status(400).json({
      error: 'missing_arguments',
      args: {
        player: !!player,
        amount: !!amount,
      },
    });
  }

  const ply = new PlayerGmod(player);
  if (!ply.isValid()) {
    return res.status(400).json({ error: 'player_bad_format', arguments: ply.isValidGetInformations() });
  }

  await logServer(server, 'ch_atm_withdraw_money', {
    player: ply,
    amount: Math.round(amount),
  });

  return res.status(200).json({ success: true });
}

export async function postCHATMDepositMoney(req: Request, res: Response) {
  const server = req.server!;
  const { player, amount } = req.body;
  if (badArgument([player, amount])) {
    return res.status(400).json({
      error: 'missing_arguments',
      args: {
        player: !!player,
        amount: !!amount,
      },
    });
  }

  const ply = new PlayerGmod(player);
  if (!ply.isValid()) {
    return res.status(400).json({ error: 'player_bad_format', arguments: ply.isValidGetInformations() });
  }

  await logServer(server, 'ch_atm_deposit_money', {
    player: ply,
    amount: Math.round(amount),
  });

  return res.status(200).json({ success: true });
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

const endpointToFunction: Record<string, Function> = {
  //   DarkRP
  '^/servers/[^/]+/players/[^/]+/dark-rp/drop-money$': function (req: Request, res: Response) {
    return postDarkRPDropMoney(req, res);
  },
  '^/servers/[^/]+/players/[^/]+/dark-rp/picked-up-money$': function (req: Request, res: Response) {
    return postDarkRPPickedUpMoney(req, res);
  },
  '^/servers/[^/]+/players/[^/]+/dark-rp/picked-up-cheque$': function (req: Request, res: Response) {
    return postDarkRPPickedUpCheque(req, res);
  },
  //   CH ATM
  '^/servers/[^/]+/players/[^/]+/ch-atm/send-money$': function (req: Request, res: Response) {
    return postCHATMSendMoney(req, res);
  },
  '^/servers/[^/]+/players/[^/]+/ch-atm/take-money$': function (req: Request, res: Response) {
    return postCHATMTakeMoney(req, res);
  },
  '^/servers/[^/]+/players/[^/]+/ch-atm/receive-money$': function (req: Request, res: Response) {
    return postCHATMReceiveMoney(req, res);
  },
  '^/servers/[^/]+/players/[^/]+/ch-atm/deposit-money$': function (req: Request, res: Response) {
    return postCHATMDepositMoney(req, res);
  },
  '^/servers/[^/]+/players/[^/]+/ch-atm/withdraw-money$': function (req: Request, res: Response) {
    return postCHATMWithdrawMoney(req, res);
  },
};

function matchLogIDEndpoint(endpoint: string) {
  for (const [regexPattern, logID] of Object.entries(endpointToLogID)) {
    const regex = new RegExp(regexPattern);
    if (regex.test(endpoint)) {
      return logID;
    }
  }
  return null;
}

function matchFunctionEndpoint(endpoint: string): Function | null {
  for (const regexPattern of Object.keys(endpointToFunction)) {
    const regex = new RegExp(regexPattern);
    if (regex.test(endpoint)) {
      return endpointToFunction[regexPattern];
    }
  }
  return null;
}

export async function postMultiLog(req: Request, res: Response) {
  const logs = req.body;
  const server = req.server!;

  for (const log of logs) {
    const { endpoint, data } = log;
    if (!endpoint || !data) continue;

    const logID = matchLogIDEndpoint(endpoint);
    if (!logID) {
      const functionEndpoint = matchFunctionEndpoint(endpoint);
      if (functionEndpoint) {
        const localReq = {
          ...req,
          body: data,
        };
        await functionEndpoint(localReq, {
          ...res,

          send: () => {},
          json: () => {},
        }).catch((err: Error) => {
          //
        });
        continue;
      }
      continue;
    }

    if (logID === 'player_spawn_object') {
      data.object = endpoint.split('/').pop();
    }

    await logServer(server, logID, data);
  }

  return res.status(200).json({ success: true });
}
