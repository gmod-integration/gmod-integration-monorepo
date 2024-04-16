import axios from 'axios';
import crypto from 'crypto';
import { gmodStoreConfig } from '../../config/index.js';
import { getConnectionPromise } from '../../database/connection.js';

export async function verifyWebhookSignature(headers, payload) {
  const webhookSignature = headers['webhook-signature'];
  const webhookTimestamp = headers['webhook-timestamp'];
  const webhookId = headers['webhook-id'];

  const signingSecret = gmodStoreConfig.signingSecretKey.replace('whsec_', '');

  const expectedSignature = crypto
    .createHmac('sha256', Buffer.from(signingSecret, 'base64'))
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

export function getUser(userID) {
  return new Promise(async (resolve, reject) => {
    axios
      .get(`https://www.gmodstore.com/api/v3/users/${userID}`, {
        headers: {
          Authorization: `Bearer ${gmodStoreConfig.apiKey}`,
          Accept: 'application/json',
        },
      })
      .then((response) => {
        console.log(response.data);
        resolve(response.data);
      })
      .catch((err) => {
        console.log(err);
        reject(err);
      });
  });
}

export function saveGmodStorePurchase(steamID64, revoke) {
  return new Promise(async (resolve, reject) => {
    const connection = await getConnectionPromise();
    await connection.execute(
      'INSERT INTO gm_gmodstore_purchases (steamID64, `revoke`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `revoke` = ?',
      [steamID64, revoke, revoke],
    );
    resolve();
  });
}
