const serverModel = require('../../models/v2/serverModel');
const {badArgument, ipGetIP} = require('../../utils/tools');

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
    let {players, maxplayers, map, hostname, gamemode, port, ip, start} = req.body;

    if (badArgument([players, maxplayers, map, hostname, gamemode, port, ip, start])) {
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
        if (!start) {
            return res.status(200).send('OK');
        } else {
            serverModel.refreshPublicTempToken(id).then((token) => {
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

const logTypes = [
    {type: "playerSay", args: ["ply", "text", "teamChat"]},
    {type: "playerDeath", args: ["ply", "inflictor", "attacker"]},
    {type: "playerInitialSpawn", args: ["ply"]},
    {type: "playerHurt", args: ["ply", "attacker", "healthRemaining", "damageTaken"]},
    {type: "playerSpawnedSomething", args: ["object", "ply", "ent", "model"]},
    {type: "playerSpawn", args: ["ply"]},
    {type: "playerDisconnect", args: ["ply"]},
    {type: "playerConnect", args: ["data"]},
    {type: "playerGive", args: ["ply", "class", "swep"]},
    {type: "damageTaken", args: ["ply", "attacker", "healthRemaining", "damageTaken"]},
];

function postServerLog(req, res) {
    const {id} = req.headers;
    const type = req.params.type;

    if (!logTypes.find((logType) => logType.type === type)) {
        return res.status(400).json({error: 'invalid_log_type'});
    }

    const args = logTypes.find((logType) => logType.type === type).args;
    const missingArgs = [];

    for (const arg of args) {
        if (req.body[arg] === undefined || req.body[arg] === null) {
            console.log("missing arg: " + arg + " in " + type + " log type");
            missingArgs.push(arg);
        }
    }

    if (missingArgs.length > 0) {
        return res.status(400).json({
            error: 'missing_arguments',
            args: missingArgs
        });
    }

    const log = {
        type: type,
        data: req.body
    };

    serverModel.addServerLog(id, log).then(() => {
        res.status(200).send('OK');
    }).catch((err) => {
        console.log(err);
        res.status(500).json({error: 'internal_server_error'});
    });
}

module.exports = {
    getServer,
    postServerStatus,
    postServerLog
};