import { badArgument, ipGetIP } from '../../utils/tools.js';
import { updateGuildUserSyncRoles } from '../../models/v3/discordModels.js';
import { PlayerGmod, updatePlayerUserGroup } from '../../classes/v3/PlayerGmod.js';
import { getUserFromSteamID64 } from '../../classes/v3/User.js';
import {
  getPlayerBan,
  saveConnectionGlobalInfo,
  saveConnectionSteamInfo,
  sendPlayerSay,
} from '../../models/v3/serversPlayersModels.js';
import { updateGuildUserPseudo } from '../../discord/index.js';
import { getGuildID } from '../../models/v3/serversModels.js';

export async function getPlayer(req, res) {
  const { steamID64 } = req.params;
  const server = req.server;

  if (badArgument([steamID64])) {
    return res.status(400).json({
      error: 'missing_arguments',
      args: {
        steamID64: !!steamID64,
      },
    });
  }

  server
    .getPlayerStats(steamID64)
    .then((player) => {
      return res.status(200).json(player);
    })
    .catch((err) => {
      if (err.error === 'player_not_found') {
        return res.status(404).json({ error: 'player_not_found' });
      } else {
        console.error(err);
        return res.status(500).json({ error: 'internal_error' });
      }
    });
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

  // TODO
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

  updateGuildUserSyncRoles(server, await getUserFromSteamID64(steamID64), player.userGroup)
    .then(() => {
      return res.status(200).json({ success: true });
    })
    .catch((err) => {
      if (err.itsFine === true) {
        return res.status(200).json({ success: false, error: err.error });
      }
      console.log(err);
      return res.status(500).json({ error: 'internal_server_error' });
    });
}

export async function getPlayerBans(req, res) {
  const { serverID, steamID64 } = req.params;

  if (badArgument([steamID64])) {
    return res.status(400).json({
      error: 'missing_arguments',
      args: {
        steamID64: !!steamID64,
      },
    });
  }
  let bansList = [];

  const guildID = await getGuildID(serverID);

  getPlayerBan(steamID64)
    .then((ban) => {
      return res.status(200).json(ban);
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: 'internal_error' });
    });
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

  const rtnVal = await sendPlayerSay(server, player, text, teamOnly);
  if (rtnVal.skip) {
    return res.status(400).json({ error: rtnVal.message });
  }
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

  updateGuildUserPseudo(server.getGuildID(), await ply.getDiscordID(), newName)
    .then(() => {
      return res.status(200).json({ success: true });
    })
    .catch((err) => {
      console.log(err);
      return res.status(500).json({ error: err.message });
    });
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

  const user = await getUserFromSteamID64(steamID64);
  if (!user) {
    return res.status(404).json({ error: 'user_not_found' });
  }

  updateGuildUserSyncRoles(server, user, newGroup, oldGroup)
    .then(async () => {
      await updatePlayerUserGroup(server.getID(), steamID64, newGroup);
      return res.status(200).json({ success: true });
    })
    .catch((err) => {
      if (err.itsFine === true) {
        return res.status(200).json({ success: false, error: err.error });
      }
      console.log(err);
      return res.status(500).json({ error: 'internal_server_error' });
    });
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

  try {
    await saveConnectionGlobalInfo(steamID64, networkid, ip, name);
    await saveConnectionSteamInfo(steamID64, name, ip);
    await server.saveUserConnectionInfo(steamID64, name, ip);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
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

  try {
    await ply.saveServerStat(server.getID());
    await ply.saveServerStatSession(server.getID());
    updateGuildUserPseudo(server.getGuildID(), await ply.getDiscordID(), ply.name).catch(() => {});
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
