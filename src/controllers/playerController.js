const playerModels = require('../models/playerModels');

function postScreenshot(req, res) {
    const { id } = req.headers;
    const { screenshot, steamID64, options } = req.body;

    playerModels.postScreenshot(id, screenshot, steamID64, options).then(() => {
        res.status(200).send('OK');
    }).catch((err) => {
        console.log(err);
        res.status(500).json({ error: 'internal_server_error' });
    });
}

module.exports = {
    postScreenshot
}