const serverModel = require('../../models/v3/serversModels');
const {badArgument, ipGetIP} = require("../../utils/tools");

function getInfo(req, res) {
    const {serverID} = req.params;

    if (badArgument([serverID])) {
        return res.status(400).json({error: 'missing_arguments'});
    }

    serverModel.getInformations(serverID).then((result) => {
        return res.status(200).json(result);
    }).catch((err) => {
        console.log(err);
        return res.status(500).json({error: 'internal_server_error'});
    });
}

function postStatus(req, res) {
    const {serverID} = req.params;
    const {
        players,
        maxPlayers,
        map,
        hostname,
        gameMode,
        port,
        ip,
        uptime,
    } = req.body;

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
            }
        });
    }

    const extractIP = ipGetIP(ip);

    serverModel.postStatus(serverID, players, maxPlayers, map, hostname, gameMode, port, extractIP, uptime).then(() => {
        return res.status(200).json({success: true});
    }).catch((err) => {
        console.log(err);
        res.status(500).json({error: 'internal_server_error'});
    });
}

function reportError(req, res) {
    const {serverID} = req.params;
    const {error} = req.body;

    if (badArgument([error])) return res.status(400).json({error: 'missing_arguments'});

    serverModel.reportError(serverID, error).then(() => {
        res.status(200).json({success: true});
    }).catch((err) => {
        console.log(err);
        res.status(500).json({error: 'internal_server_error'});
    });
}

module.exports = {
    getInfo,
    postStatus,
    reportError,
}