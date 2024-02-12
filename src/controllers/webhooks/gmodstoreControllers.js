const gmodStoreModels = require("../../models/webhooks/gmodstoreModels");

async function purchase(req, res) {
    const userID = req.body.data.userId;

    if (!userID) return res.status(400).json({error: 'missing_arguments'});

    gmodStoreModels.getUser(userID).then((user) => {
        if (!user || !user.data) return res.status(400).json({error: 'invalid_user'});

        const steamID64 = user.data.steamId;

        gmodStoreModels.saveGmodStorePurchase(steamID64, false).then(() => {
            res.json({status: 'ok'});
        }).catch((err) => {
            console.log(err);
            res.status(500).json({error: 'internal_server_error'});
        });
    }).catch((err) => {
        console.log(err);
        res.status(500).json({error: 'internal_server_error'});
    });
}

async function revoke(req, res) {
    const userID = req.body.data.userId;

    if (!userID) return res.status(400).json({error: 'missing_arguments'});

    gmodStoreModels.getUser(userID).then((user) => {
        if (!user || !user.data) return res.status(400).json({error: 'invalid_user'});

        const steamID64 = user.data.steamId;

        gmodStoreModels.saveGmodStorePurchase(steamID64, true).then(() => {
            res.json({status: 'ok'});
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
    purchase,
    revoke
}