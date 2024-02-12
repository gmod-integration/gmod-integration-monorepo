const {gmLog} = require('../utils/logger');
const {verifyWebhookSignature} = require("../models/gmodstoreModels");
const {
    stripeSecretKey,
    stripePublicKey,
    stripeWebhookSecret,
} = require('../config');

const stripe = require('stripe')(stripeSecretKey, {
    apiVersion: '2023-10-16',
});

module.exports = async (req, res, next) => {
    if (stripeWebhookSecret) {
        let event;
        let signature = req.headers["stripe-signature"];

        try {
            event = stripe.webhooks.constructEvent(
                req.rawBody,
                signature,
                stripeWebhookSecret
            );

            req.stripeEvent = event;
        } catch (err) {
            console.log(err);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }
    } else {
        return res.status(400).json({error: 'missing_arguments'});
    }

    next();
};