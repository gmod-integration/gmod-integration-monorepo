import { createHash, randomUUID } from 'node:crypto'
import { ConfigPrivacy } from '@gmod/config'
import prisma from '@gmod/infra-prisma'
import { Prisma } from '@gmod/infra-prisma/client.js'
import { privacySubject } from '@gmod/domain-user/privacy.js'
import {
  eraseCachedData,
  eraseMongoData,
  eraseObjectData,
  eraseSqlData,
  type ErasureIdentity,
} from './accountErasureStorage.js'

type ErasureStatus = 'pending' | 'running' | 'retry' | 'completed'
type RequestRecord = {
  id: string
  status: string
  requestedAt: Date
  completedAt: Date | null
}
const receiptHash = (receipt: string) => createHash('sha256').update(receipt).digest('hex')
const snapshot = (request: RequestRecord) => ({
  requestId: request.id,
  status: request.status as ErasureStatus,
  requestedAt: request.requestedAt.toISOString(),
  completedAt: request.completedAt?.toISOString() ?? null,
})

export class AccountErasureConflictError extends Error {
  readonly code = 'account_erasure_conflict'
  constructor() {
    super('An erasure request already exists or its receipt does not match.')
  }
}

/** Capture a verified identity once. No profile, credential or activity data is retained in the proof. */
export async function requestAccountErasure(discordID: string, idempotencyKey: string, receipt: string) {
  if (!ConfigPrivacy.hashSecret)
    throw new Error('A stable privacy hash key must be configured before erasure is enabled.')
  const subject = privacySubject('discord', discordID)
  const hash = receiptHash(receipt)
  const existing = await prisma.gm_user_erasure.findUnique({ where: { id: idempotencyKey } })
  if (existing) {
    if (existing.discordSubject !== subject || existing.receiptHash !== hash) throw new AccountErasureConflictError()
    return { ...snapshot(existing), receipt }
  }
  const request = await prisma.$transaction(async (tx) => {
    // Serialize requests for this account, including concurrent different idempotency keys.
    const user = await tx.gm_user.update({ where: { id: discordID }, data: { updatedAt: new Date() } })
    const active = await tx.gm_user_erasure.findFirst({ where: { discordSubject: subject, reactivatedAt: null } })
    if (active) {
      if (active.id !== idempotencyKey || active.receiptHash !== hash) throw new AccountErasureConflictError()
      return active
    }
    const steamSubject = user.steam ? privacySubject('steam', user.steam) : null
    // A default score contains no additional security information. Explicit zero must survive.
    if (user.trust !== null && user.trust !== 50) {
      for (const securitySubject of [subject, steamSubject].filter((value): value is string => !!value)) {
        await tx.gm_user_security.upsert({
          where: { subject: securitySubject },
          create: { subject: securitySubject, trust: user.trust },
          update: { trust: user.trust },
        })
      }
    } else {
      await tx.gm_user_security.deleteMany({
        where: { subject: { in: [subject, ...(steamSubject ? [steamSubject] : [])] } },
      })
    }
    const created = await tx.gm_user_erasure.create({
      data: {
        id: idempotencyKey,
        discordSubject: subject,
        steamSubject,
        receiptHash: hash,
        payload: { discordID, steamID64: user.steam },
        progress: [],
        status: 'pending',
      },
    })
    await tx.gm_panelToken.updateMany({ where: { discordID }, data: { revoke: true } })
    return created
  })
  return { ...snapshot(request), receipt }
}

/** The high-entropy, request-scoped receipt works after every account session is revoked. */
export async function getAccountErasureStatus(requestId: string, receipt: string) {
  const request = await prisma.gm_user_erasure.findFirst({
    where: { id: requestId, receiptHash: receiptHash(receipt) },
  })
  return request ? snapshot(request) : null
}

const phases = [
  ['sessions', eraseCachedData],
  ['mongo', eraseMongoData],
  ['objects', eraseObjectData],
  ['sql', eraseSqlData],
] as const

/** Durable leases and idempotent phases allow retries after process loss or a storage outage. */
export async function processAccountErasure(requestId: string): Promise<boolean> {
  const now = new Date()
  const leaseToken = randomUUID()
  const fence = { requestId, leaseToken }
  const claim = await prisma.gm_user_erasure.updateMany({
    where: {
      id: requestId,
      OR: [
        { status: { in: ['pending', 'retry'] }, nextAttemptAt: { lte: now } },
        { status: 'running', leaseUntil: { lt: now } },
      ],
    },
    data: {
      status: 'running',
      leaseToken,
      leaseUntil: new Date(now.getTime() + 300_000),
      attempts: { increment: 1 },
      lastError: null,
    },
  })
  if (claim.count !== 1) return false
  const request = await prisma.gm_user_erasure.findUniqueOrThrow({ where: { id: requestId } })
  const identity = request.payload as ErasureIdentity | null
  let phaseName = 'identity'
  const progress = Array.isArray(request.progress)
    ? request.progress.filter((phase): phase is string => typeof phase === 'string')
    : []
  const renew = setInterval(() => {
    void prisma.gm_user_erasure
      .updateMany({ where: { id: requestId, leaseToken }, data: { leaseUntil: new Date(Date.now() + 300_000) } })
      .catch(() => {})
  }, 30_000)
  renew.unref()
  try {
    if (!identity?.discordID || (identity.steamID64 !== null && typeof identity.steamID64 !== 'string'))
      throw new Error('Missing erasure identity')
    for (const [phase, erase] of phases) {
      phaseName = phase
      if (progress.includes(phase)) continue
      await erase(identity, fence)
      progress.push(phase)
      const update = await prisma.gm_user_erasure.updateMany({
        where: { id: requestId, leaseToken },
        data: { progress },
      })
      if (update.count !== 1) throw new Error('Lease lost')
    }
    // Sweep again behind the collection barrier: catches records from ingestion already in flight.
    phaseName = 'verification'
    await eraseMongoData(identity, fence)
    await eraseObjectData(identity, fence)
    await eraseSqlData(identity, fence)
    await eraseCachedData(identity, fence)
    const completed = await prisma.gm_user_erasure.updateMany({
      where: { id: requestId, leaseToken },
      data: {
        status: 'completed',
        completedAt: new Date(),
        payload: Prisma.DbNull,
        progress: Prisma.DbNull,
        lastError: null,
        leaseToken: null,
        leaseUntil: null,
      },
    })
    return completed.count === 1
  } catch {
    // Never store raw database/storage errors: they can contain personal data or object names.
    await prisma.gm_user_erasure.updateMany({
      where: { id: requestId, leaseToken },
      data: {
        status: 'retry',
        lastError: phaseName,
        leaseToken: null,
        leaseUntil: null,
        nextAttemptAt: new Date(Date.now() + Math.min(3_600_000, 5_000 * 2 ** Math.min(request.attempts, 9))),
      },
    })
    return false
  } finally {
    clearInterval(renew)
  }
}

/** Each API instance may run this poller; the SQL claim prevents duplicate workers. */
export function startAccountErasureWorker() {
  let draining = false
  let stopped = false
  const drain = async () => {
    if (draining || stopped) return
    draining = true
    try {
      const now = new Date()
      const requests = await prisma.gm_user_erasure.findMany({
        where: {
          OR: [
            { status: { in: ['pending', 'retry'] }, nextAttemptAt: { lte: now } },
            { status: 'running', leaseUntil: { lt: now } },
          ],
        },
        select: { id: true },
        take: 5,
        orderBy: { requestedAt: 'asc' },
      })
      for (const request of requests) {
        if (stopped) break
        await processAccountErasure(request.id)
      }
    } catch {
      console.error('Account erasure worker unavailable; requests remain queued.')
    } finally {
      draining = false
    }
  }
  const interval = setInterval(() => void drain(), 5_000)
  interval.unref()
  void drain()
  return () => {
    stopped = true
    clearInterval(interval)
  }
}
