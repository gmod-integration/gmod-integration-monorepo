import { badArgument, ipGetIP } from '../../utils/tools.js';
import { updateGuildUserSyncRoles } from '../../models/v3/discordModels.js';
import { PlayerGmod, updatePlayerUserGroup } from '../../classes/v3/PlayerGmod.js';
import { getUserFromSteamID64 } from '../../classes/v3/User.js';
import {
  saveConnectionGlobalInfo,
  saveConnectionSteamInfo,
  sendPlayerSay,
} from '../../models/v3/serversPlayersModels.js';
import { updateGuildUserPseudo } from '../../discord/index.js';
import { logServer } from '../../database/schema/ServerLogs.js';
import ServerSettings from '../../database/schema/ServerSettings.js';

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
  await updateGuildUserSyncRoles(server, await getUserFromSteamID64(steamID64), player.userGroup);
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
  await updateGuildUserPseudo(server.getGuildID(), await ply.getDiscordID(), newName);
  return res.status(200).json({ success: true });
}

export async function playerChangeGroup(req, res) {
  const server = req.server;
  const { steamID64 } = req.params;

  const { oldGroup, newGroup, player } = req.body;
  if (badArgument([oldGroup, newGroup, player])) {
    return res.status(400).json({
      error: 'missing_arguments',
      args: {
        oldGroup: !!oldGroup,
        newGroup: !!newGroup,
      },
    });
  }

  const ply = new PlayerGmod(player);
  if (!ply.isValid()) {
    return res.status(400).json({ error: 'player_bad_format', arguments: ply.isValidGetInformations() });
  }

  await logServer(server, 'player_change_group', { ply, oldGroup, newGroup });

  const user = await getUserFromSteamID64(steamID64);
  if (!user) {
    return res.status(404).json({ error: 'user_not_found' });
  }
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
  const hideIP = await ServerSettings.findOne({
    where: {
      serverID: server.getID(),
      setting: 'log_hide_ip',
    },
  });
  console.log(hideIP);
  await logServer(server, 'player_connect', { steamID64, name, ip: hideIP ? '[REDACTED]' : ip });
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
  updateGuildUserPseudo(server.getGuildID(), await ply.getDiscordID(), ply.name).catch(() => {});
  return res.status(200).json({ success: true });
}

export async function playerDeath(req, res) {
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

  await logServer(server, 'player_death', { ply });
  return res.status(200).json({ success: true });
}
