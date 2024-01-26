const gmodStoreModels = require("../models/gmodstoreModels");

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

async function subRoute(req, res) {
    const event = req.body.eventType;

    if (!event) return res.status(400).json({error: 'missing_arguments'});

    if (event === 'product_purchase.created' || event === 'product_purchase.unrevoked') {
        await purchase(req, res);
    } else if (event === 'product_purchase.revoked') {
        await revoke(req, res);
    } else {
        res.json({status: 'ok'});
    }
}

module.exports = {
    subRoute,
}