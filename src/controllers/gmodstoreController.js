const gmodStoreModels = require("../models/gmodstoreModels");

async function purchase(req, res) {
    const userID = req.body.data.userId;

    if (!userID) return res.status(400).json({error: 'missing_arguments'});
    console.log(userID);

    gmodStoreModels.getUser(userID).then((user) => {
        if (!user || !user.data) return res.status(400).json({error: 'invalid_user'});
        const steamID64 = user.data.steamId;
        console.log("steamID64: " + steamID64);
        res.json({status: 'ok'});
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
    } else {
        res.json({status: 'ok'});
    }
}

module.exports = {
    subRoute,
}