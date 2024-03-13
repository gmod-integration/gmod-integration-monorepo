const {badArgument, ipGetIP} = require("../../utils/tools");
const playerModel = require('../../models/v3/serversPlayersModels');
const serversModels = require('../../models/v3/serversModels');
const userModel = require("../../models/v2/userModel");
const serversPlayersModels = require('../../models/v3/serversPlayersModels');
const {PlayerGmod, updatePlayerUserGroup} = require('../../classes/v3/PlayerGmod');
const {getServerPlayer} = require("../../classes/v3/Player");
const {updateGuildUserPseudo} = require("../../discord");
const {updateGuildUserSyncRoles} = require("../../models/v3/discordModels");
const {getRoleFromRole} = require("../../classes/v3/Role");
const {getUserFromSteamID64} = require("../../classes/v3/User");
const {steamAPI} = require("../../config");
const {saveConnectionGlobalInfo, saveConnectionSteamInfo} = require("../../models/v3/serversPlayersModels");

function getPlayer(req, res) {
    const {steamID64} = req.params;
    const server = req.server;

    if (badArgument([steamID64])) {
        return res.status(400).json({
            error: 'missing_arguments',
            args: {
                steamID64: !!steamID64
            }
        });
    }

    getServerPlayer(server.getID(), steamID64).then((player) => {
        return res.status(200).json(player);
    }).catch((err) => {
        if (err.error === 'player_not_found') {
            return res.status(404).json({error: 'player_not_found'});
        } else {
            console.error(err);
            return res.status(500).json({error: 'internal_error'});
        }
    });
}

async function playerSpawn(req, res) {
    const server = req.server;
    const {steamID64} = req.params;
    const {player} = req.body;

    if (badArgument([player])) {
        return res.status(400).json({
            error: 'missing_arguments',
            args: {
                player: !!player
            }
        });
    }

    const ply = new PlayerGmod(player);
    if (!ply.isValid()) {
        return res.status(400).json({error: 'player_bad_format', arguments: ply.isValidGetInformations()});
    }

    // TODO
    res.status(200).json({success: true});
}

async function playerReady(req, res) {
    const server = req.server;
    const {steamID64} = req.params;
    const {player} = req.body;

    if (badArgument([player])) {
        return res.status(400).json({
            error: 'missing_arguments',
            args: {
                player: !!player
            }
        });
    }

    const ply = new PlayerGmod(player);
    if (!ply.isValid()) {
        return res.status(400).json({error: 'player_bad_format', arguments: ply.isValidGetInformations()});
    }

    // TODO
    res.status(200).json({success: true});
}


async function getPlayerBans(req, res) {
    const {serverID, steamID64} = req.params;

    if (badArgument([steamID64])) {
        return res.status(400).json({
            error: 'missing_arguments',
            args: {
                steamID64: !!steamID64
            }
        });
    }
    let bansList = [];

    const guildID = await serversModels.getGuildID(serverID);

    playerModel.getPlayerBan(steamID64).then((ban) => {
        return res.status(200).json(ban);
    }).catch((err) => {
        console.error(err);
        return res.status(500).json({error: 'internal_error'});
    });
}

function say(req, res) {
    const server = req.server;
    const {steamID64} = req.params;

    const {player, text, teamOnly} = req.body;
    if (badArgument([player, text, teamOnly])) {
        return res.status(400).json({
            error: 'missing_arguments',
            args: {
                steamID64: !!steamID64,
                player: !!player,
                text: !!text,
                teamOnly: !!teamOnly
            }
        });
    }

    const ply = new PlayerGmod(player);
    if (!ply.isValid()) {
        return res.status(400).json({error: 'player_bad_format', arguments: ply.isValidGetInformations()});
    }

    serversPlayersModels.sendPlayerSay(server, player, text, teamOnly).then(() => {
        return res.status(200).json({message: 'data_received'});
    }).catch((err) => {
        console.log(err);
        return res.status(500).json({error: 'internal_server_error'});
    });
}

async function playerChangeName(req, res) {
    const server = req.server;
    const {steamID64} = req.params;

    const {player, oldName, newName} = req.body;
    if (badArgument([player, oldName, newName])) {
        return res.status(400).json({
            error: 'missing_arguments',
            args: {
                oldName: !!oldName,
                newName: !!newName
            }
        });
    }

    const ply = new PlayerGmod(player);
    if (!ply.isValid()) {
        return res.status(400).json({error: 'player_bad_format', arguments: ply.isValidGetInformations()});
    }

    updateGuildUserPseudo(server.getGuildID(), await ply.getDiscordID(), newName).then(() => {
        return res.status(200).json({success: true});
    }).catch((err) => {
        if (err.error === 'missing_arguments') {
            return res.status(200).json({success: false, error: 'user_not_found'});
        }
        console.log(err);
        return res.status(500).json({error: 'internal_server_error'});
    });
}

async function playerChangeGroup(req, res) {
    const server = req.server;
    const {steamID64} = req.params;

    const {oldGroup, newGroup} = req.body;
    if (badArgument([oldGroup, newGroup])) {
        return res.status(400).json({
            error: 'missing_arguments',
            args: {
                oldGroup: !!oldGroup,
                newGroup: !!newGroup
            }
        });
    }

    const user = await getUserFromSteamID64(steamID64);
    if (!user) {
        return res.status(404).json({error: 'user_not_found'});
    }

    updateGuildUserSyncRoles(server, user, newGroup).then(async () => {
        await updatePlayerUserGroup(server.getID(), steamID64, newGroup);
        return res.status(200).json({success: true});
    }).catch((err) => {
        if (err.error === 'missing_arguments') {
            return res.status(200).json({success: false, error: 'user_not_found'});
        }
        console.log(err);
        return res.status(500).json({error: 'internal_server_error'});
    });
}

async function playerConnect(req, res) {
    const server = req.server;
    const {address, name, networkid, steamID64} = req.body;

    if (badArgument([address, name, networkid, steamID64])) {
        return res.status(400).json({
            error: 'missing_arguments',
            args: {
                address: !!address,
                name: !!name,
                networkid: !!networkid,
                steam: !!steamID64,
            }
        });
    }

    const ip = ipGetIP(address);

    try {
        await saveConnectionGlobalInfo(steamID64, networkid, ip, name);
        await saveConnectionSteamInfo(steamID64, networkid, ip);
        await server.saveUserConnectionInfo(steamID64, name, ip);
        return res.status(200).json({success: true});
    } catch (err) {
        console.error(err);
        return res.status(500).json({error: 'internal_server_error'});
    }
}

async function playerDisconnect(req, res) {
    const server = req.server;
    const {player} = req.body;

    if (badArgument([player])) {
        return res.status(400).json({
            error: 'missing_arguments',
            args: {
                player: !!player
            }
        });
    }

    const ply = new PlayerGmod(player);
    if (!ply.isValid()) {
        return res.status(400).json({error: 'player_bad_format', arguments: ply.isValidGetInformations()});
    }

    try {
        await ply.saveServerStat(server.getID());
        await ply.saveServerStatSession(server.getID());
        return res.status(200).json({success: true});
    } catch (err) {
        console.error(err);
        return res.status(500).json({error: 'internal_server_error'});
    }
}

module.exports = {
    getPlayer,
    getPlayerBans,
    playerSay: say,
    playerChangeName,
    playerChangeGroup,
    playerConnect,
    playerDisconnect,
    playerSpawn,
    playerReady
}