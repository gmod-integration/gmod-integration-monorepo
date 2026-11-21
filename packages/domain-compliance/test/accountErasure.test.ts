import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  config: { hashSecret: 'stable-key' as string | undefined },
  db: {
    gm_user_erasure: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
    },
    gm_user: { update: vi.fn() },
    gm_user_security: { upsert: vi.fn(), deleteMany: vi.fn() },
    gm_panelToken: { updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
  sessions: vi.fn(),
  mongo: vi.fn(),
  objects: vi.fn(),
  sql: vi.fn(),
}))
vi.mock('@gmod/config', () => ({ ConfigPrivacy: mocks.config }))
vi.mock('@gmod/infra-prisma', () => ({ default: mocks.db }))
vi.mock('@gmod/infra-prisma/client.js', () => ({ Prisma: { DbNull: 'DATABASE_NULL' } }))
vi.mock('@gmod/domain-user/privacy.js', () => ({
  privacySubject: (kind: string, id: string) => `${kind}:opaque:${id}`,
}))
vi.mock('../src/accountErasureStorage.js', () => ({
  eraseCachedData: mocks.sessions,
  eraseMongoData: mocks.mongo,
  eraseObjectData: mocks.objects,
  eraseSqlData: mocks.sql,
}))
const { AccountErasureConflictError, requestAccountErasure, processAccountErasure } =
  await import('../src/accountErasure.js')

const requestId = 'c6801874-4d4b-4543-884c-80f379fe7299'
const receipt = 'a'.repeat(64)
const discordID = 'discord-owner'
const steamID64 = '76561198000000000'
const identity = { discordID, steamID64 }
const requestedAt = new Date('2026-11-21T10:00:00.000Z')
const record = () => ({
  id: requestId,
  status: 'pending',
  requestedAt,
  completedAt: null,
  discordSubject: `discord:opaque:${discordID}`,
  receiptHash: createHash('sha256').update(receipt).digest('hex'),
  payload: { ...identity },
  progress: [],
  attempts: 1,
})

beforeEach(() => {
  vi.resetAllMocks()
  mocks.config.hashSecret = 'stable-key'
  mocks.db.$transaction.mockImplementation(async (operation) => operation(mocks.db))
  mocks.db.gm_user_erasure.findUnique.mockResolvedValue(null)
  mocks.db.gm_user_erasure.findFirst.mockResolvedValue(null)
  mocks.db.gm_user_erasure.create.mockResolvedValue(record())
  mocks.db.gm_user_erasure.findUniqueOrThrow.mockResolvedValue(record())
  mocks.db.gm_user_erasure.updateMany.mockResolvedValue({ count: 1 })
  mocks.db.gm_user.update.mockResolvedValue({ steam: steamID64, trust: 50 })
  for (const phase of [mocks.sessions, mocks.mongo, mocks.objects, mocks.sql]) phase.mockResolvedValue(undefined)
})

describe('durable account erasure', () => {
  it('refuses to create work or revoke sessions when the stable privacy key is absent', async () => {
    mocks.config.hashSecret = undefined
    await expect(requestAccountErasure(discordID, requestId, receipt)).rejects.toThrow('stable privacy hash key')
    expect(mocks.db.$transaction).not.toHaveBeenCalled()
    expect(mocks.db.gm_user_erasure.create).not.toHaveBeenCalled()
    expect(mocks.db.gm_panelToken.updateMany).not.toHaveBeenCalled()
  })

  it('reuses a matching request and receipt without revoking or recreating work', async () => {
    mocks.db.gm_user_erasure.findUnique.mockResolvedValue(record())
    const result = await requestAccountErasure(discordID, requestId, receipt)
    expect(result).toEqual({
      requestId,
      status: 'pending',
      requestedAt: requestedAt.toISOString(),
      completedAt: null,
      receipt,
    })
    expect(mocks.db.$transaction).not.toHaveBeenCalled()
    expect(mocks.db.gm_user_erasure.create).not.toHaveBeenCalled()
  })

  it.each(['subject', 'receipt'])('rejects an idempotency key belonging to a different %s', async (difference) => {
    mocks.db.gm_user_erasure.findUnique.mockResolvedValue({
      ...record(),
      ...(difference === 'subject' ? { discordSubject: 'discord:opaque:other' } : { receiptHash: 'different-hash' }),
    })
    await expect(requestAccountErasure(discordID, requestId, receipt)).rejects.toBeInstanceOf(
      AccountErasureConflictError,
    )
    expect(mocks.db.$transaction).not.toHaveBeenCalled()
  })

  it.each([0, 50, null])(
    'captures the verified identity and revokes sessions while retaining only meaningful trust (%s)',
    async (trust) => {
      mocks.db.gm_user.update.mockResolvedValue({ steam: steamID64, trust })
      await requestAccountErasure(discordID, requestId, receipt)
      expect(mocks.db.gm_user_erasure.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: requestId,
          discordSubject: `discord:opaque:${discordID}`,
          steamSubject: `steam:opaque:${steamID64}`,
          receiptHash: createHash('sha256').update(receipt).digest('hex'),
          payload: identity,
          status: 'pending',
          progress: [],
        }),
      })
      expect(mocks.db.gm_panelToken.updateMany).toHaveBeenCalledWith({ where: { discordID }, data: { revoke: true } })
      if (trust === 0) {
        expect(mocks.db.gm_user_security.upsert).toHaveBeenCalledTimes(2)
        expect(mocks.db.gm_user_security.upsert).toHaveBeenCalledWith({
          where: { subject: `steam:opaque:${steamID64}` },
          create: { subject: `steam:opaque:${steamID64}`, trust: 0 },
          update: { trust: 0 },
        })
        expect(mocks.db.gm_user_security.deleteMany).not.toHaveBeenCalled()
      } else {
        expect(mocks.db.gm_user_security.upsert).not.toHaveBeenCalled()
        expect(mocks.db.gm_user_security.deleteMany).toHaveBeenCalledWith({
          where: { subject: { in: [`discord:opaque:${discordID}`, `steam:opaque:${steamID64}`] } },
        })
      }
    },
  )

  it('captures an account without Steam without inventing another subject', async () => {
    mocks.db.gm_user.update.mockResolvedValue({ steam: null, trust: 0 })
    await requestAccountErasure(discordID, requestId, receipt)
    expect(mocks.db.gm_user_erasure.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ steamSubject: null, payload: { discordID, steamID64: null } }),
    })
    expect(mocks.db.gm_user_security.upsert).toHaveBeenCalledTimes(1)
  })

  it('does not create a second active request for the same subject using another key', async () => {
    mocks.db.gm_user_erasure.findFirst.mockResolvedValue({ ...record(), id: 'other-request' })
    await expect(requestAccountErasure(discordID, requestId, receipt)).rejects.toBeInstanceOf(
      AccountErasureConflictError,
    )
    expect(mocks.db.gm_user_erasure.create).not.toHaveBeenCalled()
  })

  it('grants an exclusive lease and leaves a competing worker without access to the identity', async () => {
    mocks.db.gm_user_erasure.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })
    const result = await Promise.all([processAccountErasure(requestId), processAccountErasure(requestId)])
    expect(result).toEqual([true, false])
    expect(mocks.db.gm_user_erasure.findUniqueOrThrow).toHaveBeenCalledTimes(1)
    expect(mocks.db.gm_user_erasure.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: requestId, OR: expect.any(Array) }),
        data: expect.objectContaining({
          status: 'running',
          leaseToken: expect.any(String),
          leaseUntil: expect.any(Date),
        }),
      }),
    )
  })

  it.each(['mongo', 'objects'] as const)(
    'retains the identity and records a retry after a %s outage, without false completion',
    async (phase) => {
      mocks[phase].mockRejectedValueOnce(new Error(`private ${discordID} ${receipt}`))
      expect(await processAccountErasure(requestId)).toBe(false)
      expect(mocks.db.gm_user_erasure.updateMany).toHaveBeenCalledWith({
        where: { id: requestId, leaseToken: expect.any(String) },
        data: expect.objectContaining({
          status: 'retry',
          lastError: phase,
          nextAttemptAt: expect.any(Date),
          leaseToken: null,
          leaseUntil: null,
        }),
      })
      const updates = mocks.db.gm_user_erasure.updateMany.mock.calls.map(([input]) => input.data)
      expect(updates.some((data) => data.status === 'completed')).toBe(false)
      expect(updates.some((data) => 'payload' in data)).toBe(false)
      expect(JSON.stringify(updates)).not.toContain(receipt)
      expect(mocks.sql).not.toHaveBeenCalled()
    },
  )

  it('resumes persisted phases, erases objects before SQL metadata, verifies again and purges transient identity only at completion', async () => {
    mocks.db.gm_user_erasure.findUniqueOrThrow.mockResolvedValue({ ...record(), progress: ['sessions', 'mongo'] })
    const order: string[] = []
    for (const [name, phase] of Object.entries({
      sessions: mocks.sessions,
      mongo: mocks.mongo,
      objects: mocks.objects,
      sql: mocks.sql,
    })) {
      phase.mockImplementation(async () => {
        order.push(name)
      })
    }
    expect(await processAccountErasure(requestId)).toBe(true)
    expect(order).toEqual(['objects', 'sql', 'mongo', 'objects', 'sql', 'sessions'])
    expect(mocks.objects).toHaveBeenCalledWith(identity, { requestId, leaseToken: expect.any(String) })
    expect(mocks.db.gm_user_erasure.updateMany).toHaveBeenCalledWith({
      where: { id: requestId, leaseToken: expect.any(String) },
      data: {
        status: 'completed',
        completedAt: expect.any(Date),
        payload: 'DATABASE_NULL',
        progress: 'DATABASE_NULL',
        lastError: null,
        leaseToken: null,
        leaseUntil: null,
      },
    })
  })

  it('does not mark a request completed if its verification sweep fails', async () => {
    mocks.objects.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('storage unavailable'))
    expect(await processAccountErasure(requestId)).toBe(false)
    const updates = mocks.db.gm_user_erasure.updateMany.mock.calls.map(([input]) => input.data)
    expect(updates.find((data) => data.status === 'retry')).toMatchObject({ lastError: 'verification' })
    expect(updates.some((data) => data.status === 'completed')).toBe(false)
    expect(updates.some((data) => 'payload' in data)).toBe(false)
  })
})
