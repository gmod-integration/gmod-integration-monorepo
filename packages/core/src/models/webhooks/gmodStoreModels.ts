import crypto from 'crypto'
import { ConfigGmodStore } from '@gmod/config'
import { gmLog } from '../../utils/logger.js'
import { getUserFromSteamID64 } from '@gmod/domain-user/User.js'
import prisma from '@gmod/infra-prisma'
import { addNotification } from '../../utils/tools.js'
import JSONbig from 'json-bigint'

export async function verifyWebhookSignature(headers: any, payload: any) {
  const webhookSignature = headers['webhook-signature']
  const webhookTimestamp = headers['webhook-timestamp']
  const webhookId = headers['webhook-id']

  const signingSecret = ConfigGmodStore.signingSecretKey!.replace('whsec_', '')

  const expectedSignature = crypto
    .createHmac('sha256', Buffer.from(signingSecret, 'base64'))
    .update(`${webhookId}.${webhookTimestamp}.${JSON.stringify(payload)}`)
    .digest('base64')

  const signatures = webhookSignature.split(' ')

  const expectedSignatureBuffer = Buffer.from(expectedSignature)

  for (let signature of signatures) {
    signature = signature.replace(/^v1,/, '')
    const signatureBuffer = Buffer.from(signature)

    // timingSafeEqual throws (rather than returning false) on a byte-length mismatch, which
    // would otherwise let one malformed candidate crash verification instead of just failing
    // that candidate and moving on to the next one.
    if (signatureBuffer.length !== expectedSignatureBuffer.length) {
      continue
    }

    if (crypto.timingSafeEqual(signatureBuffer, expectedSignatureBuffer)) {
      const currentTimestamp = Math.floor(Date.now() / 1000)
      const timeDifference = Math.abs(currentTimestamp - webhookTimestamp)
      if (timeDifference <= 300) {
        return true
      }
    }
  }

  return false
}

export async function getUser(userID: string) {
  const response = await fetch(`https://www.gmodstore.com/api/v3/users/${userID}`, {
    headers: {
      Authorization: `Bearer ${ConfigGmodStore.apiKey}`,
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error('Failed to fetch user data')
  }

  const rawText = await response.text()
  return JSONbig({ storeAsString: true }).parse(rawText)
}

export async function saveGmodStorePurchase(steamID64: string, userID: string, revoke: boolean) {
  const gmGmodStorePurchases = await prisma.gm_gmodstore_purchases.findUnique({
    where: {
      steamID64,
    },
  })

  gmLog('gmodStore', `Saving purchase for ${steamID64} with revoke: ${revoke}`)

  const user = await getUserFromSteamID64(steamID64)
  if (user) {
    const discordID = user.getDiscordID()
    if (discordID) {
      await addNotification(
        discordID,
        'premium',
        revoke
          ? 'Your GmodStore lifetime purchase has been revoked.'
          : 'You have received a GmodStore lifetime purchase.',
      )
    }
  }

  if (gmGmodStorePurchases) {
    await prisma.gm_gmodstore_purchases.update({
      where: {
        steamID64,
      },
      data: {
        revoke,
        userID,
      },
    })
  } else {
    await prisma.gm_gmodstore_purchases.create({
      data: {
        steamID64,
        revoke,
        userID,
      },
    })
  }
}

export async function processGmodStoreWebhook(body: any) {
  const userID = body?.data?.userId
  if (!userID) {
    return {
      status: 400,
      body: { error: 'missing_arguments', args: { user_id: !!userID } },
    }
  }

  const user = await getUser(userID)
  if (!user || !user.data.steamId) {
    return {
      status: 404,
      body: { error: 'user_not_found' },
    }
  }

  const eventType = body?.eventType
  if (!eventType) {
    return {
      status: 400,
      body: { error: 'missing_arguments', args: { eventType: !!eventType } },
    }
  }

  switch (eventType) {
    case 'product_purchase.created':
      await saveGmodStorePurchase(user.data.steamId, userID, false)
      break
    case 'product_purchase.unrevoked':
      await saveGmodStorePurchase(user.data.steamId, userID, false)
      break
    case 'product_purchase.deleted':
      await saveGmodStorePurchase(user.data.steamId, userID, true)
      break
    case 'product_purchase.revoked':
      await saveGmodStorePurchase(user.data.steamId, userID, true)
      break
    default:
      return {
        status: 400,
        body: { error: 'invalid_event_type' },
      }
  }

  return {
    status: 200,
    body: { success: true },
  }
}
