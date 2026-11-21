import { DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import prisma from '@gmod/infra-prisma'
import type { Prisma } from '@gmod/infra-prisma/client.js'
import { AVATAR_BUCKET, s3 } from '@gmod/infra-minio'
import { mongoClient } from '@gmod/infra-mongo'
import redis from '@gmod/infra-redis'
import { PRIVACY_REVOCATION_CHANNEL } from '@gmod/domain-user/privacy.js'
import { erasedPurchaseKey } from '@gmod/domain-user/purchasePrivacy.js'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export type ErasureIdentity = { discordID: string; steamID64: string | null }
export type ErasureFence = { requestId: string; leaseToken: string }

async function ensureLease(fence?: ErasureFence, store: Pick<Prisma.TransactionClient, 'gm_user_erasure'> = prisma) {
  if (!fence) return
  const renewed = await store.gm_user_erasure.updateMany({
    where: { id: fence.requestId, leaseToken: fence.leaseToken, status: 'running' },
    data: { leaseUntil: new Date(Date.now() + 300_000) },
  })
  if (renewed.count !== 1) throw new Error('Erasure lease lost')
}

/** Includes nested legacy JSON/string payloads, not just the primary player index. */
export function containsErasureIdentity(value: unknown, identity: ErasureIdentity): boolean {
  const ids = [identity.discordID, identity.steamID64].filter((id): id is string => !!id)
  if (typeof value === 'string')
    return ids.some((id) => {
      if (!/^\d+$/.test(id)) return value.includes(id)
      return new RegExp(`(^|\\D)${id}(?!\\d)`).test(value)
    })
  if (Array.isArray(value)) return value.some((part) => containsErasureIdentity(part, identity))
  if (value && typeof value === 'object')
    return Object.entries(value).some(
      ([key, part]) => containsErasureIdentity(key, identity) || containsErasureIdentity(part, identity),
    )
  return false
}

export async function eraseMongoData(identity: ErasureIdentity, fence?: ErasureFence) {
  const db = mongoClient.db('gmod_integration')
  for (const name of ['logs', 'errors']) {
    const collection = db.collection(name)
    // Legacy documents do not consistently index every involved identity. Scan in bounded batches.
    const cursor = collection.find({}).batchSize(250)
    try {
      for await (const document of cursor) {
        if (containsErasureIdentity(document, identity)) {
          await ensureLease(fence)
          await collection.deleteOne({ _id: document._id }, { maxTimeMS: 30_000 })
        }
      }
    } finally {
      await cursor.close()
    }
  }
}

async function deleteObject(bucket: string, key: string, fence?: ErasureFence) {
  await ensureLease(fence)
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: AbortSignal.timeout(30_000) })
  } catch (error) {
    // A missing bucket/key is already erased; transport and permission failures must be retried.
    if (!['NoSuchBucket', 'NoSuchKey', 'NotFound'].includes((error as Error).name)) throw error
  }
}

export async function eraseObjectData(identity: ErasureIdentity, fence?: ErasureFence) {
  const exports = await prisma.gm_users_data_request.findMany({
    where: { discordID: identity.discordID },
    select: { id: true },
  })
  for (const request of exports) {
    await deleteObject('gmi-gdpr-exports', `${request.id}.zip`, fence)
    const temporaryRoot = path.join(os.tmpdir(), 'gmod-integration', 'gdpr')
    // Only server-generated UUID export IDs may become filesystem paths.
    if (/^[a-f0-9-]{36}$/i.test(request.id)) {
      await fs.rm(path.join(temporaryRoot, request.id), { recursive: true, force: true })
      await fs.rm(path.join(temporaryRoot, `${request.id}.zip`), { force: true })
    }
  }
  const screenshots = await prisma.gm_server_screenshots.findMany({
    where: {
      OR: [
        { player: { contains: identity.discordID } },
        { captureData: { contains: identity.discordID } },
        ...(identity.steamID64
          ? [
              { player: { contains: identity.steamID64 } },
              { captureData: { contains: identity.steamID64 } },
              { url: { contains: identity.steamID64 } },
            ]
          : []),
      ],
    },
    select: { url: true, player: true, captureData: true },
  })
  for (const screenshot of screenshots) {
    if (!containsErasureIdentity(screenshot, identity)) continue
    let key: string | undefined
    try {
      const url = new URL(screenshot.url)
      if (url.pathname.startsWith('/screenshots/')) key = url.pathname.slice('/screenshots/'.length)
    } catch {
      /* Rows without a stored object URL have no owned object to remove. */
    }
    if (key && !key.includes('/') && !key.includes('\\')) await deleteObject('gmi-players-screenshots', key, fence)
  }
  await deleteObject(AVATAR_BUCKET, `discord/${identity.discordID}`, fence)
  if (!identity.steamID64) return
  await deleteObject(AVATAR_BUCKET, `steam/${identity.steamID64}`, fence)
  // Includes orphan screenshots and bug-report attachments using the historic SteamID filename.
  let continuation: string | undefined
  do {
    const result = await s3
      .send(
        new ListObjectsV2Command({
          Bucket: 'gmi-players-screenshots',
          ContinuationToken: continuation,
          MaxKeys: 500,
        }),
      )
      .catch((error: Error) => {
        if (error.name === 'NoSuchBucket') return { Contents: [], IsTruncated: false, NextContinuationToken: undefined }
        throw error
      })
    for (const object of result.Contents ?? []) {
      if (object.Key && containsErasureIdentity(object.Key, { discordID: '', steamID64: identity.steamID64 }))
        await deleteObject('gmi-players-screenshots', object.Key, fence)
    }
    continuation = result.IsTruncated ? result.NextContinuationToken : undefined
    if (result.IsTruncated && !continuation) throw new Error('Incomplete object listing')
  } while (continuation)
}

export async function eraseCachedData(identity: ErasureIdentity, fence?: ErasureFence) {
  await ensureLease(fence)
  await redis.del(`user:${identity.discordID}:guilds`, `user:${identity.discordID}:isWaitingGuilds`)
  if (identity.steamID64) {
    let cursor = '0'
    do {
      const [next, keys] = await redis.scan(
        cursor,
        'MATCH',
        `sync-*:gmod:server:*:user:${identity.steamID64}`,
        'COUNT',
        250,
      )
      if (keys.length) await redis.del(...keys)
      cursor = next
    } while (cursor !== '0')
  }
  // These caches contain personal admin references / SteamID filter exceptions and last 24h.
  // Invalidating a derived cache is safe; community rules are reloaded from their cleaned SQL rows.
  for (const pattern of ['server:*:logsTrigger*', 'server:*:gmodToDiscordFilter']) {
    let cursor = '0'
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 250)
      if (keys.length) await redis.del(...keys)
      cursor = next
    } while (cursor !== '0')
  }
  // WebSocket instances subscribe and close authenticated sessions for this subject.
  await redis.publish(PRIVACY_REVOCATION_CHANNEL, JSON.stringify(identity))
}

export async function eraseSqlData(identity: ErasureIdentity, fence?: ErasureFence) {
  const { discordID, steamID64 } = identity
  await prisma.$transaction(
    async (tx) => {
      // The lease row stays locked until this transaction commits. A stale worker cannot erase
      // a profile recreated after another worker completed and OAuth explicitly reactivated it.
      await ensureLease(fence, tx)
      await tx.gm_panelToken.deleteMany({ where: { discordID } })
      await tx.gm_discordToken.deleteMany({ where: { discordID } })
      await tx.gm_guild_member.deleteMany({ where: { user_id: discordID } })
      await tx.gm_users_transfers.deleteMany({
        where: {
          OR: [
            { oldDiscordID: discordID },
            { newDiscordID: discordID },
            ...(steamID64 ? [{ oldSteamID64: steamID64 }, { newSteamID64: steamID64 }] : []),
          ],
        },
      })

      const subjects = [{ discordID }, ...(steamID64 ? [{ steamID64 }] : [])]
      await tx.banUsers.deleteMany({ where: { OR: subjects, permanent: false, unbanDate: { lte: new Date() } } })
      await tx.banUsers.updateMany({
        where: { OR: subjects },
        data: { name: '', reason: 'Retained global security sanction' },
      })
      await tx.banUsers.updateMany({
        where: { admin: { in: [discordID, ...(steamID64 ? [steamID64] : [])] } },
        data: { admin: '' },
      })

      if (steamID64) {
        await tx.gm_server_stat_team_time.deleteMany({ where: { steamID64 } })
        await tx.gm_server_warn_options.deleteMany({ where: { steamID64 } })
        await tx.gm_server_warn.deleteMany({ where: { userSteamID64: steamID64 } })
        await tx.gm_server_warn.updateMany({ where: { adminSteamID64: steamID64 }, data: { adminSteamID64: '' } })
        await tx.gm_server_ban.deleteMany({ where: { userSteamID64: steamID64 } })
        await tx.gm_server_ban.updateMany({ where: { adminSteamID64: steamID64 }, data: { adminSteamID64: '' } })
        await tx.gm_server_report_bugs.deleteMany({ where: { steamID64 } })
        await tx.gm_server_sync_chat_filter.deleteMany({ where: { element: 'steamID64', trigger: steamID64 } })
        await tx.users.deleteMany({ where: { steamID64 } })
        // Removing the profile also cascades player statistics and sessions, not community configuration.
        await tx.gm_user_steam.deleteMany({ where: { steam_id: steamID64 } })
        // Preserve the community's acquired entitlement, detach the erased person's identifier/secret.
        const personalPurchase = await tx.gm_gmodstore_purchases.findUnique({ where: { steamID64 } })
        if (personalPurchase) {
          const retainedKey = erasedPurchaseKey(steamID64)
          const retainedPurchase = await tx.gm_gmodstore_purchases.findUnique({ where: { steamID64: retainedKey } })
          if (retainedPurchase?.guild && personalPurchase.guild && retainedPurchase.guild !== personalPurchase.guild)
            throw new Error('Conflicting collective entitlements require review')
          const latest =
            retainedPurchase && retainedPurchase.updatedAt > personalPurchase.updatedAt
              ? retainedPurchase
              : personalPurchase
          const guild = retainedPurchase?.guild || personalPurchase.guild
          await tx.gm_gmodstore_purchases.upsert({
            where: { steamID64: retainedKey },
            create: { steamID64: retainedKey, guild, revoke: latest.revoke, userID: '', token: '' },
            update: { guild, revoke: latest.revoke, userID: '', token: '' },
          })
          await tx.gm_gmodstore_purchases.deleteMany({ where: { steamID64 } })
        }
      }
      const screenshots = await tx.gm_server_screenshots.findMany({
        where: {
          OR: [
            { player: { contains: discordID } },
            { captureData: { contains: discordID } },
            ...(steamID64
              ? [
                  { player: { contains: steamID64 } },
                  { captureData: { contains: steamID64 } },
                  { url: { contains: steamID64 } },
                ]
              : []),
          ],
        },
        select: { id: true, player: true, captureData: true, url: true },
      })
      const screenshotIDs = screenshots.filter((row) => containsErasureIdentity(row, identity)).map((row) => row.id)
      if (screenshotIDs.length) await tx.gm_server_screenshots.deleteMany({ where: { id: { in: screenshotIDs } } })
      const triggers = await tx.gm_server_logs_triggers.findMany({
        where: { adminIDS: { contains: discordID } },
        select: { id: true, adminIDS: true },
      })
      for (const trigger of triggers) {
        if (!containsErasureIdentity(trigger.adminIDS, identity)) continue
        let admins: unknown
        try {
          admins = JSON.parse(trigger.adminIDS)
        } catch {
          admins = null
        }
        const remaining = Array.isArray(admins) ? admins.filter((admin) => String(admin) !== discordID) : []
        await tx.gm_server_logs_triggers.update({
          where: { id: trigger.id },
          data: { adminIDS: JSON.stringify(remaining) },
        })
      }
      const statuses = await tx.gm_server_status.findMany({
        where: { playersList: { not: null } },
        select: { id: true, playersList: true },
      })
      for (const status of statuses) {
        if (!containsErasureIdentity(status.playersList, identity)) continue
        let players: unknown
        try {
          players = JSON.parse(status.playersList!)
        } catch {
          players = null
        }
        const remaining = Array.isArray(players)
          ? players.filter((player) => !containsErasureIdentity(player, identity))
          : []
        await tx.gm_server_status.update({ where: { id: status.id }, data: { playersList: JSON.stringify(remaining) } })
      }
      // Cascades notifications, votes and export metadata only after their stored files were erased.
      await tx.gm_user.deleteMany({ where: { id: discordID } })
    },
    { timeout: 60_000 },
  )
}
