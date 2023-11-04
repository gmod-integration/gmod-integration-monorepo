const serverModel = require('../models/serverModel');

function getServer(req, res) {
    // TODO
    return res.status(200).json({ message: 'Not Implemented' });
}

function getServerGuild(req, res) {
    res.status(200).json({ guild: req.headers.guild });
}

function postServerStatus(req, res) {
    res.status(200).send('Data received');
}

function postServerShutdown(req, res) {
    // TODO
    return res.status(200).json({ message: 'Not Implemented' });
}

function postServerChangeLevel(req, res) {
    // TODO
    return res.status(200).json({ message: 'Not Implemented' });
}

function postServerChangeGameMode(req, res) {
    // TODO
    return res.status(200).json({ message: 'Not Implemented' });
}

module.exports = {
    getServer,
    getServerGuild,
    postServerStatus,
    postServerShutdown,
    postServerChangeLevel,
    postServerChangeGameMode
};