const {gmLog} = require('../../utils/logger');
const {verifyWebhookSignature} = require("../../models/webhooks/gmodStoreModels");

module.exports = async (req, res, next) => {
    const headers = req.headers;
    const payload = req.body;

    if (await verifyWebhookSignature(headers, payload)) {
        next();
    } else {
        gmLog('webhooks', 'gmodStoreValidator', 'unauthorized');
        res.status(401).json({error: 'unauthorized'});
    }
};