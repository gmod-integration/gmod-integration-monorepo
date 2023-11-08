const serverModel = require('../models/serverModel');
const { badArgument, ipGetIP } = require('../utils/tools');

function getServer(req, res) {
    const { id } = req.headers;

    serverModel.getServer(id).then((result) => {
        res.status(200).json(result);
    }).catch((err) => {
        console.log(err);
        res.status(500).json({ error: 'Internal server error' });
    });
}

function postServerStatus(req, res) {
    const { id } = req.headers;
    let { players, maxplayers, map, hostname, gamemode, port, ip } = req.body;

    if (badArgument([players, maxplayers, map, hostname, gamemode, port, ip])) {
        return res.status(400).send('missing arguments players: ' + !!players + ', maxplayers: ' + !!maxplayers + ', map: ' + !!map + ', hostname: ' + !!hostname + ', gamemode: ' + !!gamemode + ', port: ' + !!port + ', ip: ' + !!ip);
    }

    ip = ipGetIP(ip);

    serverModel.updateServerStatus(id, players, maxplayers, map, hostname, gamemode, port, ip).then(() => {
        res.status(200).json({ message: 'Status Updated' });
    }).catch((err) => {
        console.log(err);
        res.status(500).json({ error: 'Internal server error' });
    });
}

module.exports = {
    getServer,
    postServerStatus,
};