import crypto from 'crypto';
import { gmodStoreConfig } from '../../config/index.js';
import { gmLog } from '../../utils/logger.js';
import { getUserFromSteamID64 } from '../../classes/v3/User.js';
import index from '../../services/prisma/index.js';
import { addNotification } from '../../utils/tools.js';
import JSONbig from 'json-bigint';

export async function verifyWebhookSignature(headers: any, payload: any) {
  const webhookSignature = headers['webhook-signature'];
  const webhookTimestamp = headers['webhook-timestamp'];
  const webhookId = headers['webhook-id'];

  const signingSecret = gmodStoreConfig.signingSecretKey!.replace('whsec_', '');

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

export async function getUser(userID: string) {
  const response = await fetch(`https://www.gmodstore.com/api/v3/users/${userID}`, {
    headers: {
      Authorization: `Bearer ${gmodStoreConfig.apiKey}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch user data');
  }

  const rawText = await response.text();
  return JSONbig({ storeAsString: true }).parse(rawText);
}

export async function saveGmodStorePurchase(steamID64: string, userID: string, revoke: boolean) {
  const gmGmodStorePurchases = await index.gm_gmodstore_purchases.findUnique({
    where: {
      steamID64,
    },
  });

  gmLog('gmodStore', `Saving purchase for ${steamID64} with revoke: ${revoke}`);

  const user = await getUserFromSteamID64(steamID64);
  if (user) {
    const discordID = user.getDiscordID();
    if (discordID) {
      await addNotification(
        discordID,
        'premium',
        revoke
          ? 'Your GmodStore lifetime purchase has been revoked.'
          : 'You have received a GmodStore lifetime purchase.',
      );
    }
  }

  if (gmGmodStorePurchases) {
    await index.gm_gmodstore_purchases.update({
      where: {
        steamID64,
      },
      data: {
        revoke,
        userID,
      },
    });
  } else {
    await index.gm_gmodstore_purchases.create({
      data: {
        steamID64,
        revoke,
        userID,
      },
    });
  }
}
