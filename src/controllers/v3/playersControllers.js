const {badArgument} = require("../../utils/tools");
const playersModel = require('../../models/v3/playersModels');

function getProfile(req, res) {
    const {steamID64} = req.params;

    if (badArgument([steamID64])) {
        return res.status(400).json({
            error: 'missing_arguments',
            args: {
                steamID64: !!steamID64
            }
        });
    }

    playersModel.getProfile(steamID64).then((player) => {
        return res.status(200).json(player);
    }).catch((err) => {
        console.error(err);
        return res.status(500).json({error: 'internal_error'});
    });
}

module.exports = {
    getProfile,
};