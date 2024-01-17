const playerModels = require('../models/playerModels');
const {badArgument} = require("../utils/tools");

function postScreenshot(req, res) {
    const { id } = req.headers;
    const { screenshot, steamID64, options, name } = req.body;
    const { host } = req.headers;

    if (badArgument([id, screenshot, steamID64, options, host, name])) return res.status(400).json({ error: 'missing_arguments' });

    playerModels.postScreenshot(id, screenshot, steamID64, options, host, name).then(() => {
        res.status(200).send('OK');
    }).catch((err) => {
        console.log(err);
        res.status(500).json({ error: 'internal_server_error' });
    });
}

module.exports = {
    postScreenshot
}