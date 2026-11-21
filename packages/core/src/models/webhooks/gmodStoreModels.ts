import crypto from 'crypto'
import { ConfigGmodStore } from '@gmod/config'
import { gmLog } from '@gmod/shared/logger.js'
import { getUserFromSteamID64 } from '@gmod/domain-user/User.js'
import prisma from '@gmod/infra-prisma'
import { addNotification } from '../../utils/tools.js'
import JSONbig from 'json-bigint'
import { privacySubject } from '@gmod/domain-user/privacy.js'
import { erasedPurchaseKey } from '@gmod/domain-user/purchasePrivacy.js'
import redis from '@gmod/infra-redis'

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
  const retainedKey = erasedPurchaseKey(steamID64)
  const persist = () =>
    prisma.$transaction(
      async (tx) => {
        // Serializable reads also fence an erasure request being inserted concurrently. An incoming
        // provider event must not recreate the personal key after that request has been accepted.
        const personal = await tx.gm_gmodstore_purchases.findUnique({ where: { steamID64 } })
        const retained = await tx.gm_gmodstore_purchases.findUnique({ where: { steamID64: retainedKey } })
        const erased = await tx.gm_user_erasure.findFirst({
          // Deliberately includes reactivated accounts: an old collective entitlement never becomes
          // a newly recreated account's personal purchase through a provider refresh.
          where: { steamSubject: privacySubject('steam', steamID64) },
          select: { id: true },
        })
        if (retained || erased) {
          if (retained?.guild && personal?.guild && retained.guild !== personal.guild)
            throw new Error('Conflicting collective purchase assignments require review')
          const guild = retained?.guild || personal?.guild || ''
          await tx.gm_gmodstore_purchases.upsert({
            where: { steamID64: retainedKey },
            create: { steamID64: retainedKey, guild, revoke, userID: '', token: '' },
            update: { guild, revoke, userID: '', token: '' },
          })
          // A historical duplicate personal row must not outlive a webhook or permit reattachment.
          await tx.gm_gmodstore_purchases.deleteMany({ where: { steamID64 } })
          return { retained: true, guild }
        }
        if (personal) {
          await tx.gm_gmodstore_purchases.update({ where: { steamID64 }, data: { revoke, userID } })
        } else {
          await tx.gm_gmodstore_purchases.create({ data: { steamID64, revoke, userID } })
        }
        return { retained: false, guild: personal?.guild || '' }
      },
      { isolationLevel: 'Serializable' },
    )

  let saved: Awaited<ReturnType<typeof persist>> | undefined
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      saved = await persist()
      break
    } catch (error) {
      if (attempt === 2 || !error || typeof error !== 'object' || !('code' in error) || error.code !== 'P2034')
        throw error
    }
  }
  if (!saved) throw new Error('Purchase event was not persisted')
  if (saved.guild) await redis.del(`guild:${saved.guild}:premium`)
  if (saved.retained) {
    gmLog('gmodStore', `Updated retained collective entitlement; revoked: ${revoke}`)
    return
  }
  gmLog('gmodStore', `Saved purchase event; revoked: ${revoke}`)
  const user = await getUserFromSteamID64(steamID64)
  const discordID = user?.getDiscordID()
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
