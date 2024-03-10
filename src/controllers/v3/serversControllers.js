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

async function getPublicToken(req, res) {
    const server = req.server;
    await server.regeneratePublicTempToken();
    return res.status(200).json({publicTempToken: server.getPublicToken()});
}

module.exports = {
    getInfo,
    postStatus,
    postServerLog,
    getPublicToken
}