const playerModels = require('../../models/v2/playerModels');
const {badArgument} = require("../../utils/tools");

async function postScreenshot(req, res) {
    const {id} = req.headers;
    const {screenshot, steamID64, options, name} = req.body;
    const {host} = req.headers;

    if (badArgument([id, screenshot, steamID64, options, host, name])) return res.status(400).json({error: 'missing_arguments'});

    const steamSummary = await playerModels.getSteamProfile(steamID64);
    if (!steamSummary) return res.status(400).json({error: 'invalid_steamid64'});

    playerModels.saveScreenshot(id, screenshot, steamID64, options).then((result) => {
        playerModels.getScreenshotsChannels(id).then((channels) => {
            channels.forEach((channel) => {
                if (channel.adminCmd) return;
                playerModels.postScreenshot(channel.webhook, channel.token, name || steamSummary.nickname, steamID64, steamSummary.avatar.medium, `https://${host}/screenshots/${result.filename}`).then(() => {
                    console.log(`Posted screenshot to ${channel.guildID} - ${channel.channelID}`);
                }).catch((err) => {
                    console.log(err);
                    res.status(500).json({error: 'internal_server_error'});
                });
            });
        }).catch((err) => {
            console.log(err);
            res.status(500).json({error: 'internal_server_error'});
        });
    }).catch((err) => {
        console.log(err);
        res.status(500).json({error: 'internal_server_error'});
    });
}

module.exports = {
    postScreenshot
}