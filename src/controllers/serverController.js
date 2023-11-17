const serverModel = require('../models/serverModel');
const {badArgument, ipGetIP} = require('../utils/tools');

function getServer(req, res) {
    const {id} = req.headers;

    serverModel.getServer(id).then((result) => {
        res.status(200).json(result);
    }).catch((err) => {
        console.log(err);
        res.status(500).json({error: 'internal_server_error'});
    });
}

function postServerStatus(req, res) {
    const {id} = req.headers;
    let {players, maxplayers, map, hostname, gamemode, port, ip} = req.body;

    if (badArgument([players, maxplayers, map, hostname, gamemode, port, ip])) {
        return res.status(400).json({
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
    }

    ip = ipGetIP(ip);

    serverModel.updateServerStatus(id, players, maxplayers, map, hostname, gamemode, port, ip).then(() => {
        res.status(200).send('OK');
    }).catch((err) => {
        console.log(err);
        res.status(500).json({error: 'internal_server_error'});
    });
}

function postServerLog(type, req, res) {
    console.log('postServerLog', type);
    // reply in development
    res.status(299).send('DEV');
}

module.exports = {
    getServer,
    postServerStatus,
    postServerLog
};