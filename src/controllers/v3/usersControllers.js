const {getUser} = require('../../classes/v3/User');

function getProfile(req, res) {
    const {
        steamID64,
        discordID
    } = req.query;

    getUser({steamID64, discordID}).then((user) => {
        return res.status(200).json(user);
    }).catch((err) => {
        console.error(err);
        return res.status(500).json({error: 'internal_error'});
    });
}

module.exports = {
    getProfile,
};