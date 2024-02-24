const {badArgument} = require("../../utils/tools");
const clientsModels = require('../../models/v3/clientsModels');

function uploadScreenshot(req, res) {
    const {clientID64} = req.params;
    const {player, screenshot, captureData, size} = req.body;

    console.log(clientID64, captureData, size);

    if (badArgument([player, screenshot, captureData, size])) {
        return res.status(400).json({
            error: 'missing_arguments',
            args: {
                player: !!player,
                screenshot: !!screenshot,
                captureData: !!captureData,
                size: !!size,
            }
        });
    }

    clientsModels.saveScreenshot(screenshot, captureData, player).then((result) => {
        console.log(result);
        return res.status(200).json({success: true, path: result.path});
    }).catch((err) => {
        console.log(err);
        return res.status(500).json({error: 'internal_server_error'});
    });
}

async function uploadStreamsFrames(req, res) {
    const {clientID64} = req.params;
    const {player, base64Capture, captureConfig, size} = req.body;

    if (badArgument([player, base64Capture, captureConfig, size])) {
        return res.status(400).json({
            error: 'missing_arguments',
            args: {
                player: !!player,
                base64Capture: !!base64Capture,
                captureConfig: !!captureConfig,
                size: !!size,
            }
        });
    }

    // post to /api/players/:steamID64/streams/frames
    await fetch(`http://localhost:53134/api/players/${clientID64}/streams/frames`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            player,
            base64Capture,
            captureConfig,
            size,
        }),
    }).then((response) => {
        console.log(response);
    }).catch((err) => {
        console.log(err);
    });

    return res.status(200).json({success: true});
}

module.exports = {
    uploadScreenshot,
    uploadStreamsFrames,
};