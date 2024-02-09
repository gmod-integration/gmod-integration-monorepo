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
    const {players, maxplayers, map, hostname, gamemode, port, ip, start} = req.body;

    if (badArgument([players, maxplayers, map, hostname, gamemode, port, ip, start])) return res.status(400).json({
        error: 'missing_arguments',
        args: {
            players: !!players,
            maxplayers: !!maxplayers,
            map: !!map,
            hostname: !!hostname,
            gamemode: !!gamemode,
            port: !!port,
            ip: !!ip
        }
    });

    const extractIP = ipGetIP(ip);

    serverModel.postStatus(serverID, players, maxplayers, map, hostname, gamemode, port, extractIP).then(() => {
        if (!start) {
            return res.status(200).send('OK');
        } else {
            serverModel.refreshPublicTempToken(serverID).then((token) => {
                res.status(200).json({publicTempToken: token});
            }).catch((err) => {
                console.log(err);
                res.status(500).json({error: 'internal_server_error'});
            });
        }
    }).catch((err) => {
        console.log(err);
        res.status(500).json({error: 'internal_server_error'});
    });
}

module.exports = {
    getInfo,
    postStatus,
}