const axios = require('axios')
const crypto = require('crypto')
const {
    signingSecretWebhook,
    gmodStoreAPIKey
} = require('../../config');
const {getConnection} = require("../../database/connection");


async function verifyWebhookSignature(headers, payload) {
    const webhookSignature = headers['webhook-signature'];
    const webhookTimestamp = headers['webhook-timestamp'];
    const webhookId = headers['webhook-id'];

    const signingSecret = signingSecretWebhook.replace("whsec_", "");

    const expectedSignature = crypto.createHmac('sha256', Buffer.from(signingSecret, 'base64'))
        .update(`${webhookId}.${webhookTimestamp}.${JSON.stringify(payload)}`)
        .digest('base64');

    const signatures = webhookSignature.split(' ');

    for (let signature of signatures) {
        signature = signature.replace(/^v1,/, '');

        if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
            const currentTimestamp = Math.floor(Date.now() / 1000);
            const timeDifference = Math.abs(currentTimestamp - webhookTimestamp);
            if (timeDifference <= 300) {
                return true;
            }
        }
    }

    return false;
}

function getUser(userID) {
    return new Promise(async (resolve, reject) => {
        axios.get(`https://www.gmodstore.com/api/v3/users/${userID}`, {
            headers: {
                'Authorization': `Bearer ${gmodStoreAPIKey}`,
                'Accept': 'application/json',
            }
        }).then((response) => {
            console.log(response.data);
            resolve(response.data);
        }).catch((err) => {
            console.log(err);
            reject(err);
        })
    });
}

function saveGmodStorePurchase(steamID64, revoke) {
    return new Promise(async (resolve, reject) => {
        getConnection().then((connection) => {
            connection.query('INSERT INTO gm_gmodstore_purchases (steamID64, `revoke`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `revoke` = ?', [steamID64, revoke, revoke], (error) => {
                if (error) {
                    console.error(error);
                    reject(error);
                }
                resolve();
            });
        }).catch((err) => {
            reject(err);
        });
    });
}

module.exports = {
    verifyWebhookSignature,
    getUser,
    saveGmodStorePurchase,
}