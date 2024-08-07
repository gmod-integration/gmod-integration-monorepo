import crypto from 'crypto';
import { gmodStoreConfig } from '../../config/index.js';
import GmodStorePurchases from '../../database/schema/GmodStorePurchases.js';
import { gmLog } from '../../utils/logger.js';
import { getUserFromSteamID64 } from '../../classes/v3/User.js';
import UsersNotifications from '../../database/schema/UsersNotifications.js';

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

export async function getUser(userID) {
  const userData = await fetch(`https://www.gmodstore.com/api/v3/users/${userID}`, {
    headers: {
      Authorization: `Bearer ${gmodStoreConfig.apiKey}`,
      Accept: 'application/json',
    },
  });

  if (!userData.ok) {
    throw new Error('Failed to fetch user data');
  } else {
    return await userData.json();
  }
}

export async function saveGmodStorePurchase(steamID64, revoke) {
  const gmGmodStorePurchases = await GmodStorePurchases.findOne({
    where: {
      steamID64,
    },
  });

  gmLog('gmodStore', `Saving purchase for ${steamID64} with revoke: ${revoke}`);

  const user = await getUserFromSteamID64(steamID64);
  if (user) {
    const discordID = user.getDiscordID();
    if (discordID) {
      await UsersNotifications.create({
        discordID,
        type: 'premium',
        message: revoke
          ? 'Your GmodStore lifetime purchase has been revoked.'
          : 'You have received a GmodStore lifetime purchase.',
      });
    }
  }

  if (gmGmodStorePurchases) {
    gmGmodStorePurchases.revoke = revoke;
    await gmGmodStorePurchases.save();
  } else {
    await GmodStorePurchases.create({
      steamID64,
      revoke,
    });
  }
}
