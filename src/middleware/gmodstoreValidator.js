const {gmLog} = require('../utils/logger');
const {verifyWebhookSignature} = require("../models/gmodstoreModels");

module.exports = async (req, res, next) => {
    if (await verifyWebhookSignature(req.headers, req.rawBody)) {
        next();
    } else {
        res.status(401).json({error: 'unauthorized'});
    }
};