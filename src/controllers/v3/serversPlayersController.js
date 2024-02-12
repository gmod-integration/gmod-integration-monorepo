const {badArgument} = require("../../utils/tools");
const playerModel = require('../../models/v3/serversPlayersModels');
const serversModels = require('../../models/v3/serversModels');
const userModel = require("../../models/v2/userModel");
const serversPlayersModels = require('../../models/v3/serversPlayersModels');

async function getPlayer(req, res) {
    const {serverID, steamID64} = req.params;

    if (badArgument([steamID64])) {
        return res.status(400).json({
            error: 'missing_arguments',
            arguments: {
                steamID64: !!steamID64
            }
        });
    }

    playerModel.getPlayerInformations(steamID64).then((player) => {
        return res.status(200).json(player);
    }).catch((err) => {
        console.error(err);
        return res.status(500).json({error: 'internal_error'});
    });
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
    const {serverID, steamID64} = req.params;
    let {player, text, team} = req.body;

    if (badArgument([steamID64, player, text, team])) {
        return res.status(400).json({
            error: 'missing_arguments',
            args: {
                steamID64: !!steamID64,
                player: !!player,
                text: !!text,
                team: !!team
            }
        });
    }

    if (!serversPlayersModels.validPlayerFormat(player)) {
        return res.status(400).json({error: 'bad_argument', arguments: player});
    }

    serversPlayersModels.sendPlayerSay(serverID, player, text, team).then(() => {
        return res.status(200).json({message: 'data_received'});
    }).catch((err) => {
        console.log(err);
        return res.status(500).json({error: 'internal_server_error'});
    });
}

function updatePseudo(req, res) {
    const {serverID, steamID64} = req.params;
    const {player, oldName, newName} = req.body;

    if (badArgument([steamID64, player, oldName, newName])) {
        return res.status(400).json({
            error: 'missing_arguments',
            args: {
                steamID64: !!steamID64,
                player: !!player,
                oldName: !!oldName,
                newName: !!newName
            }
        });
    }

    if (!serversPlayersModels.validPlayerFormat(player)) {
        return res.status(400).json({error: 'bad_argument', arguments: player});
    }

    serversPlayersModels.updatePlayerPseudo(serverID, player, newName).then(() => {
        return res.status(200).json({message: 'data_received'});
    }).catch((err) => {
        console.log(err);
        return res.status(500).json({error: 'internal_server_error'});
    });
}

module.exports = {
    getPlayer,
    getPlayerBans,
    say,
    updatePseudo,
}